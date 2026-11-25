use axum::body::Bytes;
use axum::extract::State;
use axum::response::IntoResponse;

use super::extract::Json;
use super::Pool;
use crate::error::AppResult;
use crate::services::import;

// The body is the raw CSV file.
pub(super) async fn ticktick(
    State(pool): State<Pool>,
    body: Bytes,
) -> AppResult<impl IntoResponse> {
    Ok(Json(import::import_ticktick(&pool, &body).await?))
}
