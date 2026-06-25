//! Integration tests for the TickTick CSV import, driven through the real router
//! against a fresh in-memory SQLite database (migrations applied per test).

use axum::body::Body;
use axum::http::{Request, StatusCode};
use serde_json::Value;

mod common;
use common::*;

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
async fn all_day_keeps_its_date_and_timed_tasks_convert_into_the_export_timezone() {
    let app = test_app().await;
    send(&app, import_req(FIXTURE)).await;

    // All-day task: the date is kept literally, with no time and not shifted.
    let (_, june26) = send(&app, get("/api/tasks?date=2026-06-26")).await;
    let boots = titled(&june26, "Buy boots");
    assert_eq!(boots.len(), 1);
    assert_eq!(boots[0]["due_date"], "2026-06-26");
    assert_eq!(boots[0]["due_time"], Value::Null);
    assert_eq!(boots[0]["completed"], false);

    // Completed timed task: the UTC instant (07:30+0000) is converted into the
    // export's Europe/Amsterdam zone (CEST, +2 in June) → 09:30, same day, done.
    let (_, june27) = send(&app, get("/api/tasks?date=2026-06-27")).await;
    let stretch = titled(&june27, "Stretch");
    assert_eq!(stretch.len(), 1);
    assert_eq!(stretch[0]["due_time"], "09:30");
    assert_eq!(stretch[0]["completed"], true);
}

#[tokio::test]
async fn an_early_morning_timed_task_imports_on_the_correct_local_day() {
    // Regression for the "imported a day too soon" bug: a task at 00:30 Amsterdam
    // time on Jun 25 is exported as the *previous* UTC day (22:30 on Jun 24).
    // Reading the UTC string literally put it on Jun 24; converting into the
    // export's timezone must land it back on Jun 25 at 00:30.
    let csv = r#""Date: 2026-06-25+0000"

"Folder Name","List Name","Title","Tags","Content","Is Check list","Start Date","Due Date","Reminder","Repeat","Priority","Status","Created Time","Completed Time","Order","Timezone","Is All Day","Is Floating"
"","Work","Midnight ping","","","false","","2026-06-24T22:30:00+0000","","","0","0","2026-06-21T08:00:00+0000","","1","Europe/Amsterdam","false","false"
"#;
    let app = test_app().await;
    let (status, summary) = send(&app, import_req(csv)).await;
    assert_eq!(status, StatusCode::OK, "import failed: {summary}");

    // Not on Jun 24 (the literal UTC day)...
    let (_, june24) = send(&app, get("/api/tasks?date=2026-06-24")).await;
    assert!(titled(&june24, "Midnight ping").is_empty());
    // ...but on Jun 25, the real local day, at 00:30.
    let (_, june25) = send(&app, get("/api/tasks?date=2026-06-25")).await;
    let ping = titled(&june25, "Midnight ping");
    assert_eq!(ping.len(), 1);
    assert_eq!(ping[0]["due_date"], "2026-06-25");
    assert_eq!(ping[0]["due_time"], "00:30");
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
    // 09:00+0000 converted into the export's Europe/Amsterdam zone (CEST) → 11:00.
    assert_eq!(standups[0]["due_time"], "11:00");
}

#[tokio::test]
async fn a_recurrence_with_an_until_end_date_imports_and_stops_on_time() {
    // Regression: TickTick exports a recurrence end date as a bare `UNTIL=YYYYMMDD`
    // (an RFC-5545 DATE value). Before the fix, the `rrule` build rejected it
    // against our UTC-midnight DATE-TIME DTSTART, so every "repeat until" task
    // silently lost its recurrence on import. It must now import and expand, with
    // occurrences stopping on (and including) the UNTIL date.
    let csv = r#""Date: 2026-06-25+0000"

"Folder Name","List Name","Title","Tags","Content","Is Check list","Start Date","Due Date","Reminder","Repeat","Priority","Status","Created Time","Completed Time","Order","Timezone","Is All Day","Is Floating"
"","Work","Sprint","","","false","","2026-06-29T09:00:00+0000","","RRULE:FREQ=WEEKLY;WKST=MO;UNTIL=20260713;INTERVAL=1;BYDAY=MO","0","0","2026-06-21T08:00:00+0000","","1","Europe/Amsterdam","false","false"
"#;
    let app = test_app().await;
    let (status, summary) = send(&app, import_req(csv)).await;
    assert_eq!(status, StatusCode::OK, "import failed: {summary}");
    assert_eq!(summary["created"]["tasks"], 1);

    // The recurrence survived import (the rule is stored, not dropped)...
    let (_, range) = send(&app, get("/api/tasks?from=2026-06-29&to=2026-08-31")).await;
    let sprints = titled(&range, "Sprint");
    // ...and stops on its UNTIL date: three Mondays (29 Jun, 6 + 13 Jul), no more.
    assert_eq!(sprints.len(), 3, "expected the series to stop at UNTIL");
    assert_eq!(sprints[0]["occurrence_date"], "2026-06-29");
    assert_eq!(sprints[2]["occurrence_date"], "2026-07-13");
    assert_eq!(
        sprints[0]["recurrence_rule"],
        "FREQ=WEEKLY;WKST=MO;UNTIL=20260713;INTERVAL=1;BYDAY=MO"
    );
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
