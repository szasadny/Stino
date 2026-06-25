//! Integration tests for the TickTick CSV import, driven through the real router
//! against a fresh in-memory SQLite database (migrations applied per test).

use axum::body::Body;
use axum::http::{Request, StatusCode};
use axum::Router;
use http_body_util::BodyExt;
use serde_json::Value;
use sqlx::sqlite::SqlitePoolOptions;
use std::path::Path;
use tower::ServiceExt;

use stino_backend::routes;

async fn test_app() -> Router {
    let pool = SqlitePoolOptions::new()
        .min_connections(1)
        .max_connections(1)
        .connect("sqlite::memory:")
        .await
        .expect("open in-memory sqlite");
    sqlx::migrate!().run(&pool).await.expect("run migrations");
    routes::router(pool, Path::new("."))
}

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

fn get(uri: &str) -> Request<Body> {
    Request::builder()
        .method("GET")
        .uri(uri)
        .body(Body::empty())
        .expect("build request")
}

/// POST a raw CSV body to the import endpoint, exactly as the SPA uploads a file.
fn import_req(csv: &str) -> Request<Body> {
    Request::builder()
        .method("POST")
        .uri("/api/import/ticktick")
        .header("content-type", "text/csv")
        .body(Body::from(csv.to_string()))
        .expect("build request")
}

/// A small but representative TickTick export: a preamble + blank line before the
/// header, an all-day task, a completed timed task, a recurring task that takes
/// its label from the List (no tags), a titleless row that must be skipped, and
/// an undated Inbox note whose "Inbox" list must NOT become a label.
const FIXTURE: &str = r#""Date: 2026-06-25+0000"
"Version: 7.1"
"Status: 0 Normal, 1 Completed, 2 Archived"

"Folder Name","List Name","Title","Tags","Content","Is Check list","Start Date","Due Date","Reminder","Repeat","Priority","Status","Created Time","Completed Time","Order","Timezone","Is All Day","Is Floating"
"","Inbox","Buy boots","gear","Need new boots","false","","2026-06-26T00:00:00+0000","","","0","0","2026-06-20T10:00:00+0000","","1","Europe/Amsterdam","true","false"
"","Health","Stretch","health","","false","","2026-06-27T07:30:00+0000","","","0","1","2026-06-21T08:00:00+0000","2026-06-27T07:35:00+0000","2","Europe/Amsterdam","false","false"
"","Work","Standup","","","false","","2026-06-29T09:00:00+0000","","RRULE:FREQ=WEEKLY;INTERVAL=1;BYDAY=MO","0","0","2026-06-21T08:00:00+0000","","3","Europe/Amsterdam","false","false"
"","Work","","","","false","","","","","0","0","","","4","Europe/Amsterdam","false","false"
"","Inbox","Loose note","","just a thought","false","","","","","0","0","2026-06-22T09:00:00+0000","","5","Europe/Amsterdam","false","false"
"#;

fn titled<'a>(tasks: &'a Value, title: &str) -> Vec<&'a Value> {
    tasks
        .as_array()
        .expect("array")
        .iter()
        .filter(|t| t["title"] == title)
        .collect()
}

#[tokio::test]
async fn imports_tasks_labels_and_completions_with_a_skipped_row() {
    let app = test_app().await;

    let (status, summary) = send(&app, import_req(FIXTURE)).await;
    assert_eq!(status, StatusCode::OK, "import failed: {summary}");
    assert_eq!(summary["created"]["tasks"], 4);
    assert_eq!(summary["created"]["labels"], 3); // gear, health, Work — never "Inbox"
    assert_eq!(summary["created"]["completions"], 1);
    assert_eq!(summary["skipped"], 1); // the titleless row

    // Labels were created on demand; the "Inbox" list did not become a label.
    let (_, labels) = send(&app, get("/api/labels")).await;
    let names: Vec<&str> = labels
        .as_array()
        .unwrap()
        .iter()
        .map(|l| l["name"].as_str().unwrap())
        .collect();
    assert_eq!(names.len(), 3);
    assert!(names.contains(&"gear") && names.contains(&"health") && names.contains(&"Work"));
    assert!(!names.contains(&"Inbox"));

    // The undated note is the only Inbox task, and it carries no label.
    let (_, inbox) = send(&app, get("/api/tasks?inbox=true")).await;
    assert_eq!(inbox.as_array().unwrap().len(), 1);
    assert_eq!(inbox[0]["title"], "Loose note");
    assert_eq!(inbox[0]["label_id"], Value::Null);
}

#[tokio::test]
async fn all_day_and_timed_tasks_keep_their_literal_date_and_time() {
    let app = test_app().await;
    send(&app, import_req(FIXTURE)).await;

    // All-day task: the date is kept literally, with no time and not shifted.
    let (_, june26) = send(&app, get("/api/tasks?date=2026-06-26")).await;
    let boots = titled(&june26, "Buy boots");
    assert_eq!(boots.len(), 1);
    assert_eq!(boots[0]["due_date"], "2026-06-26");
    assert_eq!(boots[0]["due_time"], Value::Null);
    assert_eq!(boots[0]["completed"], false);

    // Completed timed task: the wall-clock time is kept and it shows as done.
    let (_, june27) = send(&app, get("/api/tasks?date=2026-06-27")).await;
    let stretch = titled(&june27, "Stretch");
    assert_eq!(stretch.len(), 1);
    assert_eq!(stretch[0]["due_time"], "07:30");
    assert_eq!(stretch[0]["completed"], true);
}

#[tokio::test]
async fn recurring_task_expands_across_the_window() {
    let app = test_app().await;
    send(&app, import_req(FIXTURE)).await;

    // Weekly-on-Monday from 2026-06-29: three Mondays through 2026-07-13.
    let (_, range) = send(&app, get("/api/tasks?from=2026-06-29&to=2026-07-13")).await;
    let standups = titled(&range, "Standup");
    assert_eq!(standups.len(), 3, "expected three weekly occurrences");
    assert_eq!(standups[0]["occurrence_date"], "2026-06-29");
    assert_eq!(
        standups[0]["recurrence_rule"],
        "FREQ=WEEKLY;INTERVAL=1;BYDAY=MO"
    );
    assert_eq!(standups[0]["due_time"], "09:00");
}

#[tokio::test]
async fn re_running_appends_tasks_but_dedupes_labels() {
    let app = test_app().await;
    send(&app, import_req(FIXTURE)).await;
    let (status, summary) = send(&app, import_req(FIXTURE)).await;
    assert_eq!(status, StatusCode::OK, "second import failed: {summary}");

    // Add-only: tasks doubled, but labels are reused (deduped by name).
    assert_eq!(summary["created"]["tasks"], 4);
    assert_eq!(summary["created"]["labels"], 0);

    let (_, labels) = send(&app, get("/api/labels")).await;
    assert_eq!(labels.as_array().unwrap().len(), 3);
}

#[tokio::test]
async fn a_file_without_a_header_is_a_clean_validation_error() {
    let app = test_app().await;
    let (status, body) = send(&app, import_req("just some text\nnot a csv export\n")).await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert!(body["error"].as_str().unwrap().contains("TickTick"));
}
