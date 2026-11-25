use axum::http::StatusCode;
use serde_json::{json, Value};

use crate::common::*;

#[tokio::test]
async fn batch_sets_a_label_on_many_tasks_and_clears_it_again() {
    let app = app().await;
    let label = id_of(&create_label(&app, "Errands", MOSS).await);
    let a = create_task_id(&app, json!({"title": "A"})).await;
    let b = create_task_id(&app, json!({"title": "B"})).await;
    let c = create_task_id(&app, json!({"title": "C"})).await;

    let status = batch(&app, &[a, b], json!({"type": "label", "label_id": label})).await;
    assert_eq!(status, StatusCode::NO_CONTENT);
    let tasks = inbox(&app).await;
    assert_eq!(with_id(&tasks, a)[0]["label_id"], label);
    assert_eq!(with_id(&tasks, b)[0]["label_id"], label);
    assert_eq!(
        with_id(&tasks, c)[0]["label_id"],
        Value::Null,
        "C was not in the batch"
    );

    let status = batch(&app, &[a, b], json!({"type": "label", "label_id": null})).await;
    assert_eq!(status, StatusCode::NO_CONTENT);
    assert!(
        inbox(&app).await.iter().all(|t| t["label_id"].is_null()),
        "all labels cleared"
    );
}

#[tokio::test]
async fn batch_schedule_moves_tasks_out_of_the_inbox_onto_a_day() {
    let app = app().await;
    let a = create_task_id(&app, json!({"title": "A"})).await;
    let b = create_task_id(&app, json!({"title": "B"})).await;

    let op = json!({"type": "schedule", "due_date": "2026-07-04"});
    assert_eq!(batch(&app, &[a, b], op).await, StatusCode::NO_CONTENT);

    assert!(inbox(&app).await.is_empty());
    assert_eq!(day(&app, "2026-07-04").await.len(), 2);
}

#[tokio::test]
async fn batch_complete_marks_every_selected_task_done() {
    let app = app().await;
    let a = create_task_id(&app, json!({"title": "task A"})).await;
    let b = create_task_id(&app, json!({"title": "task B"})).await;

    let op = json!({"type": "complete"});
    assert_eq!(
        batch(&app, &[a, b], op.clone()).await,
        StatusCode::NO_CONTENT
    );
    assert!(inbox(&app).await.is_empty(), "done tasks leave the Inbox");
    let found = list(&app, "/api/search?q=task").await;
    assert_eq!(completed_flags(&found), [true, true]);

    assert_eq!(batch(&app, &[a, b], op).await, StatusCode::NO_CONTENT);
}

#[tokio::test]
async fn batch_delete_removes_every_selected_task() {
    let app = app().await;
    let a = create_task_id(&app, json!({"title": "A"})).await;
    let b = create_task_id(&app, json!({"title": "B"})).await;
    create_task(&app, json!({"title": "Keep"})).await;

    let status = batch(&app, &[a, b], json!({"type": "delete"})).await;
    assert_eq!(status, StatusCode::NO_CONTENT);

    assert_eq!(
        titles(&inbox(&app).await),
        ["Keep"],
        "only the unselected task remains"
    );
}

#[tokio::test]
async fn batch_with_an_unknown_id_rolls_the_whole_batch_back() {
    let app = app().await;
    let label = id_of(&create_label(&app, "Tag", MOSS).await);
    let a = create_task_id(&app, json!({"title": "A"})).await;

    let op = json!({"type": "label", "label_id": label});
    assert_eq!(
        batch(&app, &[a, UNKNOWN_ID], op).await,
        StatusCode::NOT_FOUND
    );
    assert_eq!(
        inbox(&app).await[0]["label_id"],
        Value::Null,
        "the failed batch left A unlabeled"
    );

    let op = json!({"type": "delete"});
    assert_eq!(
        batch(&app, &[a, UNKNOWN_ID], op).await,
        StatusCode::NOT_FOUND
    );
    assert_eq!(inbox(&app).await.len(), 1, "A was not deleted");
}

#[tokio::test]
async fn batch_rejects_a_bad_date_or_an_unknown_label() {
    let app = app().await;
    let a = create_task_id(&app, json!({"title": "A"})).await;

    let op = json!({"type": "schedule", "due_date": IMPOSSIBLE_DATE});
    assert_eq!(
        batch(&app, &[a], op).await,
        StatusCode::BAD_REQUEST,
        "impossible date"
    );
    let op = json!({"type": "label", "label_id": UNKNOWN_ID});
    assert_eq!(
        batch(&app, &[a], op).await,
        StatusCode::BAD_REQUEST,
        "unknown label"
    );

    let task = &inbox(&app).await[0];
    assert_eq!(task["due_date"], Value::Null);
    assert_eq!(task["label_id"], Value::Null);
}

