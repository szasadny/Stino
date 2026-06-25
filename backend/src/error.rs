//! The single application error type, mapped to HTTP only here at the boundary.
//! Services return `AppResult<T>` and never touch `axum`; the `IntoResponse`
//! impl lives in this one place so handlers can `?` straight through.

use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde_json::json;

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    /// Client sent invalid input; the message is safe to return verbatim.
    #[error("{0}")]
    Validation(String),
    /// The requested resource does not exist.
    #[error("not found")]
    NotFound,
    /// Any database failure. The underlying error is logged, not returned, so we
    /// never leak SQL or schema details to the client.
    #[error("internal error")]
    Db(#[from] sqlx::Error),
}

pub type AppResult<T> = Result<T, AppError>;

/// The reorder/batch repositories report an unknown id by rolling the whole
/// transaction back and returning `RowNotFound`; surface that as a `404` while
/// letting every other database failure fall through as an internal error. The
/// single place that maps this signal, shared by the reorder/batch services.
pub fn map_row_not_found(err: sqlx::Error) -> AppError {
    match err {
        sqlx::Error::RowNotFound => AppError::NotFound,
        e => e.into(),
    }
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let status = match &self {
            AppError::Validation(_) => StatusCode::BAD_REQUEST,
            AppError::NotFound => StatusCode::NOT_FOUND,
            AppError::Db(e) => {
                tracing::error!(error = %e, "database error");
                StatusCode::INTERNAL_SERVER_ERROR
            }
        };
        (status, Json(json!({ "error": self.to_string() }))).into_response()
    }
}
