use super::load_task;
use crate::db::{self, Pool};
use crate::domain::BatchOp;
use crate::error::{AppResult, ValidationError};
use crate::services::validation::canonical_date;
use crate::services::{found, label_service};

// Only untimed ids are sent; timed tasks keep their time-sort.
pub(crate) async fn reorder(pool: &Pool, ids: &[i64]) -> AppResult<()> {
    let mut tx = pool.begin().await?;
    for (position, id) in (0..).zip(ids) {
        found(db::task::set_sort_order(&mut *tx, *id, position).await?)?;
    }
    Ok(tx.commit().await?)
}

// Each op is one transaction: an unknown id rolls the whole batch back.
pub(crate) async fn batch(pool: &Pool, ids: &[i64], op: BatchOp) -> AppResult<()> {
    if ids.is_empty() {
        return Ok(());
    }
    match op {
        BatchOp::Label { label_id } => set_label(pool, ids, label_id).await,
        BatchOp::Schedule { due_date } => {
            schedule(pool, ids, &canonical_date("due_date", &due_date)?).await
        }
        BatchOp::Complete => complete_all(pool, ids).await,
        BatchOp::Delete => delete_all(pool, ids).await,
    }
}

async fn set_label(pool: &Pool, ids: &[i64], label_id: Option<i64>) -> AppResult<()> {
    if let Some(label_id) = label_id {
        label_service::ensure_exists(pool, label_id).await?;
    }
    let mut tx = pool.begin().await?;
    for id in ids {
        found(db::task::set_label(&mut *tx, *id, label_id).await?)?;
    }
    Ok(tx.commit().await?)
}

// A series can't live in the Inbox, and re-dating one would need its rule revalidated.
async fn schedule(pool: &Pool, ids: &[i64], due_date: &str) -> AppResult<()> {
    let mut tx = pool.begin().await?;
    for id in ids {
        // Read inside the transaction, closing the check-then-write race.
        let task = load_task(&mut *tx, *id).await?;
        if task.recurrence_rule.is_some() {
            return Err(ValidationError::BatchScheduleRecurring.into());
        }
        db::task::set_due_date(&mut *tx, *id, due_date).await?;
        db::task::move_completion(&mut tx, *id, task.due_date.as_deref(), Some(due_date)).await?;
    }
    Ok(tx.commit().await?)
}

async fn complete_all(pool: &Pool, ids: &[i64]) -> AppResult<()> {
    let mut tx = pool.begin().await?;
    for id in ids {
        let task = load_task(&mut *tx, *id).await?;
        db::task::add_completion(&mut *tx, *id, task.due_date.as_deref()).await?;
    }
    Ok(tx.commit().await?)
}

async fn delete_all(pool: &Pool, ids: &[i64]) -> AppResult<()> {
    let mut tx = pool.begin().await?;
    for id in ids {
        found(db::task::delete(&mut *tx, *id).await?)?;
    }
    Ok(tx.commit().await?)
}
