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

/// Shared state handed to every handler. Holds the SQLite pool today; future
/// slices add more (config, clock) here rather than using globals.
#[derive(Clone)]
pub struct AppState {
    pub pool: SqlitePool,
}

/// Build the application router: the JSON API under `/api`, and everything else
/// served from the built SPA with a fallback to `index.html` for client routing.
/// `allowed_hosts` (from `ALLOWED_HOSTS`) optionally gates every request on its
/// Host header; `None` leaves behavior unchanged.
pub fn router(pool: SqlitePool, static_dir: &Path, allowed_hosts: Option<Vec<String>>) -> Router {
    let api = Router::new()
        .route("/health", get(health::health))
        .route("/labels", get(labels::list).post(labels::create))
        // Literal `/labels/reorder` sits beside the `/labels/{id}` param route;
        // matchit gives the literal segment priority, so they never collide (same
        // story as `/tasks/reorder`).
        .route("/labels/reorder", patch(labels::reorder))
        .route("/labels/{id}", patch(labels::update).delete(labels::delete))
        .route("/tasks", get(tasks::list).post(tasks::create))
        // Static `/tasks/reorder` is registered alongside the `/tasks/{id}` param
        // route; matchit gives the literal segment priority, so it never collides.
        .route("/tasks/reorder", patch(tasks::reorder))
        // Same literal-vs-param story as `/tasks/reorder`: the static `batch`
        // segment wins over `/tasks/{id}`, so the two never collide.
        .route("/tasks/batch", post(tasks::batch))
        .route("/tasks/{id}", patch(tasks::update).delete(tasks::delete))
        .route(
            "/tasks/{id}/completions",
            post(tasks::complete).delete(tasks::uncomplete),
        )
        // Detach a single recurring occurrence onto another day (drag one instance of a
        // repeating task). Literal segment under `{id}`, like `completions`.
        .route("/tasks/{id}/move_occurrence", post(tasks::move_occurrence))
        .route("/search", get(search::list))
        // A real TickTick backup can exceed axum's default 2 MB body limit, so
        // this route (only) takes up to IMPORT_MAX_BODY_BYTES.
        .route(
            "/import/ticktick",
            post(import::ticktick).layer(DefaultBodyLimit::max(config::IMPORT_MAX_BODY_BYTES)),
        )
        // Unknown /api/* paths return a JSON 404 instead of falling through to
        // the SPA index, so the client always gets a parseable error.
        .fallback(api_not_found)
        .with_state(AppState { pool });

    // Serve built assets; unknown paths fall back to index.html with a 200 so
    // client-side routing works on deep-links/refresh (.fallback keeps the
    // fallback's 200, unlike .not_found_service which forces a 404).
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

/// DNS-rebinding guard: with `ALLOWED_HOSTS` configured, reject any request
/// whose Host header (port stripped, case-insensitive) isn't in the list. Pure
/// HTTP shape — it decides nothing about tasks — so it lives with the router.
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

/// The hostname of a Host header value: strips a `:port`, keeping an IPv6
/// literal (`[::1]:8080`) intact up to its closing bracket.
fn host_name(header: &str) -> &str {
    if let Some(rest) = header.strip_prefix('[') {
        return rest.split_once(']').map_or(rest, |(name, _)| name);
    }
    header.split_once(':').map_or(header, |(name, _)| name)
}

/// Deserialize so a present JSON `null` becomes `Some(None)` (clear) rather than
/// `None` (absent) — serde's default collapses both to `None`. Paired with
/// `#[serde(default)]`, an omitted field stays `None`. Shared by the `tasks` and
/// `labels` PATCH bodies, which both distinguish "clear" from "leave unchanged".
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
