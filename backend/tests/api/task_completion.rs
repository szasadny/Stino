use axum::http::StatusCode;
use serde_json::json;

use crate::common::*;

#[tokio::test]
async fn complete_and_uncomplete_toggle_without_mutating_the_task() {
    let app = app().await;
    let id = create_task_id(
        &app,
        json!({"title": "Pitch tent", "due_date": "2026-07-01"}),
    )
    .await;

    let (status, done) = complete(&app, id, None).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(done["completed"], true);
    assert_eq!(
        done["title"], "Pitch tent",
        "completion never mutates the task"
    );

    let (status, _) = complete(&app, id, None).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(day(&app, "2026-07-01").await[0]["completed"], true);

    let (status, reopened) = uncomplete(&app, id, None).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(reopened["completed"], false);
}

#[tokio::test]
async fn rescheduling_a_completed_task_keeps_it_completed() {
    let app = app().await;
    let id = create_task_id(
        &app,
        json!({"title": "Chop wood", "due_date": "2026-07-01"}),
    )
    .await;
    complete(&app, id, None).await;

    let (status, moved) = patch_task(&app, id, json!({"due_date": "2026-07-08"})).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(moved["due_date"], "2026-07-08");
    assert_eq!(
        moved["completed"], true,
        "the completion follows the task to its new day"
    );

    assert_eq!(completed_flags(&day(&app, "2026-07-08").await), [true]);
    assert!(
        day(&app, "2026-07-01").await.is_empty(),
        "the task no longer lives on the old day"
    );
}

#[tokio::test]
async fn completing_an_inbox_task_removes_it_from_the_inbox() {
    let app = app().await;
    let id = create_task_id(&app, json!({"title": "Someday"})).await;

    let (status, done) = complete(&app, id, None).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(done["completed"], true);

    assert!(
        inbox(&app).await.is_empty(),
        "the completed task no longer appears in the inbox"
    );
}

#[tokio::test]
async fn completing_one_occurrence_leaves_the_others_open() {
    let app = app().await;
    let id = create_task_id(&app, daily_series()).await;

    let (status, done) = complete(&app, id, Some("2026-06-02")).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(done["completed"], true);
    assert_eq!(
        done["occurrence_date"], "2026-06-02",
        "the toggled occurrence is returned, not the series start"
    );
    assert_eq!(
        completed_flags(&range(&app, "2026-06-01", "2026-06-03").await),
        [false, true, false]
    );

    let (status, reopened) = uncomplete(&app, id, Some("2026-06-02")).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(reopened["completed"], false);
    assert!(
        !completed_flags(&range(&app, "2026-06-01", "2026-06-03").await).contains(&true),
        "reopening cleared the only completed occurrence"
    );
}

#[tokio::test]
async fn completing_one_monthly_occurrence_leaves_the_others_open() {
    let app = app().await;
    let id = create_task_id(
        &app,
        json!({"title": "Report", "due_date": THU_JAN_1, "recurrence_rule": FIRST_MONDAY_MONTHLY}),
    )
    .await;

    let (status, done) = complete(&app, id, Some("2026-02-02")).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(done["completed"], true);
    assert_eq!(
        completed_flags(&range(&app, THU_JAN_1, "2026-03-31").await),
        [false, true, false]
    );

    let (status, reopened) = uncomplete(&app, id, Some("2026-02-02")).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(reopened["completed"], false);
}

#[tokio::test]
async fn completing_a_date_that_is_not_a_real_occurrence_is_rejected() {
    let app = app().await;

    let series = create_task_id(&app, weekly_monday_series()).await;
    let (status, _) = complete(&app, series, Some(WED_JUN_3)).await;
    assert_eq!(status, StatusCode::BAD_REQUEST, "not an occurrence");

    let one_off = create_task_id(&app, json!({"title": "One-off", "due_date": MON_JUN_1})).await;
    let (status, _) = complete(&app, one_off, Some("2026-06-02")).await;
    assert_eq!(status, StatusCode::BAD_REQUEST, "mismatched one-off date");

    let someday = create_task_id(&app, json!({"title": "Someday"})).await;
    let (status, _) = complete(&app, someday, Some("2026-06-02")).await;
    assert_eq!(
        status,
        StatusCode::BAD_REQUEST,
        "an Inbox task has no dated occurrence"
    );

    assert!(!completed_flags(&day(&app, MON_JUN_1).await).contains(&true));
}

#[tokio::test]
async fn completing_a_detached_occurrence_of_the_series_is_rejected() {
    let app = app().await;
    let series = create_task_id(&app, weekly_monday_series()).await;

    let (status, _) = move_occurrence(&app, series, MON_JUN_8, "2026-06-10").await;
    assert_eq!(status, StatusCode::CREATED);

    let (status, _) = complete(&app, series, Some(MON_JUN_8)).await;
    assert_eq!(
        status,
        StatusCode::BAD_REQUEST,
        "the detached date belongs to the one-off now, not the series"
    );
}

#[tokio::test]
async fn a_series_start_the_rule_does_not_regenerate_still_toggles() {
    let app = app().await;
    // rrule never emits an off-rule DTSTART, but search and import key the series there.
    let series = create_task_id(
        &app,
        json!({"title": "Standup", "due_date": WED_JUN_3, "recurrence_rule": "FREQ=WEEKLY;BYDAY=MO"}),
    )
    .await;

    let (status, done) = complete(&app, series, None).await;
    assert_eq!(status, StatusCode::OK, "series start completes: {done}");
    assert_eq!(done["completed"], true);

    let (status, reopened) = uncomplete(&app, series, None).await;
    assert_eq!(status, StatusCode::OK, "series start reopens: {reopened}");
    assert_eq!(reopened["completed"], false);

    let (status, _) = complete(&app, series, Some("2026-06-04")).await;
    assert_eq!(status, StatusCode::BAD_REQUEST, "not an occurrence");
}
