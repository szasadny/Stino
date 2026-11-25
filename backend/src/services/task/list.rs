use std::collections::HashSet;

use chrono::NaiveDate;

use super::{or_warn, series_start};
use crate::db::{self, Pool};
use crate::domain::{Task, TaskSelector};
use crate::error::AppResult;
use crate::services::recurrence;
use crate::services::validation::{format_date, parse_date};

pub(crate) async fn list(pool: &Pool, selector: TaskSelector) -> AppResult<Vec<Task>> {
    let (from, to) = match selector {
        TaskSelector::Inbox => return Ok(db::task::list_inbox(pool).await?),
        TaskSelector::Day(date) => {
            let day = parse_date("date", &date)?;
            (day, day)
        }
        TaskSelector::Range { from, to } => (parse_date("from", &from)?, parse_date("to", &to)?),
    };
    let mut tasks =
        db::task::list_one_offs_between(pool, &format_date(from), &format_date(to)).await?;
    append_recurring(pool, &mut tasks, from, to).await?;
    sort_tasks(&mut tasks);
    Ok(tasks)
}

async fn append_recurring(
    pool: &Pool,
    out: &mut Vec<Task>,
    from: NaiveDate,
    to: NaiveDate,
) -> AppResult<()> {
    let (from_key, to_key) = (format_date(from), format_date(to));
    let series = db::task::list_recurring_through(pool, &to_key).await?;
    if series.is_empty() {
        return Ok(());
    }
    let done: HashSet<_> = db::task::series_completions_between(pool, &from_key, &to_key)
        .await?
        .into_iter()
        .collect();
    let excepted: HashSet<_> = db::task::exceptions_between(pool, &from_key, &to_key)
        .await?
        .into_iter()
        .collect();
    for task in series {
        let Some(series) = task.series() else {
            continue;
        };
        let start = series_start(series)?;
        let Some(dates) = or_warn(task.id, recurrence::expand(series.rule, start, from, to)) else {
            continue;
        };
        for date in dates {
            let key = (task.id, format_date(date));
            if excepted.contains(&key) {
                continue;
            }
            out.push(Task {
                completed: done.contains(&key),
                occurrence_date: Some(key.1),
                ..task.clone()
            });
        }
    }
    Ok(())
}

// `occurrence_date` is `YYYY-MM-DD`, so lexicographic order is chronological.
fn sort_tasks(tasks: &mut [Task]) {
    tasks.sort_by(|a, b| {
        a.occurrence_date
            .cmp(&b.occurrence_date)
            .then_with(|| a.due_time.is_none().cmp(&b.due_time.is_none()))
            .then_with(|| a.due_time.cmp(&b.due_time))
            .then_with(|| a.sort_order.cmp(&b.sort_order))
            .then_with(|| a.id.cmp(&b.id))
    });
}
