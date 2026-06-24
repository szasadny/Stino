//! Thin HTTP handlers for label CRUD: parse the request, call one service, shape
//! the response. No business logic, no SQL.

use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use serde::Deserialize;

use super::AppState;
use crate::error::AppResult;
use crate::services::label_service;

#[derive(Deserialize)]
pub struct CreateLabel {
    pub name: String,
    pub color: String,
}

#[derive(Deserialize)]
pub struct UpdateLabel {
    pub name: Option<String>,
    pub color: Option<String>,
}

pub async fn list(State(state): State<AppState>) -> AppResult<impl IntoResponse> {
    Ok(Json(label_service::list(&state.pool).await?))
}

pub async fn create(
    State(state): State<AppState>,
    Json(body): Json<CreateLabel>,
) -> AppResult<impl IntoResponse> {
    let label = label_service::create(&state.pool, &body.name, &body.color).await?;
    Ok((StatusCode::CREATED, Json(label)))
}

pub async fn update(
    State(state): State<AppState>,
    Path(id): Path<i64>,
    Json(body): Json<UpdateLabel>,
) -> AppResult<impl IntoResponse> {
    let label =
        label_service::update(&state.pool, id, body.name.as_deref(), body.color.as_deref()).await?;
    Ok(Json(label))
}

pub async fn delete(
    State(state): State<AppState>,
    Path(id): Path<i64>,
) -> AppResult<impl IntoResponse> {
    label_service::delete(&state.pool, id).await?;
    Ok(StatusCode::NO_CONTENT)
}
