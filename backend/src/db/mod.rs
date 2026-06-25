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
