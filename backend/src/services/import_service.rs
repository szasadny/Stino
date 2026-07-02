//! TickTick CSV import: map a TickTick backup export into our model.
//!
//! **Add-only** — it never deletes existing data (Hard Rule 3) — and **per-row
//! tolerant**: a row that can't be mapped (e.g. no title) is skipped, not fatal,
//! and the summary reports how many. Labels dedupe by name (case-insensitive);
//! tasks are add-only (the export carries no id we trust), so a re-run appends.
//!
//! Dates/times honour the export's timezone (Hard Rule 7 — our stored local date
//! must match what the user saw, never slip a day). TickTick writes a Due Date as
//! a **UTC instant** (`…+0000`) plus a `Timezone` column (e.g. `Europe/Amsterdam`)
//! and displays it converted into that zone — so we convert the instant into the
//! task's timezone before reading its local date (and time, when timed). This
//! holds for **all-day** tasks too: TickTick stores those as *local midnight in
//! UTC* (e.g. `2026-06-17T22:00:00+0000` is midnight 18 Jun in Amsterdam), so a
//! literal read of the UTC date was the "imported a day too soon" bug — every
//! all-day task landed on the previous day. **Floating** tasks (`Is Floating`)
//! carry a zone-independent wall-clock and are kept literally; we also fall back
//! to a literal read when the timezone is missing/unknown or the instant won't
//! parse, degrading rather than losing the task.
//!
//! Validation and ordering are not duplicated here: each mapped row is created
//! through [`task_service::create`], the one place that enforces the task rules.

use std::collections::HashMap;

use chrono::{DateTime, NaiveDate, NaiveTime};
use chrono_tz::Tz;
use sqlx::{SqliteConnection, SqlitePool};

use crate::config;
use crate::db;
use crate::domain::{ImportCreated, ImportSummary, NewTask, LABEL_PALETTE};
use crate::error::{AppError, AppResult};
use crate::services::{recurrence, task_service};

// TickTick CSV column names we read, lowercased (the header map is lowercased so
// matching is case-insensitive). Columns we don't map — Reminder, Priority,
// Start Date, Order, taskId, … — are simply never looked up.
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

/// TickTick's default list; mapping it to a label would mint a confusing "Inbox"
/// label, so the list fallback skips it.
const DEFAULT_LIST: &str = "inbox";

/// How TickTick writes a Due Date instant: an offset with no colon (`+0000`), so
/// it parses with `%z`, not RFC-3339 (which wants `+00:00`).
const TICKTICK_DT_FORMAT: &str = "%Y-%m-%dT%H:%M:%S%z";

/// Lowercased TickTick column name → its index in the data rows.
type Headers = HashMap<String, usize>;

