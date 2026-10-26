//! Not every test binary uses every helper, so dead code is allowed here.
#![allow(dead_code)]

use axum::body::Body;
use axum::http::{Request, StatusCode};
use axum::Router;
use http_body_util::BodyExt;
use serde_json::Value;
use sqlx::sqlite::SqlitePoolOptions;
use sqlx::SqlitePool;
use std::path::Path;
use tower::ServiceExt;

use stino_backend::routes;

/// `max_connections(1)` keeps the single in-memory DB alive; `min_connections(1)`
/// stops it being reaped between requests.
pub async fn test_pool() -> SqlitePool {
    let pool = SqlitePoolOptions::new()
        .min_connections(1)
        .max_connections(1)
        .connect("sqlite::memory:")
        .await
        .expect("open in-memory sqlite");
    sqlx::migrate!().run(&pool).await.expect("run migrations");
    pool
}

pub async fn test_app() -> Router {
    routes::router(test_pool().await, Path::new("."), None)
}

pub async fn test_app_with_pool() -> (Router, SqlitePool) {
    let pool = test_pool().await;
    (routes::router(pool.clone(), Path::new("."), None), pool)
}

/// Empty bodies (e.g. 204) decode to `Value::Null`.
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

pub async fn status_of(app: &Router, req: Request<Body>) -> StatusCode {
    app.clone()
        .oneshot(req)
        .await
        .expect("router response")
        .status()
}

pub fn json_req(method: &str, uri: &str, body: Value) -> Request<Body> {
    Request::builder()
        .method(method)
        .uri(uri)
        .header("content-type", "application/json")
        .body(Body::from(body.to_string()))
        .expect("build request")
}

pub fn empty_req(method: &str, uri: &str) -> Request<Body> {
    Request::builder()
        .method(method)
        .uri(uri)
        .body(Body::empty())
        .expect("build request")
}

pub fn get(uri: &str) -> Request<Body> {
    empty_req("GET", uri)
}
