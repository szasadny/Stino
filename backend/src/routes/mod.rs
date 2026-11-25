mod extract;
mod health;
mod host_guard;
mod import;
mod labels;
mod search;
mod tasks;

use std::path::Path;
use std::sync::Arc;

use axum::extract::DefaultBodyLimit;
use axum::middleware;
use axum::routing::{get, patch, post};
use axum::Router;
use serde::Deserialize;
use tower_http::services::{ServeDir, ServeFile};
use tower_http::trace::TraceLayer;

use crate::config;
use crate::error::AppError;
use crate::services::Pool;

#[derive(Deserialize)]
struct IdList {
    ids: Vec<i64>,
}

pub fn router(pool: Pool, static_dir: &Path, allowed_hosts: Option<Vec<String>>) -> Router {
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
        .with_state(pool);

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
                host_guard::check_host(hosts.clone(), req, next)
            }))
        }
        None => router,
    }
}

async fn api_not_found() -> AppError {
    AppError::NotFound
}
