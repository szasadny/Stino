use crate::db::Executor;

pub(crate) async fn set_sort_order(
    executor: impl Executor<'_>,
    id: i64,
    sort_order: i64,
) -> Result<bool, sqlx::Error> {
    let res = sqlx::query!(
        "UPDATE task SET sort_order = ?, updated_at = datetime('now') WHERE id = ?",
        sort_order,
        id
    )
    .execute(executor)
    .await?;
    Ok(res.rows_affected() > 0)
}

pub(crate) async fn set_label(
    executor: impl Executor<'_>,
    id: i64,
    label_id: Option<i64>,
) -> Result<bool, sqlx::Error> {
    let res = sqlx::query!(
        "UPDATE task SET label_id = ?, updated_at = datetime('now') WHERE id = ?",
        label_id,
        id
    )
    .execute(executor)
    .await?;
    Ok(res.rows_affected() > 0)
}

pub(crate) async fn set_due_date(
    executor: impl Executor<'_>,
    id: i64,
    due_date: &str,
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        "UPDATE task SET due_date = ?, updated_at = datetime('now') WHERE id = ?",
        due_date,
        id
    )
    .execute(executor)
    .await?;
    Ok(())
}

// Recurring tasks are untouched: their series generates today's occurrence itself.
pub(crate) async fn move_overdue_one_offs(
    executor: impl Executor<'_>,
    today: &str,
) -> Result<u64, sqlx::Error> {
    let res = sqlx::query!(
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
    .execute(executor)
    .await?;
    Ok(res.rows_affected())
}
