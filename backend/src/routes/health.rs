use axum::{extract::State, Json};
use serde::Serialize;

use super::AppState;
use crate::db;

#[derive(Serialize)]
pub struct Health {
    pub status: &'static str,
    pub db: bool,
}

/// Container health probe; not called by the SPA.
pub async fn health(State(state): State<AppState>) -> Json<Health> {
    let db = db::ping(&state.pool).await;
    Json(Health { status: "ok", db })
}
