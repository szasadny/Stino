use super::Executor;
use crate::domain::Label;

// `query_as!` needs a literal; `"col!"` forces NOT-NULL where SQLite infers nullable.
macro_rules! label_query {
    ($head:literal, $tail:literal $(, $arg:expr)* $(,)?) => {
        sqlx::query_as!(
            Label,
            $head
                + r#" id AS "id!", name AS "name!", color AS "color!", emoji, sort_order AS "sort_order!" "#
                + $tail
            $(, $arg)*
        )
    };
}

pub(crate) async fn list(executor: impl Executor<'_>) -> Result<Vec<Label>, sqlx::Error> {
    label_query!("SELECT", "FROM label ORDER BY sort_order, id")
        .fetch_all(executor)
        .await
}

pub(crate) async fn get(
    executor: impl Executor<'_>,
    id: i64,
) -> Result<Option<Label>, sqlx::Error> {
    label_query!("SELECT", "FROM label WHERE id = ?", id)
        .fetch_optional(executor)
        .await
}

// ASCII case-insensitive (`COLLATE NOCASE`).
pub(crate) async fn find_by_name(
    executor: impl Executor<'_>,
    name: &str,
) -> Result<Option<Label>, sqlx::Error> {
    label_query!("SELECT", "FROM label WHERE name = ? COLLATE NOCASE", name)
        .fetch_optional(executor)
        .await
}

pub(crate) async fn next_sort_order(executor: impl Executor<'_>) -> Result<i64, sqlx::Error> {
    sqlx::query_scalar!(r#"SELECT COALESCE(MAX(sort_order), -1) + 1 AS "next!" FROM label"#)
        .fetch_one(executor)
        .await
}

pub(crate) async fn insert(
    executor: impl Executor<'_>,
    name: &str,
    color: &str,
    emoji: Option<&str>,
    sort_order: i64,
) -> Result<Label, sqlx::Error> {
    label_query!(
        "INSERT INTO label (name, color, emoji, sort_order) VALUES (?, ?, ?, ?) RETURNING",
        "",
        name,
        color,
        emoji,
        sort_order
    )
    .fetch_one(executor)
    .await
}

pub(crate) async fn update(
    executor: impl Executor<'_>,
    id: i64,
    name: &str,
    color: &str,
    emoji: Option<&str>,
) -> Result<Option<Label>, sqlx::Error> {
    label_query!(
        "UPDATE label SET name = ?, color = ?, emoji = ?, updated_at = datetime('now') WHERE id = ? RETURNING",
        "",
        name,
        color,
        emoji,
        id
    )
    .fetch_optional(executor)
    .await
}

pub(crate) async fn set_sort_order(
    executor: impl Executor<'_>,
    id: i64,
    sort_order: i64,
) -> Result<bool, sqlx::Error> {
    let res = sqlx::query!(
        "UPDATE label SET sort_order = ?, updated_at = datetime('now') WHERE id = ?",
        sort_order,
        id
    )
    .execute(executor)
    .await?;
    Ok(res.rows_affected() > 0)
}

pub(crate) async fn delete(executor: impl Executor<'_>, id: i64) -> Result<bool, sqlx::Error> {
    let res = sqlx::query!("DELETE FROM label WHERE id = ?", id)
        .execute(executor)
        .await?;
    Ok(res.rows_affected() > 0)
}
