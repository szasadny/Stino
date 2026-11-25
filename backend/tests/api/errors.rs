use axum::http::StatusCode;

use crate::common::*;

const JSON: &str = "application/json";

#[tokio::test]
async fn malformed_json_body_returns_a_json_error() {
    let app = app().await;
    let (status, body) = post("/api/tasks").raw(JSON, "{\"title\":").send(&app).await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert_eq!(body["error"], "request body is not valid JSON");
}

#[tokio::test]
async fn json_with_wrong_field_types_returns_a_json_error() {
    let app = app().await;
    let (status, body) = post("/api/tasks")
        .raw(JSON, "{\"title\":1}")
        .send(&app)
        .await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(body["error"], "request body has missing or invalid fields");
}

#[tokio::test]
async fn non_json_content_type_returns_a_json_error() {
    let app = app().await;
    let (status, body) = post("/api/labels").raw("text/plain", "{}").send(&app).await;
    assert_eq!(status, StatusCode::UNSUPPORTED_MEDIA_TYPE);
    assert_eq!(body["error"], "request body must be JSON");
}

#[tokio::test]
async fn non_numeric_path_id_returns_a_json_error() {
    let app = app().await;
    let (status, body) = patch("/api/tasks/abc").raw(JSON, "{}").send(&app).await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert_eq!(body["error"], "invalid path parameter");
}
