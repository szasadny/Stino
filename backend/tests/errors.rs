//! Integration tests for extractor rejections: every API failure is a JSON
//! `{"error": msg}` body, with axum's own rejection status preserved.

use axum::body::Body;
use axum::http::{Request, StatusCode};

mod common;
use common::*;

fn raw_req(method: &str, uri: &str, content_type: &str, body: &str) -> Request<Body> {
    Request::builder()
        .method(method)
        .uri(uri)
        .header("content-type", content_type)
        .body(Body::from(body.to_owned()))
        .expect("build request")
}

#[tokio::test]
async fn malformed_json_body_returns_a_json_error() {
    let app = test_app().await;
    let (status, body) = send(
        &app,
        raw_req("POST", "/api/tasks", "application/json", "{\"title\":"),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert_eq!(body["error"], "request body is not valid JSON");
}

#[tokio::test]
async fn json_with_wrong_field_types_returns_a_json_error() {
    let app = test_app().await;
    let (status, body) = send(
        &app,
        raw_req("POST", "/api/tasks", "application/json", "{\"title\":1}"),
    )
    .await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(body["error"], "request body has missing or invalid fields");
}

#[tokio::test]
async fn non_json_content_type_returns_a_json_error() {
    let app = test_app().await;
    let (status, body) = send(&app, raw_req("POST", "/api/labels", "text/plain", "{}")).await;
    assert_eq!(status, StatusCode::UNSUPPORTED_MEDIA_TYPE);
    assert_eq!(body["error"], "request body must be JSON");
}

#[tokio::test]
async fn non_numeric_path_id_returns_a_json_error() {
    let app = test_app().await;
    let (status, body) = send(
        &app,
        raw_req("PATCH", "/api/tasks/abc", "application/json", "{}"),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert_eq!(body["error"], "invalid path parameter");
}
