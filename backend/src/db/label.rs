//! All SQL for the `label` table. Queries are compile-time-checked against the
//! schema; the `"col!"` overrides force NOT-NULL inference (SQLite + RETURNING
//! otherwise reports columns as nullable).

use sqlx::SqlitePool;

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

pub async fn get(pool: &SqlitePool, id: i64) -> Result<Option<Label>, sqlx::Error> {
    sqlx::query_as!(
        Label,
        r#"SELECT id AS "id!", name AS "name!", color AS "color!", emoji, sort_order AS "sort_order!"
           FROM label
           WHERE id = ?"#,
        id
    )
    .fetch_optional(pool)
    .await
}

/// Find a label by name, case-insensitively (`COLLATE NOCASE` folds ASCII case).
/// Used by the importer to map a tag/list to an existing label instead of
/// creating a duplicate.
pub async fn find_by_name(pool: &SqlitePool, name: &str) -> Result<Option<Label>, sqlx::Error> {
    sqlx::query_as!(
        Label,
        r#"SELECT id AS "id!", name AS "name!", color AS "color!", emoji, sort_order AS "sort_order!"
           FROM label
           WHERE name = ? COLLATE NOCASE"#,
        name
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
    .fetch_one(pool)
    .await
}

/// Update name, color, and emoji; returns `None` if no label has that id.
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

/// Persist a new label order: set each label's `sort_order` to its position in
/// `ids` (0-based) in one transaction, so the list reorders atomically. Returns
/// `RowNotFound` — rolling the whole batch back — if any id doesn't exist. Mirrors
/// `task::reorder`; the label `sort_order` drives both the Labels manager and the
/// grouped day view's section order.
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

/// Returns `true` if a row was deleted, `false` if no label had that id.
pub async fn delete(pool: &SqlitePool, id: i64) -> Result<bool, sqlx::Error> {
    let res = sqlx::query!("DELETE FROM label WHERE id = ?", id)
        .execute(pool)
        .await?;
    Ok(res.rows_affected() > 0)
}
