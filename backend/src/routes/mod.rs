mod extract;
mod health;
mod import;
mod labels;
mod search;
mod tasks;

use std::path::Path;
use std::sync::Arc;

use axum::extract::{DefaultBodyLimit, Request};
use axum::http::{header, StatusCode};
use axum::middleware::{self, Next};
use axum::response::{IntoResponse, Response};
use axum::{
    routing::{get, patch, post},
    Json, Router,
};
use serde::{Deserialize, Deserializer};
use sqlx::SqlitePool;
use tower_http::services::{ServeDir, ServeFile};
use tower_http::trace::TraceLayer;

use crate::config;

#[derive(Clone)]
pub struct AppState {
    pub pool: SqlitePool,
}

pub fn router(pool: SqlitePool, static_dir: &Path, allowed_hosts: Option<Vec<String>>) -> Router {
    let api = Router::new()
        .route("/health", get(health::health))
        .route("/labels", get(labels::list).post(labels::create))
        .route("/labels/reorder", patch(labels::reorder))
        .route("/labels/{id}", patch(labels::update).delete(labels::delete))
        .route("/tasks", get(tasks::list).post(tasks::create))
        .route("/tasks/reorder", patch(tasks::reorder))
        .route("/tasks/batch", post(tasks::batch))
        .route("/tasks/rollover", post(tasks::rollover))
        .route("/tasks/{id}", patch(tasks::update).delete(tasks::delete))
        .route(
            "/tasks/{id}/completions",
            post(tasks::complete).delete(tasks::uncomplete),
        )
        .route("/tasks/{id}/move_occurrence", post(tasks::move_occurrence))
        .route("/tasks/{id}/skip_occurrence", post(tasks::skip_occurrence))
        .route("/search", get(search::list))
        .route(
            "/import/ticktick",
            post(import::ticktick).layer(DefaultBodyLimit::max(config::IMPORT_MAX_BODY_BYTES)),
        )
        // JSON 404 for unknown /api paths instead of the SPA index.
        .fallback(api_not_found)
        .with_state(AppState { pool });

    // SPA fallback keeps a 200 for deep links (.not_found_service would force a 404).
    let index = static_dir.join("index.html");
    let spa = ServeDir::new(static_dir).fallback(ServeFile::new(index));

    let router = Router::new()
        .nest("/api", api)
        .fallback_service(spa)
        .layer(TraceLayer::new_for_http());

    match allowed_hosts {
        Some(hosts) => {
            let hosts = Arc::new(hosts);
            router.layer(middleware::from_fn(move |req, next| {
                check_host(hosts.clone(), req, next)
            }))
        }
        None => router,
    }
}

/// DNS-rebinding guard: reject requests whose Host (port stripped, case-insensitive) isn't allowed.
async fn check_host(hosts: Arc<Vec<String>>, req: Request, next: Next) -> Response {
    let allowed = req
        .headers()
        .get(header::HOST)
        .and_then(|value| value.to_str().ok())
        .map(host_name)
        .is_some_and(|name| hosts.iter().any(|host| host.eq_ignore_ascii_case(name)));
    if allowed {
        next.run(req).await
    } else {
        (
            StatusCode::FORBIDDEN,
            Json(serde_json::json!({ "error": "forbidden host" })),
        )
            .into_response()
    }
}

/// Strips a `:port`, keeping an IPv6 literal (`[::1]:8080`) intact.
fn host_name(header: &str) -> &str {
    if let Some(rest) = header.strip_prefix('[') {
        return rest.split_once(']').map_or(rest, |(name, _)| name);
    }
    header.split_once(':').map_or(header, |(name, _)| name)
}

/// Present `null` ⇒ `Some(None)` (clear); with `#[serde(default)]` an omitted field stays `None`.
pub(super) fn double_option<'de, T, D>(deserializer: D) -> Result<Option<Option<T>>, D::Error>
where
    T: Deserialize<'de>,
    D: Deserializer<'de>,
{
    Option::<T>::deserialize(deserializer).map(Some)
}

async fn api_not_found() -> (StatusCode, Json<serde_json::Value>) {
    (
        StatusCode::NOT_FOUND,
        Json(serde_json::json!({ "error": "not found" })),
    )
}
