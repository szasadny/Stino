use crate::db::{Conn, Executor};
use crate::domain::{NewTask, Task};

// One global counter suffices: only relative order within a filtered list matters.
pub(crate) async fn next_sort_order(executor: impl Executor<'_>) -> Result<i64, sqlx::Error> {
    sqlx::query_scalar!(r#"SELECT COALESCE(MAX(sort_order), -1) + 1 AS "next!" FROM task"#)
        .fetch_one(executor)
        .await
}

pub(crate) async fn insert(
    conn: &mut Conn,
    fields: &NewTask,
    sort_order: i64,
) -> Result<Task, sqlx::Error> {
    let id = sqlx::query_scalar!(
        r#"INSERT INTO task (title, notes, label_id, due_date, due_time, recurrence_rule, sort_order)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           RETURNING id AS "id!""#,
        fields.title,
        fields.notes,
        fields.label_id,
        fields.due_date,
        fields.due_time,
        fields.recurrence_rule,
        sort_order
    )
    .fetch_one(&mut *conn)
    .await?;
    select_tasks!("WHERE id = ?", id).fetch_one(conn).await
}

pub(crate) async fn update(
    executor: impl Executor<'_>,
    id: i64,
    fields: &NewTask,
) -> Result<bool, sqlx::Error> {
    let res = sqlx::query!(
        r#"UPDATE task
           SET title = ?, notes = ?, label_id = ?, due_date = ?, due_time = ?,
               recurrence_rule = ?, updated_at = datetime('now')
           WHERE id = ?"#,
        fields.title,
        fields.notes,
        fields.label_id,
        fields.due_date,
        fields.due_time,
        fields.recurrence_rule,
        id
    )
    .execute(executor)
    .await?;
    Ok(res.rows_affected() > 0)
}

pub(crate) async fn delete(executor: impl Executor<'_>, id: i64) -> Result<bool, sqlx::Error> {
    let res = sqlx::query!("DELETE FROM task WHERE id = ?", id)
        .execute(executor)
        .await?;
    Ok(res.rows_affected() > 0)
}
