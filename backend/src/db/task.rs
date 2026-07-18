//! SQL for `task` and `completion`. `completed` is derived from a completion at
//! the current occurrence (`occurrence_date IS due_date`, null-safe for Inbox).

use sqlx::{SqliteExecutor, SqlitePool};

use super::assert_affected;
use crate::domain::Task;

// The projection is repeated because `query_as!` requires a literal SQL string
// for compile-time checking.

/// Inbox: unscheduled, not-yet-completed tasks (`due_date IS NULL`), in manual
/// `sort_order`. Completed captures drop out — a done inbox task doesn't return.
pub async fn list_inbox(pool: &SqlitePool) -> Result<Vec<Task>, sqlx::Error> {
    sqlx::query_as!(
        Task,
        r#"SELECT
            id              AS "id!",
            title           AS "title!",
            notes,
            label_id,
            due_date,
            due_time,
            recurrence_rule,
            due_date        AS occurrence_date,
            sort_order      AS "sort_order!",
            EXISTS(
                SELECT 1 FROM completion c
                WHERE c.task_id = task.id AND c.occurrence_date IS task.due_date
            ) AS "completed!: bool"
        FROM task
        WHERE due_date IS NULL
          AND NOT EXISTS(
              SELECT 1 FROM completion c
              WHERE c.task_id = task.id AND c.occurrence_date IS task.due_date
          )
        ORDER BY sort_order, id"#
    )
    .fetch_all(pool)
    .await
}

/// One-off tasks on a given local date, applying the view sort rule: timed tasks
/// first by `due_time` ascending, then untimed by manual `sort_order`. Recurring
/// tasks are excluded here and expanded over the date by the service layer.
pub async fn list_for_date(pool: &SqlitePool, date: &str) -> Result<Vec<Task>, sqlx::Error> {
    sqlx::query_as!(
        Task,
        r#"SELECT
            id              AS "id!",
            title           AS "title!",
            notes,
            label_id,
            due_date,
            due_time,
            recurrence_rule,
            due_date        AS occurrence_date,
            sort_order      AS "sort_order!",
            EXISTS(
                SELECT 1 FROM completion c
                WHERE c.task_id = task.id AND c.occurrence_date IS task.due_date
            ) AS "completed!: bool"
        FROM task
        WHERE due_date = ? AND recurrence_rule IS NULL
        ORDER BY (due_time IS NULL), due_time, sort_order, id"#,
        date
    )
    .fetch_all(pool)
    .await
}

/// One-off tasks whose `due_date` falls in the inclusive range `[from, to]` (the
/// month/week grid window). Ordered by day, then the within-day view sort rule
/// (timed first by `due_time`, then manual `sort_order`). Inbox tasks
/// (`due_date IS NULL`) are excluded — `BETWEEN` never matches NULL. Recurring
/// tasks are excluded too; the service expands them across the window instead.
pub async fn list_in_range(
    pool: &SqlitePool,
    from: &str,
    to: &str,
) -> Result<Vec<Task>, sqlx::Error> {
    sqlx::query_as!(
        Task,
        r#"SELECT
            id              AS "id!",
            title           AS "title!",
            notes,
            label_id,
            due_date,
            due_time,
            recurrence_rule,
            due_date        AS occurrence_date,
            sort_order      AS "sort_order!",
            EXISTS(
                SELECT 1 FROM completion c
                WHERE c.task_id = task.id AND c.occurrence_date IS task.due_date
            ) AS "completed!: bool"
        FROM task
        WHERE due_date BETWEEN ? AND ? AND recurrence_rule IS NULL
        ORDER BY due_date, (due_time IS NULL), due_time, sort_order, id"#,
        from,
        to
    )
    .fetch_all(pool)
    .await
}

