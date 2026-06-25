//! Integration tests for the task API, driven through the real router against a
//! fresh in-memory SQLite database (migrations applied per test for isolation).

use axum::body::Body;
use axum::http::{Request, StatusCode};
use axum::Router;
use http_body_util::BodyExt;
use serde_json::{json, Value};
use sqlx::sqlite::SqlitePoolOptions;
use std::path::Path;
use tower::ServiceExt;

use stino_backend::routes;

async fn test_app() -> Router {
    // max_connections(1) keeps the single in-memory DB alive for the whole test;
    // min_connections(1) stops it being reaped between requests.
    let pool = SqlitePoolOptions::new()
        .min_connections(1)
        .max_connections(1)
        .connect("sqlite::memory:")
        .await
        .expect("open in-memory sqlite");
    sqlx::migrate!().run(&pool).await.expect("run migrations");
    routes::router(pool, Path::new("."))
}

/// Send a request through a clone of the router and decode the JSON body (empty
/// bodies, e.g. 204, decode to `Value::Null`).
async fn send(app: &Router, req: Request<Body>) -> (StatusCode, Value) {
    let res = app.clone().oneshot(req).await.expect("router response");
    let status = res.status();
    let bytes = res
        .into_body()
        .collect()
        .await
        .expect("collect body")
        .to_bytes();
    let body = if bytes.is_empty() {
        Value::Null
    } else {
        serde_json::from_slice(&bytes).expect("json body")
    };
    (status, body)
}

fn json_req(method: &str, uri: &str, body: Value) -> Request<Body> {
    Request::builder()
        .method(method)
        .uri(uri)
        .header("content-type", "application/json")
        .body(Body::from(body.to_string()))
        .expect("build request")
}

fn empty_req(method: &str, uri: &str) -> Request<Body> {
    Request::builder()
        .method(method)
        .uri(uri)
        .body(Body::empty())
        .expect("build request")
}

fn get(uri: &str) -> Request<Body> {
    empty_req("GET", uri)
}

async fn create_task(app: &Router, body: Value) -> Value {
    let (status, task) = send(app, json_req("POST", "/api/tasks", body)).await;
    assert_eq!(status, StatusCode::CREATED, "create failed: {task}");
    task
}

#[tokio::test]
async fn create_defaults_to_inbox_and_lists_there() {
    let app = test_app().await;

    let task = create_task(&app, json!({"title":"Buy boots"})).await;
    assert_eq!(task["title"], "Buy boots");
    assert_eq!(task["due_date"], Value::Null, "no date => Inbox");
    assert_eq!(task["completed"], false);
    assert_eq!(task["sort_order"], 0);

    let (status, inbox) = send(&app, get("/api/tasks?inbox=true")).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(inbox.as_array().expect("array").len(), 1);
}

#[tokio::test]
async fn inbox_and_scheduled_lists_are_disjoint() {
    let app = test_app().await;

    create_task(&app, json!({"title":"Unscheduled"})).await;
    create_task(&app, json!({"title":"On a day","due_date":"2026-06-24"})).await;

    let (_, inbox) = send(&app, get("/api/tasks?inbox=true")).await;
    let inbox = inbox.as_array().expect("array");
    assert_eq!(inbox.len(), 1);
    assert_eq!(inbox[0]["title"], "Unscheduled");

    let (_, day) = send(&app, get("/api/tasks?date=2026-06-24")).await;
    let day = day.as_array().expect("array");
    assert_eq!(day.len(), 1);
    assert_eq!(day[0]["title"], "On a day");
}

