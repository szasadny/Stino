//! Thin task CRUD and completion handlers.

use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use serde::Deserialize;

use super::{double_option, AppState};
use crate::domain::{BatchOp, NewTask, TaskPatch};
use crate::error::{AppError, AppResult};
use crate::services::task_service;

/// `GET /api/tasks` selectors, most specific first: `?from=&to=` lists a date
/// range (the calendar grid), `?date=YYYY-MM-DD` lists one day, and otherwise
/// (incl. `?inbox=true`) the Inbox. Giving only one of `from`/`to` is a 400.
/// Unknown params are a 400 too (`deny_unknown_fields`) — a typo'd selector
/// must not silently return the Inbox.
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ListParams {
    /// Accepted for the explicit `?inbox=true` form; the Inbox is also the
    /// default when no selector is given, so only deserialization reads it.
    #[allow(dead_code)]
    pub inbox: Option<bool>,
    pub date: Option<String>,
    pub from: Option<String>,
    pub to: Option<String>,
}

#[derive(Deserialize)]
pub struct CreateTask {
    pub title: String,
    pub notes: Option<String>,
    pub label_id: Option<i64>,
    pub due_date: Option<String>,
    pub due_time: Option<String>,
    pub recurrence_rule: Option<String>,
}

/// Partial update. Nullable fields use `double_option` so a JSON `null` clears
/// the field, while omitting it leaves the field untouched.
#[derive(Deserialize)]
pub struct UpdateTask {
    pub title: Option<String>,
    #[serde(default, deserialize_with = "double_option")]
    pub notes: Option<Option<String>>,
    #[serde(default, deserialize_with = "double_option")]
    pub label_id: Option<Option<i64>>,
    #[serde(default, deserialize_with = "double_option")]
    pub due_date: Option<Option<String>>,
    #[serde(default, deserialize_with = "double_option")]
    pub due_time: Option<Option<String>>,
    #[serde(default, deserialize_with = "double_option")]
    pub recurrence_rule: Option<Option<String>>,
}

/// Optional occurrence for (un)completing; defaults to the task's own due_date.
#[derive(Deserialize)]
pub struct CompletionParams {
    pub occurrence_date: Option<String>,
}

/// Move one occurrence of a recurring task: `occurrence_date` is the instance to
/// detach, `new_date` the day it moves to. The series keeps repeating elsewhere.
#[derive(Deserialize)]
pub struct MoveOccurrence {
    pub occurrence_date: String,
    pub new_date: String,
}

/// Rollover payload: the client's local date (Hard Rule 7 — the browser is the
/// single source of "today"; the backend never computes it).
#[derive(Deserialize)]
pub struct RolloverTasks {
    pub today: String,
}

/// Reorder payload: the full ordered list of (untimed) task ids for a list/day.
/// Each task's `sort_order` becomes its position in this list.
#[derive(Deserialize)]
pub struct ReorderTasks {
    pub ids: Vec<i64>,
}

/// Bulk-edit payload (Inbox multi-select): the target `ids` and one `op` to apply
/// to all of them.
#[derive(Deserialize)]
pub struct BatchTasks {
    pub ids: Vec<i64>,
    pub op: BatchOpBody,
}

/// The wire form of a [`BatchOp`], tagged by `type`. `label_id` is nullable
/// (a `null`/absent label clears it); `schedule` carries the date to set.
#[derive(Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum BatchOpBody {
    Label {
        #[serde(default)]
        label_id: Option<i64>,
    },
    Schedule {
        due_date: String,
    },
    Complete,
    Delete,
}

pub async fn list(
    State(state): State<AppState>,
    Query(params): Query<ListParams>,
) -> AppResult<impl IntoResponse> {
    let tasks = match (params.from, params.to, params.date) {
        (Some(from), Some(to), _) => task_service::list_in_range(&state.pool, &from, &to).await?,
        (Some(_), None, _) | (None, Some(_), _) => {
            return Err(AppError::Validation(
                "both from and to are required for a range".into(),
            ))
        }
        (None, None, Some(date)) => task_service::list_for_date(&state.pool, &date).await?,
        (None, None, None) => task_service::list_inbox(&state.pool).await?,
    };
    Ok(Json(tasks))
}

pub async fn create(
    State(state): State<AppState>,
    Json(body): Json<CreateTask>,
) -> AppResult<impl IntoResponse> {
    let task = task_service::create(
        &state.pool,
        NewTask {
            title: body.title,
            notes: body.notes,
            label_id: body.label_id,
            due_date: body.due_date,
            due_time: body.due_time,
            recurrence_rule: body.recurrence_rule,
        },
    )
    .await?;
    Ok((StatusCode::CREATED, Json(task)))
}

pub async fn update(
    State(state): State<AppState>,
    Path(id): Path<i64>,
    Json(body): Json<UpdateTask>,
) -> AppResult<impl IntoResponse> {
    let task = task_service::update(
        &state.pool,
        id,
        TaskPatch {
            title: body.title,
            notes: body.notes,
            label_id: body.label_id,
            due_date: body.due_date,
            due_time: body.due_time,
            recurrence_rule: body.recurrence_rule,
        },
    )
    .await?;
    Ok(Json(task))
}

pub async fn delete(
    State(state): State<AppState>,
    Path(id): Path<i64>,
) -> AppResult<impl IntoResponse> {
    task_service::delete(&state.pool, id).await?;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn reorder(
    State(state): State<AppState>,
    Json(body): Json<ReorderTasks>,
) -> AppResult<impl IntoResponse> {
    task_service::reorder(&state.pool, &body.ids).await?;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn rollover(
    State(state): State<AppState>,
    Json(body): Json<RolloverTasks>,
) -> AppResult<impl IntoResponse> {
    let summary = task_service::rollover(&state.pool, &body.today).await?;
    Ok(Json(summary))
}

pub async fn batch(
    State(state): State<AppState>,
    Json(body): Json<BatchTasks>,
) -> AppResult<impl IntoResponse> {
    let op = match body.op {
        BatchOpBody::Label { label_id } => BatchOp::SetLabel(label_id),
        BatchOpBody::Schedule { due_date } => BatchOp::Schedule(due_date),
        BatchOpBody::Complete => BatchOp::Complete,
        BatchOpBody::Delete => BatchOp::Delete,
    };
    task_service::batch(&state.pool, &body.ids, op).await?;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn move_occurrence(
    State(state): State<AppState>,
    Path(id): Path<i64>,
    Json(body): Json<MoveOccurrence>,
) -> AppResult<impl IntoResponse> {
    let task =
        task_service::move_occurrence(&state.pool, id, body.occurrence_date, body.new_date).await?;
    Ok((StatusCode::CREATED, Json(task)))
}

pub async fn complete(
    State(state): State<AppState>,
    Path(id): Path<i64>,
    Query(params): Query<CompletionParams>,
) -> AppResult<impl IntoResponse> {
    let task = task_service::complete(&state.pool, id, params.occurrence_date).await?;
    Ok(Json(task))
}

pub async fn uncomplete(
    State(state): State<AppState>,
    Path(id): Path<i64>,
    Query(params): Query<CompletionParams>,
) -> AppResult<impl IntoResponse> {
    let task = task_service::uncomplete(&state.pool, id, params.occurrence_date).await?;
    Ok(Json(task))
}
