//! Repository layer: all SQL lives here and business rules stay in `services/`.
//! Resource queries are compile-time checked via SQLx.

use sqlx::SqlitePool;

pub mod label;
pub mod task;

/// Return whether a trivial query round-trips through the pool.
pub async fn ping(pool: &SqlitePool) -> bool {
    sqlx::query("SELECT 1").execute(pool).await.is_ok()
}

/// Turn a write's affected-row count into the atomic-batch rollback signal: 0
/// rows ⇒ the id didn't exist ⇒ `RowNotFound`. Returning the error inside an
/// open transaction drops it uncommitted, so the whole batch rolls back. Shared
/// by every reorder/batch loop so the "unknown id aborts the batch" rule lives
/// in one place.
pub(crate) fn assert_affected(rows: u64) -> Result<(), sqlx::Error> {
    if rows == 0 {
        Err(sqlx::Error::RowNotFound)
    } else {
        Ok(())
    }
}
