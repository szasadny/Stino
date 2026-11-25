use axum::http::StatusCode;
use axum::Router;
use stino_backend::error::AppError;

use crate::common::*;

const HEALTH: &str = "/api/health";

async fn app_allowing(host: &str) -> Router {
    app_with(pool_with(sqlx::migrate!()).await, Some(&[host]))
}

async fn health_from(app: &Router, host: &str) -> StatusCode {
    get(HEALTH).header("host", host).send(app).await.0
}

#[tokio::test]
async fn an_allowed_host_passes_and_a_wrong_one_is_forbidden() {
    let app = app_allowing("stino.example").await;

    assert_eq!(
        health_from(&app, "stino.example").await,
        StatusCode::OK,
        "the listed host passes"
    );

    let (status, body) = get(HEALTH).header("host", "evil.example").send(&app).await;
    assert_eq!(
        status,
        StatusCode::FORBIDDEN,
        "an unlisted host is rejected"
    );
    assert_eq!(body["error"], AppError::Forbidden.to_string());

    let (status, _) = get(HEALTH).send(&app).await;
    assert_eq!(status, StatusCode::FORBIDDEN, "no Host header is rejected");
}

#[tokio::test]
async fn host_matching_strips_the_port_and_ignores_case() {
    let app = app_allowing("stino.example").await;

    assert_eq!(
        health_from(&app, "stino.example:8080").await,
        StatusCode::OK,
        "the port is not part of the name"
    );
    assert_eq!(
        health_from(&app, "Stino.EXAMPLE").await,
        StatusCode::OK,
        "hostnames compare case-insensitively"
    );
    assert_eq!(
        health_from(&app, "stino.example.evil.example").await,
        StatusCode::FORBIDDEN,
        "a superstring host is not a match"
    );
}

#[tokio::test]
async fn without_a_configured_allowlist_any_host_passes() {
    let app = app().await;
    assert_eq!(health_from(&app, "anything.example").await, StatusCode::OK);
}
