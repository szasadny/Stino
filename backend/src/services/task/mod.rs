mod batch;
mod completion;
mod list;
mod occurrence;
mod rollover;
mod validate;
mod write;

use chrono::NaiveDate;

pub(crate) use batch::{batch, reorder};
pub(crate) use completion::set_completed;
pub(crate) use list::list;
pub(crate) use occurrence::{move_occurrence, skip_occurrence};
pub(crate) use rollover::rollover;
pub(crate) use write::{create, create_on, delete, update};

use crate::db::{self, Executor};
use crate::domain::{Series, Task};
use crate::error::{AppError, AppResult, ValidationError};
use crate::services::recurrence;
use crate::services::validation::parse_date;

async fn load_task(executor: impl Executor<'_>, id: i64) -> AppResult<Task> {
    db::task::get(executor, id).await?.ok_or(AppError::NotFound)
}

fn series_start(series: Series<'_>) -> Result<NaiveDate, ValidationError> {
    parse_date("due_date", series.start)
}

// DTSTART counts even off-rule: search and import key the series at `due_date`.
fn ensure_series_member(series: Series<'_>, day: NaiveDate) -> Result<(), ValidationError> {
    let start = series_start(series)?;
    if day == start || !recurrence::expand(series.rule, start, day, day)?.is_empty() {
        Ok(())
    } else {
        Err(ValidationError::NotAnOccurrence)
    }
}

// A stored rule that fails to expand must not brick every view; search still finds it.
fn or_warn<T>(task_id: i64, expanded: Result<T, ValidationError>) -> Option<T> {
    match expanded {
        Ok(value) => Some(value),
        Err(err) => {
            tracing::warn!(task_id, error = %err, "skipping unexpandable recurrence rule");
            None
        }
    }
}
