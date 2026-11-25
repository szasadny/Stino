use std::collections::HashMap;

use chrono::NaiveDate;

use super::{or_warn, series_start};
use crate::db::{self, Pool};
use crate::domain::RolloverSummary;
use crate::error::AppResult;
use crate::services::recurrence;
use crate::services::validation::{format_date, parse_date};

// One-offs move first, so an open rollover copy is already on today when series are checked.
pub(crate) async fn rollover(pool: &Pool, today: &str) -> AppResult<RolloverSummary> {
    let today = parse_date("today", today)?;
    let mut moved = db::task::move_overdue_one_offs(pool, &format_date(today)).await?;
    moved += detach_missed_recurring(pool, today).await?;
    Ok(RolloverSummary { moved })
}

// TickTick-style: a completion or exception settles every earlier occurrence.
async fn detach_missed_recurring(pool: &Pool, today: NaiveDate) -> AppResult<u64> {
    let yesterday = today - chrono::Duration::days(1);
    let (today, through) = (format_date(today), format_date(yesterday));
    let settled: HashMap<i64, String> = db::task::latest_settled_through(pool, &through)
        .await?
        .into_iter()
        .collect();

    let mut detached = 0;
    for task in db::task::list_recurring_through(pool, &through).await? {
        let Some(series) = task.series() else {
            continue;
        };
        let latest = recurrence::latest_through(series.rule, series_start(series)?, yesterday);
        let Some(latest) = or_warn(task.id, latest).flatten().map(format_date) else {
            continue;
        };
        if settled
            .get(&task.id)
            .is_some_and(|settled| *settled >= latest)
        {
            continue;
        }
        if roll_over_occurrence(pool, task.id, &latest, &today).await? {
            detached += 1;
        }
    }
    Ok(detached)
}

async fn roll_over_occurrence(pool: &Pool, id: i64, missed: &str, today: &str) -> AppResult<bool> {
    let mut tx = pool.begin().await?;
    db::task::insert_exception(&mut *tx, id, missed).await?;
    // An existing open copy was already counted by the one-off move if it moved.
    let has_copy = db::task::has_open_rollover_copy(&mut *tx, id, today).await?;
    if !has_copy {
        let sort_order = db::task::next_sort_order(&mut *tx).await?;
        db::task::insert_detached_copy(&mut *tx, id, today, Some(id), sort_order).await?;
    }
    tx.commit().await?;
    Ok(!has_copy)
}
