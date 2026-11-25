use chrono::NaiveDate;

use crate::db::Executor;
use crate::domain::NewTask;
use crate::error::{AppResult, ValidationError};
use crate::services::validation::{
    canonical_time, clean_optional, format_date, parse_date, validate_title,
};
use crate::services::{label_service, recurrence};

pub(super) async fn validate_fields(
    executor: impl Executor<'_>,
    draft: NewTask,
) -> AppResult<NewTask> {
    let title = validate_title(&draft.title)?;
    let notes = clean_optional(draft.notes);
    if let Some(label_id) = draft.label_id {
        label_service::ensure_exists(executor, label_id).await?;
    }
    let due_date = draft
        .due_date
        .map(|d| parse_date("due_date", &d))
        .transpose()?;
    let due_time = draft.due_time.map(|t| canonical_time(&t)).transpose()?;
    if due_time.is_some() && due_date.is_none() {
        return Err(ValidationError::TimeWithoutDate.into());
    }
    let recurrence_rule = clean_optional(draft.recurrence_rule).map(|r| recurrence::normalize(&r));
    validate_recurrence(recurrence_rule.as_deref(), due_date)?;
    Ok(NewTask {
        title,
        notes,
        label_id: draft.label_id,
        due_date: due_date.map(format_date),
        due_time,
        recurrence_rule,
    })
}

fn validate_recurrence(
    rule: Option<&str>,
    due_date: Option<NaiveDate>,
) -> Result<(), ValidationError> {
    let Some(rule) = rule else {
        return Ok(());
    };
    let Some(start) = due_date else {
        return Err(ValidationError::RecurringWithoutDate);
    };
    recurrence::validate(rule, start)
}
