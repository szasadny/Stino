use axum::extract::rejection::{JsonRejection, PathRejection, QueryRejection};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde_json::json;

use crate::config::{DATE_HINT, TIME_HINT};

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("{0}")]
    Validation(#[from] ValidationError),
    #[error("not found")]
    NotFound,
    #[error("forbidden host")]
    Forbidden,
    // Logged, never returned, so SQL/schema details don't leak.
    #[error("internal error")]
    Db(#[from] sqlx::Error),
    // An axum extractor rejection keeps its own status (400/413/415/422).
    #[error("{message}")]
    Rejected {
        status: StatusCode,
        message: &'static str,
    },
}

pub(crate) type AppResult<T> = Result<T, AppError>;

#[derive(Debug, Clone, Copy, PartialEq, Eq, thiserror::Error)]
pub enum ValidationError {
    #[error("{0} must not be empty")]
    Blank(&'static str),
    #[error("{field} must be at most {max} characters")]
    TooLong { field: &'static str, max: usize },
    #[error("{0} must be a valid {hint} date", hint = DATE_HINT)]
    InvalidDate(&'static str),
    #[error("due_time must be a valid {hint} time", hint = TIME_HINT)]
    InvalidTime,
    #[error("a task with a time must also have a date")]
    TimeWithoutDate,
    #[error("a recurring task must have a date")]
    RecurringWithoutDate,
    #[error("unknown label")]
    UnknownLabel,
    #[error("both from and to are required for a range")]
    RangeNeedsBothBounds,
    #[error("inbox=false is not a selector; use date or from and to")]
    InboxMustBeTrue,
    #[error("only a recurring task's occurrence can be moved")]
    MoveNonRecurring,
    #[error("that occurrence has already been moved")]
    AlreadyMoved,
    #[error("only a recurring task's occurrence can be deleted on its own")]
    SkipNonRecurring,
    #[error("a completed occurrence can't be deleted on its own")]
    SkipCompleted,
    #[error("occurrence_date must match the task's due date")]
    OccurrenceDateMismatch,
    #[error("a recurring task needs an occurrence_date")]
    OccurrenceDateRequired,
    #[error("that occurrence is no longer part of the series")]
    OccurrenceDetached,
    #[error("that date is not an occurrence of the series")]
    NotAnOccurrence,
    #[error("a recurring task cannot be bulk-scheduled")]
    BatchScheduleRecurring,
    #[error("recurrence_rule must be a valid RRULE")]
    InvalidRule,
    #[error("recurrence_rule must repeat daily or less often")]
    SubDailyRule,
    #[error("recurrence_rule never produces an occurrence")]
    RuleNeverOccurs,
    #[error("recurrence_rule produces too many occurrences")]
    TooManyOccurrences,
    #[error("ids must list every label exactly once")]
    LabelOrderMismatch,
    #[error("a label with that name already exists")]
    DuplicateLabelName,
    #[error("label emoji must be a single emoji")]
    EmojiTooLong,
    #[error("label color must be one of the palette colors")]
    OffPaletteColor,
    #[error("the file is not valid CSV")]
    InvalidCsv,
    #[error("this doesn't look like a TickTick CSV export (no header row with a Title column)")]
    NotTickTickCsv,
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
            AppError::Forbidden => StatusCode::FORBIDDEN,
            AppError::Db(e) => {
                tracing::error!(error = %e, "database error");
                StatusCode::INTERNAL_SERVER_ERROR
            }
            AppError::Rejected { status, .. } => *status,
        };
        (status, Json(json!({ "error": self.to_string() }))).into_response()
    }
}
