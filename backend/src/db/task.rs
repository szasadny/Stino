//! `completed` is derived from a completion at the current occurrence
//! (`occurrence_date IS due_date`, null-safe for Inbox).

use sqlx::{SqliteExecutor, SqlitePool};

use super::assert_affected;
use crate::domain::Task;

// The projection is repeated because `query_as!` needs a literal SQL string.

/// A completed inbox task drops out for good.
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

/// One-offs only; the service expands recurring tasks over the date.
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

/// One-offs only, inclusive range; the service expands recurring tasks over the window.
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

/// `pattern` is a pre-escaped LIKE term (`\` escape). Recurring tasks return as
/// their series row, not expanded.
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

/// Series started on or before `to`; `completed` is a placeholder until the service expands it.
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

pub async fn latest_settled_occurrence(
    pool: &SqlitePool,
    task_id: i64,
    through: &str,
) -> Result<Option<String>, sqlx::Error> {
    sqlx::query_scalar!(
        r#"SELECT MAX(occurrence_date) AS "latest?: String" FROM (
               SELECT occurrence_date FROM completion WHERE task_id = ? AND occurrence_date <= ?
               UNION ALL
               SELECT occurrence_date FROM task_exception WHERE task_id = ? AND occurrence_date <= ?
           )"#,
        task_id,
        through,
        task_id,
        through
    )
    .fetch_one(pool)
    .await
}

/// Not idempotent (creates a one-off), so the service must ensure the occurrence
/// isn't already detached.
pub async fn move_occurrence(
    pool: &SqlitePool,
    task_id: i64,
    occurrence_date: &str,
    new_date: &str,
) -> Result<Task, sqlx::Error> {
    let mut tx = pool.begin().await?;
    insert_exception(&mut tx, task_id, occurrence_date).await?;
    let new_id = insert_detached_copy(&mut tx, task_id, new_date, None).await?;
    // A completed source occurrence carries its done state to the detached one-off.
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

/// Skip `missed` (settling the series up to it) and add one copy on `today` unless the
/// series already has an open rollover copy. Returns whether a copy was created.
pub async fn rollover_occurrence(
    pool: &SqlitePool,
    task_id: i64,
    missed: &str,
    today: &str,
) -> Result<bool, sqlx::Error> {
    let mut tx = pool.begin().await?;
    insert_exception(&mut tx, task_id, missed).await?;
    let has_open_copy: bool = sqlx::query_scalar!(
        r#"SELECT EXISTS(
               SELECT 1 FROM task t
               WHERE t.detached_from = ? AND t.due_date IS NOT NULL AND t.due_date <= ?
                 AND NOT EXISTS (
                     SELECT 1 FROM completion c
                     WHERE c.task_id = t.id AND c.occurrence_date IS t.due_date
                 )
           ) AS "exists!: bool""#,
        task_id,
        today
    )
    .fetch_one(&mut *tx)
    .await?;
    if !has_open_copy {
        insert_detached_copy(&mut tx, task_id, today, Some(task_id)).await?;
    }
    tx.commit().await?;
    Ok(!has_open_copy)
}

async fn insert_exception(
    tx: &mut sqlx::SqliteConnection,
    task_id: i64,
    occurrence_date: &str,
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        "INSERT OR IGNORE INTO task_exception (task_id, occurrence_date) VALUES (?, ?)",
        task_id,
        occurrence_date
    )
    .execute(&mut *tx)
    .await?;
    Ok(())
}

