use crate::db::{Conn, Executor};

// Not `INSERT OR IGNORE`: UNIQUE treats NULLs as distinct, so an Inbox completion would duplicate.
pub(crate) async fn add_completion(
    executor: impl Executor<'_>,
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

pub(crate) async fn delete_completion(
    executor: impl Executor<'_>,
    task_id: i64,
    occurrence_date: Option<&str>,
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        "DELETE FROM completion WHERE task_id = ? AND occurrence_date IS ?",
        task_id,
        occurrence_date
    )
    .execute(executor)
    .await?;
    Ok(())
}

pub(crate) async fn rekey_completion(
    executor: impl Executor<'_>,
    (from_task, from_date): (i64, Option<&str>),
    (to_task, to_date): (i64, Option<&str>),
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        "UPDATE completion SET task_id = ?, occurrence_date = ?
         WHERE task_id = ? AND occurrence_date IS ?",
        to_task,
        to_date,
        from_task,
        from_date
    )
    .execute(executor)
    .await?;
    Ok(())
}

// `completed` is keyed to `due_date`; the target is cleared first to dodge the UNIQUE index.
pub(crate) async fn move_completion(
    conn: &mut Conn,
    task_id: i64,
    from: Option<&str>,
    to: Option<&str>,
) -> Result<(), sqlx::Error> {
    if from == to {
        return Ok(());
    }
    delete_completion(&mut *conn, task_id, to).await?;
    rekey_completion(conn, (task_id, from), (task_id, to)).await
}

pub(crate) async fn is_completed(
    executor: impl Executor<'_>,
    task_id: i64,
    occurrence_date: &str,
) -> Result<bool, sqlx::Error> {
    sqlx::query_scalar!(
        r#"SELECT EXISTS(
               SELECT 1 FROM completion WHERE task_id = ? AND occurrence_date = ?
           ) AS "exists!: bool""#,
        task_id,
        occurrence_date
    )
    .fetch_one(executor)
    .await
}

// Narrowed to series so the `(task_id, occurrence_date)` index serves it, not a table scan.
pub(crate) async fn series_completions_between(
    executor: impl Executor<'_>,
    from: &str,
    to: &str,
) -> Result<Vec<(i64, String)>, sqlx::Error> {
    let rows = sqlx::query!(
        r#"SELECT task_id AS "task_id!", occurrence_date AS "occurrence_date!"
           FROM completion
           WHERE task_id IN (SELECT id FROM task WHERE recurrence_rule IS NOT NULL)
             AND occurrence_date BETWEEN ? AND ?"#,
        from,
        to
    )
    .fetch_all(executor)
    .await?;
    Ok(rows
        .into_iter()
        .map(|row| (row.task_id, row.occurrence_date))
        .collect())
}
