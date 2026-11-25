use axum::extract::State;

use super::extract::Json;
use super::Pool;
use crate::domain::Health;
use crate::services::health_service;

// Container health probe; not called by the SPA.
pub(super) async fn health(State(pool): State<Pool>) -> Json<Health> {
    Json(health_service::check(&pool).await)
}
