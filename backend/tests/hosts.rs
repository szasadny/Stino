//! Integration tests for the optional Host-header allowlist (`ALLOWED_HOSTS`):
//! a DNS-rebinding guard that rejects requests whose Host isn't listed, and
//! changes nothing when unset.

use axum::body::Body;
use axum::http::{Request, StatusCode};
use axum::Router;
use std::path::Path;

mod common;
use common::*;

use stino_backend::routes;

/// The real router with a configured Host allowlist over a fresh test database.
async fn app_allowing(hosts: &[&str]) -> Router {
    let hosts = hosts.iter().map(|h| h.to_string()).collect();
    routes::router(test_pool().await, Path::new("."), Some(hosts))
}

/// A GET carrying an explicit Host header.
fn get_with_host(uri: &str, host: &str) -> Request<Body> {
    Request::builder()
        .method("GET")
        .uri(uri)
        .header("host", host)
        .body(Body::empty())
        .expect("build request")
}

#[tokio::test]
async fn an_allowed_host_passes_and_a_wrong_one_is_forbidden() {
    let app = app_allowing(&["stino.example"]).await;

    let (status, _) = send(&app, get_with_host("/api/health", "stino.example")).await;
    assert_eq!(status, StatusCode::OK, "the listed host passes");

    let (status, body) = send(&app, get_with_host("/api/health", "evil.example")).await;
    assert_eq!(
        status,
        StatusCode::FORBIDDEN,
        "an unlisted host is rejected"
    );
    assert_eq!(body["error"], "forbidden host");

    // A missing Host header can't prove it's allowed either.
    let (status, _) = send(&app, get("/api/health")).await;
    assert_eq!(status, StatusCode::FORBIDDEN, "no Host header is rejected");
}

#[tokio::test]
async fn host_matching_strips_the_port_and_ignores_case() {
    let app = app_allowing(&["stino.example"]).await;

    let (status, _) = send(&app, get_with_host("/api/health", "stino.example:8080")).await;
    assert_eq!(status, StatusCode::OK, "the port is not part of the name");

    let (status, _) = send(&app, get_with_host("/api/health", "Stino.EXAMPLE")).await;
    assert_eq!(
        status,
        StatusCode::OK,
        "hostnames compare case-insensitively"
    );

    let (status, _) = send(
        &app,
        get_with_host("/api/health", "stino.example.evil.example"),
    )
    .await;
    assert_eq!(
        status,
        StatusCode::FORBIDDEN,
        "a superstring host is not a match"
    );
}

#[tokio::test]
async fn without_a_configured_allowlist_any_host_passes() {
    // `test_app()` builds the router with no allowlist — unchanged behavior.
    let app = test_app().await;
    let (status, _) = send(&app, get_with_host("/api/health", "anything.example")).await;
    assert_eq!(status, StatusCode::OK);
}
