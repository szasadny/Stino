use super::load_task;
use super::validate::validate_fields;
use crate::db::{self, Conn, Pool};
use crate::domain::{NewTask, Task, TaskPatch};
use crate::error::AppResult;
use crate::services::found;

pub(crate) async fn create(pool: &Pool, input: NewTask) -> AppResult<Task> {
    let mut conn = pool.acquire().await?;
    let sort_order = db::task::next_sort_order(&mut *conn).await?;
    create_on(&mut conn, input, sort_order).await
}

// On one connection, with the order handed in, so the importer runs it inside its transaction.
pub(crate) async fn create_on(conn: &mut Conn, input: NewTask, sort_order: i64) -> AppResult<Task> {
    let task = validate_fields(&mut *conn, input).await?;
    Ok(db::task::insert(conn, &task, sort_order).await?)
}

pub(crate) async fn update(pool: &Pool, id: i64, patch: TaskPatch) -> AppResult<Task> {
    let current = load_task(pool, id).await?;
    let was_recurring = current.recurrence_rule.is_some();
    let prev_due_date = current.due_date.clone();
    let next = validate_fields(pool, patch.apply_to(current)).await?;
    let repeats = next.recurrence_rule.is_some();

    let mut tx = pool.begin().await?;
    found(db::task::update(&mut *tx, id, &next).await?)?;
    if was_recurring && !repeats {
        // Stale skips/moves would otherwise hide dates again if a rule is re-added.
        db::task::delete_exceptions(&mut *tx, id).await?;
    } else if !was_recurring && !repeats {
        let (from, to) = (prev_due_date.as_deref(), next.due_date.as_deref());
        db::task::move_completion(&mut tx, id, from, to).await?;
    }
    tx.commit().await?;
    load_task(pool, id).await
}

pub(crate) async fn delete(pool: &Pool, id: i64) -> AppResult<()> {
    found(db::task::delete(pool, id).await?)
}
