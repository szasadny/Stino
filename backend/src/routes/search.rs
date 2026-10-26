//! Thin task-search handler; query and persistence logic live in the service.

use axum::extract::State;
use axum::response::IntoResponse;
use serde::Deserialize;

use super::extract::{Json, Query};
use super::AppState;
use crate::error::AppResult;
use crate::services::search_service;

/// `GET /api/search?q=` — a missing/blank `q` yields an empty list (calm), so the
/// query param is optional.
#[derive(Deserialize)]
pub struct SearchParams {
    pub q: Option<String>,
}

pub async fn list(
    State(state): State<AppState>,
    Query(params): Query<SearchParams>,
) -> AppResult<impl IntoResponse> {
    let tasks = search_service::search(&state.pool, params.q.as_deref().unwrap_or("")).await?;
    Ok(Json(tasks))
}
