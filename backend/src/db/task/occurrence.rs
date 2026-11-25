use crate::db::Executor;

pub(crate) async fn exceptions_between(
    executor: impl Executor<'_>,
    from: &str,
    to: &str,
) -> Result<Vec<(i64, String)>, sqlx::Error> {
    let rows = sqlx::query!(
        r#"SELECT task_id AS "task_id!", occurrence_date AS "occurrence_date!"
           FROM task_exception
           WHERE occurrence_date BETWEEN ? AND ?"#,
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

pub(crate) async fn is_excepted(
    executor: impl Executor<'_>,
    task_id: i64,
    occurrence_date: &str,
) -> Result<bool, sqlx::Error> {
    sqlx::query_scalar!(
        r#"SELECT EXISTS(
               SELECT 1 FROM task_exception WHERE task_id = ? AND occurrence_date = ?
           ) AS "exists!: bool""#,
        task_id,
        occurrence_date
    )
    .fetch_one(executor)
    .await
}

pub(crate) async fn latest_settled_through(
    executor: impl Executor<'_>,
    through: &str,
) -> Result<Vec<(i64, String)>, sqlx::Error> {
    let rows = sqlx::query!(
        r#"SELECT task_id AS "task_id!", MAX(occurrence_date) AS "latest!: String" FROM (
               SELECT task_id, occurrence_date FROM completion WHERE occurrence_date <= ?
               UNION ALL
               SELECT task_id, occurrence_date FROM task_exception WHERE occurrence_date <= ?
           )
           GROUP BY task_id"#,
        through,
        through
    )
    .fetch_all(executor)
    .await?;
    Ok(rows
        .into_iter()
        .map(|row| (row.task_id, row.latest))
        .collect())
}

pub(crate) async fn insert_exception(
    executor: impl Executor<'_>,
    task_id: i64,
    occurrence_date: &str,
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        "INSERT OR IGNORE INTO task_exception (task_id, occurrence_date) VALUES (?, ?)",
        task_id,
        occurrence_date
    )
    .execute(executor)
    .await?;
    Ok(())
}

pub(crate) async fn delete_exceptions(
    executor: impl Executor<'_>,
    task_id: i64,
) -> Result<(), sqlx::Error> {
    sqlx::query!("DELETE FROM task_exception WHERE task_id = ?", task_id)
        .execute(executor)
        .await?;
    Ok(())
}

pub(crate) async fn insert_detached_copy(
    executor: impl Executor<'_>,
    task_id: i64,
    new_date: &str,
    detached_from: Option<i64>,
    sort_order: i64,
) -> Result<i64, sqlx::Error> {
    // RETURNING nullable columns from `INSERT … SELECT` mis-decodes in SQLite; take the id only.
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
    .fetch_one(executor)
    .await
}

pub(crate) async fn has_open_rollover_copy(
    executor: impl Executor<'_>,
    series_id: i64,
    today: &str,
) -> Result<bool, sqlx::Error> {
    sqlx::query_scalar!(
        r#"SELECT EXISTS(
               SELECT 1 FROM task t
               WHERE t.detached_from = ? AND t.due_date IS NOT NULL AND t.due_date <= ?
                 AND NOT EXISTS (
                     SELECT 1 FROM completion c
                     WHERE c.task_id = t.id AND c.occurrence_date IS t.due_date
                 )
           ) AS "exists!: bool""#,
        series_id,
        today
    )
    .fetch_one(executor)
    .await
}
