use serde::Serialize;

/// A task. Mirrors the `task` table plus a derived `completed` flag (true when a
/// `completion` row exists for this task's current occurrence). Mirror `Task` in
/// `frontend/src/lib/types.ts`.
///
/// `due_date` NULL ⇒ the task lives in the **Inbox** (unscheduled); `due_time`
/// NULL ⇒ untimed. Both are local-timezone text (`YYYY-MM-DD` / `HH:MM`), never
/// UTC instants.
///
/// `recurrence_rule` is the stored series definition; `due_date` is its start
/// (DTSTART). For a recurring task the calendar/day queries return **one `Task`
/// per occurrence** in the window: `due_date` stays the series start while
/// `occurrence_date` carries the specific instance being rendered, and
/// `completed` reflects that instance. For a one-off task `occurrence_date`
/// equals `due_date`. Clients key rows by `(id, occurrence_date)`.
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

/// Fields for creating a task. `title` is required; the rest are optional.
/// `recurrence_rule` (an RRULE) makes the task recurring and requires a
/// `due_date` to anchor the series start.
#[derive(Debug, Clone)]
pub struct NewTask {
    pub title: String,
    pub notes: Option<String>,
    pub label_id: Option<i64>,
    pub due_date: Option<String>,
    pub due_time: Option<String>,
    pub recurrence_rule: Option<String>,
}

/// A partial update. Each field uses `Option<Option<T>>` (the nullable ones) to
/// distinguish three cases the API needs:
/// `None` ⇒ absent, keep the current value; `Some(None)` ⇒ explicit null, clear
/// it; `Some(Some(v))` ⇒ set it. `title` is non-nullable, so a plain `Option`.
#[derive(Debug, Clone, Default)]
pub struct TaskPatch {
    pub title: Option<String>,
    pub notes: Option<Option<String>>,
    pub label_id: Option<Option<i64>>,
    pub due_date: Option<Option<String>>,
    pub due_time: Option<Option<String>>,
    pub recurrence_rule: Option<Option<String>>,
}