/// Tasks whose `title` or `notes` match a pre-escaped LIKE `pattern` (`%term%`),
/// case-insensitively (SQLite `LIKE` folds ASCII case). Both Inbox and scheduled
/// tasks are searchable; recurring tasks return as their canonical series row,
/// not expanded — search finds the task, not a date. Ordered by `due_date`
/// (nulls last) then `title`. `\` is the escape char, so a literal `%`/`_` in the
/// term matches itself rather than acting as a wildcard.
pub async fn search(pool: &SqlitePool, pattern: &str) -> Result<Vec<Task>, sqlx::Error> {
    sqlx::query_as!(
        Task,
        r#"SELECT
            id              AS "id!",
            title           AS "title!",
            notes,
            label_id,
            due_date,
            due_time,
            recurrence_rule,
            due_date        AS occurrence_date,
            sort_order      AS "sort_order!",
            EXISTS(
                SELECT 1 FROM completion c
                WHERE c.task_id = task.id AND c.occurrence_date IS task.due_date
            ) AS "completed!: bool"
        FROM task
        WHERE title LIKE ? ESCAPE '\' OR notes LIKE ? ESCAPE '\'
        ORDER BY (due_date IS NULL), due_date, title"#,
        pattern,
        pattern
    )
    .fetch_all(pool)
    .await
}

/// Recurring tasks whose series could have occurrences on or before `to` (i.e.
/// `due_date <= to`, the DTSTART has started). Which occurrences actually fall in
/// the window is decided by the service when it expands the rule, so `completed`
/// here is a placeholder (`FALSE`) and `occurrence_date` mirrors the start.
pub async fn list_recurring_through(pool: &SqlitePool, to: &str) -> Result<Vec<Task>, sqlx::Error> {
    sqlx::query_as!(
        Task,
        r#"SELECT
            id              AS "id!",
            title           AS "title!",
            notes,
            label_id,
            due_date,
            due_time,
            recurrence_rule,
            due_date        AS occurrence_date,
            sort_order      AS "sort_order!",
            FALSE           AS "completed!: bool"
        FROM task
        WHERE recurrence_rule IS NOT NULL AND due_date IS NOT NULL AND due_date <= ?"#,
        to
    )
    .fetch_all(pool)
    .await
}

/// The occurrence dates a task is completed for within `[from, to]`. Used to
/// overlay per-occurrence completion onto an expanded recurring series. A NULL
/// occurrence (the Inbox case) never falls in a date range, so it is excluded.
pub async fn completed_occurrences(
    pool: &SqlitePool,
    task_id: i64,
    from: &str,
    to: &str,
) -> Result<Vec<String>, sqlx::Error> {
    sqlx::query_scalar!(
        r#"SELECT occurrence_date AS "occurrence_date!"
           FROM completion
           WHERE task_id = ? AND occurrence_date BETWEEN ? AND ?"#,
        task_id,
        from,
        to
    )
    .fetch_all(pool)
    .await
}

/// The occurrence dates of a recurring task that have been DETACHED (moved off the
/// series) within `[from, to]`. Used to drop those dates from an expanded series so a
/// moved instance no longer shows on its original day. Mirrors `completed_occurrences`.
pub async fn excepted_occurrences(
    pool: &SqlitePool,
    task_id: i64,
    from: &str,
    to: &str,
) -> Result<Vec<String>, sqlx::Error> {
    sqlx::query_scalar!(
        r#"SELECT occurrence_date AS "occurrence_date!"
           FROM task_exception
           WHERE task_id = ? AND occurrence_date BETWEEN ? AND ?"#,
        task_id,
        from,
        to
    )
    .fetch_all(pool)
    .await
}

