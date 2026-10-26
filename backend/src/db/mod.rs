//! All SQL lives here; business rules stay in `services/`.

use sqlx::SqlitePool;

pub mod label;
pub mod task;

pub async fn ping(pool: &SqlitePool) -> bool {
    sqlx::query("SELECT 1").execute(pool).await.is_ok()
}

/// 0 affected rows ⇒ `RowNotFound`, which drops the open transaction so the whole batch rolls back.
pub(crate) fn assert_affected(rows: u64) -> Result<(), sqlx::Error> {
    if rows == 0 {
        Err(sqlx::Error::RowNotFound)
    } else {
        Ok(())
    }
}
