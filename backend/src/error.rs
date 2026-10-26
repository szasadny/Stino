//! Application errors map to HTTP at this boundary; services return `AppResult`.

use axum::extract::rejection::{JsonRejection, PathRejection, QueryRejection};
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
    /// An axum extractor rejected the request before it reached a handler; keeps
    /// the extractor's own status (400/413/415/422).
    #[error("{message}")]
    Rejected {
        status: StatusCode,
        message: &'static str,
    },
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

impl From<JsonRejection> for AppError {
    fn from(rejection: JsonRejection) -> Self {
        let message = match &rejection {
            JsonRejection::JsonSyntaxError(_) => "request body is not valid JSON",
            JsonRejection::JsonDataError(_) => "request body has missing or invalid fields",
            JsonRejection::MissingJsonContentType(_) => "request body must be JSON",
            _ => "request body could not be read",
        };
        AppError::Rejected {
            status: rejection.status(),
            message,
        }
    }
}

impl From<QueryRejection> for AppError {
    fn from(rejection: QueryRejection) -> Self {
        AppError::Rejected {
            status: rejection.status(),
            message: "invalid query parameters",
        }
    }
}

impl From<PathRejection> for AppError {
    fn from(rejection: PathRejection) -> Self {
        AppError::Rejected {
            status: rejection.status(),
            message: "invalid path parameter",
        }
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
            AppError::Rejected { status, .. } => *status,
        };
        (status, Json(json!({ "error": self.to_string() }))).into_response()
    }
}