#[tokio::test]
async fn batch_schedule_keeps_completed_tasks_completed() {
    let app = app().await;
    let undated = create_task_id(&app, json!({"title": "Inbox done"})).await;
    let dated = create_task_id(
        &app,
        json!({"title": "Dated done", "due_date": "2026-07-01"}),
    )
    .await;
    for id in [undated, dated] {
        assert_eq!(complete(&app, id, None).await.0, StatusCode::OK);
    }

    let op = json!({"type": "schedule", "due_date": "2026-07-10"});
    assert_eq!(
        batch(&app, &[undated, dated], op).await,
        StatusCode::NO_CONTENT
    );

    assert_eq!(
        completed_flags(&day(&app, "2026-07-10").await),
        [true, true],
        "the batch schedule reopened nothing"
    );
}

#[tokio::test]
async fn batch_schedule_rejects_recurring_tasks() {
    let app = app().await;
    let series = create_task_id(&app, weekly_monday_series()).await;
    let plain = create_task_id(&app, json!({"title": "Plain"})).await;

    let op = json!({"type": "schedule", "due_date": "2026-07-10"});
    assert_eq!(
        batch(&app, &[plain, series], op).await,
        StatusCode::BAD_REQUEST
    );

    assert_eq!(
        inbox(&app).await.len(),
        1,
        "the plain task stayed in the Inbox — the rejected batch changed nothing"
    );
    assert_eq!(
        series_dates(&app, series, MON_JUN_1, MON_JUN_8).await.len(),
        2,
        "the series still starts Jun 1, untouched"
    );
}

#[tokio::test]
async fn batch_with_no_ids_is_a_harmless_no_op() {
    let app = app().await;
    create_task(&app, json!({"title": "A"})).await;

    let status = batch(&app, &[], json!({"type": "delete"})).await;
    assert_eq!(status, StatusCode::NO_CONTENT);
    assert_eq!(inbox(&app).await.len(), 1, "nothing deleted");
}

#[tokio::test]
async fn reorder_persists_a_new_manual_order_and_a_refetch_returns_it() {
    let app = app().await;
    let a = create_task_id(&app, json!({"title": "A"})).await;
    let b = create_task_id(&app, json!({"title": "B"})).await;
    let c = create_task_id(&app, json!({"title": "C"})).await;
    assert_eq!(titles(&inbox(&app).await), ["A", "B", "C"]);

    let (status, _) = patch("/api/tasks/reorder")
        .json(json!({"ids": [c, a, b]}))
        .send(&app)
        .await;
    assert_eq!(status, StatusCode::NO_CONTENT);
    assert_eq!(titles(&inbox(&app).await), ["C", "A", "B"]);
}

#[tokio::test]
async fn reorder_keeps_timed_tasks_time_sorted_and_rolls_back_unknown_ids() {
    let app = app().await;
    let on_the_day = |title: &str, time: Option<&str>| json!({"title": title, "due_date": "2026-06-24", "due_time": time});
    create_task(&app, on_the_day("Morning", Some("08:00"))).await;
    create_task(&app, on_the_day("Evening", Some("18:00"))).await;
    let untimed_a = create_task_id(&app, on_the_day("Untimed A", None)).await;
    let untimed_b = create_task_id(&app, on_the_day("Untimed B", None)).await;
    let reorder = |ids: Value| patch("/api/tasks/reorder").json(json!({ "ids": ids }));
    let expected = ["Morning", "Evening", "Untimed B", "Untimed A"];

    let (status, _) = reorder(json!([untimed_b, untimed_a])).send(&app).await;
    assert_eq!(status, StatusCode::NO_CONTENT);
    assert_eq!(titles(&day(&app, "2026-06-24").await), expected);

    let (status, _) = reorder(json!([untimed_a, UNKNOWN_ID])).send(&app).await;
    assert_eq!(status, StatusCode::NOT_FOUND);
    assert_eq!(
        titles(&day(&app, "2026-06-24").await),
        expected,
        "the failed reorder changed nothing"
    );
}
