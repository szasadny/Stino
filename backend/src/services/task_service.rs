//! Task business rules: validate input, merge partial updates, apply the view
//! sort rule, expand recurring tasks over a window, and record completions.
//! Never imports `axum` or SQL.

use std::collections::HashSet;

use sqlx::{SqliteConnection, SqliteExecutor, SqlitePool};

use crate::config;
use crate::db;
use crate::domain::{BatchOp, NewTask, Task, TaskPatch};
use crate::error::{map_row_not_found, AppError, AppResult};
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
    let mut conn = pool.acquire().await?;
    create_on(&mut conn, input).await
}

/// [`create`] on a single connection, so the importer can validate and insert
/// every row inside its one transaction. The validation lives here — the one
/// place that enforces the task rules — not forked per caller.
pub(crate) async fn create_on(conn: &mut SqliteConnection, input: NewTask) -> AppResult<Task> {
    let title = non_empty_capped(&input.title, "task title", config::MAX_TITLE_LEN)?;
    let notes = clean_optional(input.notes);
    if let Some(label_id) = input.label_id {
        ensure_label(&mut *conn, label_id).await?;
    }
    let due_date = input.due_date.map(|d| validate_date(&d)).transpose()?;
    let due_time = input.due_time.map(|t| validate_time(&t)).transpose()?;
    require_date_for_time(due_date.as_deref(), due_time.as_deref())?;
    let recurrence_rule = clean_optional(input.recurrence_rule);
    validate_recurrence(recurrence_rule.as_deref(), due_date.as_deref())?;

    let sort_order = db::task::next_sort_order(&mut *conn).await?;
    Ok(db::task::insert(
        &mut *conn,
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
    // Capture the pre-update date/recurrence before the merge below consumes
    // `current`; the completion migration after the write needs the old values.
    let prev_due_date = current.due_date.clone();
    let was_recurring = current.recurrence_rule.is_some();

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

    // A non-recurring task's completion is keyed to its `due_date`
    // (`completed` = a completion exists at `occurrence_date IS due_date`), so
    // rescheduling it to another day would otherwise strand that completion and
    // reopen the task. Carry the completion across with the move — atomically,
    // in the same transaction as the date change. Recurring tasks key
    // completions per instance date, so theirs are left untouched.
    let reschedules = !was_recurring && recurrence_rule.is_none() && prev_due_date != due_date;

    let task = if reschedules {
        db::task::update_rescheduled(
            pool,
            id,
            &title,
            notes.as_deref(),
            label_id,
            due_date.as_deref(),
            due_time.as_deref(),
            prev_due_date.as_deref(),
        )
        .await?
    } else {
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
    };
    task.ok_or(AppError::NotFound)
}

pub async fn delete(pool: &SqlitePool, id: i64) -> AppResult<()> {
    if db::task::delete(pool, id).await? {
        Ok(())
    } else {
        Err(AppError::NotFound)
    }
}

/// Move a SINGLE occurrence of a recurring task to another day, TickTick-style: the
/// series keeps repeating, but the chosen instance is detached into its own one-off
/// task on `new_date` (copying title/notes/label/time, no recurrence) while the series
/// skips the original date via a `task_exception`. Validates that the task is recurring
/// and that `occurrence_date` is a real instance of the series that hasn't already been
/// detached (re-detaching it would orphan a second one-off). A same-day move is a
/// no-op. 404 if the id is unknown; 400 if it isn't a recurring task, the date isn't an
/// occurrence, or it has already been moved.
pub async fn move_occurrence(
    pool: &SqlitePool,
    id: i64,
    occurrence_date: String,
    new_date: String,
) -> AppResult<Task> {
    let occurrence_date = validate_date(&occurrence_date)?;
    let new_date = validate_date(&new_date)?;
    let task = db::task::get(pool, id).await?.ok_or(AppError::NotFound)?;
    let (Some(rule), Some(start)) = (task.recurrence_rule.as_deref(), task.due_date.as_deref())
    else {
        return Err(AppError::Validation(
            "only a recurring task's occurrence can be moved".into(),
        ));
    };
    // The date must actually be an instance of the series, or there is nothing to detach.
    ensure_series_member(rule, start, &occurrence_date)?;
    if new_date == occurrence_date {
        return Ok(task); // a no-op move — keep the series untouched
    }
    // Already detached? The `task_exception` insert is idempotent, but creating the one-off
    // is not — a second move of the same instance would orphan a duplicate. Reject it.
    ensure_not_detached(
        pool,
        id,
        &occurrence_date,
        "that occurrence has already been moved",
    )
    .await?;
    Ok(db::task::move_occurrence(pool, id, &occurrence_date, &new_date).await?)
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
    db::task::reorder(pool, ids)
        .await
        .map_err(map_row_not_found)
}

/// Apply one bulk operation to many tasks (the Inbox multi-select). Validation
/// happens once up front — the same label/date applies to every id — then the
/// repository runs the change in a single transaction. Atomic: an unknown id is
/// a 404 and changes nothing. An empty id list is a no-op.
pub async fn batch(pool: &SqlitePool, ids: &[i64], op: BatchOp) -> AppResult<()> {
    if ids.is_empty() {
        return Ok(());
    }
    let result = match op {
        BatchOp::SetLabel(label_id) => {
            if let Some(label_id) = label_id {
                ensure_label(pool, label_id).await?;
            }
            db::task::batch_set_label(pool, ids, label_id).await
        }
        BatchOp::Schedule(due_date) => {
            let due_date = validate_date(&due_date)?;
            // Bulk Schedule serves the Inbox, where a recurring task never
            // lives (its rule requires a start date). Re-dating a series would
            // also need its rule revalidated against the new DTSTART — reject
            // rather than silently move a whole series. The repository already
            // reads each row inside its transaction and reports a recurring id
            // as a typed signal, so the check-then-write pair can't race.
            return db::task::batch_set_due_date(pool, ids, &due_date)
                .await
                .map_err(|err| match err {
                    db::task::BatchScheduleError::Recurring => {
                        AppError::Validation("a recurring task cannot be bulk-scheduled".into())
                    }
                    db::task::BatchScheduleError::Db(e) => map_row_not_found(e),
                });
        }
        BatchOp::Complete => db::task::batch_complete(pool, ids).await,
        BatchOp::Delete => db::task::batch_delete(pool, ids).await,
    };
    result.map_err(map_row_not_found)
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
    ensure_real_occurrence(pool, &task, occurrence.as_deref()).await?;
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
    ensure_real_occurrence(pool, &task, occurrence.as_deref()).await?;
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
        // A stored rule that no longer expands (e.g. one accepted before a
        // stricter validation gate, or a pathological occurrence count) must
        // not fail the whole listing — one bad row would brick every calendar
        // view. Skip the series instead; the task stays reachable via search.
        let dates = match recurrence::expand(rule, parse_date(start)?, from_date, to_date) {
            Ok(dates) => dates,
            Err(err) => {
                tracing::warn!(task_id = task.id, error = %err, "skipping unexpandable recurrence rule");
                continue;
            }
        };
        if dates.is_empty() {
            continue;
        }
        let done: HashSet<String> = db::task::completed_occurrences(pool, task.id, from, to)
            .await?
            .into_iter()
            .collect();
        // Occurrences detached by a single-instance move: the series skips these dates
        // (the moved instance now lives as its own one-off task on the new day).
        let detached: HashSet<String> = db::task::excepted_occurrences(pool, task.id, from, to)
            .await?
            .into_iter()
            .collect();
        for date in dates {
            let occurrence = date.format(config::DATE_FORMAT).to_string();
            if detached.contains(&occurrence) {
                continue;
            }
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

/// A completion may only key a date the client can actually show — otherwise
/// the row is an orphan and the "completed" answer is a lie. For a recurring
/// task the date must be a member of the series (the same check
/// `move_occurrence` uses) that hasn't been detached; for a one-off it must be
/// the task's own `due_date` (NULL for an Inbox task).
async fn ensure_real_occurrence(
    pool: &SqlitePool,
    task: &Task,
    occurrence: Option<&str>,
) -> AppResult<()> {
    let (Some(rule), Some(start)) = (task.recurrence_rule.as_deref(), task.due_date.as_deref())
    else {
        // Non-recurring: the only occurrence is the task's own due_date
        // (NULL-safe — an Inbox task pairs with a NULL occurrence).
        if occurrence == task.due_date.as_deref() {
            return Ok(());
        }
        return Err(AppError::Validation(
            "occurrence_date must match the task's due date".into(),
        ));
    };
    // A recurring task always has a date, so the resolved occurrence is Some.
    let Some(date) = occurrence else {
        return Err(AppError::Validation(
            "a recurring task needs an occurrence_date".into(),
        ));
    };
    ensure_series_member(rule, start, date)?;
    ensure_not_detached(
        pool,
        task.id,
        date,
        "that occurrence has been moved off the series",
    )
    .await
}

/// The series-membership rule shared by `move_occurrence` and the completion
/// endpoints: `date` counts when the rule generates it — or when it is the
/// series start itself. DTSTART is a member even when the rule wouldn't
/// regenerate it (e.g. a task due Wednesday repeating weekly on Mondays, which
/// import and the picker both permit): search returns the canonical series row
/// keyed at `due_date`, and the importer records completions there, so the
/// start must stay toggleable.
fn ensure_series_member(rule: &str, start: &str, date: &str) -> AppResult<()> {
    if date == start {
        return Ok(());
    }
    let day = parse_date(date)?;
    if recurrence::expand(rule, parse_date(start)?, day, day)?.is_empty() {
        return Err(AppError::Validation(
            "that date is not an occurrence of the series".into(),
        ));
    }
    Ok(())
}

/// Reject an occurrence that has been detached from its series by a
/// single-instance move; `detached_msg` keeps each endpoint's own wording.
async fn ensure_not_detached(
    pool: &SqlitePool,
    task_id: i64,
    date: &str,
    detached_msg: &str,
) -> AppResult<()> {
    if !db::task::excepted_occurrences(pool, task_id, date, date)
        .await?
        .is_empty()
    {
        return Err(AppError::Validation(detached_msg.into()));
    }
    Ok(())
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

/// Takes any executor so `create_on` can check labels inside the importer's
/// transaction (where just-created labels aren't visible from the pool yet).
async fn ensure_label(executor: impl SqliteExecutor<'_>, label_id: i64) -> AppResult<()> {
    if db::label::get(executor, label_id).await?.is_some() {
        Ok(())
    } else {
        Err(AppError::Validation("unknown label".into()))
    }
}
