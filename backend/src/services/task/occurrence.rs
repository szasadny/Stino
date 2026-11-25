use chrono::NaiveDate;

use super::{ensure_series_member, load_task};
use crate::db::{self, Pool};
use crate::domain::{MoveOutcome, Task};
use crate::error::{AppResult, ValidationError};
use crate::services::validation::{format_date, parse_date};

pub(crate) async fn move_occurrence(
    pool: &Pool,
    id: i64,
    occurrence_date: &str,
    new_date: &str,
) -> AppResult<MoveOutcome> {
    let occurrence = parse_date("occurrence_date", occurrence_date)?;
    let target = parse_date("new_date", new_date)?;
    let task =
        load_series_occurrence(pool, id, occurrence, ValidationError::MoveNonRecurring).await?;
    if target == occurrence {
        return Ok(MoveOutcome::Unchanged(task));
    }
    let (occurrence, target) = (format_date(occurrence), format_date(target));
    // Re-detaching would orphan a second one-off.
    if db::task::is_excepted(pool, id, &occurrence).await? {
        return Err(ValidationError::AlreadyMoved.into());
    }
    let mut tx = pool.begin().await?;
    db::task::insert_exception(&mut *tx, id, &occurrence).await?;
    let sort_order = db::task::next_sort_order(&mut *tx).await?;
    let copy = db::task::insert_detached_copy(&mut *tx, id, &target, None, sort_order).await?;
    // A completed source occurrence carries its done state to the one-off.
    db::task::rekey_completion(&mut *tx, (id, Some(&occurrence)), (copy, Some(&target))).await?;
    tx.commit().await?;
    Ok(MoveOutcome::Moved(load_task(pool, copy).await?))
}

// Completions are history, so only an unfinished occurrence can be skipped.
pub(crate) async fn skip_occurrence(pool: &Pool, id: i64, occurrence_date: &str) -> AppResult<()> {
    let occurrence = parse_date("occurrence_date", occurrence_date)?;
    load_series_occurrence(pool, id, occurrence, ValidationError::SkipNonRecurring).await?;
    let occurrence = format_date(occurrence);
    if db::task::is_completed(pool, id, &occurrence).await? {
        return Err(ValidationError::SkipCompleted.into());
    }
    Ok(db::task::insert_exception(pool, id, &occurrence).await?)
}

async fn load_series_occurrence(
    pool: &Pool,
    id: i64,
    occurrence: NaiveDate,
    not_recurring: ValidationError,
) -> AppResult<Task> {
    let task = load_task(pool, id).await?;
    ensure_series_member(task.series().ok_or(not_recurring)?, occurrence)?;
    Ok(task)
}
