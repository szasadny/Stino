//! Task business rules: validate input, merge partial updates, apply the view
//! sort rule, expand recurring tasks over a window, and record completions.
//! Never imports `axum` or SQL.

use std::collections::HashSet;

use sqlx::SqlitePool;

use crate::config;
use crate::db;
use crate::domain::{NewTask, Task, TaskPatch};
use crate::error::{AppError, AppResult};
use crate::services::recurrence;
use crate::services::validation::{
    clean_optional, non_empty_capped, parse_date, validate_date, validate_time,
};

/// Inbox = unscheduled tasks (`due_date IS NULL`). Recurring tasks always have a
/// start date, so they never appear here.
pub async fn list_inbox(pool: &SqlitePool) -> AppResult<Vec<Task>> {
    Ok(db::task::list_inbox(pool).await?)
}

/// Tasks on a single local date: the one-off tasks on that day plus every
/// recurring task whose rule lands on it, each as its own occurrence. Sorted
/// timed-first then by manual order.
pub async fn list_for_date(pool: &SqlitePool, date: &str) -> AppResult<Vec<Task>> {
    let date = validate_date(date)?;
    let mut tasks = db::task::list_for_date(pool, &date).await?;
    append_recurring(pool, &mut tasks, &date, &date).await?;
    sort_tasks(&mut tasks);
    Ok(tasks)
}

/// Tasks in the inclusive local-date range `[from, to]` for the month/week grid:
/// one-off tasks in the window plus the expanded occurrences of every recurring
/// task. Both bounds are validated; an inverted range yields no rows.
pub async fn list_in_range(pool: &SqlitePool, from: &str, to: &str) -> AppResult<Vec<Task>> {
    let from = validate_date(from)?;
    let to = validate_date(to)?;
    let mut tasks = db::task::list_in_range(pool, &from, &to).await?;
    append_recurring(pool, &mut tasks, &from, &to).await?;
    sort_tasks(&mut tasks);
    Ok(tasks)
}

pub async fn create(pool: &SqlitePool, input: NewTask) -> AppResult<Task> {
    let title = non_empty_capped(&input.title, "task title", config::MAX_TITLE_LEN)?;
    let notes = clean_optional(input.notes);
    if let Some(label_id) = input.label_id {
        ensure_label(pool, label_id).await?;
    }
    let due_date = input.due_date.map(|d| validate_date(&d)).transpose()?;
    let due_time = input.due_time.map(|t| validate_time(&t)).transpose()?;
    require_date_for_time(due_date.as_deref(), due_time.as_deref())?;
    let recurrence_rule = clean_optional(input.recurrence_rule);
    validate_recurrence(recurrence_rule.as_deref(), due_date.as_deref())?;

    let sort_order = db::task::next_sort_order(pool).await?;
    Ok(db::task::insert(
        pool,
        &title,
        notes.as_deref(),
        input.label_id,
        due_date.as_deref(),
        due_time.as_deref(),
        recurrence_rule.as_deref(),
        sort_order,
    )
    .await?)
}

/// Partial update. Absent fields keep their current value; an explicit null
/// clears a nullable field (see [`TaskPatch`]). 404 if the id is unknown.
pub async fn update(pool: &SqlitePool, id: i64, patch: TaskPatch) -> AppResult<Task> {
    let current = db::task::get(pool, id).await?.ok_or(AppError::NotFound)?;

    let title = match patch.title {
        Some(t) => non_empty_capped(&t, "task title", config::MAX_TITLE_LEN)?,
        None => current.title,
    };
    let notes = match patch.notes {
        Some(n) => clean_optional(n),
        None => current.notes,
    };
    let label_id = match patch.label_id {
        Some(Some(label_id)) => {
            ensure_label(pool, label_id).await?;
            Some(label_id)
        }
        Some(None) => None,
        None => current.label_id,
    };
    let due_date = match patch.due_date {
        Some(Some(d)) => Some(validate_date(&d)?),
        Some(None) => None,
        None => current.due_date,
    };
    let due_time = match patch.due_time {
        Some(Some(t)) => Some(validate_time(&t)?),
        Some(None) => None,
        None => current.due_time,
    };
    let recurrence_rule = match patch.recurrence_rule {
        Some(rule) => clean_optional(rule),
        None => current.recurrence_rule,
    };
    require_date_for_time(due_date.as_deref(), due_time.as_deref())?;
    validate_recurrence(recurrence_rule.as_deref(), due_date.as_deref())?;

    db::task::update(
        pool,
        id,
        &title,
        notes.as_deref(),
        label_id,
        due_date.as_deref(),
        due_time.as_deref(),
        recurrence_rule.as_deref(),
    )
    .await?
    .ok_or(AppError::NotFound)
}

pub async fn delete(pool: &SqlitePool, id: i64) -> AppResult<()> {
    if db::task::delete(pool, id).await? {
        Ok(())
    } else {
        Err(AppError::NotFound)
    }
}

/// Persist a new manual order: `ids` is the full ordered list for a list/day,
/// and each task's `sort_order` becomes its position. The client sends only
/// untimed task ids — timed and recurring tasks keep their time-sort — so this
/// just rewrites positions. Atomic: an unknown id is a 404 and changes nothing.
/// An empty list is a no-op.
pub async fn reorder(pool: &SqlitePool, ids: &[i64]) -> AppResult<()> {
    if ids.is_empty() {
        return Ok(());
    }
    match db::task::reorder(pool, ids).await {
        Ok(()) => Ok(()),
        Err(sqlx::Error::RowNotFound) => Err(AppError::NotFound),
        Err(e) => Err(e.into()),
    }
}

