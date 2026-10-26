//! TickTick CSV import: add-only, per-row tolerant, labels reused case-insensitively.

use std::collections::HashMap;

use chrono::{DateTime, NaiveDate, NaiveTime};
use chrono_tz::Tz;
use sqlx::{SqliteConnection, SqlitePool};

use crate::config;
use crate::db;
use crate::domain::{ImportCreated, ImportSummary, NewTask, LABEL_PALETTE};
use crate::error::{AppError, AppResult};
use crate::services::{recurrence, task_service};

// Lowercased TickTick columns we read; unmapped ones (Reminder, Priority, …) are never looked up.
const COL_TITLE: &str = "title";
const COL_CONTENT: &str = "content";
const COL_TAGS: &str = "tags";
const COL_LIST: &str = "list name";
const COL_DUE: &str = "due date";
const COL_ALL_DAY: &str = "is all day";
const COL_TIMEZONE: &str = "timezone";
const COL_FLOATING: &str = "is floating";
const COL_REPEAT: &str = "repeat";
const COL_STATUS: &str = "status";
const COL_COMPLETED: &str = "completed time";

/// TickTick's default list — not mapped to a label.
const DEFAULT_LIST: &str = "inbox";

/// Offset without a colon (`+0000`), so `%z`, not RFC-3339.
const TICKTICK_DT_FORMAT: &str = "%Y-%m-%dT%H:%M:%S%z";

type Headers = HashMap<String, usize>;

/// A bad row is skipped; a database error aborts. The whole file runs in one
/// transaction, so a failed import leaves the database untouched.
pub async fn import_ticktick(pool: &SqlitePool, csv_bytes: &[u8]) -> AppResult<ImportSummary> {
    let text = decode(csv_bytes);
    let (headers, records) = parse_csv(&text)?;

    let mut created = ImportCreated::default();
    let mut skipped = 0usize;
    let mut label_ids: HashMap<String, i64> = HashMap::new();

    let mut tx = pool.begin().await?;

    for record in &records {
        let Some(title) = field(record, &headers, COL_TITLE) else {
            skipped += 1;
            continue;
        };

        let content = field(record, &headers, COL_CONTENT);
        let (title, notes) = fit_title(title, content);
        let (due_date, due_time) = parse_due(
            field(record, &headers, COL_DUE),
            is_true(field(record, &headers, COL_ALL_DAY)),
            field(record, &headers, COL_TIMEZONE),
            is_true(field(record, &headers, COL_FLOATING)),
        );
        let completed = is_completed(
            field(record, &headers, COL_STATUS),
            field(record, &headers, COL_COMPLETED),
        );
        // TickTick exports each ticked-off instance of a series as its own completed row.
        let recurrence_rule = if completed {
            None
        } else {
            parse_repeat(field(record, &headers, COL_REPEAT), due_date.as_deref())
        };

        let label_id = match pick_label(record, &headers) {
            Some(name) => Some(resolve_label(&mut tx, &mut label_ids, &mut created, &name).await?),
            None => None,
        };

        let new_task = NewTask {
            title,
            notes,
            label_id,
            due_date,
            due_time,
            recurrence_rule,
        };

        // A Validation error skips the row; a Db error aborts the import.
        match task_service::create_on(&mut tx, new_task).await {
            Ok(task) => {
                created.tasks += 1;
                if completed {
                    db::task::add_completion(&mut *tx, task.id, task.due_date.as_deref()).await?;
                    created.completions += 1;
                }
            }
            Err(AppError::Validation(_)) => skipped += 1,
            Err(e) => return Err(e),
        }
    }

    tx.commit().await?;
    Ok(ImportSummary { created, skipped })
}

/// Lossy, to tolerate stray bytes; strips a leading BOM.
fn decode(bytes: &[u8]) -> String {
    let bytes = bytes.strip_prefix(b"\xEF\xBB\xBF").unwrap_or(bytes);
    String::from_utf8_lossy(bytes).into_owned()
}

/// TickTick prefixes metadata lines before the real header, so scan for the first
/// row with a `Title` column. `flexible` because the preamble's field counts differ.
fn parse_csv(text: &str) -> AppResult<(Headers, Vec<csv::StringRecord>)> {
    let mut reader = csv::ReaderBuilder::new()
        .has_headers(false)
        .flexible(true)
        .from_reader(text.as_bytes());

    let mut headers: Option<Headers> = None;
    let mut records = Vec::new();
    for result in reader.records() {
        let record =
            result.map_err(|_| AppError::Validation("the file is not valid CSV".into()))?;
        match headers {
            None => headers = header_map(&record),
            Some(_) => records.push(record),
        }
    }

    match headers {
        Some(headers) => Ok((headers, records)),
        None => Err(AppError::Validation(
            "this doesn't look like a TickTick CSV export (no header row with a Title column)"
                .into(),
        )),
    }
}

