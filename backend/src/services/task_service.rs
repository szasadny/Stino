use std::collections::HashSet;

use sqlx::{SqliteConnection, SqliteExecutor, SqlitePool};

use crate::config;
use crate::db;
use crate::domain::{BatchOp, NewTask, RolloverSummary, Task, TaskPatch};
use crate::error::{map_row_not_found, AppError, AppResult};
use crate::services::recurrence;
use crate::services::validation::{
    clean_optional, non_empty_capped, parse_date, validate_date, validate_time,
};

/// Recurring tasks always have a start date, so they never appear here.
pub async fn list_inbox(pool: &SqlitePool) -> AppResult<Vec<Task>> {
    Ok(db::task::list_inbox(pool).await?)
}

pub async fn list_for_date(pool: &SqlitePool, date: &str) -> AppResult<Vec<Task>> {
    let date = validate_date(date)?;
    let mut tasks = db::task::list_for_date(pool, &date).await?;
    append_recurring(pool, &mut tasks, &date, &date).await?;
    sort_tasks(&mut tasks);
    Ok(tasks)
}

/// Inclusive range; an inverted range yields no rows.
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

/// The single validator, on one connection so the importer can run it inside its transaction.
pub(crate) async fn create_on(conn: &mut SqliteConnection, input: NewTask) -> AppResult<Task> {
    let title = non_empty_capped(&input.title, "task title", config::MAX_TITLE_LEN)?;
    let notes = clean_optional(input.notes);
    if let Some(label_id) = input.label_id {
        ensure_label(&mut *conn, label_id).await?;
    }
    let due_date = input.due_date.map(|d| validate_date(&d)).transpose()?;
    let due_time = input.due_time.map(|t| validate_time(&t)).transpose()?;
    require_date_for_time(due_date.as_deref(), due_time.as_deref())?;
    let recurrence_rule = clean_optional(input.recurrence_rule).map(|r| recurrence::normalize(&r));
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

pub async fn update(pool: &SqlitePool, id: i64, patch: TaskPatch) -> AppResult<Task> {
    let current = db::task::get(pool, id).await?.ok_or(AppError::NotFound)?;
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
        Some(rule) => clean_optional(rule).map(|r| recurrence::normalize(&r)),
        None => current.recurrence_rule,
    };
    require_date_for_time(due_date.as_deref(), due_time.as_deref())?;
    validate_recurrence(recurrence_rule.as_deref(), due_date.as_deref())?;

    // One-off completions are keyed to `due_date`, so a reschedule carries them along atomically.
    let reschedules = !was_recurring && recurrence_rule.is_none() && prev_due_date != due_date;
    // Stale skips/moves would otherwise hide dates again if a rule is re-added.
    let stops_recurring = was_recurring && recurrence_rule.is_none();

    let task = if stops_recurring {
        db::task::update_clearing_exceptions(
            pool,
            id,
            &title,
            notes.as_deref(),
            label_id,
            due_date.as_deref(),
            due_time.as_deref(),
        )
        .await?
    } else if reschedules {
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

/// Detach one occurrence into a one-off on `new_date`; the series skips the original via
/// `task_exception`. A same-day move is a no-op.
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
    ensure_series_member(rule, start, &occurrence_date)?;
    if new_date == occurrence_date {
        return Ok(task); // a no-op move — keep the series untouched
    }
    // Re-detaching would orphan a second one-off.
    ensure_not_detached(
        pool,
        id,
        &occurrence_date,
        "that occurrence has already been moved",
    )
    .await?;
    Ok(db::task::move_occurrence(pool, id, &occurrence_date, &new_date).await?)
}

/// Completions are history, so only an unfinished occurrence can be skipped. Idempotent.
pub async fn skip_occurrence(pool: &SqlitePool, id: i64, occurrence_date: String) -> AppResult<()> {
    let occurrence_date = validate_date(&occurrence_date)?;
    let task = db::task::get(pool, id).await?.ok_or(AppError::NotFound)?;
    let (Some(rule), Some(start)) = (task.recurrence_rule.as_deref(), task.due_date.as_deref())
    else {
        return Err(AppError::Validation(
            "only a recurring task's occurrence can be deleted on its own".into(),
        ));
    };
    ensure_series_member(rule, start, &occurrence_date)?;
    if !db::task::completed_occurrences(pool, id, &occurrence_date, &occurrence_date)
        .await?
        .is_empty()
    {
        return Err(AppError::Validation(
            "a completed occurrence can't be deleted on its own".into(),
        ));
    }
    Ok(db::task::skip_occurrence(pool, id, &occurrence_date).await?)
}

/// Only untimed ids are sent; timed and recurring tasks keep their time-sort.
pub async fn reorder(pool: &SqlitePool, ids: &[i64]) -> AppResult<()> {
    if ids.is_empty() {
        return Ok(());
    }
    db::task::reorder(pool, ids)
        .await
        .map_err(map_row_not_found)
}

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
            // A series can't live in the Inbox, and re-dating one would need its rule revalidated.
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

/// `today` is the browser's local date. Overdue one-offs move first, then each series'
/// missed occurrences in the lookback window collapse into one reused copy on today
/// (so the order matters). Idempotent: completed and detached occurrences are left alone.
pub async fn rollover(pool: &SqlitePool, today: &str) -> AppResult<RolloverSummary> {
    let today = validate_date(today)?;
    let mut moved = db::task::rollover_overdue(pool, &today).await?;
    moved += detach_missed_recurring(pool, &today).await?;
    Ok(RolloverSummary { moved })
}

async fn detach_missed_recurring(pool: &SqlitePool, today: &str) -> AppResult<u64> {
    let today_date = parse_date(today)?;
    let to_date = today_date - chrono::Duration::days(1);
    let from_date = today_date - chrono::Duration::days(config::ROLLOVER_LOOKBACK_DAYS);
    if to_date < from_date {
        return Ok(0); // window collapsed (non-positive lookback) — nothing to scan
    }
    let from = from_date.format(config::DATE_FORMAT).to_string();
    let to = to_date.format(config::DATE_FORMAT).to_string();

    let mut detached = 0;
    for task in db::task::list_recurring_through(pool, &to).await? {
        let (Some(rule), Some(start)) = (task.recurrence_rule.as_deref(), task.due_date.as_deref())
        else {
            continue; // a recurring row always has both; skip defensively
        };
        // A rule that no longer expands must not abort the whole rollover.
        let dates = match recurrence::expand(rule, parse_date(start)?, from_date, to_date) {
            Ok(dates) => dates,
            Err(err) => {
                tracing::warn!(task_id = task.id, error = %err, "skipping unexpandable recurrence rule during rollover");
                continue;
            }
        };
        if dates.is_empty() {
            continue;
        }
        let done: HashSet<String> = db::task::completed_occurrences(pool, task.id, &from, &to)
            .await?
            .into_iter()
            .collect();
        let already_detached: HashSet<String> =
            db::task::excepted_occurrences(pool, task.id, &from, &to)
                .await?
                .into_iter()
                .collect();
        let missed: Vec<String> = dates
            .into_iter()
            .map(|date| date.format(config::DATE_FORMAT).to_string())
            .filter(|occurrence| {
                !done.contains(occurrence) && !already_detached.contains(occurrence)
            })
            .collect();
        if missed.is_empty() {
            continue;
        }
        // An existing open copy was already counted by `rollover_overdue` if it moved.
        if db::task::rollover_occurrences(pool, task.id, &missed, today).await? {
            detached += 1;
        }
    }
    Ok(detached)
}

/// Never mutates the task; returns the toggled occurrence so the client updates exactly that row.
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
        // A rule that no longer expands (e.g. accepted before stricter validation) must not
        // brick every calendar view; skip it — the task stays reachable via search.
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

fn resolve_occurrence(task: &Task, occurrence_date: Option<String>) -> AppResult<Option<String>> {
    match occurrence_date {
        Some(d) => Ok(Some(validate_date(&d)?)),
        None => Ok(task.due_date.clone()),
    }
}

/// Reject dates the client can't show, so no orphan completion rows are written.
async fn ensure_real_occurrence(
    pool: &SqlitePool,
    task: &Task,
    occurrence: Option<&str>,
) -> AppResult<()> {
    let (Some(rule), Some(start)) = (task.recurrence_rule.as_deref(), task.due_date.as_deref())
    else {
        if occurrence == task.due_date.as_deref() {
            return Ok(());
        }
        return Err(AppError::Validation(
            "occurrence_date must match the task's due date".into(),
        ));
    };
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
        "that occurrence is no longer part of the series",
    )
    .await
}

/// DTSTART counts even when the rule wouldn't regenerate it (e.g. due Wednesday,
/// repeating Mondays): search and import key the series at `due_date`.
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

fn occurrence_view(mut task: Task, occurrence: Option<String>, completed: bool) -> Task {
    task.occurrence_date = occurrence;
    task.completed = completed;
    task
}

fn require_date_for_time(due_date: Option<&str>, due_time: Option<&str>) -> AppResult<()> {
    if due_time.is_some() && due_date.is_none() {
        return Err(AppError::Validation(
            "a task with a time must also have a date".into(),
        ));
    }
    Ok(())
}

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

/// Any executor so the importer sees labels its own transaction just created.
async fn ensure_label(executor: impl SqliteExecutor<'_>, label_id: i64) -> AppResult<()> {
    if db::label::get(executor, label_id).await?.is_some() {
        Ok(())
    } else {
        Err(AppError::Validation("unknown label".into()))
    }
}
