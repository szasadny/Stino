//! TickTick CSV import: map a TickTick backup export into our model.
//!
//! **Add-only** — it never deletes existing data (Hard Rule 3) — and **per-row
//! tolerant**: a row that can't be mapped (e.g. no title) is skipped, not fatal,
//! and the summary reports how many. Labels dedupe by name (case-insensitive);
//! tasks are add-only (the export carries no id we trust), so a re-run appends.
//!
//! Dates/times are read **literally** from the export string — the calendar date
//! and wall-clock time exactly as TickTick wrote them — with **no timezone
//! conversion**. The trailing offset (`+0000`) is annotation, not a cue to
//! convert, so a task can never shift a day (Hard Rule 7).
//!
//! Validation and ordering are not duplicated here: each mapped row is created
//! through [`task_service::create`], the one place that enforces the task rules.

use std::collections::HashMap;

use chrono::{NaiveDate, NaiveTime};
use sqlx::SqlitePool;

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
const COL_REPEAT: &str = "repeat";
const COL_STATUS: &str = "status";
const COL_COMPLETED: &str = "completed time";

/// TickTick's default list; mapping it to a label would mint a confusing "Inbox"
/// label, so the list fallback skips it.
const DEFAULT_LIST: &str = "inbox";

/// Lowercased TickTick column name → its index in the data rows.
type Headers = HashMap<String, usize>;

/// Import a TickTick CSV backup. Returns the counts created plus how many rows
/// were skipped. A mapping problem skips one row; only a real database error
/// aborts the whole import.
pub async fn import_ticktick(pool: &SqlitePool, csv_bytes: &[u8]) -> AppResult<ImportSummary> {
    let text = decode(csv_bytes);
    let (headers, records) = parse_csv(&text)?;

    let mut created = ImportCreated::default();
    let mut skipped = 0usize;
    // Lowercased label name → id, so a tag/list seen twice in one file reuses the
    // same label without re-querying.
    let mut label_ids: HashMap<String, i64> = HashMap::new();

    for record in &records {
        // A titleless row is the one thing we can't import — skip it.
        let Some(title) = field(record, &headers, COL_TITLE) else {
            skipped += 1;
            continue;
        };

        let notes = field(record, &headers, COL_CONTENT).map(str::to_string);
        let (due_date, due_time) = parse_due(
            field(record, &headers, COL_DUE),
            is_all_day(field(record, &headers, COL_ALL_DAY)),
        );
        let recurrence_rule =
            parse_repeat(field(record, &headers, COL_REPEAT), due_date.as_deref());

        let label_id = match pick_label(record, &headers) {
            Some(name) => Some(resolve_label(pool, &mut label_ids, &mut created, &name).await?),
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

        // task_service::create is the single validator; a Validation error means
        // this row's data is unusable, so skip it. A Db error is infrastructure,
        // not data, so it aborts.
        match task_service::create(pool, new_task).await {
            Ok(task) => {
                created.tasks += 1;
                if is_completed(
                    field(record, &headers, COL_STATUS),
                    field(record, &headers, COL_COMPLETED),
                ) {
                    // Mark the task done for its own occurrence (the series start
                    // for a recurring task; NULL for an undated Inbox task).
                    db::task::add_completion(pool, task.id, task.due_date.as_deref()).await?;
                    created.completions += 1;
                }
            }
            Err(AppError::Validation(_)) => skipped += 1,
            Err(e) => return Err(e),
        }
    }

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

/// TickTick's "Is All Day" is `true`/`false`; absent/blank ⇒ not all-day.
fn is_all_day(raw: Option<&str>) -> bool {
    raw.is_some_and(|v| v.eq_ignore_ascii_case("true"))
}

/// Read the calendar date and wall-clock time **literally** from a TickTick due
/// date (`2026-06-24T09:00:00+0000`), with no timezone math (Hard Rule 7). An
/// all-day task keeps only the date; an unparseable date drops to the Inbox
/// rather than losing the task.
fn parse_due(raw: Option<&str>, all_day: bool) -> (Option<String>, Option<String>) {
    let Some(raw) = raw else {
        return (None, None);
    };
    let (date_part, time_part) = match raw.split_once('T') {
        Some((date, rest)) => (date, Some(rest)),
        None => (raw, None),
    };
    let Ok(date) = NaiveDate::parse_from_str(date_part, config::DATE_FORMAT) else {
        return (None, None);
    };
    let due_date = Some(date.format(config::DATE_FORMAT).to_string());
    if all_day {
        return (due_date, None);
    }
    // Take the leading HH:MM of the time component; ignore seconds and offset.
    let due_time = time_part
        .and_then(|t| t.get(0..5))
        .and_then(|hhmm| NaiveTime::parse_from_str(hhmm, config::TIME_FORMAT).ok())
        .map(|t| t.format(config::TIME_FORMAT).to_string());
    (due_date, due_time)
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
/// for a given starting database.
async fn resolve_label(
    pool: &SqlitePool,
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
    if let Some(label) = db::label::find_by_name(pool, &name).await? {
        label_ids.insert(key, label.id);
        return Ok(label.id);
    }
    let sort_order = db::label::next_sort_order(pool).await?;
    let color = LABEL_PALETTE[(sort_order as usize) % LABEL_PALETTE.len()];
    let label = db::label::insert(pool, &name, color, None, sort_order).await?;
    created.labels += 1;
    label_ids.insert(key, label.id);
    Ok(label.id)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_due_literally_without_shifting_the_day() {
        // A late-evening UTC time and an all-day date in a +0800 zone must both
        // keep their literal calendar date — no UTC conversion (Hard Rule 7).
        assert_eq!(
            parse_due(Some("2026-06-24T23:30:00+0000"), false),
            (Some("2026-06-24".into()), Some("23:30".into()))
        );
        assert_eq!(
            parse_due(Some("2026-06-24T00:00:00+0800"), true),
            (Some("2026-06-24".into()), None)
        );
        assert_eq!(parse_due(None, false), (None, None));
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
