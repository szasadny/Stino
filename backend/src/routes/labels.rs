//! Thin label CRUD handlers; validation and persistence live below the route.

use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use serde::Deserialize;

use super::{double_option, AppState};
use crate::error::AppResult;
use crate::services::label_service;

#[derive(Deserialize)]
pub struct CreateLabel {
    pub name: String,
    pub color: String,
    /// Optional emoji glyph; absent/null ⇒ no emoji.
    pub emoji: Option<String>,
}

/// Reorder payload: the full ordered list of label ids (their new manual order).
#[derive(Deserialize)]
pub struct ReorderLabels {
    pub ids: Vec<i64>,
}

#[derive(Deserialize)]
pub struct UpdateLabel {
    pub name: Option<String>,
    pub color: Option<String>,
    /// `double_option` so an explicit `null` clears the emoji while an omitted
    /// field leaves it unchanged.
    #[serde(default, deserialize_with = "double_option")]
    pub emoji: Option<Option<String>>,
}

pub async fn list(State(state): State<AppState>) -> AppResult<impl IntoResponse> {
    Ok(Json(label_service::list(&state.pool).await?))
}

pub async fn create(
    State(state): State<AppState>,
    Json(body): Json<CreateLabel>,
) -> AppResult<impl IntoResponse> {
    let label =
        label_service::create(&state.pool, &body.name, &body.color, body.emoji.as_deref()).await?;
    Ok((StatusCode::CREATED, Json(label)))
}

pub async fn update(
    State(state): State<AppState>,
    Path(id): Path<i64>,
    Json(body): Json<UpdateLabel>,
) -> AppResult<impl IntoResponse> {
    let label = label_service::update(
        &state.pool,
        id,
        body.name.as_deref(),
        body.color.as_deref(),
        body.emoji.as_ref().map(Option::as_deref),
    )
    .await?;
    Ok(Json(label))
}

pub async fn delete(
    State(state): State<AppState>,
    Path(id): Path<i64>,
) -> AppResult<impl IntoResponse> {
    label_service::delete(&state.pool, id).await?;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn reorder(
    State(state): State<AppState>,
    Json(body): Json<ReorderLabels>,
) -> AppResult<impl IntoResponse> {
    label_service::reorder(&state.pool, &body.ids).await?;
    Ok(StatusCode::NO_CONTENT)
}
