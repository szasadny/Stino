use super::{ensure_series_member, load_task};
use crate::db::{self, Pool};
use crate::domain::Task;
use crate::error::{AppResult, ValidationError};
use crate::services::validation::{canonical_date, parse_date};

// Never mutates the task; returns the toggled occurrence so the client updates exactly that row.
pub(crate) async fn set_completed(
    pool: &Pool,
    id: i64,
    occurrence_date: Option<&str>,
    completed: bool,
) -> AppResult<Task> {
    let (task, occurrence) = load_occurrence(pool, id, occurrence_date).await?;
    if completed {
        db::task::add_completion(pool, id, occurrence.as_deref()).await?;
    } else {
        db::task::delete_completion(pool, id, occurrence.as_deref()).await?;
    }
    Ok(Task {
        occurrence_date: occurrence,
        completed,
        ..task
    })
}

// Rejects dates the client can't show, so no orphan completion rows are written.
async fn load_occurrence(
    pool: &Pool,
    id: i64,
    occurrence_date: Option<&str>,
) -> AppResult<(Task, Option<String>)> {
    let task = load_task(pool, id).await?;
    let occurrence = match occurrence_date {
        Some(raw) => Some(canonical_date("occurrence_date", raw)?),
        None => task.due_date.clone(),
    };
    let Some(series) = task.series() else {
        if occurrence != task.due_date {
            return Err(ValidationError::OccurrenceDateMismatch.into());
        }
        return Ok((task, occurrence));
    };
    let Some(date) = occurrence.as_deref() else {
        return Err(ValidationError::OccurrenceDateRequired.into());
    };
    ensure_series_member(series, parse_date("occurrence_date", date)?)?;
    if db::task::is_excepted(pool, id, date).await? {
        return Err(ValidationError::OccurrenceDetached.into());
    }
    Ok((task, occurrence))
}
