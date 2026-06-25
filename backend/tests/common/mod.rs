//! Shared integration-test harness: build the real router over a fresh in-memory
//! SQLite database, send requests through it, and decode JSON bodies. Included
//! via `mod common;` in each test file. Not every test binary uses every helper,
//! so dead code is allowed here rather than gated per file.
#![allow(dead_code)]

use axum::body::Body;
use axum::http::{Request, StatusCode};
use axum::Router;
use http_body_util::BodyExt;
use serde_json::Value;
use sqlx::sqlite::SqlitePoolOptions;
use std::path::Path;
use tower::ServiceExt;

use stino_backend::routes;

/// The real router over a fresh in-memory database with migrations applied, so
/// each test runs in full isolation. `max_connections(1)` keeps the single
/// in-memory DB alive for the whole test; `min_connections(1)` stops it being
/// reaped between requests.
pub async fn test_app() -> Router {
    let pool = SqlitePoolOptions::new()
        .min_connections(1)
        .max_connections(1)
        .connect("sqlite::memory:")
        .await
        .expect("open in-memory sqlite");
    sqlx::migrate!().run(&pool).await.expect("run migrations");
    routes::router(pool, Path::new("."))
}

/// Send a request through a clone of the router and decode the JSON body (empty
/// bodies, e.g. 204, decode to `Value::Null`).
pub async fn send(app: &Router, req: Request<Body>) -> (StatusCode, Value) {
    let res = app.clone().oneshot(req).await.expect("router response");
    let status = res.status();
    let bytes = res
        .into_body()
        .collect()
        .await
        .expect("collect body")
        .to_bytes();
    let body = if bytes.is_empty() {
        Value::Null
    } else {
        serde_json::from_slice(&bytes).expect("json body")
    };
    (status, body)
}

/// Build a JSON request with the given method, URI, and body.
pub fn json_req(method: &str, uri: &str, body: Value) -> Request<Body> {
    Request::builder()
        .method(method)
        .uri(uri)
        .header("content-type", "application/json")
        .body(Body::from(body.to_string()))
        .expect("build request")
}

/// Build a bodyless request — the method carries the intent (DELETE, or a
/// POST/PATCH with no payload).
pub fn empty_req(method: &str, uri: &str) -> Request<Body> {
    Request::builder()
        .method(method)
        .uri(uri)
        .body(Body::empty())
        .expect("build request")
}

/// A bodyless GET.
pub fn get(uri: &str) -> Request<Body> {
    empty_req("GET", uri)
}
