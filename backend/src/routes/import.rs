//! Thin handler for the TickTick CSV import: take the raw uploaded bytes, hand
//! them to the import service, return the JSON summary. No business logic here.

use axum::body::Bytes;
use axum::extract::State;
use axum::response::IntoResponse;
use axum::Json;

use super::AppState;
use crate::error::AppResult;
use crate::services::import_service;

/// `POST /api/import/ticktick` — the request body is the raw CSV file (the SPA
/// sends the picked `File` directly). Returns a
/// `{ created: { tasks, labels, completions }, skipped }` summary.
pub async fn ticktick(State(state): State<AppState>, body: Bytes) -> AppResult<impl IntoResponse> {
    let summary = import_service::import_ticktick(&state.pool, &body).await?;
    Ok(Json(summary))
}
