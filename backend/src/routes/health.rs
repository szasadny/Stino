use axum::{extract::State, Json};
use serde::Serialize;

use super::AppState;
use crate::db;

#[derive(Serialize)]
pub struct Health {
    pub status: &'static str,
    /// Whether a trivial query against the database succeeded.
    pub db: bool,
}

/// Liveness + DB connectivity check: a container/deployment health probe and
/// the integration tests' end-to-end wiring hook. Not called by the SPA.
pub async fn health(State(state): State<AppState>) -> Json<Health> {
    let db = db::ping(&state.pool).await;
    Json(Health { status: "ok", db })
}
