use axum::extract::State;
use axum::response::IntoResponse;
use serde::Deserialize;

use super::extract::{Json, Query};
use super::AppState;
use crate::error::AppResult;
use crate::services::search_service;

/// A missing/blank `q` yields an empty list.
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
