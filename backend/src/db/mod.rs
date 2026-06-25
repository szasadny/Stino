//! Repository layer: every SQL query lives here. Resource queries are
//! compile-time-checked via SQLx; the one exception is the trivial liveness
//! probe below — a constant `SELECT 1` with no inputs to check.
//! No business rules — callers in `services/` decide what the queries mean.

use sqlx::SqlitePool;

pub mod label;
pub mod task;

/// Liveness probe: `true` if a trivial query round-trips through the pool. A
/// constant `SELECT 1` with no parameters, so it needs no compile-time check or
/// offline-cache entry — it only proves the database connection is alive.
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
