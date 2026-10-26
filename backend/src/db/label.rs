//! `"col!"` overrides force NOT-NULL where SQLite infers nullable.

use sqlx::{SqliteExecutor, SqlitePool};

use super::assert_affected;
use crate::domain::Label;

pub async fn list(pool: &SqlitePool) -> Result<Vec<Label>, sqlx::Error> {
    sqlx::query_as!(
        Label,
        r#"SELECT id AS "id!", name AS "name!", color AS "color!", emoji, sort_order AS "sort_order!"
           FROM label
           ORDER BY sort_order, id"#
    )
    .fetch_all(pool)
    .await
}

/// Takes any executor so validation inside the importer's transaction sees the
/// labels that transaction created.
pub async fn get(executor: impl SqliteExecutor<'_>, id: i64) -> Result<Option<Label>, sqlx::Error> {
    sqlx::query_as!(
        Label,
        r#"SELECT id AS "id!", name AS "name!", color AS "color!", emoji, sort_order AS "sort_order!"
           FROM label
           WHERE id = ?"#,
        id
    )
    .fetch_optional(executor)
    .await
}

/// ASCII case-insensitive; any executor so the importer can reuse labels inside its transaction.
pub async fn find_by_name(
    executor: impl SqliteExecutor<'_>,
    name: &str,
) -> Result<Option<Label>, sqlx::Error> {
    sqlx::query_as!(
        Label,
        r#"SELECT id AS "id!", name AS "name!", color AS "color!", emoji, sort_order AS "sort_order!"
           FROM label
           WHERE name = ? COLLATE NOCASE"#,
        name
    )
    .fetch_optional(executor)
    .await
}

pub async fn next_sort_order(executor: impl SqliteExecutor<'_>) -> Result<i64, sqlx::Error> {
    sqlx::query_scalar!(r#"SELECT COALESCE(MAX(sort_order), -1) + 1 AS "next!" FROM label"#)
        .fetch_one(executor)
        .await
}

pub async fn insert(
    executor: impl SqliteExecutor<'_>,
    name: &str,
    color: &str,
    emoji: Option<&str>,
    sort_order: i64,
) -> Result<Label, sqlx::Error> {
    sqlx::query_as!(
        Label,
        r#"INSERT INTO label (name, color, emoji, sort_order)
           VALUES (?, ?, ?, ?)
           RETURNING id AS "id!", name AS "name!", color AS "color!", emoji, sort_order AS "sort_order!""#,
        name,
        color,
        emoji,
        sort_order
    )
    .fetch_one(executor)
    .await
}

pub async fn update(
    pool: &SqlitePool,
    id: i64,
    name: &str,
    color: &str,
    emoji: Option<&str>,
) -> Result<Option<Label>, sqlx::Error> {
    sqlx::query_as!(
        Label,
        r#"UPDATE label
           SET name = ?, color = ?, emoji = ?, updated_at = datetime('now')
           WHERE id = ?
           RETURNING id AS "id!", name AS "name!", color AS "color!", emoji, sort_order AS "sort_order!""#,
        name,
        color,
        emoji,
        id
    )
    .fetch_optional(pool)
    .await
}

/// Set each label's `sort_order` to its index in `ids`, atomically.
pub async fn reorder(pool: &SqlitePool, ids: &[i64]) -> Result<(), sqlx::Error> {
    let mut tx = pool.begin().await?;
    for (index, id) in ids.iter().enumerate() {
        let position = index as i64;
        let affected = sqlx::query!(
            "UPDATE label SET sort_order = ?, updated_at = datetime('now') WHERE id = ?",
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

pub async fn delete(pool: &SqlitePool, id: i64) -> Result<bool, sqlx::Error> {
    let res = sqlx::query!("DELETE FROM label WHERE id = ?", id)
        .execute(pool)
        .await?;
    Ok(res.rows_affected() > 0)
}
