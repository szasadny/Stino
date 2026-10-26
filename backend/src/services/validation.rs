use chrono::{NaiveDate, NaiveTime};

use crate::config::{DATE_FORMAT, TIME_FORMAT};
use crate::error::{AppError, AppResult};

/// `field` names the field in the UI-safe error message.
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

pub fn clean_optional(value: Option<String>) -> Option<String> {
    value
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty())
}

pub fn parse_date(date: &str) -> AppResult<NaiveDate> {
    NaiveDate::parse_from_str(date.trim(), DATE_FORMAT)
        .map_err(|_| AppError::Validation("due_date must be a valid YYYY-MM-DD date".into()))
}

pub fn validate_date(date: &str) -> AppResult<String> {
    Ok(parse_date(date)?.format(DATE_FORMAT).to_string())
}

pub fn validate_time(time: &str) -> AppResult<String> {
    NaiveTime::parse_from_str(time.trim(), TIME_FORMAT)
        .map(|t| t.format(TIME_FORMAT).to_string())
        .map_err(|_| AppError::Validation("due_time must be a valid HH:MM time".into()))
}
