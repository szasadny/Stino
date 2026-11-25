use super::csv::{
    Row, COL_ALL_DAY, COL_COMPLETED, COL_CONTENT, COL_DUE, COL_FLOATING, COL_LIST, COL_REPEAT,
    COL_STATUS, COL_TAGS, COL_TIMEZONE, COL_TITLE,
};
use super::due::{parse_due, zone, Clock};
use crate::config::MAX_TITLE_LEN;
use crate::domain::NewTask;
use crate::services::recurrence;
use crate::services::validation::parse_date_lenient;

// TickTick's default list — not mapped to a label.
const DEFAULT_LIST: &str = "inbox";
const TAG_SEPARATOR: char = ',';
const STATUS_COMPLETED: &str = "1";
// Archived is only ever reached from completed.
const STATUS_ARCHIVED: &str = "2";

pub(super) struct RowDraft {
    pub(super) task: NewTask,
    pub(super) label: Option<String>,
    pub(super) completed: bool,
}

pub(super) fn map_row(row: Row<'_>) -> Option<RowDraft> {
    let (title, notes) = fit_title(row.get(COL_TITLE)?, row.get(COL_CONTENT));
    let (due_date, due_time) = parse_due(
        row.get(COL_DUE),
        Clock::from_all_day(row.get(COL_ALL_DAY)),
        zone(row.get(COL_TIMEZONE), row.get(COL_FLOATING)),
    );
    let completed = is_completed(row.get(COL_STATUS), row.get(COL_COMPLETED));
    // TickTick exports each ticked-off instance of a series as its own completed row.
    let recurrence_rule = if completed {
        None
    } else {
        parse_repeat(row.get(COL_REPEAT), due_date.as_deref())
    };
    Some(RowDraft {
        task: NewTask {
            title,
            notes,
            label_id: None,
            due_date,
            due_time,
            recurrence_rule,
        },
        label: pick_label(row),
        completed,
    })
}

// A rule without a start date or that fails to validate is dropped; the task still imports.
fn parse_repeat(raw: Option<&str>, due_date: Option<&str>) -> Option<String> {
    let raw = raw?;
    let start = due_date.and_then(parse_date_lenient)?;
    let rule = recurrence::normalize(raw);
    recurrence::validate(&rule, start).ok().map(|()| rule)
}

fn pick_label(row: Row<'_>) -> Option<String> {
    if let Some(tags) = row.get(COL_TAGS) {
        if let Some(first) = tags
            .split(TAG_SEPARATOR)
            .map(str::trim)
            .find(|t| !t.is_empty())
        {
            return Some(first.to_string());
        }
    }
    row.get(COL_LIST)
        .filter(|list| !list.eq_ignore_ascii_case(DEFAULT_LIST))
        .map(str::to_string)
}

fn is_completed(status: Option<&str>, completed_time: Option<&str>) -> bool {
    matches!(status, Some(STATUS_COMPLETED | STATUS_ARCHIVED)) || completed_time.is_some()
}

// Clamp rather than let the validator skip the row; the full title moves into the notes.
fn fit_title(title: &str, content: Option<&str>) -> (String, Option<String>) {
    if title.chars().count() <= MAX_TITLE_LEN {
        return (title.to_string(), content.map(str::to_string));
    }
    let notes = match content {
        Some(content) => format!("{title}\n\n{content}"),
        None => title.to_string(),
    };
    (title.chars().take(MAX_TITLE_LEN).collect(), Some(notes))
}

#[cfg(test)]
mod tests {
    use super::*;

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