/// Mark a task done for an occurrence. `occurrence_date` defaults to the task's
/// own `due_date` (the only occurrence for a non-recurring task; NULL for an
/// Inbox task). Writes a `completion` row — it never mutates the task — and
/// returns the **toggled occurrence** (its `occurrence_date` and `completed`
/// state) so the client can update exactly that row.
pub async fn complete(
    pool: &SqlitePool,
    id: i64,
    occurrence_date: Option<String>,
) -> AppResult<Task> {
    let task = db::task::get(pool, id).await?.ok_or(AppError::NotFound)?;
    let occurrence = resolve_occurrence(&task, occurrence_date)?;
    db::task::add_completion(pool, id, occurrence.as_deref()).await?;
    Ok(occurrence_view(task, occurrence, true))
}

/// Reopen a task for an occurrence by removing its completion row. Returns the
/// toggled occurrence with `completed = false`.
pub async fn uncomplete(
    pool: &SqlitePool,
    id: i64,
    occurrence_date: Option<String>,
) -> AppResult<Task> {
    let task = db::task::get(pool, id).await?.ok_or(AppError::NotFound)?;
    let occurrence = resolve_occurrence(&task, occurrence_date)?;
    db::task::remove_completion(pool, id, occurrence.as_deref()).await?;
    Ok(occurrence_view(task, occurrence, false))
}

/// Expand every recurring task across `[from, to]` and append one `Task` per
/// occurrence — `occurrence_date` set to the instance date and `completed`
/// resolved from that task's completion rows in the window.
async fn append_recurring(
    pool: &SqlitePool,
    out: &mut Vec<Task>,
    from: &str,
    to: &str,
) -> AppResult<()> {
    let from_date = parse_date(from)?;
    let to_date = parse_date(to)?;
    for task in db::task::list_recurring_through(pool, to).await? {
        let (Some(rule), Some(start)) = (task.recurrence_rule.as_deref(), task.due_date.as_deref())
        else {
            continue; // a recurring row always has both; skip defensively
        };
        let dates = recurrence::expand(rule, parse_date(start)?, from_date, to_date)?;
        if dates.is_empty() {
            continue;
        }
        let done: HashSet<String> = db::task::completed_occurrences(pool, task.id, from, to)
            .await?
            .into_iter()
            .collect();
        for date in dates {
            let occurrence = date.format(config::DATE_FORMAT).to_string();
            out.push(Task {
                completed: done.contains(&occurrence),
                occurrence_date: Some(occurrence),
                ..task.clone()
            });
        }
    }
    Ok(())
}

/// The view sort rule across a (possibly multi-day) result set: by occurrence
/// day, then timed tasks first by `due_time`, then manual `sort_order`, then id.
/// `occurrence_date` is `YYYY-MM-DD`, so lexicographic order is chronological.
fn sort_tasks(tasks: &mut [Task]) {
    tasks.sort_by(|a, b| {
        a.occurrence_date
            .cmp(&b.occurrence_date)
            .then_with(|| a.due_time.is_none().cmp(&b.due_time.is_none()))
            .then_with(|| a.due_time.cmp(&b.due_time))
            .then_with(|| a.sort_order.cmp(&b.sort_order))
            .then_with(|| a.id.cmp(&b.id))
    });
}

/// Pick the occurrence to (un)complete: the given date if provided, else the
/// task's own `due_date` (NULL for an Inbox task).
fn resolve_occurrence(task: &Task, occurrence_date: Option<String>) -> AppResult<Option<String>> {
    match occurrence_date {
        Some(d) => Ok(Some(validate_date(&d)?)),
        None => Ok(task.due_date.clone()),
    }
}

/// Present a task as the single occurrence that was just toggled.
fn occurrence_view(mut task: Task, occurrence: Option<String>, completed: bool) -> Task {
    task.occurrence_date = occurrence;
    task.completed = completed;
    task
}

/// A timed task must be scheduled: a `due_time` without a `due_date` has nothing
/// to anchor to and can't be placed on the calendar.
fn require_date_for_time(due_date: Option<&str>, due_time: Option<&str>) -> AppResult<()> {
    if due_time.is_some() && due_date.is_none() {
        return Err(AppError::Validation(
            "a task with a time must also have a date".into(),
        ));
    }
    Ok(())
}

/// A recurring task needs a start date (DTSTART) and a parseable RRULE. The rule
/// is validated by the recurrence service against that start.
fn validate_recurrence(rule: Option<&str>, due_date: Option<&str>) -> AppResult<()> {
    let Some(rule) = rule else {
        return Ok(());
    };
    let Some(date) = due_date else {
        return Err(AppError::Validation(
            "a recurring task must have a date".into(),
        ));
    };
    recurrence::validate(rule, parse_date(date)?)
}

async fn ensure_label(pool: &SqlitePool, label_id: i64) -> AppResult<()> {
    if db::label::get(pool, label_id).await?.is_some() {
        Ok(())
    } else {
        Err(AppError::Validation("unknown label".into()))
    }
}
