use std::path::Path;

use axum::body::Body;
use axum::http::header::CONTENT_TYPE;
use axum::http::request::Builder;
use axum::http::{Method, Request, StatusCode};
use axum::Router;
use http_body_util::BodyExt;
use serde_json::Value;
use sqlx::migrate::Migrator;
use sqlx::sqlite::SqlitePoolOptions;
use sqlx::SqlitePool;
use tower::ServiceExt;

// Each in-memory SQLite connection is its own database, so pin exactly one.
pub async fn pool_with(migrator: Migrator) -> SqlitePool {
    let pool = SqlitePoolOptions::new()
        .min_connections(1)
        .max_connections(1)
        .connect("sqlite::memory:")
        .await
        .expect("open in-memory sqlite");
    migrator.run(&pool).await.expect("run migrations");
    pool
}

pub fn app_with(pool: SqlitePool, hosts: Option<&[&str]>) -> Router {
    let hosts = hosts.map(|hosts| hosts.iter().map(|host| host.to_string()).collect());
    stino_backend::routes::router(pool, Path::new("."), hosts)
}

pub async fn app() -> Router {
    app_with(pool_with(sqlx::migrate!()).await, None)
}

pub struct Req {
    builder: Builder,
    body: Body,
}

pub fn get(uri: &str) -> Req {
    Req::new(Method::GET, uri)
}

pub fn post(uri: &str) -> Req {
    Req::new(Method::POST, uri)
}

pub fn patch(uri: &str) -> Req {
    Req::new(Method::PATCH, uri)
}

pub fn delete(uri: &str) -> Req {
    Req::new(Method::DELETE, uri)
}

impl Req {
    fn new(method: Method, uri: &str) -> Self {
        Self {
            builder: Request::builder().method(method).uri(uri),
            body: Body::empty(),
        }
    }

    pub fn json(self, body: Value) -> Self {
        self.raw("application/json", body.to_string())
    }

    pub fn raw(self, content_type: &str, body: impl Into<Body>) -> Self {
        Self {
            builder: self.builder.header(CONTENT_TYPE, content_type),
            body: body.into(),
        }
    }

    pub fn header(self, name: &str, value: &str) -> Self {
        Self {
            builder: self.builder.header(name, value),
            ..self
        }
    }

    pub async fn send(self, app: &Router) -> (StatusCode, Value) {
        let request = self.builder.body(self.body).expect("build request");
        let response = app.clone().oneshot(request).await.expect("router response");
        let status = response.status();
        let bytes = response
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
}