/// Import a TickTick CSV backup. Returns the counts created plus how many rows
/// were skipped. A mapping problem skips one row; only a real database error
/// aborts the whole import — and because every row runs in ONE transaction, an
/// abort rolls all of it back, so a failed import leaves the database untouched
/// (a re-run can't duplicate the rows before the failure).
pub async fn import_ticktick(pool: &SqlitePool, csv_bytes: &[u8]) -> AppResult<ImportSummary> {
    let text = decode(csv_bytes);
    let (headers, records) = parse_csv(&text)?;

    let mut created = ImportCreated::default();
    let mut skipped = 0usize;
    // Lowercased label name → id, so a tag/list seen twice in one file reuses the
    // same label without re-querying.
    let mut label_ids: HashMap<String, i64> = HashMap::new();

    // One transaction for the whole file. Returning an error drops it
    // uncommitted, so any Db failure rolls every imported row back.
    let mut tx = pool.begin().await?;

    for record in &records {
        // A titleless row is the one thing we can't import — skip it.
        let Some(title) = field(record, &headers, COL_TITLE) else {
            skipped += 1;
            continue;
        };

        let notes = field(record, &headers, COL_CONTENT).map(str::to_string);
        let (due_date, due_time) = parse_due(
            field(record, &headers, COL_DUE),
            is_true(field(record, &headers, COL_ALL_DAY)),
            field(record, &headers, COL_TIMEZONE),
            is_true(field(record, &headers, COL_FLOATING)),
        );
        let recurrence_rule =
            parse_repeat(field(record, &headers, COL_REPEAT), due_date.as_deref());

        let label_id = match pick_label(record, &headers) {
            Some(name) => Some(resolve_label(&mut tx, &mut label_ids, &mut created, &name).await?),
            None => None,
        };

        let new_task = NewTask {
            title: title.to_string(),
            notes,
            label_id,
            due_date,
            due_time,
            recurrence_rule,
        };

        // task_service::create_on is the single validator; a Validation error
        // means this row's data is unusable, so skip it. A Db error is
        // infrastructure, not data, so it aborts (and rolls the import back).
        match task_service::create_on(&mut tx, new_task).await {
            Ok(task) => {
                created.tasks += 1;
                if is_completed(
                    field(record, &headers, COL_STATUS),
                    field(record, &headers, COL_COMPLETED),
                ) {
                    // Mark the task done for its own occurrence (the series start
                    // for a recurring task; NULL for an undated Inbox task).
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

/// Decode the upload as UTF-8 (lossy, to tolerate stray bytes), stripping a
/// leading BOM that some exports include.
fn decode(bytes: &[u8]) -> String {
    let bytes = bytes.strip_prefix(b"\xEF\xBB\xBF").unwrap_or(bytes);
    String::from_utf8_lossy(bytes).into_owned()
}

/// Split the CSV into a lowercased header map and the data rows after it. A
/// TickTick export prefixes a few metadata lines ("Date: …", "Version: …") before
/// the real header, so we scan for the first row that has a `Title` column and
/// treat everything after it as data. `flexible` is required because those
/// preamble lines have a different field count than the header.
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
            // Still looking for the header: ignore preamble lines until we find it.
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

/// A header row maps lowercased column name → index — but only if it actually has
/// a `Title` column, which is how we tell the header apart from a preamble line.
fn header_map(record: &csv::StringRecord) -> Option<Headers> {
    let map: Headers = record
        .iter()
        .enumerate()
        .map(|(index, name)| (name.trim().to_lowercase(), index))
        .collect();
    map.contains_key(COL_TITLE).then_some(map)
}

/// A trimmed, non-empty cell by column name, or `None` if the column is absent,
/// out of range for this row, or blank.
fn field<'a>(record: &'a csv::StringRecord, headers: &Headers, name: &str) -> Option<&'a str> {
    let index = *headers.get(name)?;
    let value = record.get(index)?.trim();
    (!value.is_empty()).then_some(value)
}

/// A TickTick boolean column (`Is All Day`, `Is Floating`) is `true`/`false`;
/// absent/blank ⇒ false.
fn is_true(raw: Option<&str>) -> bool {
    raw.is_some_and(|v| v.eq_ignore_ascii_case("true"))
}

/// Resolve a TickTick Due Date into our stored local `(due_date, due_time)`.
///
/// A **timed, non-floating** task is a UTC instant (`2026-06-24T22:30:00+0000`)
/// that TickTick shows in its `timezone` column's zone, so we convert into that
/// zone before reading the date + time — otherwise an early-morning local time
/// lands a day too soon (Hard Rule 7). **All-day** tasks (a floating UTC-midnight
/// date) and **floating** tasks (a zone-independent wall-clock) are read
/// literally — converting them could itself slip a day. We also fall back to the
/// literal read when the timezone is missing/unknown or the instant won't parse,
/// degrading rather than losing the task; an unparseable date drops to the Inbox.
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

    // A non-floating Due Date is a UTC instant TickTick shows in its `timezone`
    // zone — and that includes ALL-DAY tasks, which it stores as **local midnight
    // expressed in UTC** (e.g. `2026-06-17T22:00:00+0000` is midnight 18 Jun in
    // Amsterdam). So convert the instant into the zone before reading the date,
    // then drop the time for all-day. Reading the literal UTC date put these a day
    // too soon (the import bug).
    if !floating {
        if let Some((date, time)) = timezone
            .and_then(|name| name.parse::<Tz>().ok())
            .and_then(|tz| to_local(raw, tz))
        {
            let due_time = (!all_day).then(|| fmt_time(time));
            return (Some(fmt_date(date)), due_time);
        }
    }

    // Floating, or no usable timezone: read the literal wall-clock (no convert) —
    // the leading HH:MM, ignoring seconds and offset; all-day drops the time.
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

/// Convert a TickTick UTC instant string into a wall-clock date + time in `tz`.
/// `None` if the instant doesn't parse, so the caller can fall back to a literal
/// read.
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

/// Map TickTick's Repeat column to a stored recurrence rule. The rule needs a
/// start date (DTSTART) and must parse; if either fails we drop the recurrence
/// but still import the task (degrade, never lose it). TickTick may prefix the
/// rule with `RRULE:`; our stored form is the bare rule, so strip it.
fn parse_repeat(raw: Option<&str>, due_date: Option<&str>) -> Option<String> {
    let raw = raw?;
    let start = due_date.and_then(|d| NaiveDate::parse_from_str(d, config::DATE_FORMAT).ok())?;
    let rule = normalize_rule(raw);
    recurrence::validate(&rule, start).ok().map(|()| rule)
}

/// Strip a leading `RRULE:` (any case) and surrounding whitespace.
fn normalize_rule(raw: &str) -> String {
    let trimmed = raw.trim();
    let body = match trimmed.get(0..6) {
        Some(prefix) if prefix.eq_ignore_ascii_case("RRULE:") => &trimmed[6..],
        _ => trimmed,
    };
    body.trim().to_string()
}

/// The label name for a row: the first Tag (TickTick's colored labels), else the
/// List name (its project) — but never the default "Inbox" list, which isn't a
/// real label. `None` ⇒ no label.
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

/// A task counts as done if TickTick marked its status Completed (`1`) or stamped
/// a Completed Time.
fn is_completed(status: Option<&str>, completed_time: Option<&str>) -> bool {
    status == Some("1") || completed_time.is_some()
}

/// Find or create the label for `name`, caching the id. New labels take the next
/// palette color deterministically (by append position), so colors are stable
/// for a given starting database. Runs on the import's transaction connection so
/// created labels roll back with the rest of a failed import.
async fn resolve_label(
    conn: &mut SqliteConnection,
    label_ids: &mut HashMap<String, i64>,
    created: &mut ImportCreated,
    name: &str,
) -> AppResult<i64> {
    let name: String = name
        .trim()
        .chars()
        .take(config::MAX_LABEL_NAME_LEN)
        .collect();
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
        // The reported bug: TickTick stores a timed task as a UTC instant. An
        // early-morning Amsterdam time (00:30 CEST on Jun 25) is written as the
        // *previous* UTC day (22:30 on Jun 24). Read literally it imported a day
        // too soon at the wrong clock; converted into Europe/Amsterdam it must
        // land back on Jun 25 at 00:30.
        assert_eq!(
            parse_due(
                Some("2026-06-24T22:30:00+0000"),
                false,
                Some("Europe/Amsterdam"),
                false
            ),
            (Some("2026-06-25".into()), Some("00:30".into()))
        );
        // A daytime instant shifts only the clock by the offset, not the day:
        // 07:30 UTC → 09:30 CEST, still Jun 27.
        assert_eq!(
            parse_due(
                Some("2026-06-27T07:30:00+0000"),
                false,
                Some("Europe/Amsterdam"),
                false
            ),
            (Some("2026-06-27".into()), Some("09:30".into()))
        );
        // A western zone shifts the other way: 01:00 UTC Jun 27 → 21:00 EDT Jun 26.
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
        // The real bug from the user's export: TickTick stores an all-day task as
        // LOCAL midnight expressed in UTC — `2026-06-17T22:00:00+0000` is midnight
        // 18 Jun in Amsterdam (CEST). A literal read gave 17 Jun (a day too soon);
        // converting into the zone must yield 18 Jun, with no time.
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
        // A floating task's wall-clock is zone-independent — kept literally, no
        // conversion (date and time both as written).
        assert_eq!(
            parse_due(
                Some("2026-06-27T07:30:00+0000"),
                false,
                Some("Europe/Amsterdam"),
                true
            ),
            (Some("2026-06-27".into()), Some("07:30".into()))
        );
        // A floating all-day task keeps its literal date and drops the time.
        assert_eq!(
            parse_due(Some("2026-06-27T00:00:00+0000"), true, None, true),
            (Some("2026-06-27".into()), None)
        );
    }

    #[test]
    fn unknown_or_missing_timezone_falls_back_to_a_literal_read() {
        // No timezone column, or an unrecognised name: degrade to the literal
        // wall-clock rather than losing the time.
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
    fn normalize_rule_strips_the_rrule_prefix_any_case() {
        assert_eq!(normalize_rule("RRULE:FREQ=DAILY"), "FREQ=DAILY");
        assert_eq!(normalize_rule(" rrule:FREQ=WEEKLY "), "FREQ=WEEKLY");
        assert_eq!(normalize_rule("FREQ=DAILY"), "FREQ=DAILY");
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
        assert!(!is_completed(Some("2"), None)); // archived, no completed time
    }
}
