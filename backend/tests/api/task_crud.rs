use axum::http::StatusCode;
use serde_json::{json, Value};
use stino_backend::error::ValidationError;

use crate::common::*;

#[tokio::test]
async fn create_defaults_to_inbox_and_lists_there() {
    let app = app().await;

    let task = create_task(&app, json!({"title": "Buy boots"})).await;
    assert_eq!(task["title"], "Buy boots");
    assert_eq!(task["due_date"], Value::Null, "no date => Inbox");
    assert_eq!(task["completed"], false);
    assert_eq!(task["sort_order"], 0);

    assert_eq!(inbox(&app).await.len(), 1);
}

#[tokio::test]
async fn scheduling_moves_a_task_out_of_the_inbox() {
    let app = app().await;
    let id = create_task_id(&app, json!({"title": "Capture now"})).await;

    let (status, updated) = patch_task(&app, id, json!({"due_date": "2026-06-30"})).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(updated["due_date"], "2026-06-30");

    assert!(inbox(&app).await.is_empty());
    assert_eq!(day(&app, "2026-06-30").await.len(), 1);
}

#[tokio::test]
async fn patch_clears_a_field_with_explicit_null_but_keeps_omitted_ones() {
    let app = app().await;
    let id = create_task_id(
        &app,
        json!({"title": "Has notes", "notes": "remember the map"}),
    )
    .await;

    let (status, updated) = patch_task(&app, id, json!({"notes": null})).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(updated["title"], "Has notes", "omitted title is preserved");
    assert_eq!(updated["notes"], Value::Null, "null cleared the notes");
}

#[tokio::test]
async fn validation_rejects_blank_title_time_without_date_and_unknown_label() {
    let app = app().await;

    for (case, body) in [
        ("blank title", json!({"title": "   "})),
        (
            "time without a date",
            json!({"title": "X", "due_time": "09:00"}),
        ),
        (
            "unknown label",
            json!({"title": "X", "label_id": UNKNOWN_ID}),
        ),
        (
            "impossible date",
            json!({"title": "X", "due_date": IMPOSSIBLE_DATE}),
        ),
    ] {
        let (status, _) = post("/api/tasks").json(body).send(&app).await;
        assert_eq!(status, StatusCode::BAD_REQUEST, "{case}");
    }
}

#[tokio::test]
async fn delete_removes_the_task_and_unknown_ids_are_404() {
    let app = app().await;
    let id = create_task_id(&app, json!({"title": "Temp"})).await;

    let (status, _) = delete(&format!("/api/tasks/{id}")).send(&app).await;
    assert_eq!(status, StatusCode::NO_CONTENT);
    assert!(inbox(&app).await.is_empty());

    let (status, _) = delete(&format!("/api/tasks/{UNKNOWN_ID}")).send(&app).await;
    assert_eq!(status, StatusCode::NOT_FOUND);
    let (status, _) = patch_task(&app, UNKNOWN_ID, json!({"title": "x"})).await;
    assert_eq!(status, StatusCode::NOT_FOUND);
    let (status, _) = complete(&app, UNKNOWN_ID, None).await;
    assert_eq!(status, StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn a_bad_date_error_names_the_field_it_came_from() {
    let app = app().await;
    let series = create_task_id(&app, weekly_monday_series()).await;
    let on_series = |action: &str| post(&format!("/api/tasks/{series}/{action}"));

    let cases = [
        (
            "due_date",
            post("/api/tasks").json(json!({"title": "X", "due_date": "nope"})),
        ),
        ("date", get("/api/tasks?date=nope")),
        ("from", get("/api/tasks?from=nope&to=2026-06-30")),
        ("to", get("/api/tasks?from=2026-06-01&to=nope")),
        (
            "today",
            post("/api/tasks/rollover").json(json!({"today": "nope"})),
        ),
        (
            "occurrence_date",
            on_series("skip_occurrence").json(json!({"occurrence_date": "nope"})),
        ),
        (
            "occurrence_date",
            on_series("completions?occurrence_date=nope"),
        ),
        (
            "new_date",
            on_series("move_occurrence")
                .json(json!({"occurrence_date": MON_JUN_8, "new_date": "nope"})),
        ),
    ];
    for (field, request) in cases {
        let (status, body) = request.send(&app).await;
        assert_eq!(status, StatusCode::BAD_REQUEST, "{field}");
        assert_eq!(
            body["error"],
            ValidationError::InvalidDate(field).to_string()
        );
    }
}