/// Detach one occurrence of a recurring series onto its own day, atomically: record
/// the skip in `task_exception` (so expansion no longer yields `occurrence_date`), and
/// create a one-off task on `new_date` copying the series' title/notes/label/time but
/// no recurrence. Returns the new detached task. The exception insert is idempotent, but
/// creating the one-off is not, so the service guarantees the occurrence isn't already
/// detached before calling — `task_id` must be an existing recurring task whose
/// `occurrence_date` has not yet been moved.
pub async fn move_occurrence(
    pool: &SqlitePool,
    task_id: i64,
    occurrence_date: &str,
    new_date: &str,
) -> Result<Task, sqlx::Error> {
    let mut tx = pool.begin().await?;
    sqlx::query!(
        "INSERT OR IGNORE INTO task_exception (task_id, occurrence_date) VALUES (?, ?)",
        task_id,
        occurrence_date
    )
    .execute(&mut *tx)
    .await?;
    let sort_order: i64 =
        sqlx::query_scalar!(r#"SELECT COALESCE(MAX(sort_order), -1) + 1 AS "next!" FROM task"#)
            .fetch_one(&mut *tx)
            .await?;
    // Copy the series' fields into a new one-off. RETURN only the new id — a nullable
    // column (e.g. an unset `label_id`) read back through `INSERT … SELECT … RETURNING`
    // mis-decodes to 0 in SQLite, so we re-`get` the canonical row by id below instead.
    let new_id: i64 = sqlx::query_scalar!(
        r#"INSERT INTO task (title, notes, label_id, due_date, due_time, recurrence_rule, sort_order)
           SELECT title, notes, label_id, ?, due_time, NULL, ? FROM task WHERE id = ?
           RETURNING id AS "id!""#,
        new_date,
        sort_order,
        task_id
    )
    .fetch_one(&mut *tx)
    .await?;
    // A completed source occurrence carries its done state to the detached
    // one-off: re-key the series' completion at `occurrence_date` to the new
    // task on its new day. The new id is fresh, so the
    // `UNIQUE(task_id, occurrence_date)` index can't collide. No-op if the
    // occurrence wasn't completed.
    sqlx::query!(
        "UPDATE completion SET task_id = ?, occurrence_date = ?
         WHERE task_id = ? AND occurrence_date = ?",
        new_id,
        new_date,
        task_id,
        occurrence_date
    )
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;
    let task = get(pool, new_id).await?.ok_or(sqlx::Error::RowNotFound)?;
    Ok(task)
}

pub async fn get(pool: &SqlitePool, id: i64) -> Result<Option<Task>, sqlx::Error> {
    sqlx::query_as!(
        Task,
        r#"SELECT
            id              AS "id!",
            title           AS "title!",
            notes,
            label_id,
            due_date,
            due_time,
            recurrence_rule,
            due_date        AS occurrence_date,
            sort_order      AS "sort_order!",
            EXISTS(
                SELECT 1 FROM completion c
                WHERE c.task_id = task.id AND c.occurrence_date IS task.due_date
            ) AS "completed!: bool"
        FROM task
        WHERE id = ?"#,
        id
    )
    .fetch_optional(pool)
    .await
}

/// The next `sort_order` so a new task appends to the end. A single global
/// counter is enough: relative order is preserved within any filtered list, and
/// drag-reordering rewrites these values for the reordered set (see [`reorder`]).
/// Takes any executor so the importer can run it inside its one transaction.
pub async fn next_sort_order(executor: impl SqliteExecutor<'_>) -> Result<i64, sqlx::Error> {
    sqlx::query_scalar!(r#"SELECT COALESCE(MAX(sort_order), -1) + 1 AS "next!" FROM task"#)
        .fetch_one(executor)
        .await
}

/// Persist a manual ordering: set each task's `sort_order` to its position in
/// `ids` (0-based) in one transaction, so the list reorders atomically. Returns
/// `RowNotFound` — rolling the whole batch back — if any id doesn't exist.
/// `sort_order` is global; only the relative order within a filtered list (the
/// Inbox or a day's untimed tasks) matters, so reassigning a contiguous run is safe.
pub async fn reorder(pool: &SqlitePool, ids: &[i64]) -> Result<(), sqlx::Error> {
    let mut tx = pool.begin().await?;
    for (index, id) in ids.iter().enumerate() {
        let position = index as i64;
        let affected = sqlx::query!(
            "UPDATE task SET sort_order = ?, updated_at = datetime('now') WHERE id = ?",
            position,
            id
        )
        .execute(&mut *tx)
        .await?
        .rows_affected();
        assert_affected(affected)?;
    }
    tx.commit().await?;
    Ok(())
}

/// Set (or, with `None`, clear) the label on each id in one transaction — the
/// Inbox bulk "set label". Like [`reorder`], an unknown id returns `RowNotFound`
/// and rolls the whole batch back, so the set changes atomically or not at all.
pub async fn batch_set_label(
    pool: &SqlitePool,
    ids: &[i64],
    label_id: Option<i64>,
) -> Result<(), sqlx::Error> {
    let mut tx = pool.begin().await?;
    for id in ids {
        let affected = sqlx::query!(
            "UPDATE task SET label_id = ?, updated_at = datetime('now') WHERE id = ?",
            label_id,
            id
        )
        .execute(&mut *tx)
        .await?
        .rows_affected();
        assert_affected(affected)?;
    }
    tx.commit().await?;
    Ok(())
}

/// How [`batch_set_due_date`] fails: a recurring task in the batch (a typed
/// signal the service maps to a validation error — detecting it here, from the
/// row just read inside the transaction, closes the check-then-write race and
/// avoids a second per-id lookup) or any database error (`RowNotFound` keeps
/// meaning an unknown id, as in the other batches).
#[derive(Debug, thiserror::Error)]
pub enum BatchScheduleError {
    #[error("a recurring task cannot be batch-scheduled")]
    Recurring,
    #[error(transparent)]
    Db(#[from] sqlx::Error),
}

/// Give each id a `due_date` in one transaction — the Inbox bulk "schedule",
/// which moves the tasks onto the calendar. An unknown id rolls the batch back.
/// Mirrors the single-task PATCH: a non-recurring task's completion is keyed to
/// its `due_date` (`completed` = a completion at `occurrence_date IS due_date`),
/// so a completed task carries its done state to the new date instead of
/// silently reopening. A recurring id rolls the batch back with
/// [`BatchScheduleError::Recurring`] — re-dating a series would need its rule
/// revalidated, which is the service's decision to reject.
pub async fn batch_set_due_date(
    pool: &SqlitePool,
    ids: &[i64],
    due_date: &str,
) -> Result<(), BatchScheduleError> {
    let mut tx = pool.begin().await?;
    for id in ids {
        // The select doubles as the existence check (an unknown id returns
        // `RowNotFound` inside the open transaction, rolling the batch back).
        let Some(current) = sqlx::query!(
            "SELECT due_date, recurrence_rule FROM task WHERE id = ?",
            id
        )
        .fetch_optional(&mut *tx)
        .await?
        else {
            return Err(sqlx::Error::RowNotFound.into());
        };
        if current.recurrence_rule.is_some() {
            return Err(BatchScheduleError::Recurring);
        }
        sqlx::query!(
            "UPDATE task SET due_date = ?, updated_at = datetime('now') WHERE id = ?",
            due_date,
            id
        )
        .execute(&mut *tx)
        .await?;
        // Same carry as the single-task reschedule. Skipped when the date
        // doesn't change — the delete-at-target would drop the completion the
        // move is meant to keep.
        if current.due_date.as_deref() != Some(due_date) {
            carry_completion(&mut tx, *id, current.due_date.as_deref(), Some(due_date)).await?;
        }
    }
    tx.commit().await?;
    Ok(())
}

/// Move every overdue, uncompleted one-off onto `today` in a single UPDATE:
/// tasks with a `due_date` before `today`, no recurrence rule, and no completion
/// at their current occurrence. `due_time` is kept — the task keeps its
/// wall-clock time on the new day. Recurring tasks are untouched (their series
/// generates today's occurrence itself; `due_date` is the DTSTART). Returns how
/// many tasks moved.
pub async fn rollover_overdue(pool: &SqlitePool, today: &str) -> Result<u64, sqlx::Error> {
    Ok(sqlx::query!(
        r#"UPDATE task
           SET due_date = ?, updated_at = datetime('now')
           WHERE recurrence_rule IS NULL
             AND due_date IS NOT NULL
             AND due_date < ?
             AND NOT EXISTS (
                 SELECT 1 FROM completion c
                 WHERE c.task_id = task.id AND c.occurrence_date IS task.due_date
             )"#,
        today,
        today
    )
    .execute(pool)
    .await?
    .rows_affected())
}

/// Delete each id in one transaction (`completion` rows cascade). An unknown id
/// rolls the batch back.
pub async fn batch_delete(pool: &SqlitePool, ids: &[i64]) -> Result<(), sqlx::Error> {
    let mut tx = pool.begin().await?;
    for id in ids {
        let affected = sqlx::query!("DELETE FROM task WHERE id = ?", id)
            .execute(&mut *tx)
            .await?
            .rows_affected();
        assert_affected(affected)?;
    }
    tx.commit().await?;
    Ok(())
}

/// Mark each id done at its own occurrence (its `due_date`, NULL in the Inbox) in
/// one transaction. The guarded INSERT is idempotent — re-completing is a no-op —
/// so its `rows_affected` can't tell "already done" from "missing task"; an
/// explicit existence check supplies the unknown-id rollback the other batches give.
pub async fn batch_complete(pool: &SqlitePool, ids: &[i64]) -> Result<(), sqlx::Error> {
    let mut tx = pool.begin().await?;
    for id in ids {
        let exists: bool = sqlx::query_scalar!(
            r#"SELECT EXISTS(SELECT 1 FROM task WHERE id = ?) AS "exists!: bool""#,
            id
        )
        .fetch_one(&mut *tx)
        .await?;
        assert_affected(u64::from(exists))?;
        sqlx::query!(
            r#"INSERT INTO completion (task_id, occurrence_date)
               SELECT t.id, t.due_date FROM task t
               WHERE t.id = ?
                 AND NOT EXISTS (
                     SELECT 1 FROM completion c
                     WHERE c.task_id = t.id AND c.occurrence_date IS t.due_date
                 )"#,
            id
        )
        .execute(&mut *tx)
        .await?;
    }
    tx.commit().await?;
    Ok(())
}

/// Takes any executor so the importer can run it inside its one transaction.
#[allow(clippy::too_many_arguments)]
pub async fn insert(
    executor: impl SqliteExecutor<'_>,
    title: &str,
    notes: Option<&str>,
    label_id: Option<i64>,
    due_date: Option<&str>,
    due_time: Option<&str>,
    recurrence_rule: Option<&str>,
    sort_order: i64,
) -> Result<Task, sqlx::Error> {
    sqlx::query_as!(
        Task,
        r#"INSERT INTO task (title, notes, label_id, due_date, due_time, recurrence_rule, sort_order)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           RETURNING
            id              AS "id!",
            title           AS "title!",
            notes,
            label_id,
            due_date,
            due_time,
            recurrence_rule,
            due_date        AS occurrence_date,
            sort_order      AS "sort_order!",
            FALSE           AS "completed!: bool""#,
        title,
        notes,
        label_id,
        due_date,
        due_time,
        recurrence_rule,
        sort_order
    )
    .fetch_one(executor)
    .await
}

/// Overwrite the editable fields with already-merged, already-validated values.
/// Returns `None` if no task has that id. Re-fetches so `completed` reflects the
/// (possibly changed) `due_date`.
#[allow(clippy::too_many_arguments)]
pub async fn update(
    pool: &SqlitePool,
    id: i64,
    title: &str,
    notes: Option<&str>,
    label_id: Option<i64>,
    due_date: Option<&str>,
    due_time: Option<&str>,
    recurrence_rule: Option<&str>,
) -> Result<Option<Task>, sqlx::Error> {
    let rows = run_update(
        pool,
        id,
        title,
        notes,
        label_id,
        due_date,
        due_time,
        recurrence_rule,
    )
    .await?;
    if rows == 0 {
        return Ok(None);
    }
    get(pool, id).await
}

/// The one UPDATE statement behind [`update`] and [`update_rescheduled`], so the
/// column list can't drift between them. Takes any executor so the reschedule
/// path can run it inside its transaction. Returns the affected row count
/// (0 = unknown id).
#[allow(clippy::too_many_arguments)]
async fn run_update(
    executor: impl SqliteExecutor<'_>,
    id: i64,
    title: &str,
    notes: Option<&str>,
    label_id: Option<i64>,
    due_date: Option<&str>,
    due_time: Option<&str>,
    recurrence_rule: Option<&str>,
) -> Result<u64, sqlx::Error> {
    Ok(sqlx::query!(
        r#"UPDATE task
           SET title = ?, notes = ?, label_id = ?, due_date = ?, due_time = ?,
               recurrence_rule = ?, updated_at = datetime('now')
           WHERE id = ?"#,
        title,
        notes,
        label_id,
        due_date,
        due_time,
        recurrence_rule,
        id
    )
    .execute(executor)
    .await?
    .rows_affected())
}

/// Returns `true` if a row was deleted. `completion` rows cascade (ON DELETE).
pub async fn delete(pool: &SqlitePool, id: i64) -> Result<bool, sqlx::Error> {
    let res = sqlx::query!("DELETE FROM task WHERE id = ?", id)
        .execute(pool)
        .await?;
    Ok(res.rows_affected() > 0)
}

/// Mark a task done for an occurrence (`occurrence_date`, NULL for an Inbox
/// task). Idempotent: the guarded INSERT does nothing if the row already exists.
/// We can't lean on `INSERT OR IGNORE` because SQLite treats NULLs as distinct
/// in the UNIQUE index, so a NULL occurrence would never collide. Takes any
/// executor so the importer can run it inside its one transaction.
pub async fn add_completion(
    executor: impl SqliteExecutor<'_>,
    task_id: i64,
    occurrence_date: Option<&str>,
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        r#"INSERT INTO completion (task_id, occurrence_date)
           SELECT ?, ?
           WHERE NOT EXISTS (
               SELECT 1 FROM completion
               WHERE task_id = ? AND occurrence_date IS ?
           )"#,
        task_id,
        occurrence_date,
        task_id,
        occurrence_date
    )
    .execute(executor)
    .await?;
    Ok(())
}

/// Reopen a task for an occurrence by removing its completion row (no-op if
/// none). `IS` matches a NULL occurrence (the Inbox case).
pub async fn remove_completion(
    pool: &SqlitePool,
    task_id: i64,
    occurrence_date: Option<&str>,
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        "DELETE FROM completion WHERE task_id = ? AND occurrence_date IS ?",
        task_id,
        occurrence_date
    )
    .execute(pool)
    .await?;
    Ok(())
}

/// [`update`] plus the completion migration a non-recurring reschedule needs, in
/// ONE transaction — so the date change and the carried completion commit (or
/// fail) together, never leaving a window where the task moved but its done
/// state was stranded. The caller (the service) decides this is a reschedule and
/// passes the pre-update `prev_due_date`; the reschedule rule only applies to
/// non-recurring tasks, so `recurrence_rule` is written as NULL. Returns `None`
/// if no task has that id.
#[allow(clippy::too_many_arguments)]
pub async fn update_rescheduled(
    pool: &SqlitePool,
    id: i64,
    title: &str,
    notes: Option<&str>,
    label_id: Option<i64>,
    due_date: Option<&str>,
    due_time: Option<&str>,
    prev_due_date: Option<&str>,
) -> Result<Option<Task>, sqlx::Error> {
    let mut tx = pool.begin().await?;
    let rows = run_update(
        &mut *tx, id, title, notes, label_id, due_date, due_time, None,
    )
    .await?;
    if rows == 0 {
        return Ok(None); // dropping the tx rolls back (nothing changed anyway)
    }
    carry_completion(&mut tx, id, prev_due_date, due_date).await?;
    tx.commit().await?;
    get(pool, id).await
}

/// Carry a non-recurring task's completion across a date change, inside the
/// caller's open transaction. `completed` is derived as `occurrence_date IS
/// due_date`, so without this a reschedule would strand the completion at the
/// old date and silently reopen the task. Any completion already sitting at the
/// target is cleared first so the move can't trip the
/// `(task_id, occurrence_date)` UNIQUE index; `IS` matches a NULL date (the
/// Inbox case). No-op if the old date had no completion.
async fn carry_completion(
    tx: &mut sqlx::SqliteConnection,
    task_id: i64,
    from_date: Option<&str>,
    to_date: Option<&str>,
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        "DELETE FROM completion WHERE task_id = ? AND occurrence_date IS ?",
        task_id,
        to_date
    )
    .execute(&mut *tx)
    .await?;
    sqlx::query!(
        "UPDATE completion SET occurrence_date = ? WHERE task_id = ? AND occurrence_date IS ?",
        to_date,
        task_id,
        from_date
    )
    .execute(&mut *tx)
    .await?;
    Ok(())
}
