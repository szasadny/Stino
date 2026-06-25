mod health;
mod import;
mod labels;
mod search;
mod tasks;

use std::path::Path;

use axum::http::StatusCode;
use axum::{
    routing::{get, patch, post},
    Json, Router,
};
use sqlx::SqlitePool;
use tower_http::services::{ServeDir, ServeFile};
use tower_http::trace::TraceLayer;

/// Shared state handed to every handler. Holds the SQLite pool today; future
/// slices add more (config, clock) here rather than using globals.
#[derive(Clone)]
pub struct AppState {
    pub pool: SqlitePool,
}

/// Build the application router: the JSON API under `/api`, and everything else
/// served from the built SPA with a fallback to `index.html` for client routing.
pub fn router(pool: SqlitePool, static_dir: &Path) -> Router {
    let api = Router::new()
        .route("/health", get(health::health))
        .route("/labels", get(labels::list).post(labels::create))
        .route("/labels/{id}", patch(labels::update).delete(labels::delete))
        .route("/tasks", get(tasks::list).post(tasks::create))
        // Static `/tasks/reorder` is registered alongside the `/tasks/{id}` param
        // route; matchit gives the literal segment priority, so it never collides.
        .route("/tasks/reorder", patch(tasks::reorder))
        .route("/tasks/{id}", patch(tasks::update).delete(tasks::delete))
        .route(
            "/tasks/{id}/completions",
            post(tasks::complete).delete(tasks::uncomplete),
        )
        .route("/search", get(search::list))
        .route("/import/ticktick", post(import::ticktick))
        // Unknown /api/* paths return a JSON 404 instead of falling through to
        // the SPA index, so the client always gets a parseable error.
        .fallback(api_not_found)
        .with_state(AppState { pool });

    // Serve built assets; unknown paths fall back to index.html with a 200 so
    // client-side routing works on deep-links/refresh (.fallback keeps the
    // fallback's 200, unlike .not_found_service which forces a 404).
    let index = static_dir.join("index.html");
    let spa = ServeDir::new(static_dir).fallback(ServeFile::new(index));

    Router::new()
        .nest("/api", api)
        .fallback_service(spa)
        .layer(TraceLayer::new_for_http())
}

async fn api_not_found() -> (StatusCode, Json<serde_json::Value>) {
    (
        StatusCode::NOT_FOUND,
        Json(serde_json::json!({ "error": "not found" })),
    )
}