fn header_map(record: &csv::StringRecord) -> Option<Headers> {
    let map: Headers = record
        .iter()
        .enumerate()
        .map(|(index, name)| (name.trim().to_lowercase(), index))
        .collect();
    map.contains_key(COL_TITLE).then_some(map)
}

fn field<'a>(record: &'a csv::StringRecord, headers: &Headers, name: &str) -> Option<&'a str> {
    let index = *headers.get(name)?;
    let value = record.get(index)?.trim();
    (!value.is_empty()).then_some(value)
}

fn is_true(raw: Option<&str>) -> bool {
    raw.is_some_and(|v| v.eq_ignore_ascii_case("true"))
}

/// Timed, non-floating values are converted into the row's timezone (see below);
/// floating values and unknown zones are read literally. An unparseable date ⇒ Inbox.
fn parse_due(
    raw: Option<&str>,
    all_day: bool,
    timezone: Option<&str>,
    floating: bool,
) -> (Option<String>, Option<String>) {
    let Some(raw) = raw else {
        return (None, None);
    };
    let (date_part, time_part) = match raw.split_once('T') {
        Some((date, rest)) => (date, Some(rest)),
        None => (raw, None),
    };
    let Ok(literal_date) = NaiveDate::parse_from_str(date_part, config::DATE_FORMAT) else {
        return (None, None);
    };

    // A non-floating Due Date is a UTC instant — including all-day tasks, stored as
    // local midnight in UTC (`2026-06-17T22:00:00+0000` is 18 Jun in Amsterdam).
    // Convert before reading the date, or it lands a day too soon.
    if !floating {
        if let Some((date, time)) = timezone
            .and_then(|name| name.parse::<Tz>().ok())
            .and_then(|tz| to_local(raw, tz))
        {
            let due_time = (!all_day).then(|| fmt_time(time));
            return (Some(fmt_date(date)), due_time);
        }
    }

    // Literal read: the leading HH:MM, ignoring seconds and offset.
    let due_time = if all_day {
        None
    } else {
        time_part
            .and_then(|t| t.get(0..5))
            .and_then(|hhmm| NaiveTime::parse_from_str(hhmm, config::TIME_FORMAT).ok())
            .map(fmt_time)
    };
    (Some(fmt_date(literal_date)), due_time)
}

fn to_local(raw: &str, tz: Tz) -> Option<(NaiveDate, NaiveTime)> {
    let instant = DateTime::parse_from_str(raw, TICKTICK_DT_FORMAT).ok()?;
    let local = instant.with_timezone(&tz);
    Some((local.date_naive(), local.time()))
}

fn fmt_date(date: NaiveDate) -> String {
    date.format(config::DATE_FORMAT).to_string()
}

fn fmt_time(time: NaiveTime) -> String {
    time.format(config::TIME_FORMAT).to_string()
}

/// A rule without a start date or that fails to parse is dropped; the task still imports.
fn parse_repeat(raw: Option<&str>, due_date: Option<&str>) -> Option<String> {
    let raw = raw?;
    let start = due_date.and_then(|d| NaiveDate::parse_from_str(d, config::DATE_FORMAT).ok())?;
    let rule = recurrence::normalize(raw);
    recurrence::validate(&rule, start).ok().map(|()| rule)
}

/// The first Tag, else the List name — but never the default "Inbox" list.
fn pick_label(record: &csv::StringRecord, headers: &Headers) -> Option<String> {
    if let Some(tags) = field(record, headers, COL_TAGS) {
        if let Some(first) = tags.split(',').map(str::trim).find(|t| !t.is_empty()) {
            return Some(first.to_string());
        }
    }
    field(record, headers, COL_LIST)
        .filter(|list| !list.eq_ignore_ascii_case(DEFAULT_LIST))
        .map(str::to_string)
}

/// Archived (`2`) is only ever reached from completed.
fn is_completed(status: Option<&str>, completed_time: Option<&str>) -> bool {
    matches!(status, Some("1" | "2")) || completed_time.is_some()
}

fn clamp_chars(value: &str, max: usize) -> String {
    value.chars().take(max).collect()
}

