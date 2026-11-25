use crate::db::Executor;
use crate::domain::Task;

// A completed Inbox task drops out for good.
pub(crate) async fn list_inbox(executor: impl Executor<'_>) -> Result<Vec<Task>, sqlx::Error> {
    select_tasks!(
        "WHERE due_date IS NULL
           AND NOT EXISTS(
               SELECT 1 FROM completion c
               WHERE c.task_id = task.id AND c.occurrence_date IS task.due_date
           )
         ORDER BY sort_order, id"
    )
    .fetch_all(executor)
    .await
}

pub(crate) async fn list_one_offs_between(
    executor: impl Executor<'_>,
    from: &str,
    to: &str,
) -> Result<Vec<Task>, sqlx::Error> {
    select_tasks!(
        "WHERE due_date BETWEEN ? AND ? AND recurrence_rule IS NULL",
        from,
        to
    )
    .fetch_all(executor)
    .await
}

// `pattern` is a pre-escaped LIKE term (`\` escape); recurring tasks return as their series row.
pub(crate) async fn search(
    executor: impl Executor<'_>,
    pattern: &str,
) -> Result<Vec<Task>, sqlx::Error> {
    select_tasks!(
        r#"WHERE title LIKE ? ESCAPE '\' OR notes LIKE ? ESCAPE '\'
           ORDER BY (due_date IS NULL), due_date, title"#,
        pattern,
        pattern
    )
    .fetch_all(executor)
    .await
}

pub(crate) async fn list_recurring_through(
    executor: impl Executor<'_>,
    to: &str,
) -> Result<Vec<Task>, sqlx::Error> {
    select_tasks!(
        "WHERE recurrence_rule IS NOT NULL AND due_date IS NOT NULL AND due_date <= ?",
        to
    )
    .fetch_all(executor)
    .await
}

pub(crate) async fn get(executor: impl Executor<'_>, id: i64) -> Result<Option<Task>, sqlx::Error> {
    select_tasks!("WHERE id = ?", id)
        .fetch_optional(executor)
        .await
}
