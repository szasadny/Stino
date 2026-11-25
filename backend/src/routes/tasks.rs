use axum::extract::State;
use axum::http::StatusCode;
use axum::response::IntoResponse;
use serde::Deserialize;

use super::extract::{Json, Path, Query};
use super::{IdList, Pool};
use crate::domain::{BatchOp, MoveOutcome, NewTask, TaskPatch, TaskSelector};
use crate::error::AppResult;
use crate::services::task;

// Unknown params are a 400 so a typo'd selector can't silently return the Inbox.
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct ListParams {
    inbox: Option<bool>,
    date: Option<String>,
    from: Option<String>,
    to: Option<String>,
}

#[derive(Deserialize)]
pub(super) struct CompletionParams {
    occurrence_date: Option<String>,
}

#[derive(Deserialize)]
pub(super) struct MoveOccurrence {
    occurrence_date: String,
    new_date: String,
}

#[derive(Deserialize)]
pub(super) struct SkipOccurrence {
    occurrence_date: String,
}

#[derive(Deserialize)]
pub(super) struct RolloverTasks {
    today: String,
}

#[derive(Deserialize)]
pub(super) struct BatchTasks {
    ids: Vec<i64>,
    op: BatchOp,
}

pub(super) async fn list(
    State(pool): State<Pool>,
    Query(params): Query<ListParams>,
) -> AppResult<impl IntoResponse> {
    let selector = TaskSelector::from_params(params.inbox, params.date, params.from, params.to)?;
    Ok(Json(task::list(&pool, selector).await?))
}

pub(super) async fn create(
    State(pool): State<Pool>,
    Json(input): Json<NewTask>,
) -> AppResult<impl IntoResponse> {
    let created = task::create(&pool, input).await?;
    Ok((StatusCode::CREATED, Json(created)))
}

pub(super) async fn update(
    State(pool): State<Pool>,
    Path(id): Path<i64>,
    Json(patch): Json<TaskPatch>,
) -> AppResult<impl IntoResponse> {
    Ok(Json(task::update(&pool, id, patch).await?))
}

pub(super) async fn delete(
    State(pool): State<Pool>,
    Path(id): Path<i64>,
) -> AppResult<impl IntoResponse> {
    task::delete(&pool, id).await?;
    Ok(StatusCode::NO_CONTENT)
}

pub(super) async fn reorder(
    State(pool): State<Pool>,
    Json(body): Json<IdList>,
) -> AppResult<impl IntoResponse> {
    task::reorder(&pool, &body.ids).await?;
    Ok(StatusCode::NO_CONTENT)
}

pub(super) async fn rollover(
    State(pool): State<Pool>,
    Json(body): Json<RolloverTasks>,
) -> AppResult<impl IntoResponse> {
    Ok(Json(task::rollover(&pool, &body.today).await?))
}

pub(super) async fn batch(
    State(pool): State<Pool>,
    Json(body): Json<BatchTasks>,
) -> AppResult<impl IntoResponse> {
    task::batch(&pool, &body.ids, body.op).await?;
    Ok(StatusCode::NO_CONTENT)
}

pub(super) async fn move_occurrence(
    State(pool): State<Pool>,
    Path(id): Path<i64>,
    Json(body): Json<MoveOccurrence>,
) -> AppResult<impl IntoResponse> {
    let outcome = task::move_occurrence(&pool, id, &body.occurrence_date, &body.new_date).await?;
    Ok(match outcome {
        MoveOutcome::Moved(copy) => (StatusCode::CREATED, Json(copy)),
        MoveOutcome::Unchanged(series) => (StatusCode::OK, Json(series)),
    })
}

pub(super) async fn skip_occurrence(
    State(pool): State<Pool>,
    Path(id): Path<i64>,
    Json(body): Json<SkipOccurrence>,
) -> AppResult<impl IntoResponse> {
    task::skip_occurrence(&pool, id, &body.occurrence_date).await?;
    Ok(StatusCode::NO_CONTENT)
}

pub(super) async fn complete(
    State(pool): State<Pool>,
    Path(id): Path<i64>,
    Query(params): Query<CompletionParams>,
) -> AppResult<impl IntoResponse> {
    let done = task::set_completed(&pool, id, params.occurrence_date.as_deref(), true).await?;
    Ok(Json(done))
}

pub(super) async fn uncomplete(
    State(pool): State<Pool>,
    Path(id): Path<i64>,
    Query(params): Query<CompletionParams>,
) -> AppResult<impl IntoResponse> {
    let reopened = task::set_completed(&pool, id, params.occurrence_date.as_deref(), false).await?;
    Ok(Json(reopened))
}
