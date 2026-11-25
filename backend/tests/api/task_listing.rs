use axum::http::StatusCode;
use serde_json::json;
use stino_backend::error::ValidationError;

use crate::common::*;

#[tokio::test]
async fn inbox_and_scheduled_lists_are_disjoint() {
    let app = app().await;
    create_task(&app, json!({"title": "Unscheduled"})).await;
    create_task(&app, json!({"title": "On a day", "due_date": "2026-06-24"})).await;

    assert_eq!(titles(&inbox(&app).await), ["Unscheduled"]);
    assert_eq!(titles(&day(&app, "2026-06-24").await), ["On a day"]);
}

#[tokio::test]
async fn day_view_sorts_timed_first_then_untimed_by_order() {
    let app = app().await;
    create_task(
        &app,
        json!({"title": "Untimed A", "due_date": "2026-06-24"}),
    )
    .await;
    create_task(
        &app,
        json!({"title": "Evening", "due_date": "2026-06-24", "due_time": "18:30"}),
    )
    .await;
    create_task(
        &app,
        json!({"title": "Untimed B", "due_date": "2026-06-24"}),
    )
    .await;
    create_task(
        &app,
        json!({"title": "Morning", "due_date": "2026-06-24", "due_time": "08:00"}),
    )
    .await;

    assert_eq!(
        titles(&day(&app, "2026-06-24").await),
        ["Morning", "Evening", "Untimed A", "Untimed B"]
    );
}

#[tokio::test]
async fn range_returns_tasks_across_month_edges_in_day_then_time_order() {
    let app = app().await;
    create_task(
        &app,
        json!({"title": "Jul 1 evening", "due_date": "2026-07-01", "due_time": "18:00"}),
    )
    .await;
    create_task(
        &app,
        json!({"title": "Jun 30 untimed", "due_date": "2026-06-30"}),
    )
    .await;
    create_task(
        &app,
        json!({"title": "Jul 1 morning", "due_date": "2026-07-01", "due_time": "08:00"}),
    )
    .await;
    create_task(
        &app,
        json!({"title": "Too early", "due_date": "2026-06-29"}),
    )
    .await;
    create_task(&app, json!({"title": "In the inbox"})).await;

    assert_eq!(
        titles(&range(&app, "2026-06-30", "2026-07-01").await),
        ["Jun 30 untimed", "Jul 1 morning", "Jul 1 evening"]
    );
}

#[tokio::test]
async fn range_with_no_tasks_in_window_is_empty() {
    let app = app().await;
    create_task(&app, json!({"title": "Far off", "due_date": "2026-09-15"})).await;

    assert!(range(&app, "2026-06-01", "2026-06-30").await.is_empty());
}

#[tokio::test]
async fn range_requires_both_bounds() {
    let app = app().await;

    let (status, _) = get("/api/tasks?from=2026-06-01").send(&app).await;
    assert_eq!(status, StatusCode::BAD_REQUEST, "from without to");
    let (status, _) = get("/api/tasks?to=2026-06-30").send(&app).await;
    assert_eq!(status, StatusCode::BAD_REQUEST, "to without from");
}

#[tokio::test]
async fn unknown_task_list_params_are_rejected_but_the_known_forms_pass() {
    let app = app().await;

    let (status, body) = get("/api/tasks?fromm=2026-06-01").send(&app).await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert!(body["error"].is_string());

    for uri in [
        "/api/tasks?inbox=true",
        "/api/tasks?date=2026-06-01",
        "/api/tasks?from=2026-06-01&to=2026-06-30",
        "/api/tasks",
    ] {
        list(&app, uri).await;
    }
}

#[tokio::test]
async fn inbox_false_is_rejected_while_inbox_true_and_no_params_list_the_inbox() {
    let app = app().await;
    create_task(&app, json!({"title": "Unscheduled"})).await;

    let (status, body) = get("/api/tasks?inbox=false").send(&app).await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert_eq!(body["error"], ValidationError::InboxMustBeTrue.to_string());

    for uri in ["/api/tasks?inbox=true", "/api/tasks"] {
        assert_eq!(list(&app, uri).await.len(), 1, "{uri}");
    }
}
