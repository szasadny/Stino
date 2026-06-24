//! All SQL for the `label` table. Queries are compile-time-checked against the
//! schema; the `"col!"` overrides force NOT-NULL inference (SQLite + RETURNING
//! otherwise reports columns as nullable).

use sqlx::SqlitePool;

use crate::domain::Label;

pub async fn list(pool: &SqlitePool) -> Result<Vec<Label>, sqlx::Error> {
    sqlx::query_as!(
        Label,
        r#"SELECT id AS "id!", name AS "name!", color AS "color!", sort_order AS "sort_order!"
           FROM label
           ORDER BY sort_order, id"#
    )
    .fetch_all(pool)
    .await
}

pub async fn get(pool: &SqlitePool, id: i64) -> Result<Option<Label>, sqlx::Error> {
    sqlx::query_as!(
        Label,
        r#"SELECT id AS "id!", name AS "name!", color AS "color!", sort_order AS "sort_order!"
           FROM label
           WHERE id = ?"#,
        id
    )
    .fetch_optional(pool)
    .await
}

/// The next `sort_order` to assign so new labels append to the end.
pub async fn next_sort_order(pool: &SqlitePool) -> Result<i64, sqlx::Error> {
    sqlx::query_scalar!(r#"SELECT COALESCE(MAX(sort_order), -1) + 1 AS "next!" FROM label"#)
        .fetch_one(pool)
        .await
}

pub async fn insert(
    pool: &SqlitePool,
    name: &str,
    color: &str,
    sort_order: i64,
) -> Result<Label, sqlx::Error> {
    sqlx::query_as!(
        Label,
        r#"INSERT INTO label (name, color, sort_order)
           VALUES (?, ?, ?)
           RETURNING id AS "id!", name AS "name!", color AS "color!", sort_order AS "sort_order!""#,
        name,
        color,
        sort_order
    )
    .fetch_one(pool)
    .await
}

/// Update name and color; returns `None` if no label has that id.
pub async fn update(
    pool: &SqlitePool,
    id: i64,
    name: &str,
    color: &str,
) -> Result<Option<Label>, sqlx::Error> {
    sqlx::query_as!(
        Label,
        r#"UPDATE label
           SET name = ?, color = ?, updated_at = datetime('now')
           WHERE id = ?
           RETURNING id AS "id!", name AS "name!", color AS "color!", sort_order AS "sort_order!""#,
        name,
        color,
        id
    )
    .fetch_optional(pool)
    .await
}

/// Returns `true` if a row was deleted, `false` if no label had that id.
pub async fn delete(pool: &SqlitePool, id: i64) -> Result<bool, sqlx::Error> {
    let res = sqlx::query!("DELETE FROM label WHERE id = ?", id)
        .execute(pool)
        .await?;
    Ok(res.rows_affected() > 0)
}
