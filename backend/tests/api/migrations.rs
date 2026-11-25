use std::borrow::Cow;

use sqlx::migrate::Migrator;
use sqlx::{Row, SqlitePool};

use crate::common::pool_with;

fn migrator_through(version: i64) -> Migrator {
    let mut migrator = sqlx::migrate!();
    let early = migrator.iter().filter(|m| m.version <= version).cloned();
    migrator.migrations = Cow::Owned(early.collect());
    migrator
}

async fn insert_series(
    pool: &SqlitePool,
    title: &str,
    due: &str,
    created: &str,
) -> sqlx::Result<()> {
    sqlx::query(
        "INSERT INTO task (title, due_date, recurrence_rule, sort_order, created_at)
         VALUES (?, ?, 'FREQ=WEEKLY', 0, ?)",
    )
    .bind(title)
    .bind(due)
    .bind(created)
    .execute(pool)
    .await?;
    Ok(())
}

async fn insert_completion(pool: &SqlitePool, title: &str, date: &str) -> sqlx::Result<()> {
    sqlx::query(
        "INSERT INTO completion (task_id, occurrence_date)
         SELECT id, ? FROM task WHERE title = ?",
    )
    .bind(date)
    .bind(title)
    .execute(pool)
    .await?;
    Ok(())
}

async fn rule_of(pool: &SqlitePool, title: &str) -> sqlx::Result<Option<String>> {
    sqlx::query("SELECT recurrence_rule FROM task WHERE title = ?")
        .bind(title)
        .fetch_one(pool)
        .await?
        .try_get(0)
}

#[tokio::test]
async fn imported_history_rows_become_one_offs_and_live_series_are_untouched() -> sqlx::Result<()> {
    let pool = pool_with(migrator_through(4)).await;

    insert_series(&pool, "History", "2024-10-02", "2026-06-25 10:00:00").await?;
    insert_completion(&pool, "History", "2024-10-02").await?;
    insert_series(
        &pool,
        "Ticked on day one",
        "2026-07-01",
        "2026-07-01 08:00:00",
    )
    .await?;
    insert_completion(&pool, "Ticked on day one", "2026-07-01").await?;
    insert_series(&pool, "Used series", "2026-06-01", "2026-06-25 10:00:00").await?;
    insert_completion(&pool, "Used series", "2026-06-01").await?;
    insert_completion(&pool, "Used series", "2026-06-08").await?;
    insert_series(&pool, "Open import", "2026-06-01", "2026-06-25 10:00:00").await?;

    sqlx::migrate!().run(&pool).await?;

    assert_eq!(rule_of(&pool, "History").await?, None);
    for live in ["Ticked on day one", "Used series", "Open import"] {
        assert_eq!(
            rule_of(&pool, live).await?.as_deref(),
            Some("FREQ=WEEKLY"),
            "{live}"
        );
    }
    let kept: String = sqlx::query_scalar(
        "SELECT recurrence_rule FROM imported_history_rule
         WHERE task_id = (SELECT id FROM task WHERE title = 'History')",
    )
    .fetch_one(&pool)
    .await?;
    assert_eq!(kept, "FREQ=WEEKLY");
    Ok(())
}

#[tokio::test]
async fn open_legacy_rollover_copies_are_linked_to_their_series() -> sqlx::Result<()> {
    let pool = pool_with(migrator_through(3)).await;

    insert_series(&pool, "Stretch", "2026-06-01", "2026-06-01 08:00:00").await?;
    sqlx::query(
        "INSERT INTO task_exception (task_id, occurrence_date)
         SELECT id, '2026-06-08' FROM task WHERE title = 'Stretch'",
    )
    .execute(&pool)
    .await?;
    for title in ["Stretch", "Stretch", "Unrelated"] {
        sqlx::query("INSERT INTO task (title, due_date, sort_order) VALUES (?, '2026-06-09', 1)")
            .bind(title)
            .execute(&pool)
            .await?;
    }

    sqlx::migrate!().run(&pool).await?;

    let linked: Vec<(String, Option<i64>)> = sqlx::query_as(
        "SELECT title, detached_from FROM task WHERE recurrence_rule IS NULL ORDER BY id",
    )
    .fetch_all(&pool)
    .await?;
    let series: i64 = sqlx::query_scalar("SELECT id FROM task WHERE recurrence_rule IS NOT NULL")
        .fetch_one(&pool)
        .await?;
    assert_eq!(
        linked,
        vec![
            ("Stretch".to_string(), Some(series)),
            ("Stretch".to_string(), Some(series)),
            ("Unrelated".to_string(), None),
        ]
    );
    Ok(())
}