#[tokio::test]
async fn scheduling_moves_a_task_out_of_the_inbox() {
    let app = test_app().await;

    let task = create_task(&app, json!({"title":"Capture now"})).await;
    let id = task["id"].as_i64().expect("id");

    let (status, updated) = send(
        &app,
        json_req(
            "PATCH",
            &format!("/api/tasks/{id}"),
            json!({"due_date":"2026-06-30"}),
        ),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(updated["due_date"], "2026-06-30");

    // Gone from the Inbox, present on its day.
    let (_, inbox) = send(&app, get("/api/tasks?inbox=true")).await;
    assert_eq!(inbox.as_array().expect("array").len(), 0);
    let (_, day) = send(&app, get("/api/tasks?date=2026-06-30")).await;
    assert_eq!(day.as_array().expect("array").len(), 1);
}

#[tokio::test]
async fn patch_clears_a_field_with_explicit_null_but_keeps_omitted_ones() {
    let app = test_app().await;

    let task = create_task(
        &app,
        json!({"title":"Has notes","notes":"remember the map"}),
    )
    .await;
    let id = task["id"].as_i64().expect("id");

    // Explicit null clears notes; omitting title leaves it unchanged.
    let (status, updated) = send(
        &app,
        json_req("PATCH", &format!("/api/tasks/{id}"), json!({"notes":null})),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(updated["title"], "Has notes", "omitted title is preserved");
    assert_eq!(updated["notes"], Value::Null, "null cleared the notes");
}

#[tokio::test]
async fn complete_and_uncomplete_toggle_without_mutating_the_task() {
    let app = test_app().await;

    let task = create_task(&app, json!({"title":"Pitch tent","due_date":"2026-07-01"})).await;
    let id = task["id"].as_i64().expect("id");

    let (status, done) = send(
        &app,
        empty_req("POST", &format!("/api/tasks/{id}/completions")),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(done["completed"], true);
    assert_eq!(
        done["title"], "Pitch tent",
        "completion never mutates the task"
    );

    // Completing again is idempotent (no duplicate completion rows / errors).
    let (status, _) = send(
        &app,
        empty_req("POST", &format!("/api/tasks/{id}/completions")),
    )
    .await;
    assert_eq!(status, StatusCode::OK);

    let (_, day) = send(&app, get("/api/tasks?date=2026-07-01")).await;
    assert_eq!(day.as_array().expect("array")[0]["completed"], true);

    let (status, reopened) = send(
        &app,
        empty_req("DELETE", &format!("/api/tasks/{id}/completions")),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(reopened["completed"], false);
}

#[tokio::test]
async fn an_inbox_task_can_be_completed() {
    let app = test_app().await;

    let task = create_task(&app, json!({"title":"Someday"})).await;
    let id = task["id"].as_i64().expect("id");

    // due_date is NULL here, so the completion's occurrence_date is NULL too.
    let (status, done) = send(
        &app,
        empty_req("POST", &format!("/api/tasks/{id}/completions")),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(done["completed"], true);

    let (_, inbox) = send(&app, get("/api/tasks?inbox=true")).await;
    assert_eq!(inbox.as_array().expect("array")[0]["completed"], true);
}

#[tokio::test]
async fn day_view_sorts_timed_first_then_untimed_by_order() {
    let app = test_app().await;

    // Created out of order; all on the same day.
    create_task(&app, json!({"title":"Untimed A","due_date":"2026-06-24"})).await;
    create_task(
        &app,
        json!({"title":"Evening","due_date":"2026-06-24","due_time":"18:30"}),
    )
    .await;
    create_task(&app, json!({"title":"Untimed B","due_date":"2026-06-24"})).await;
    create_task(
        &app,
        json!({"title":"Morning","due_date":"2026-06-24","due_time":"08:00"}),
    )
    .await;

    let (_, day) = send(&app, get("/api/tasks?date=2026-06-24")).await;
    let titles: Vec<&str> = day
        .as_array()
        .expect("array")
        .iter()
        .map(|t| t["title"].as_str().expect("title"))
        .collect();
    // Timed first by time ascending, then untimed in creation (sort_order) order.
    assert_eq!(titles, ["Morning", "Evening", "Untimed A", "Untimed B"]);
}

#[tokio::test]
async fn range_returns_tasks_across_month_edges_in_day_then_time_order() {
    let app = test_app().await;

    // Inside the window, spanning a month boundary; created out of order.
    create_task(
        &app,
        json!({"title":"Jul 1 evening","due_date":"2026-07-01","due_time":"18:00"}),
    )
    .await;
    create_task(
        &app,
        json!({"title":"Jun 30 untimed","due_date":"2026-06-30"}),
    )
    .await;
    create_task(
        &app,
        json!({"title":"Jul 1 morning","due_date":"2026-07-01","due_time":"08:00"}),
    )
    .await;
    // Outside the window and in the Inbox — neither should appear.
    create_task(&app, json!({"title":"Too early","due_date":"2026-06-29"})).await;
    create_task(&app, json!({"title":"In the inbox"})).await;

    let (status, range) = send(&app, get("/api/tasks?from=2026-06-30&to=2026-07-01")).await;
    assert_eq!(status, StatusCode::OK);
    let titles: Vec<&str> = range
        .as_array()
        .expect("array")
        .iter()
        .map(|t| t["title"].as_str().expect("title"))
        .collect();
    // Sorted by day, then timed-first by time within the day.
    assert_eq!(titles, ["Jun 30 untimed", "Jul 1 morning", "Jul 1 evening"]);
}

#[tokio::test]
async fn range_with_no_tasks_in_window_is_empty() {
    let app = test_app().await;

    create_task(&app, json!({"title":"Far off","due_date":"2026-09-15"})).await;

    let (status, range) = send(&app, get("/api/tasks?from=2026-06-01&to=2026-06-30")).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(range.as_array().expect("array").len(), 0);
}

#[tokio::test]
async fn range_requires_both_bounds() {
    let app = test_app().await;

    let (status, _) = send(&app, get("/api/tasks?from=2026-06-01")).await;
    assert_eq!(status, StatusCode::BAD_REQUEST, "from without to");
    let (status, _) = send(&app, get("/api/tasks?to=2026-06-30")).await;
    assert_eq!(status, StatusCode::BAD_REQUEST, "to without from");
}

#[tokio::test]
async fn validation_rejects_blank_title_time_without_date_and_unknown_label() {
    let app = test_app().await;

    let (status, _) = send(&app, json_req("POST", "/api/tasks", json!({"title":"   "}))).await;
    assert_eq!(status, StatusCode::BAD_REQUEST, "blank title");

    let (status, _) = send(
        &app,
        json_req(
            "POST",
            "/api/tasks",
            json!({"title":"X","due_time":"09:00"}),
        ),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST, "time without a date");

    let (status, _) = send(
        &app,
        json_req("POST", "/api/tasks", json!({"title":"X","label_id":999})),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST, "unknown label");

    let (status, _) = send(
        &app,
        json_req(
            "POST",
            "/api/tasks",
            json!({"title":"X","due_date":"2026-13-40"}),
        ),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST, "impossible date");
}

#[tokio::test]
async fn a_recurring_task_expands_to_one_occurrence_per_day_in_range() {
    let app = test_app().await;

    // A daily task starting Jun 1; the series start is the DTSTART.
    let task = create_task(
        &app,
        json!({"title":"Stretch","due_date":"2026-06-01","recurrence_rule":"FREQ=DAILY"}),
    )
    .await;
    let id = task["id"].as_i64().expect("id");
    assert_eq!(task["recurrence_rule"], "FREQ=DAILY");

    let (status, range) = send(&app, get("/api/tasks?from=2026-06-01&to=2026-06-03")).await;
    assert_eq!(status, StatusCode::OK);
    let days = range.as_array().expect("array");
    assert_eq!(days.len(), 3, "one occurrence per day in the window");
    // Same task id across all occurrences; due_date stays the series start while
    // occurrence_date carries the instance — the (id, occurrence_date) key.
    for (i, expected) in ["2026-06-01", "2026-06-02", "2026-06-03"]
        .iter()
        .enumerate()
    {
        assert_eq!(days[i]["id"].as_i64(), Some(id));
        assert_eq!(days[i]["due_date"], "2026-06-01", "due_date is the DTSTART");
        assert_eq!(days[i]["occurrence_date"], *expected);
        assert_eq!(days[i]["completed"], false);
    }
}

#[tokio::test]
async fn completing_one_occurrence_leaves_the_others_open() {
    let app = test_app().await;

    let task = create_task(
        &app,
        json!({"title":"Water plants","due_date":"2026-06-01","recurrence_rule":"FREQ=DAILY"}),
    )
    .await;
    let id = task["id"].as_i64().expect("id");

    // Complete only the Jun 2 occurrence.
    let (status, done) = send(
        &app,
        empty_req(
            "POST",
            &format!("/api/tasks/{id}/completions?occurrence_date=2026-06-02"),
        ),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(done["completed"], true);
    assert_eq!(
        done["occurrence_date"], "2026-06-02",
        "the toggled occurrence is returned, not the series start"
    );

    // Only Jun 2 is done; Jun 1 and Jun 3 stay open.
    let (_, range) = send(&app, get("/api/tasks?from=2026-06-01&to=2026-06-03")).await;
    let days = range.as_array().expect("array");
    let done_for: Vec<bool> = days
        .iter()
        .map(|d| d["completed"].as_bool().expect("completed"))
        .collect();
    assert_eq!(done_for, [false, true, false]);

    // Reopen Jun 2.
    let (status, reopened) = send(
        &app,
        empty_req(
            "DELETE",
            &format!("/api/tasks/{id}/completions?occurrence_date=2026-06-02"),
        ),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(reopened["completed"], false);
    let (_, range) = send(&app, get("/api/tasks?from=2026-06-01&to=2026-06-03")).await;
    let any_done = range
        .as_array()
        .expect("array")
        .iter()
        .any(|d| d["completed"].as_bool().expect("completed"));
    assert!(!any_done, "reopening cleared the only completed occurrence");
}

#[tokio::test]
async fn weekly_byday_only_lands_on_chosen_weekdays() {
    let app = test_app().await;

    // 2026-06-01 is a Monday; repeat Mondays and Wednesdays.
    create_task(
        &app,
        json!({"title":"Class","due_date":"2026-06-01","recurrence_rule":"FREQ=WEEKLY;BYDAY=MO,WE"}),
    )
    .await;

    let (_, range) = send(&app, get("/api/tasks?from=2026-06-01&to=2026-06-07")).await;
    let dates: Vec<&str> = range
        .as_array()
        .expect("array")
        .iter()
        .map(|d| d["occurrence_date"].as_str().expect("occurrence_date"))
        .collect();
    assert_eq!(dates, ["2026-06-01", "2026-06-03"]);
}

#[tokio::test]
async fn for_date_includes_recurring_occurrences_alongside_one_offs() {
    let app = test_app().await;

    create_task(
        &app,
        json!({"title":"Daily standup","due_date":"2026-06-01","due_time":"09:00","recurrence_rule":"FREQ=DAILY"}),
    )
    .await;
    create_task(&app, json!({"title":"One-off","due_date":"2026-06-03"})).await;

    // Jun 3 is both a recurring occurrence (timed 09:00) and the one-off (untimed).
    let (_, day) = send(&app, get("/api/tasks?date=2026-06-03")).await;
    let titles: Vec<&str> = day
        .as_array()
        .expect("array")
        .iter()
        .map(|t| t["title"].as_str().expect("title"))
        .collect();
    // Timed recurring occurrence sorts before the untimed one-off.
    assert_eq!(titles, ["Daily standup", "One-off"]);
}

#[tokio::test]
async fn recurrence_validation_rejects_a_missing_date_or_a_bad_rule() {
    let app = test_app().await;

    let (status, _) = send(
        &app,
        json_req(
            "POST",
            "/api/tasks",
            json!({"title":"No start","recurrence_rule":"FREQ=DAILY"}),
        ),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST, "recurrence needs a date");

    let (status, _) = send(
        &app,
        json_req(
            "POST",
            "/api/tasks",
            json!({"title":"Bad rule","due_date":"2026-06-01","recurrence_rule":"FREQ=NONSENSE"}),
        ),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST, "rule must parse");
}

#[tokio::test]
async fn delete_removes_the_task_and_unknown_ids_are_404() {
    let app = test_app().await;

    let task = create_task(&app, json!({"title":"Temp"})).await;
    let id = task["id"].as_i64().expect("id");

    let (status, _) = send(&app, empty_req("DELETE", &format!("/api/tasks/{id}"))).await;
    assert_eq!(status, StatusCode::NO_CONTENT);

    let (_, inbox) = send(&app, get("/api/tasks?inbox=true")).await;
    assert_eq!(inbox.as_array().expect("array").len(), 0);

    let (status, _) = send(&app, empty_req("DELETE", "/api/tasks/9999")).await;
    assert_eq!(status, StatusCode::NOT_FOUND);
    let (status, _) = send(
        &app,
        json_req("PATCH", "/api/tasks/9999", json!({"title":"x"})),
    )
    .await;
    assert_eq!(status, StatusCode::NOT_FOUND);
    let (status, _) = send(&app, empty_req("POST", "/api/tasks/9999/completions")).await;
    assert_eq!(status, StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn search_matches_title_or_notes_case_insensitively() {
    let app = test_app().await;

    create_task(&app, json!({"title":"Buy hiking boots"})).await;
    create_task(
        &app,
        json!({"title":"Trip prep","notes":"reserve the BOOTS at the rental"}),
    )
    .await;
    create_task(&app, json!({"title":"Unrelated errand"})).await;

    // A lowercase query still matches "Boots"/"BOOTS" in title and notes.
    let (status, hits) = send(&app, get("/api/search?q=boots")).await;
    assert_eq!(status, StatusCode::OK);
    let titles: Vec<&str> = hits
        .as_array()
        .expect("array")
        .iter()
        .map(|t| t["title"].as_str().expect("title"))
        .collect();
    assert_eq!(titles, ["Buy hiking boots", "Trip prep"]);
}

#[tokio::test]
async fn search_treats_wildcards_in_the_term_as_literal_text() {
    let app = test_app().await;

    create_task(&app, json!({"title":"Pay 50% deposit"})).await;
    create_task(&app, json!({"title":"Read 50 pages"})).await;

    // The `%` is escaped, so it must match a literal percent — not "any chars".
    let (_, hits) = send(&app, get("/api/search?q=50%25")).await; // %25 = '%'
    let titles: Vec<&str> = hits
        .as_array()
        .expect("array")
        .iter()
        .map(|t| t["title"].as_str().expect("title"))
        .collect();
    assert_eq!(
        titles,
        ["Pay 50% deposit"],
        "the literal % matched only one"
    );
}

#[tokio::test]
async fn search_orders_by_due_date_then_title_with_inbox_last() {
    let app = test_app().await;

    create_task(&app, json!({"title":"trail: inbox one"})).await;
    create_task(
        &app,
        json!({"title":"trail: later","due_date":"2026-07-10"}),
    )
    .await;
    create_task(&app, json!({"title":"trail: soon","due_date":"2026-07-01"})).await;

    let (_, hits) = send(&app, get("/api/search?q=trail")).await;
    let titles: Vec<&str> = hits
        .as_array()
        .expect("array")
        .iter()
        .map(|t| t["title"].as_str().expect("title"))
        .collect();
    // Scheduled tasks by date ascending, then the undated Inbox task last.
    assert_eq!(titles, ["trail: soon", "trail: later", "trail: inbox one"]);
}

#[tokio::test]
async fn reorder_persists_a_new_manual_order_and_a_refetch_returns_it() {
    let app = test_app().await;

    // Three untimed Inbox tasks, created A, B, C (sort_order 0, 1, 2).
    let a = create_task(&app, json!({"title":"A"})).await["id"]
        .as_i64()
        .expect("id");
    let b = create_task(&app, json!({"title":"B"})).await["id"]
        .as_i64()
        .expect("id");
    let c = create_task(&app, json!({"title":"C"})).await["id"]
        .as_i64()
        .expect("id");

    let order = |inbox: &Value| -> Vec<String> {
        inbox
            .as_array()
            .expect("array")
            .iter()
            .map(|t| t["title"].as_str().expect("title").to_string())
            .collect()
    };

    // Starts in creation order.
    let (_, inbox) = send(&app, get("/api/tasks?inbox=true")).await;
    assert_eq!(order(&inbox), ["A", "B", "C"]);

    // Drag C to the front: C, A, B.
    let (status, _) = send(
        &app,
        json_req("PATCH", "/api/tasks/reorder", json!({"ids":[c, a, b]})),
    )
    .await;
    assert_eq!(status, StatusCode::NO_CONTENT);

    // A re-fetch returns the new order.
    let (_, inbox) = send(&app, get("/api/tasks?inbox=true")).await;
    assert_eq!(order(&inbox), ["C", "A", "B"]);
}

#[tokio::test]
async fn reorder_keeps_timed_tasks_time_sorted_and_rolls_back_unknown_ids() {
    let app = test_app().await;

    // One day: two timed (sort by time) and two untimed (sort by manual order).
    create_task(
        &app,
        json!({"title":"Morning","due_date":"2026-06-24","due_time":"08:00"}),
    )
    .await;
    create_task(
        &app,
        json!({"title":"Evening","due_date":"2026-06-24","due_time":"18:00"}),
    )
    .await;
    let untimed_a = create_task(&app, json!({"title":"Untimed A","due_date":"2026-06-24"})).await
        ["id"]
        .as_i64()
        .expect("id");
    let untimed_b = create_task(&app, json!({"title":"Untimed B","due_date":"2026-06-24"})).await
        ["id"]
        .as_i64()
        .expect("id");

    let titles = |day: &Value| -> Vec<String> {
        day.as_array()
            .expect("array")
            .iter()
            .map(|t| t["title"].as_str().expect("title").to_string())
            .collect()
    };

    // Reorder the untimed pair so B precedes A.
    let (status, _) = send(
        &app,
        json_req(
            "PATCH",
            "/api/tasks/reorder",
            json!({"ids":[untimed_b, untimed_a]}),
        ),
    )
    .await;
    assert_eq!(status, StatusCode::NO_CONTENT);

    let (_, day) = send(&app, get("/api/tasks?date=2026-06-24")).await;
    // Timed first by time; untimed now B before A.
    assert_eq!(
        titles(&day),
        ["Morning", "Evening", "Untimed B", "Untimed A"]
    );

    // An unknown id 404s and the whole batch rolls back (order unchanged).
    let (status, _) = send(
        &app,
        json_req(
            "PATCH",
            "/api/tasks/reorder",
            json!({"ids":[untimed_a, 9999]}),
        ),
    )
    .await;
    assert_eq!(status, StatusCode::NOT_FOUND);

    let (_, day) = send(&app, get("/api/tasks?date=2026-06-24")).await;
    assert_eq!(
        titles(&day),
        ["Morning", "Evening", "Untimed B", "Untimed A"],
        "the failed reorder changed nothing"
    );
}

#[tokio::test]
async fn search_with_blank_or_missing_query_is_an_empty_list() {
    let app = test_app().await;

    create_task(&app, json!({"title":"Something"})).await;

    for uri in ["/api/search", "/api/search?q=", "/api/search?q=%20%20"] {
        let (status, hits) = send(&app, get(uri)).await;
        assert_eq!(status, StatusCode::OK, "{uri} should be OK");
        assert_eq!(
            hits.as_array().expect("array").len(),
            0,
            "{uri} should return no rows"
        );
    }
}
