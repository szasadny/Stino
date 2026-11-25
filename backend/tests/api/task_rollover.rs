use axum::http::StatusCode;
use axum::Router;
use serde_json::{json, Value};

use crate::common::*;

async fn open_copies(app: &Router, title: &str, date: &str) -> Vec<Value> {
    day(app, date)
        .await
        .into_iter()
        .filter(|t| {
            t["title"] == title && t["recurrence_rule"].is_null() && t["completed"] == false
        })
        .collect()
}

#[tokio::test]
async fn rollover_moves_only_overdue_uncompleted_one_offs() {
    let app = app().await;
    let (open_day, done_day, future_day) = (from_today(-6), from_today(-5), from_today(3));
    let open = create_task_id(
        &app,
        json!({"title": "Overdue open", "due_date": open_day, "due_time": "09:00"}),
    )
    .await;
    let done = create_task_id(&app, json!({"title": "Overdue done", "due_date": done_day})).await;
    assert_eq!(complete(&app, done, None).await.0, StatusCode::OK);
    create_task(&app, json!({"title": "Due today", "due_date": TODAY})).await;
    create_task(&app, json!({"title": "Future", "due_date": future_day})).await;
    create_task(&app, json!({"title": "Inbox"})).await;

    let (status, body) = rollover(&app, TODAY).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["moved"], 1, "only the open overdue one-off moves");

    let today = day(&app, TODAY).await;
    let moved = with_title(&today, "Overdue open");
    assert!(!moved.is_empty(), "moved task is on today");
    assert_eq!(moved[0]["id"], open);
    assert_eq!(moved[0]["due_time"], "09:00");
    assert!(
        !with_title(&today, "Due today").is_empty(),
        "today's own task is untouched"
    );

    let past = day(&app, &done_day).await;
    assert_eq!(
        completed_flags(with_title(&past, "Overdue done")),
        [true],
        "completed task stays put"
    );
    assert!(
        with_title(&day(&app, &open_day).await, "Overdue open").is_empty(),
        "the moved one-off left its old day"
    );
    assert_eq!(inbox(&app).await.len(), 1);
    assert!(
        !with_title(&day(&app, &future_day).await, "Future").is_empty(),
        "the future task keeps its own day"
    );
}

#[tokio::test]
async fn rollover_collapses_missed_recurring_occurrences_into_one_copy() {
    let app = app().await;
    let series = create_task(
        &app,
        json!({"title": "Daily standup", "due_date": from_today(-3), "due_time": "09:00", "recurrence_rule": "FREQ=DAILY"}),
    )
    .await;
    let series_id = id_of(&series);
    let completed_day = from_today(-2);
    let (status, _) = complete(&app, series_id, Some(&completed_day)).await;
    assert_eq!(status, StatusCode::OK);

    let (status, body) = rollover(&app, TODAY).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["moved"], 1, "one standalone copy per series");

    let today = day(&app, TODAY).await;
    let standups = with_title(&today, "Daily standup");
    let (copies, occurrences): (Vec<&Value>, Vec<&Value>) = standups
        .into_iter()
        .partition(|t| t["recurrence_rule"].is_null());
    assert_eq!(copies.len(), 1, "one detached copy on today");
    assert_eq!(
        copies[0]["due_time"], "09:00",
        "the copy keeps the series' time"
    );
    assert_ne!(
        copies[0]["id"], series["id"],
        "a detached copy is a new task"
    );
    assert!(
        !occurrences.is_empty(),
        "the series still generates today's occurrence"
    );

    let yesterday = from_today(-1);
    assert!(series_dates(&app, series_id, &yesterday, &yesterday)
        .await
        .is_empty());
    let kept = day(&app, &completed_day).await;
    assert_eq!(
        completed_flags(with_title(&kept, "Daily standup")),
        [true],
        "completed occurrence stays put"
    );
}

#[tokio::test]
async fn rollover_catches_a_miss_of_any_age_and_is_idempotent() {
    let app = app().await;
    create_task(
        &app,
        json!({"title": "Pay rent", "due_date": from_today(-71), "recurrence_rule": "FREQ=MONTHLY"}),
    )
    .await;

    let (status, body) = rollover(&app, TODAY).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(
        body["moved"], 1,
        "three missed months collapse into one copy"
    );

    let (_, body) = rollover(&app, TODAY).await;
    assert_eq!(body["moved"], 0, "re-running the same day is a no-op");
    assert_eq!(open_copies(&app, "Pay rent", TODAY).await.len(), 1);
}

#[tokio::test]
async fn rollover_ignores_misses_settled_by_a_later_completion() {
    let app = app().await;
    let id = create_task_id(
        &app,
        json!({"title": "Water plants", "due_date": from_today(-19), "recurrence_rule": "FREQ=WEEKLY"}),
    )
    .await;
    let (status, _) = complete(&app, id, Some(&from_today(-5))).await;
    assert_eq!(status, StatusCode::OK);

    let (_, body) = rollover(&app, TODAY).await;
    assert_eq!(body["moved"], 0);
    assert!(open_copies(&app, "Water plants", TODAY).await.is_empty());
}

#[tokio::test]
async fn rollover_on_consecutive_days_keeps_one_open_copy() {
    let app = app().await;
    let id = create_task_id(
        &app,
        json!({"title": "Stretch", "due_date": from_today(-6), "recurrence_rule": "FREQ=DAILY"}),
    )
    .await;

    for offset in [-4, -3, -2] {
        let today = from_today(offset);
        let (status, body) = rollover(&app, &today).await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(body["moved"], 1, "{today}: the one copy lands on today");
        assert_eq!(
            open_copies(&app, "Stretch", &today).await.len(),
            1,
            "{today}: one open copy"
        );
    }
    assert!(series_dates(&app, id, &from_today(-5), &from_today(-3))
        .await
        .is_empty());

    let copy = id_of(&open_copies(&app, "Stretch", &from_today(-2)).await[0]);
    assert_eq!(complete(&app, copy, None).await.0, StatusCode::OK);
    let yesterday = from_today(-1);
    let (_, body) = rollover(&app, &yesterday).await;
    assert_eq!(body["moved"], 1, "a fresh copy for the newly missed day");
    let fresh = open_copies(&app, "Stretch", &yesterday).await;
    assert_eq!(fresh.len(), 1);
    assert_ne!(fresh[0]["id"], copy);
}

#[tokio::test]
async fn rollover_again_moves_nothing_and_a_bad_date_is_rejected() {
    let app = app().await;
    create_task(
        &app,
        json!({"title": "Overdue", "due_date": from_today(-6)}),
    )
    .await;

    let (status, body) = rollover(&app, TODAY).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["moved"], 1);

    let (status, body) = rollover(&app, TODAY).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["moved"], 0);

    let (status, _) = rollover(&app, IMPOSSIBLE_DATE).await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
}
