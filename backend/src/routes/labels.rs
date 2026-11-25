use axum::extract::State;
use axum::http::StatusCode;
use axum::response::IntoResponse;

use super::extract::{Json, Path};
use super::{IdList, Pool};
use crate::domain::{LabelPatch, NewLabel};
use crate::error::AppResult;
use crate::services::label_service;

pub(super) async fn list(State(pool): State<Pool>) -> AppResult<impl IntoResponse> {
    Ok(Json(label_service::list(&pool).await?))
}

pub(super) async fn create(
    State(pool): State<Pool>,
    Json(input): Json<NewLabel>,
) -> AppResult<impl IntoResponse> {
    let label = label_service::create(&pool, input).await?;
    Ok((StatusCode::CREATED, Json(label)))
}

pub(super) async fn update(
    State(pool): State<Pool>,
    Path(id): Path<i64>,
    Json(patch): Json<LabelPatch>,
) -> AppResult<impl IntoResponse> {
    Ok(Json(label_service::update(&pool, id, patch).await?))
}

pub(super) async fn delete(
    State(pool): State<Pool>,
    Path(id): Path<i64>,
) -> AppResult<impl IntoResponse> {
    label_service::delete(&pool, id).await?;
    Ok(StatusCode::NO_CONTENT)
}

pub(super) async fn reorder(
    State(pool): State<Pool>,
    Json(body): Json<IdList>,
) -> AppResult<impl IntoResponse> {
    label_service::reorder(&pool, &body.ids).await?;
    Ok(StatusCode::NO_CONTENT)
}
