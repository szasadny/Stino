use chrono::{NaiveDate, NaiveTime};

use crate::config::{DATE_FORMAT, MAX_LABEL_NAME_LEN, MAX_TITLE_LEN, TIME_FORMAT};
use crate::error::ValidationError;

pub(crate) fn validate_title(value: &str) -> Result<String, ValidationError> {
    non_empty_capped(value, "task title", MAX_TITLE_LEN)
}

pub(crate) fn validate_label_name(value: &str) -> Result<String, ValidationError> {
    non_empty_capped(value, "label name", MAX_LABEL_NAME_LEN)
}

fn non_empty_capped(
    value: &str,
    field: &'static str,
    max: usize,
) -> Result<String, ValidationError> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err(ValidationError::Blank(field));
    }
    if trimmed.chars().count() > max {
        return Err(ValidationError::TooLong { field, max });
    }
    Ok(trimmed.to_string())
}

pub(crate) fn clean_optional(value: Option<String>) -> Option<String> {
    value
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty())
}

pub(crate) fn parse_date(field: &'static str, raw: &str) -> Result<NaiveDate, ValidationError> {
    parse_date_lenient(raw.trim()).ok_or(ValidationError::InvalidDate(field))
}

pub(crate) fn canonical_date(field: &'static str, raw: &str) -> Result<String, ValidationError> {
    parse_date(field, raw).map(format_date)
}

pub(crate) fn canonical_time(raw: &str) -> Result<String, ValidationError> {
    parse_time_lenient(raw.trim())
        .map(format_time)
        .ok_or(ValidationError::InvalidTime)
}

pub(crate) fn parse_date_lenient(raw: &str) -> Option<NaiveDate> {
    NaiveDate::parse_from_str(raw, DATE_FORMAT).ok()
}

pub(crate) fn parse_time_lenient(raw: &str) -> Option<NaiveTime> {
    NaiveTime::parse_from_str(raw, TIME_FORMAT).ok()
}

pub(crate) fn format_date(date: NaiveDate) -> String {
    date.format(DATE_FORMAT).to_string()
}

pub(crate) fn format_time(time: NaiveTime) -> String {
    time.format(TIME_FORMAT).to_string()
}
