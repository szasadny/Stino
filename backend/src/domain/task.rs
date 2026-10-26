use serde::Serialize;

/// Mirror `Task` in `frontend/src/lib/types.ts`. `completed` is derived per occurrence.
///
/// For a recurring task the range/date queries return one `Task` per occurrence:
/// `due_date` stays the series start (DTSTART) and `occurrence_date` is the instance,
/// so clients key rows by `(id, occurrence_date)`.
#[derive(Debug, Clone, Serialize)]
pub struct Task {
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

/// A `recurrence_rule` requires a `due_date` to anchor the series.
#[derive(Debug, Clone)]
pub struct NewTask {
    pub title: String,
    pub notes: Option<String>,
    pub label_id: Option<i64>,
    pub due_date: Option<String>,
    pub due_time: Option<String>,
    pub recurrence_rule: Option<String>,
}

/// Inbox multi-select; each op is one atomic batch.
#[derive(Debug, Clone)]
pub enum BatchOp {
    SetLabel(Option<i64>),
    Schedule(String),
    Complete,
    Delete,
}

/// Overdue one-offs moved plus new copies of missed recurring series. Mirror
/// `RolloverSummary` in `frontend/src/lib/types.ts`.
#[derive(Debug, Clone, Serialize)]
pub struct RolloverSummary {
    pub moved: u64,
}

/// `None` ⇒ keep, `Some(None)` ⇒ clear, `Some(Some(v))` ⇒ set.
#[derive(Debug, Clone, Default)]
pub struct TaskPatch {
    pub title: Option<String>,
    pub notes: Option<Option<String>>,
    pub label_id: Option<Option<i64>>,
    pub due_date: Option<Option<String>>,
    pub due_time: Option<Option<String>>,
    pub recurrence_rule: Option<Option<String>>,
}
