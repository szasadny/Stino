use axum::extract::rejection::{JsonRejection, PathRejection, QueryRejection};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde_json::json;

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    /// The message is safe to return verbatim.
    #[error("{0}")]
    Validation(String),
    #[error("not found")]
    NotFound,
    /// Logged, never returned, so SQL/schema details don't leak.
    #[error("internal error")]
    Db(#[from] sqlx::Error),
    /// An axum extractor rejection; keeps its own status (400/413/415/422).
    #[error("{message}")]
    Rejected {
        status: StatusCode,
        message: &'static str,
    },
}

pub type AppResult<T> = Result<T, AppError>;

/// Batch repositories signal an unknown id with `RowNotFound`; that's a 404, anything else is internal.
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
