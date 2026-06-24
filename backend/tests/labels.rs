//! Integration tests for the label API, driven through the real router against a
//! fresh in-memory SQLite database (migrations applied per test for isolation).

use axum::body::Body;
use axum::http::{Request, StatusCode};
use axum::Router;
use http_body_util::BodyExt;
use serde_json::{json, Value};
use sqlx::sqlite::SqlitePoolOptions;
use std::path::Path;
use tower::ServiceExt;

use stino_backend::routes;

async fn test_app() -> Router {
    // max_connections(1) keeps the single in-memory DB alive for the whole test;
    // min_connections(1) stops it being reaped between requests.
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
async fn send(app: &Router, req: Request<Body>) -> (StatusCode, Value) {
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

fn json_req(method: &str, uri: &str, body: Value) -> Request<Body> {
    Request::builder()
        .method(method)
        .uri(uri)
        .header("content-type", "application/json")
        .body(Body::from(body.to_string()))
        .expect("build request")
}

fn get(uri: &str) -> Request<Body> {
    Request::builder()
        .method("GET")
        .uri(uri)
        .body(Body::empty())
        .expect("build request")
}

#[tokio::test]
async fn create_list_update_delete_lifecycle() {
    let app = test_app().await;

    let (status, label) = send(
        &app,
        json_req(
            "POST",
            "/api/labels",
            json!({"name":"Work","color":"#2F5D50"}),
        ),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED);
    assert_eq!(label["name"], "Work");
    assert_eq!(label["color"], "#2F5D50");
    assert_eq!(label["sort_order"], 0);
    let id = label["id"].as_i64().expect("id");

    let (status, list) = send(&app, get("/api/labels")).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(list.as_array().expect("array").len(), 1);

    let (status, updated) = send(
        &app,
        json_req(
            "PATCH",
            &format!("/api/labels/{id}"),
            json!({"color":"#6F8F6B"}),
        ),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(
        updated["name"], "Work",
        "name should be unchanged by a partial patch"
    );
    assert_eq!(updated["color"], "#6F8F6B");

    let (status, _) = send(
        &app,
        json_req("DELETE", &format!("/api/labels/{id}"), Value::Null),
    )
    .await;
    assert_eq!(status, StatusCode::NO_CONTENT);

    let (_, list) = send(&app, get("/api/labels")).await;
    assert_eq!(list.as_array().expect("array").len(), 0);
}

#[tokio::test]
async fn validation_rejects_blank_name_and_off_palette_color() {
    let app = test_app().await;

    let (status, _) = send(
        &app,
        json_req(
            "POST",
            "/api/labels",
            json!({"name":"   ","color":"#2F5D50"}),
        ),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);

    let (status, _) = send(
        &app,
        json_req("POST", "/api/labels", json!({"name":"X","color":"#123456"})),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);

    // A palette color in lowercase is accepted and normalized to canonical case.
    let (status, label) = send(
        &app,
        json_req("POST", "/api/labels", json!({"name":"X","color":"#2f5d50"})),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED);
    assert_eq!(label["color"], "#2F5D50");
}

#[tokio::test]
async fn sort_order_appends_in_creation_order() {
    let app = test_app().await;

    let (_, a) = send(
        &app,
        json_req("POST", "/api/labels", json!({"name":"A","color":"#2F5D50"})),
    )
    .await;
    let (_, b) = send(
        &app,
        json_req("POST", "/api/labels", json!({"name":"B","color":"#6F8F6B"})),
    )
    .await;
    assert_eq!(a["sort_order"], 0);
    assert_eq!(b["sort_order"], 1);

    let (_, list) = send(&app, get("/api/labels")).await;
    let arr = list.as_array().expect("array");
    assert_eq!(arr[0]["name"], "A");
    assert_eq!(arr[1]["name"], "B");
}

#[tokio::test]
async fn update_and_delete_unknown_id_are_404() {
    let app = test_app().await;

    let (status, _) = send(
        &app,
        json_req("PATCH", "/api/labels/9999", json!({"name":"x"})),
    )
    .await;
    assert_eq!(status, StatusCode::NOT_FOUND);

    let (status, _) = send(&app, json_req("DELETE", "/api/labels/9999", Value::Null)).await;
    assert_eq!(status, StatusCode::NOT_FOUND);
}
