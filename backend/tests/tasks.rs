//! Integration tests for the task API, driven through the real router against a
//! fresh in-memory SQLite database (migrations applied per test for isolation).

use axum::http::StatusCode;
use axum::Router;
use serde_json::{json, Value};

mod common;
use common::*;

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
async fn rescheduling_a_completed_task_keeps_it_completed() {
    let app = test_app().await;

    // Complete a task on its due day, then drag it to another day.
    let task = create_task(&app, json!({"title":"Chop wood","due_date":"2026-07-01"})).await;
    let id = task["id"].as_i64().expect("id");
    send(
        &app,
        empty_req("POST", &format!("/api/tasks/{id}/completions")),
    )
    .await;

    let (status, moved) = send(
        &app,
        json_req(
            "PATCH",
            &format!("/api/tasks/{id}"),
            json!({"due_date":"2026-07-08"}),
        ),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(moved["due_date"], "2026-07-08");
    assert_eq!(
        moved["completed"], true,
        "the completion follows the task to its new day"
    );

    // It is done on the new day and absent from the old one.
    let (_, new_day) = send(&app, get("/api/tasks?date=2026-07-08")).await;
    let new_day = new_day.as_array().expect("array");
    assert_eq!(new_day.len(), 1);
    assert_eq!(new_day[0]["completed"], true);

    let (_, old_day) = send(&app, get("/api/tasks?date=2026-07-01")).await;
    assert!(
        old_day.as_array().expect("array").is_empty(),
        "the task no longer lives on the old day"
    );
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
async fn moving_one_occurrence_detaches_it_and_leaves_the_series_repeating() {
    let app = test_app().await;

    // A labeled, weekly-on-Mondays series from Jun 1 2026 (a Monday): Jun 1, 8, 15, 22, 29.
    let (status, label) = send(
        &app,
        json_req(
            "POST",
            "/api/labels",
            json!({"name":"Work","color":"#2F5D50"}),
        ),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED, "label create failed: {label}");
    let label_id = label["id"].as_i64().expect("label id");

    let task = create_task(
        &app,
        json!({"title":"Standup","due_date":"2026-06-01","label_id":label_id,"recurrence_rule":"FREQ=WEEKLY;BYDAY=MO"}),
    )
    .await;
    let id = task["id"].as_i64().expect("id");

    // Drag the Jun 8 instance to Jun 10 (a Wednesday — not itself an occurrence).
    let (status, moved) = send(
        &app,
        json_req(
            "POST",
            &format!("/api/tasks/{id}/move_occurrence"),
            json!({"occurrence_date":"2026-06-08","new_date":"2026-06-10"}),
        ),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED, "move failed: {moved}");
    let new_id = moved["id"].as_i64().expect("new id");
    assert_ne!(
        new_id, id,
        "the moved instance becomes its own one-off task"
    );
    assert_eq!(moved["title"], "Standup");
    assert_eq!(moved["due_date"], "2026-06-10");
    assert_eq!(
        moved["label_id"].as_i64(),
        Some(label_id),
        "the detached copy carries the series' label"
    );
    assert_eq!(
        moved["recurrence_rule"],
        Value::Null,
        "the detached copy does not repeat"
    );

    // The series still repeats every other Monday; only Jun 8 is gone.
    let (_, range) = send(&app, get("/api/tasks?from=2026-06-01&to=2026-06-15")).await;
    let days = range.as_array().expect("array");
    let series_dates: Vec<&str> = days
        .iter()
        .filter(|d| d["id"].as_i64() == Some(id))
        .map(|d| d["occurrence_date"].as_str().expect("occurrence_date"))
        .collect();
    assert_eq!(
        series_dates,
        ["2026-06-01", "2026-06-15"],
        "Jun 8 detached; the rest keep repeating"
    );

    // Jun 10 now carries the detached one-off, and nothing else.
    let detached: Vec<&Value> = days
        .iter()
        .filter(|d| d["occurrence_date"] == "2026-06-10")
        .collect();
    assert_eq!(detached.len(), 1);
    assert_eq!(detached[0]["id"].as_i64(), Some(new_id));
    assert_eq!(detached[0]["recurrence_rule"], Value::Null);
}

#[tokio::test]
async fn moving_an_occurrence_of_a_non_recurring_task_is_rejected() {
    let app = test_app().await;
    let task = create_task(&app, json!({"title":"One-off","due_date":"2026-06-01"})).await;
    let id = task["id"].as_i64().expect("id");

    let (status, _) = send(
        &app,
        json_req(
            "POST",
            &format!("/api/tasks/{id}/move_occurrence"),
            json!({"occurrence_date":"2026-06-01","new_date":"2026-06-02"}),
        ),
    )
    .await;
    assert_eq!(
        status,
        StatusCode::BAD_REQUEST,
        "only a recurring task's occurrence can be moved"
    );
}

#[tokio::test]
async fn moving_a_date_that_is_not_an_occurrence_is_rejected() {
    let app = test_app().await;

    // Weekly on Mondays from Jun 1; Jun 3 2026 is a Wednesday — not an occurrence.
    let task = create_task(
        &app,
        json!({"title":"Standup","due_date":"2026-06-01","recurrence_rule":"FREQ=WEEKLY;BYDAY=MO"}),
    )
    .await;
    let id = task["id"].as_i64().expect("id");

    let (status, _) = send(
        &app,
        json_req(
            "POST",
            &format!("/api/tasks/{id}/move_occurrence"),
            json!({"occurrence_date":"2026-06-03","new_date":"2026-06-10"}),
        ),
    )
    .await;
    assert_eq!(
        status,
        StatusCode::BAD_REQUEST,
        "Jun 3 is not a Monday occurrence of the series"
    );
}

#[tokio::test]
async fn moving_an_occurrence_to_its_own_day_changes_nothing() {
    let app = test_app().await;

    // Weekly on Mondays from Jun 1: Jun 1, 8, 15 in the window.
    let task = create_task(
        &app,
        json!({"title":"Standup","due_date":"2026-06-01","recurrence_rule":"FREQ=WEEKLY;BYDAY=MO"}),
    )
    .await;
    let id = task["id"].as_i64().expect("id");

    // Moving Jun 8 onto Jun 8 is a no-op: no exception, no detached one-off.
    let (status, _) = send(
        &app,
        json_req(
            "POST",
            &format!("/api/tasks/{id}/move_occurrence"),
            json!({"occurrence_date":"2026-06-08","new_date":"2026-06-08"}),
        ),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED);

    let (_, range) = send(&app, get("/api/tasks?from=2026-06-01&to=2026-06-15")).await;
    let days = range.as_array().expect("array");
    assert_eq!(
        days.len(),
        3,
        "the series still lands on all three Mondays; nothing was detached"
    );
    assert!(
        days.iter().all(|d| d["id"].as_i64() == Some(id)),
        "every row is still the series — no one-off copy was created"
    );
}

#[tokio::test]
async fn moving_the_same_occurrence_twice_is_rejected() {
    let app = test_app().await;

    // Weekly on Mondays from Jun 1: Jun 1, 8, 15 in the window.
    let task = create_task(
        &app,
        json!({"title":"Standup","due_date":"2026-06-01","recurrence_rule":"FREQ=WEEKLY;BYDAY=MO"}),
    )
    .await;
    let id = task["id"].as_i64().expect("id");

    // First move detaches Jun 8 onto Jun 10.
    let (status, _) = send(
        &app,
        json_req(
            "POST",
            &format!("/api/tasks/{id}/move_occurrence"),
            json!({"occurrence_date":"2026-06-08","new_date":"2026-06-10"}),
        ),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED);

    // Re-moving the now-detached Jun 8 must be rejected, not create a second one-off.
    let (status, _) = send(
        &app,
        json_req(
            "POST",
            &format!("/api/tasks/{id}/move_occurrence"),
            json!({"occurrence_date":"2026-06-08","new_date":"2026-06-12"}),
        ),
    )
    .await;
    assert_eq!(
        status,
        StatusCode::BAD_REQUEST,
        "Jun 8 was already detached; re-moving it must not orphan a duplicate one-off"
    );

    // Exactly one detached one-off exists (on Jun 10); Jun 12 has nothing.
    let (_, range) = send(&app, get("/api/tasks?from=2026-06-01&to=2026-06-15")).await;
    let days = range.as_array().expect("array");
    let detached: Vec<&Value> = days
        .iter()
        .filter(|d| d["id"].as_i64() != Some(id))
        .collect();
    assert_eq!(detached.len(), 1, "only the first move's one-off exists");
    assert_eq!(detached[0]["due_date"], "2026-06-10");
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
async fn a_monthly_ordinal_weekday_task_expands_across_a_range() {
    let app = test_app().await;

    // First Monday of every month; series starts Jan 1 2026 (a Thursday).
    let task = create_task(
        &app,
        json!({"title":"Pay rent","due_date":"2026-01-01","recurrence_rule":"FREQ=MONTHLY;BYDAY=MO;BYSETPOS=1"}),
    )
    .await;
    let id = task["id"].as_i64().expect("id");

    let (status, range) = send(&app, get("/api/tasks?from=2026-01-01&to=2026-03-31")).await;
    assert_eq!(status, StatusCode::OK);
    let days = range.as_array().expect("array");
    let dates: Vec<&str> = days
        .iter()
        .map(|d| d["occurrence_date"].as_str().expect("occurrence_date"))
        .collect();
    assert_eq!(dates, ["2026-01-05", "2026-02-02", "2026-03-02"]);
    for d in days {
        assert_eq!(d["id"].as_i64(), Some(id));
        assert_eq!(d["due_date"], "2026-01-01", "due_date stays the DTSTART");
    }
}

#[tokio::test]
async fn completing_one_monthly_occurrence_leaves_the_others_open() {
    let app = test_app().await;

    let task = create_task(
        &app,
        json!({"title":"Report","due_date":"2026-01-01","recurrence_rule":"FREQ=MONTHLY;BYDAY=MO;BYSETPOS=1"}),
    )
    .await;
    let id = task["id"].as_i64().expect("id");

    // Complete only the Feb 2 occurrence.
    let (status, done) = send(
        &app,
        empty_req(
            "POST",
            &format!("/api/tasks/{id}/completions?occurrence_date=2026-02-02"),
        ),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(done["completed"], true);

    let (_, range) = send(&app, get("/api/tasks?from=2026-01-01&to=2026-03-31")).await;
    let done_for: Vec<bool> = range
        .as_array()
        .expect("array")
        .iter()
        .map(|d| d["completed"].as_bool().expect("completed"))
        .collect();
    assert_eq!(done_for, [false, true, false]);

    // Reopen Feb 2.
    let (status, reopened) = send(
        &app,
        empty_req(
            "DELETE",
            &format!("/api/tasks/{id}/completions?occurrence_date=2026-02-02"),
        ),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(reopened["completed"], false);
}

#[tokio::test]
async fn a_monthly_last_day_task_tracks_short_months() {
    let app = test_app().await;

    // BYMONTHDAY=-1 must validate and yield the real last day of each month.
    create_task(
        &app,
        json!({"title":"Close books","due_date":"2026-01-01","recurrence_rule":"FREQ=MONTHLY;BYMONTHDAY=-1"}),
    )
    .await;

    let (_, range) = send(&app, get("/api/tasks?from=2026-01-01&to=2026-03-31")).await;
    let dates: Vec<&str> = range
        .as_array()
        .expect("array")
        .iter()
        .map(|d| d["occurrence_date"].as_str().expect("occurrence_date"))
        .collect();
    assert_eq!(dates, ["2026-01-31", "2026-02-28", "2026-03-31"]);
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

// --- Bulk edit (Inbox multi-select) ---

async fn create_label(app: &Router, name: &str, color: &str) -> i64 {
    let (status, label) = send(
        app,
        json_req("POST", "/api/labels", json!({"name": name, "color": color})),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED, "create label failed: {label}");
    label["id"].as_i64().expect("label id")
}

#[tokio::test]
async fn batch_sets_a_label_on_many_tasks_and_clears_it_again() {
    let app = test_app().await;
    let label = create_label(&app, "Errands", "#6F8F6B").await;

    let a = create_task(&app, json!({"title":"A"})).await["id"]
        .as_i64()
        .expect("id");
    let b = create_task(&app, json!({"title":"B"})).await["id"]
        .as_i64()
        .expect("id");
    let c = create_task(&app, json!({"title":"C"})).await["id"]
        .as_i64()
        .expect("id");

    // Label A and B (leave C untouched).
    let (status, _) = send(
        &app,
        json_req(
            "POST",
            "/api/tasks/batch",
            json!({"ids":[a, b], "op":{"type":"label","label_id":label}}),
        ),
    )
    .await;
    assert_eq!(status, StatusCode::NO_CONTENT);

    let (_, inbox) = send(&app, get("/api/tasks?inbox=true")).await;
    let label_of = |id: i64| -> Value {
        inbox
            .as_array()
            .expect("array")
            .iter()
            .find(|t| t["id"].as_i64() == Some(id))
            .expect("task present")["label_id"]
            .clone()
    };
    assert_eq!(label_of(a), json!(label));
    assert_eq!(label_of(b), json!(label));
    assert_eq!(label_of(c), Value::Null, "C was not in the batch");

    // A null label clears it on the selected tasks.
    let (status, _) = send(
        &app,
        json_req(
            "POST",
            "/api/tasks/batch",
            json!({"ids":[a, b], "op":{"type":"label","label_id":null}}),
        ),
    )
    .await;
    assert_eq!(status, StatusCode::NO_CONTENT);
    let (_, inbox) = send(&app, get("/api/tasks?inbox=true")).await;
    for t in inbox.as_array().expect("array") {
        assert_eq!(t["label_id"], Value::Null, "all labels cleared");
    }
}

#[tokio::test]
async fn batch_schedule_moves_tasks_out_of_the_inbox_onto_a_day() {
    let app = test_app().await;
    let a = create_task(&app, json!({"title":"A"})).await["id"]
        .as_i64()
        .expect("id");
    let b = create_task(&app, json!({"title":"B"})).await["id"]
        .as_i64()
        .expect("id");

    let (status, _) = send(
        &app,
        json_req(
            "POST",
            "/api/tasks/batch",
            json!({"ids":[a, b], "op":{"type":"schedule","due_date":"2026-07-04"}}),
        ),
    )
    .await;
    assert_eq!(status, StatusCode::NO_CONTENT);

    // Both gone from the Inbox, both on their new day.
    let (_, inbox) = send(&app, get("/api/tasks?inbox=true")).await;
    assert_eq!(inbox.as_array().expect("array").len(), 0);
    let (_, day) = send(&app, get("/api/tasks?date=2026-07-04")).await;
    assert_eq!(day.as_array().expect("array").len(), 2);
}

#[tokio::test]
async fn batch_complete_marks_every_selected_task_done() {
    let app = test_app().await;
    let a = create_task(&app, json!({"title":"A"})).await["id"]
        .as_i64()
        .expect("id");
    let b = create_task(&app, json!({"title":"B"})).await["id"]
        .as_i64()
        .expect("id");

    let (status, _) = send(
        &app,
        json_req(
            "POST",
            "/api/tasks/batch",
            json!({"ids":[a, b], "op":{"type":"complete"}}),
        ),
    )
    .await;
    assert_eq!(status, StatusCode::NO_CONTENT);

    // Completed Inbox tasks stay in the list, but flagged done.
    let (_, inbox) = send(&app, get("/api/tasks?inbox=true")).await;
    for t in inbox.as_array().expect("array") {
        assert_eq!(t["completed"], true);
    }

    // Re-completing is idempotent (the guarded insert is a no-op).
    let (status, _) = send(
        &app,
        json_req(
            "POST",
            "/api/tasks/batch",
            json!({"ids":[a, b], "op":{"type":"complete"}}),
        ),
    )
    .await;
    assert_eq!(status, StatusCode::NO_CONTENT);
}

#[tokio::test]
async fn batch_delete_removes_every_selected_task() {
    let app = test_app().await;
    let a = create_task(&app, json!({"title":"A"})).await["id"]
        .as_i64()
        .expect("id");
    let b = create_task(&app, json!({"title":"B"})).await["id"]
        .as_i64()
        .expect("id");
    create_task(&app, json!({"title":"Keep"})).await;

    let (status, _) = send(
        &app,
        json_req(
            "POST",
            "/api/tasks/batch",
            json!({"ids":[a, b], "op":{"type":"delete"}}),
        ),
    )
    .await;
    assert_eq!(status, StatusCode::NO_CONTENT);

    let (_, inbox) = send(&app, get("/api/tasks?inbox=true")).await;
    let titles: Vec<&str> = inbox
        .as_array()
        .expect("array")
        .iter()
        .map(|t| t["title"].as_str().expect("title"))
        .collect();
    assert_eq!(titles, ["Keep"], "only the unselected task remains");
}

#[tokio::test]
async fn batch_with_an_unknown_id_rolls_the_whole_batch_back() {
    let app = test_app().await;
    let label = create_label(&app, "Tag", "#6F8F6B").await;
    let a = create_task(&app, json!({"title":"A"})).await["id"]
        .as_i64()
        .expect("id");

    // One real id and one bogus id: the batch must 404 and change nothing.
    let (status, _) = send(
        &app,
        json_req(
            "POST",
            "/api/tasks/batch",
            json!({"ids":[a, 9999], "op":{"type":"label","label_id":label}}),
        ),
    )
    .await;
    assert_eq!(status, StatusCode::NOT_FOUND);

    let (_, inbox) = send(&app, get("/api/tasks?inbox=true")).await;
    assert_eq!(
        inbox.as_array().expect("array")[0]["label_id"],
        Value::Null,
        "the failed batch left A unlabeled"
    );

    // Same atomicity for delete: A survives a batch that references a bad id.
    let (status, _) = send(
        &app,
        json_req(
            "POST",
            "/api/tasks/batch",
            json!({"ids":[a, 9999], "op":{"type":"delete"}}),
        ),
    )
    .await;
    assert_eq!(status, StatusCode::NOT_FOUND);
    let (_, inbox) = send(&app, get("/api/tasks?inbox=true")).await;
    assert_eq!(
        inbox.as_array().expect("array").len(),
        1,
        "A was not deleted"
    );
}

#[tokio::test]
async fn batch_rejects_a_bad_date_or_an_unknown_label() {
    let app = test_app().await;
    let a = create_task(&app, json!({"title":"A"})).await["id"]
        .as_i64()
        .expect("id");

    let (status, _) = send(
        &app,
        json_req(
            "POST",
            "/api/tasks/batch",
            json!({"ids":[a], "op":{"type":"schedule","due_date":"2026-13-40"}}),
        ),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST, "impossible date");

    let (status, _) = send(
        &app,
        json_req(
            "POST",
            "/api/tasks/batch",
            json!({"ids":[a], "op":{"type":"label","label_id":999}}),
        ),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST, "unknown label");

    // The rejected ops left A unchanged in the Inbox.
    let (_, inbox) = send(&app, get("/api/tasks?inbox=true")).await;
    let task = &inbox.as_array().expect("array")[0];
    assert_eq!(task["due_date"], Value::Null);
    assert_eq!(task["label_id"], Value::Null);
}

#[tokio::test]
async fn batch_with_no_ids_is_a_harmless_no_op() {
    let app = test_app().await;
    create_task(&app, json!({"title":"A"})).await;

    let (status, _) = send(
        &app,
        json_req(
            "POST",
            "/api/tasks/batch",
            json!({"ids":[], "op":{"type":"delete"}}),
        ),
    )
    .await;
    assert_eq!(status, StatusCode::NO_CONTENT);

    let (_, inbox) = send(&app, get("/api/tasks?inbox=true")).await;
    assert_eq!(inbox.as_array().expect("array").len(), 1, "nothing deleted");
}
