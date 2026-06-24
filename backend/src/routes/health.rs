use axum::{extract::State, Json};
use serde::Serialize;

use super::AppState;

#[derive(Serialize)]
pub struct Health {
    pub status: &'static str,
    /// Whether a trivial query against the database succeeded.
    pub db: bool,
}

/// Liveness + DB connectivity check. Used by the frontend shell to show the
/// connection indicator, and proves the whole stack is wired end-to-end.
pub async fn health(State(state): State<AppState>) -> Json<Health> {
    let db = sqlx::query("SELECT 1").execute(&state.pool).await.is_ok();
    Json(Health { status: "ok", db })
}
