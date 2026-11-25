use axum::http::StatusCode;
use serde_json::{json, Value};
use stino_backend::error::ValidationError;

use crate::common::*;

#[tokio::test]
async fn moving_one_occurrence_detaches_it_and_leaves_the_series_repeating() {
    let app = app().await;
    let label_id = id_of(&create_label(&app, "Work", PINE).await);
    let mut series = weekly_monday_series();
    series["label_id"] = json!(label_id);
    let id = create_task_id(&app, series).await;

    let (status, moved) = move_occurrence(&app, id, MON_JUN_8, "2026-06-10").await;
    assert_eq!(status, StatusCode::CREATED, "move failed: {moved}");
    let new_id = id_of(&moved);
    assert_ne!(
        new_id, id,
        "the moved instance becomes its own one-off task"
    );
    assert_eq!(moved["title"], "Standup");
    assert_eq!(moved["due_date"], "2026-06-10");
    assert_eq!(
        moved["label_id"], label_id,
        "the detached copy carries the series' label"
    );
    assert_eq!(
        moved["recurrence_rule"],
        Value::Null,
        "the detached copy does not repeat"
    );

    let days = range(&app, MON_JUN_1, MON_JUN_15).await;
    assert_eq!(
        occurrence_dates(with_id(&days, id)),
        [MON_JUN_1, MON_JUN_15],
        "Jun 8 detached; the rest keep repeating"
    );
    let detached: Vec<&Value> = days
        .iter()
        .filter(|d| d["occurrence_date"] == "2026-06-10")
        .collect();
    assert_eq!(detached.len(), 1);
    assert_eq!(detached[0]["id"], new_id);
    assert_eq!(detached[0]["recurrence_rule"], Value::Null);
}

#[tokio::test]
async fn moving_an_occurrence_of_a_non_recurring_task_is_rejected() {
    let app = app().await;
    let id = create_task_id(&app, json!({"title": "One-off", "due_date": MON_JUN_1})).await;

    let (status, _) = move_occurrence(&app, id, MON_JUN_1, "2026-06-02").await;
    assert_eq!(
        status,
        StatusCode::BAD_REQUEST,
        "only a recurring task's occurrence can be moved"
    );
}

#[tokio::test]
async fn moving_a_date_that_is_not_an_occurrence_is_rejected() {
    let app = app().await;
    let id = create_task_id(&app, weekly_monday_series()).await;

    let (status, _) = move_occurrence(&app, id, WED_JUN_3, "2026-06-10").await;
    assert_eq!(
        status,
        StatusCode::BAD_REQUEST,
        "Jun 3 is not a Monday occurrence of the series"
    );
}

#[tokio::test]
async fn moving_an_occurrence_to_its_own_day_changes_nothing() {
    let app = app().await;
    let id = create_task_id(&app, weekly_monday_series()).await;

    let (status, _) = move_occurrence(&app, id, MON_JUN_8, MON_JUN_8).await;
    assert_eq!(status, StatusCode::OK);

    let days = range(&app, MON_JUN_1, MON_JUN_15).await;
    assert_eq!(
        days.len(),
        3,
        "the series still lands on all three Mondays; nothing was detached"
    );
    assert!(
        days.iter().all(|d| d["id"] == id),
        "every row is still the series — no one-off copy was created"
    );
}

#[tokio::test]
async fn moving_the_same_occurrence_twice_is_rejected() {
    let app = app().await;
    let id = create_task_id(&app, weekly_monday_series()).await;

    let (status, _) = move_occurrence(&app, id, MON_JUN_8, "2026-06-10").await;
    assert_eq!(status, StatusCode::CREATED);
    let (status, _) = move_occurrence(&app, id, MON_JUN_8, "2026-06-12").await;
    assert_eq!(
        status,
        StatusCode::BAD_REQUEST,
        "Jun 8 was already detached; re-moving it must not orphan a duplicate one-off"
    );

    let days = range(&app, MON_JUN_1, MON_JUN_15).await;
    let detached: Vec<&Value> = days.iter().filter(|d| d["id"] != id).collect();
    assert_eq!(detached.len(), 1, "only the first move's one-off exists");
    assert_eq!(detached[0]["due_date"], "2026-06-10");
}

#[tokio::test]
async fn moving_a_completed_occurrence_carries_its_completion_to_the_one_off() {
    let pool = pool_with(sqlx::migrate!()).await;
    let app = app_with(pool.clone(), None);
    let id = create_task_id(&app, daily_series()).await;
    complete(&app, id, Some("2026-06-02")).await;

    let (status, moved) = move_occurrence(&app, id, "2026-06-02", "2026-06-05").await;
    assert_eq!(status, StatusCode::CREATED, "move failed: {moved}");
    assert_eq!(
        moved["completed"], true,
        "the detached one-off keeps the source occurrence's done state"
    );

    let days = range(&app, MON_JUN_1, "2026-06-05").await;
    let series = with_id(&days, id);
    assert_eq!(
        occurrence_dates(series.iter().copied()),
        [MON_JUN_1, WED_JUN_3, "2026-06-04", "2026-06-05"]
    );
    assert_eq!(
        completed_flags(series),
        [false; 4],
        "the series keeps repeating, all open"
    );
    let one_off = with_id(&days, id_of(&moved));
    assert_eq!(occurrence_dates(one_off.iter().copied()), ["2026-06-05"]);
    assert_eq!(completed_flags(one_off), [true]);

    let stale: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM completion WHERE task_id = ? AND occurrence_date = '2026-06-02'",
    )
    .bind(id)
    .fetch_one(&pool)
    .await
    .expect("count completions");
    assert_eq!(
        stale, 0,
        "no orphan completion remains at (series, old date)"
    );
}

