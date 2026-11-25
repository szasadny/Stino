use axum::extract::State;
use axum::response::IntoResponse;
use serde::Deserialize;

use super::extract::{Json, Query};
use super::Pool;
use crate::error::AppResult;
use crate::services::search_service;

#[derive(Deserialize)]
pub(super) struct SearchParams {
    q: Option<String>,
}

pub(super) async fn list(
    State(pool): State<Pool>,
    Query(params): Query<SearchParams>,
) -> AppResult<impl IntoResponse> {
    let tasks = search_service::search(&pool, params.q.as_deref().unwrap_or("")).await?;
    Ok(Json(tasks))
}