async fn insert_detached_copy(
    tx: &mut sqlx::SqliteConnection,
    task_id: i64,
    new_date: &str,
    detached_from: Option<i64>,
) -> Result<i64, sqlx::Error> {
    let sort_order: i64 =
        sqlx::query_scalar!(r#"SELECT COALESCE(MAX(sort_order), -1) + 1 AS "next!" FROM task"#)
            .fetch_one(&mut *tx)
            .await?;
    // RETURNING a nullable column through `INSERT … SELECT` mis-decodes to 0 in
    // SQLite, so return only the id and let callers re-`get` the row.
    sqlx::query_scalar!(
        r#"INSERT INTO task
               (title, notes, label_id, due_date, due_time, recurrence_rule, sort_order, detached_from)
           SELECT title, notes, label_id, ?, due_time, NULL, ?, ? FROM task WHERE id = ?
           RETURNING id AS "id!""#,
        new_date,
        sort_order,
        detached_from,
        task_id
    )
    .fetch_one(&mut *tx)
    .await
}

/// Idempotent. The service refuses to skip a completed date.
pub async fn skip_occurrence(
    pool: &SqlitePool,
    task_id: i64,
    occurrence_date: &str,
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        "INSERT OR IGNORE INTO task_exception (task_id, occurrence_date) VALUES (?, ?)",
        task_id,
        occurrence_date
    )
    .execute(pool)
    .await?;
    Ok(())
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

/// One global counter suffices: only relative order within a filtered list matters.
pub async fn next_sort_order(executor: impl SqliteExecutor<'_>) -> Result<i64, sqlx::Error> {
    sqlx::query_scalar!(r#"SELECT COALESCE(MAX(sort_order), -1) + 1 AS "next!" FROM task"#)
        .fetch_one(executor)
        .await
}

/// Set each task's `sort_order` to its index in `ids`, atomically.
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

/// Recurring is detected from the row read inside the transaction, closing the
/// check-then-write race.
#[derive(Debug, thiserror::Error)]
pub enum BatchScheduleError {
    #[error("a recurring task cannot be batch-scheduled")]
    Recurring,
    #[error(transparent)]
    Db(#[from] sqlx::Error),
}

/// Inbox bulk schedule. Carries completions like the single-task PATCH; a
/// recurring id rolls the batch back (re-dating a series needs its rule revalidated).
pub async fn batch_set_due_date(
    pool: &SqlitePool,
    ids: &[i64],
    due_date: &str,
) -> Result<(), BatchScheduleError> {
    let mut tx = pool.begin().await?;
    for id in ids {
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
        // Skipped when unchanged — the delete-at-target would drop the completion.
        if current.due_date.as_deref() != Some(due_date) {
            carry_completion(&mut tx, *id, current.due_date.as_deref(), Some(due_date)).await?;
        }
    }
    tx.commit().await?;
    Ok(())
}

/// Recurring tasks are untouched: their series generates today's occurrence itself.
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

/// The guarded INSERT is idempotent, so an explicit existence check supplies
/// the unknown-id rollback.
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

/// Any executor so the importer can run it inside its transaction.
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

/// Re-fetches so `completed` reflects the possibly changed `due_date`.
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

/// Shared by [`update`] and [`update_rescheduled`] so the column list can't drift.
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

pub async fn delete(pool: &SqlitePool, id: i64) -> Result<bool, sqlx::Error> {
    let res = sqlx::query!("DELETE FROM task WHERE id = ?", id)
        .execute(pool)
        .await?;
    Ok(res.rows_affected() > 0)
}

/// Not `INSERT OR IGNORE`: SQLite treats NULLs as distinct in UNIQUE, so a NULL
/// (Inbox) occurrence would never collide.
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

/// [`update`] plus the completion carry, in one transaction so the move and the
/// done state commit together.
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
        return Ok(None);
    }
    carry_completion(&mut tx, id, prev_due_date, due_date).await?;
    tx.commit().await?;
    get(pool, id).await
}

/// Turn recurrence off and drop its exceptions atomically; completions are kept.
#[allow(clippy::too_many_arguments)]
pub async fn update_clearing_exceptions(
    pool: &SqlitePool,
    id: i64,
    title: &str,
    notes: Option<&str>,
    label_id: Option<i64>,
    due_date: Option<&str>,
    due_time: Option<&str>,
) -> Result<Option<Task>, sqlx::Error> {
    let mut tx = pool.begin().await?;
    let rows = run_update(
        &mut *tx, id, title, notes, label_id, due_date, due_time, None,
    )
    .await?;
    if rows == 0 {
        return Ok(None);
    }
    sqlx::query!("DELETE FROM task_exception WHERE task_id = ?", id)
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    get(pool, id).await
}

/// `completed` is keyed to `due_date`, so without this a reschedule would silently
/// reopen the task. Clears any completion at the target first to dodge the UNIQUE index.
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