#[tokio::test]
async fn a_same_day_move_answers_200_with_the_series_and_a_real_move_201_with_the_copy() {
    let app = app().await;
    let series = create_task(&app, weekly_monday_series()).await;
    let id = id_of(&series);

    let (status, same_day) = move_occurrence(&app, id, MON_JUN_8, MON_JUN_8).await;
    assert_eq!(status, StatusCode::OK, "nothing was created");
    assert_eq!(same_day, series, "the unchanged series comes back");

    let (status, moved) = move_occurrence(&app, id, MON_JUN_8, "2026-06-09").await;
    assert_eq!(status, StatusCode::CREATED);
    assert_ne!(moved["id"], series["id"]);
}

#[tokio::test]
async fn skipping_an_occurrence_removes_only_that_date() {
    let app = app().await;
    let id = create_task_id(&app, weekly_monday_series()).await;

    assert_eq!(skip(&app, id, MON_JUN_8).await, StatusCode::NO_CONTENT);
    assert_eq!(
        series_dates(&app, id, MON_JUN_1, MON_JUN_15).await,
        [MON_JUN_1, MON_JUN_15],
        "Jun 8 is gone; the series keeps repeating"
    );
    assert_eq!(range(&app, MON_JUN_1, MON_JUN_15).await.len(), 2);

    assert_eq!(skip(&app, id, MON_JUN_8).await, StatusCode::NO_CONTENT);
    assert_eq!(
        series_dates(&app, id, MON_JUN_1, MON_JUN_15).await,
        [MON_JUN_1, MON_JUN_15]
    );
}

#[tokio::test]
async fn completing_a_skipped_occurrence_is_rejected() {
    let app = app().await;
    let id = create_task_id(&app, daily_series()).await;
    assert_eq!(skip(&app, id, "2026-06-02").await, StatusCode::NO_CONTENT);

    let (status, body) = complete(&app, id, Some("2026-06-02")).await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert_eq!(
        body["error"],
        ValidationError::OccurrenceDetached.to_string(),
        "a skip is not described as a move"
    );
}

#[tokio::test]
async fn skipping_a_completed_occurrence_is_rejected_and_keeps_it() {
    let app = app().await;
    let id = create_task_id(&app, daily_series()).await;
    let (status, _) = complete(&app, id, Some("2026-06-02")).await;
    assert_eq!(status, StatusCode::OK);

    assert_eq!(skip(&app, id, "2026-06-02").await, StatusCode::BAD_REQUEST);
    assert_eq!(
        series_dates(&app, id, MON_JUN_1, WED_JUN_3).await,
        [MON_JUN_1, "2026-06-02", WED_JUN_3],
        "the completed occurrence is still in the series"
    );
    let on_the_day = range(&app, "2026-06-02", "2026-06-02").await;
    assert_eq!(
        completed_flags(with_id(&on_the_day, id)),
        [true],
        "its completion is kept"
    );
}

#[tokio::test]
async fn skipping_an_occurrence_of_a_missing_task_is_404() {
    let app = app().await;
    assert_eq!(
        skip(&app, UNKNOWN_ID, MON_JUN_1).await,
        StatusCode::NOT_FOUND
    );
}

#[tokio::test]
async fn skipping_an_occurrence_of_a_non_recurring_task_is_rejected() {
    let app = app().await;
    let id = create_task_id(&app, json!({"title": "One-off", "due_date": MON_JUN_1})).await;
    assert_eq!(skip(&app, id, MON_JUN_1).await, StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn skipping_a_bad_or_non_member_date_is_rejected() {
    let app = app().await;
    let id = create_task_id(&app, weekly_monday_series()).await;
    assert_eq!(skip(&app, id, WED_JUN_3).await, StatusCode::BAD_REQUEST);
    assert_eq!(skip(&app, id, "June 8").await, StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn turning_recurrence_off_clears_its_skips_but_changing_the_rule_keeps_them() {
    let app = app().await;
    let id = create_task_id(&app, daily_series()).await;
    assert_eq!(skip(&app, id, "2026-06-02").await, StatusCode::NO_CONTENT);

    let (status, _) = patch_task(
        &app,
        id,
        json!({"recurrence_rule": "FREQ=DAILY;INTERVAL=1"}),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(
        series_dates(&app, id, MON_JUN_1, WED_JUN_3).await,
        [MON_JUN_1, WED_JUN_3],
        "a rule-to-rule change keeps the skip"
    );

    let (status, _) = patch_task(&app, id, json!({"recurrence_rule": null})).await;
    assert_eq!(status, StatusCode::OK);
    let (status, _) = patch_task(&app, id, json!({"recurrence_rule": "FREQ=DAILY"})).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(
        series_dates(&app, id, MON_JUN_1, WED_JUN_3).await,
        [MON_JUN_1, "2026-06-02", WED_JUN_3],
        "re-adding a rule after turning it off starts clean"
    );
}
