use serde::{Deserialize, Serialize};

use super::double_option;
use crate::error::ValidationError;

// Mirror `Task` in `frontend/src/lib/types.ts`.
#[derive(Debug, Clone, Serialize)]
pub(crate) struct Task {
    pub id: i64,
    pub title: String,
    pub notes: Option<String>,
    pub label_id: Option<i64>,
    pub due_date: Option<String>,
    pub due_time: Option<String>,
    pub recurrence_rule: Option<String>,
    pub occurrence_date: Option<String>,
    pub sort_order: i64,
    pub completed: bool,
}

#[derive(Debug, Clone, Copy)]
pub(crate) struct Series<'a> {
    pub rule: &'a str,
    pub start: &'a str,
}

impl Task {
    pub(crate) fn series(&self) -> Option<Series<'_>> {
        Some(Series {
            rule: self.recurrence_rule.as_deref()?,
            start: self.due_date.as_deref()?,
        })
    }
}

#[derive(Debug, Deserialize)]
pub(crate) struct NewTask {
    pub title: String,
    pub notes: Option<String>,
    pub label_id: Option<i64>,
    pub due_date: Option<String>,
    pub due_time: Option<String>,
    pub recurrence_rule: Option<String>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct TaskPatch {
    pub title: Option<String>,
    #[serde(default, deserialize_with = "double_option")]
    pub notes: Option<Option<String>>,
    #[serde(default, deserialize_with = "double_option")]
    pub label_id: Option<Option<i64>>,
    #[serde(default, deserialize_with = "double_option")]
    pub due_date: Option<Option<String>>,
    #[serde(default, deserialize_with = "double_option")]
    pub due_time: Option<Option<String>>,
    #[serde(default, deserialize_with = "double_option")]
    pub recurrence_rule: Option<Option<String>>,
}

impl TaskPatch {
    pub(crate) fn apply_to(self, current: Task) -> NewTask {
        NewTask {
            title: self.title.unwrap_or(current.title),
            notes: self.notes.unwrap_or(current.notes),
            label_id: self.label_id.unwrap_or(current.label_id),
            due_date: self.due_date.unwrap_or(current.due_date),
            due_time: self.due_time.unwrap_or(current.due_time),
            recurrence_rule: self.recurrence_rule.unwrap_or(current.recurrence_rule),
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub(crate) enum BatchOp {
    Label {
        #[serde(default)]
        label_id: Option<i64>,
    },
    Schedule {
        due_date: String,
    },
    Complete,
    Delete,
}

#[derive(Debug)]
pub(crate) enum TaskSelector {
    Inbox,
    Day(String),
    Range { from: String, to: String },
}

impl TaskSelector {
    pub(crate) fn from_params(
        inbox: Option<bool>,
        date: Option<String>,
        from: Option<String>,
        to: Option<String>,
    ) -> Result<Self, ValidationError> {
        match (from, to, date) {
            (Some(from), Some(to), _) => Ok(Self::Range { from, to }),
            (Some(_), None, _) | (None, Some(_), _) => Err(ValidationError::RangeNeedsBothBounds),
            (None, None, Some(date)) => Ok(Self::Day(date)),
            (None, None, None) if inbox == Some(false) => Err(ValidationError::InboxMustBeTrue),
            (None, None, None) => Ok(Self::Inbox),
        }
    }
}

#[derive(Debug)]
pub(crate) enum MoveOutcome {
    Moved(Task),
    Unchanged(Task),
}

// Mirror `RolloverSummary` in `frontend/src/lib/types.ts`.
#[derive(Debug, Clone, Serialize)]
pub(crate) struct RolloverSummary {
    pub moved: u64,
}