/// Clamp rather than let the validator skip the row; the full title moves into the notes.
fn fit_title(title: &str, content: Option<&str>) -> (String, Option<String>) {
    if title.chars().count() <= config::MAX_TITLE_LEN {
        return (title.to_string(), content.map(str::to_string));
    }
    let notes = match content {
        Some(content) => format!("{title}\n\n{content}"),
        None => title.to_string(),
    };
    (clamp_chars(title, config::MAX_TITLE_LEN), Some(notes))
}

/// New labels take the next palette color by append position, so colors are deterministic.
async fn resolve_label(
    conn: &mut SqliteConnection,
    label_ids: &mut HashMap<String, i64>,
    created: &mut ImportCreated,
    name: &str,
) -> AppResult<i64> {
    let name = clamp_chars(name.trim(), config::MAX_LABEL_NAME_LEN);
    let key = name.to_lowercase();
    if let Some(id) = label_ids.get(&key) {
        return Ok(*id);
    }
    if let Some(label) = db::label::find_by_name(&mut *conn, &name).await? {
        label_ids.insert(key, label.id);
        return Ok(label.id);
    }
    let sort_order = db::label::next_sort_order(&mut *conn).await?;
    let color = LABEL_PALETTE[(sort_order as usize) % LABEL_PALETTE.len()];
    let label = db::label::insert(&mut *conn, &name, color, None, sort_order).await?;
    created.labels += 1;
    label_ids.insert(key, label.id);
    Ok(label.id)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn timed_task_converts_the_utc_instant_into_the_tasks_timezone() {
        // 00:30 CEST on Jun 25 is written as 22:30 UTC on Jun 24; it must land back on Jun 25.
        assert_eq!(
            parse_due(
                Some("2026-06-24T22:30:00+0000"),
                false,
                Some("Europe/Amsterdam"),
                false
            ),
            (Some("2026-06-25".into()), Some("00:30".into()))
        );
        assert_eq!(
            parse_due(
                Some("2026-06-27T07:30:00+0000"),
                false,
                Some("Europe/Amsterdam"),
                false
            ),
            (Some("2026-06-27".into()), Some("09:30".into()))
        );
        assert_eq!(
            parse_due(
                Some("2026-06-27T01:00:00+0000"),
                false,
                Some("America/New_York"),
                false
            ),
            (Some("2026-06-26".into()), Some("21:00".into()))
        );
    }

    #[test]
    fn all_day_task_converts_its_local_midnight_instant_to_the_right_day() {
        // All-day stored as local midnight in UTC: `2026-06-17T22:00:00+0000` is 18 Jun in Amsterdam.
        assert_eq!(
            parse_due(
                Some("2026-06-17T22:00:00+0000"),
                true,
                Some("Europe/Amsterdam"),
                false
            ),
            (Some("2026-06-18".into()), None)
        );
    }

    #[test]
    fn floating_tasks_keep_their_literal_wall_clock() {
        assert_eq!(
            parse_due(
                Some("2026-06-27T07:30:00+0000"),
                false,
                Some("Europe/Amsterdam"),
                true
            ),
            (Some("2026-06-27".into()), Some("07:30".into()))
        );
        assert_eq!(
            parse_due(Some("2026-06-27T00:00:00+0000"), true, None, true),
            (Some("2026-06-27".into()), None)
        );
    }

    #[test]
    fn unknown_or_missing_timezone_falls_back_to_a_literal_read() {
        assert_eq!(
            parse_due(Some("2026-06-27T07:30:00+0000"), false, None, false),
            (Some("2026-06-27".into()), Some("07:30".into()))
        );
        assert_eq!(
            parse_due(
                Some("2026-06-27T07:30:00+0000"),
                false,
                Some("Not/AZone"),
                false
            ),
            (Some("2026-06-27".into()), Some("07:30".into()))
        );
        assert_eq!(
            parse_due(None, false, Some("Europe/Amsterdam"), false),
            (None, None)
        );
    }

    #[test]
    fn repeat_is_dropped_when_it_has_no_start_or_is_invalid() {
        assert_eq!(parse_repeat(Some("FREQ=DAILY"), None), None);
        assert_eq!(parse_repeat(Some("not a rule"), Some("2026-06-01")), None);
        assert_eq!(
            parse_repeat(Some("RRULE:FREQ=DAILY"), Some("2026-06-01")),
            Some("FREQ=DAILY".into())
        );
    }

    #[test]
    fn completion_signals() {
        assert!(is_completed(Some("1"), None));
        assert!(is_completed(Some("0"), Some("2026-06-20T10:00:00+0000")));
        assert!(!is_completed(Some("0"), None));
        assert!(is_completed(Some("2"), None));
    }
}
