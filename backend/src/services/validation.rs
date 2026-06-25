//! Shared input-validation primitives so the trim + empty-check + length-check
//! and the local date/time parsing rules live in **one** place instead of being
//! re-implemented per service. Pure functions: no SQL, no `axum`. The length
//! caps and date/time formats come from [`crate::config`].

use chrono::{NaiveDate, NaiveTime};

use crate::config::{DATE_FORMAT, TIME_FORMAT};
use crate::error::{AppError, AppResult};

/// Trim `value`, reject it when empty, and cap it by character count. `field`
/// names the field in the (UI-safe) error messages — e.g. `"task title"` or
/// `"label name"`. Returns the trimmed, owned string.
pub fn non_empty_capped(value: &str, field: &str, max_len: usize) -> AppResult<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err(AppError::Validation(format!("{field} must not be empty")));
    }
    if trimmed.chars().count() > max_len {
        return Err(AppError::Validation(format!(
            "{field} must be at most {max_len} characters"
        )));
    }
    Ok(trimmed.to_string())
}

/// Treat a blank/whitespace-only value as absent; otherwise keep it trimmed.
/// Used for free-text notes and the recurrence rule alike.
pub fn clean_optional(value: Option<String>) -> Option<String> {
    value
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty())
}

/// Parse a local calendar date (`YYYY-MM-DD`), mapping a bad value to a UI-safe
/// error. Local date only — never converted through UTC (Hard Rule 7).
pub fn parse_date(date: &str) -> AppResult<NaiveDate> {
    NaiveDate::parse_from_str(date.trim(), DATE_FORMAT)
        .map_err(|_| AppError::Validation("due_date must be a valid YYYY-MM-DD date".into()))
}

/// Validate a local calendar date and return it re-formatted canonically.
pub fn validate_date(date: &str) -> AppResult<String> {
    Ok(parse_date(date)?.format(DATE_FORMAT).to_string())
}

/// Validate a local wall-clock time (`HH:MM`, 24-hour) and return it canonically.
pub fn validate_time(time: &str) -> AppResult<String> {
    NaiveTime::parse_from_str(time.trim(), TIME_FORMAT)
        .map(|t| t.format(TIME_FORMAT).to_string())
        .map_err(|_| AppError::Validation("due_time must be a valid HH:MM time".into()))
}
