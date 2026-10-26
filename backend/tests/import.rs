use axum::body::Body;
use axum::http::{Request, StatusCode};
use serde_json::Value;

mod common;
use common::*;

fn import_req(csv: &str) -> Request<Body> {
    Request::builder()
        .method("POST")
        .uri("/api/import/ticktick")
        .header("content-type", "text/csv")
        .body(Body::from(csv.to_string()))
        .expect("build request")
}

/// Covers a preamble, all-day, completed timed, List-labelled recurring, titleless
/// (skipped), and an undated note whose "Inbox" list must not become a label.
const FIXTURE: &str = r#""Date: 2026-06-25+0000"
"Version: 7.1"
"Status: 0 Normal, 1 Completed, 2 Archived"

"Folder Name","List Name","Title","Tags","Content","Is Check list","Start Date","Due Date","Reminder","Repeat","Priority","Status","Created Time","Completed Time","Order","Timezone","Is All Day","Is Floating"
"","Inbox","Buy boots","gear","Need new boots","false","","2026-06-25T22:00:00+0000","","","0","0","2026-06-20T10:00:00+0000","","1","Europe/Amsterdam","true","false"
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

    let (_, inbox) = send(&app, get("/api/tasks?inbox=true")).await;
    assert_eq!(inbox.as_array().unwrap().len(), 1);
    assert_eq!(inbox[0]["title"], "Loose note");
    assert_eq!(inbox[0]["label_id"], Value::Null);
}

#[tokio::test]
async fn all_day_keeps_its_date_and_timed_tasks_convert_into_the_export_timezone() {
    let app = test_app().await;
    send(&app, import_req(FIXTURE)).await;

    // All-day is local midnight in UTC: 2026-06-25T22:00+0000 is 26 Jun in Amsterdam.
    let (_, june26) = send(&app, get("/api/tasks?date=2026-06-26")).await;
    let boots = titled(&june26, "Buy boots");
    assert_eq!(boots.len(), 1);
    assert_eq!(boots[0]["due_date"], "2026-06-26");
    assert_eq!(boots[0]["due_time"], Value::Null);
    assert_eq!(boots[0]["completed"], false);

    let (_, june27) = send(&app, get("/api/tasks?date=2026-06-27")).await;
    let stretch = titled(&june27, "Stretch");
    assert_eq!(stretch.len(), 1);
    assert_eq!(stretch[0]["due_time"], "09:30");
    assert_eq!(stretch[0]["completed"], true);
}

#[tokio::test]
async fn an_early_morning_timed_task_imports_on_the_correct_local_day() {
    // 00:30 Amsterdam on Jun 25 is exported as 22:30 UTC on Jun 24.
    let csv = r#""Date: 2026-06-25+0000"

"Folder Name","List Name","Title","Tags","Content","Is Check list","Start Date","Due Date","Reminder","Repeat","Priority","Status","Created Time","Completed Time","Order","Timezone","Is All Day","Is Floating"
"","Work","Midnight ping","","","false","","2026-06-24T22:30:00+0000","","","0","0","2026-06-21T08:00:00+0000","","1","Europe/Amsterdam","false","false"
"#;
    let app = test_app().await;
    let (status, summary) = send(&app, import_req(csv)).await;
    assert_eq!(status, StatusCode::OK, "import failed: {summary}");

    let (_, june24) = send(&app, get("/api/tasks?date=2026-06-24")).await;
    assert!(titled(&june24, "Midnight ping").is_empty());
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

    let (_, range) = send(&app, get("/api/tasks?from=2026-06-29&to=2026-07-13")).await;
    let standups = titled(&range, "Standup");
    assert_eq!(standups.len(), 3, "expected three weekly occurrences");
    assert_eq!(standups[0]["occurrence_date"], "2026-06-29");
    assert_eq!(
        standups[0]["recurrence_rule"],
        "FREQ=WEEKLY;INTERVAL=1;BYDAY=MO"
    );
    assert_eq!(standups[0]["due_time"], "11:00");
}

#[tokio::test]
async fn a_recurrence_with_an_until_end_date_imports_and_stops_on_time() {
    // TickTick's bare `UNTIL=YYYYMMDD` must import and stop on (and include) that date.
    let csv = r#""Date: 2026-06-25+0000"

"Folder Name","List Name","Title","Tags","Content","Is Check list","Start Date","Due Date","Reminder","Repeat","Priority","Status","Created Time","Completed Time","Order","Timezone","Is All Day","Is Floating"
"","Work","Sprint","","","false","","2026-06-29T09:00:00+0000","","RRULE:FREQ=WEEKLY;WKST=MO;UNTIL=20260713;INTERVAL=1;BYDAY=MO","0","0","2026-06-21T08:00:00+0000","","1","Europe/Amsterdam","false","false"
"#;
    let app = test_app().await;
    let (status, summary) = send(&app, import_req(csv)).await;
    assert_eq!(status, StatusCode::OK, "import failed: {summary}");
    assert_eq!(summary["created"]["tasks"], 1);

    let (_, range) = send(&app, get("/api/tasks?from=2026-06-29&to=2026-08-31")).await;
    let sprints = titled(&range, "Sprint");
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

#[tokio::test]
async fn a_mid_file_database_error_rolls_the_whole_import_back() {
    // Dropping `completion` makes row 2's completion insert fail after row 1 mapped
    // inside the transaction; nothing may commit.
    let pool = test_pool().await;
    sqlx::query("DROP TABLE completion")
        .execute(&pool)
        .await
        .expect("drop completion table");

    let csv = r#""Date: 2026-06-25+0000"

"Folder Name","List Name","Title","Tags","Content","Is Check list","Start Date","Due Date","Reminder","Repeat","Priority","Status","Created Time","Completed Time","Order","Timezone","Is All Day","Is Floating"
"","Work","First row","","","false","","","","","0","0","2026-06-21T08:00:00+0000","","1","Europe/Amsterdam","false","false"
"","Work","Second row done","","","false","","","","","0","1","2026-06-21T08:00:00+0000","2026-06-22T08:00:00+0000","2","Europe/Amsterdam","false","false"
"#;
    let result =
        stino_backend::services::import_service::import_ticktick(&pool, csv.as_bytes()).await;
    assert!(
        result.is_err(),
        "the completion insert must abort the import"
    );

    let tasks: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM task")
        .fetch_one(&pool)
        .await
        .expect("count tasks");
    let labels: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM label")
        .fetch_one(&pool)
        .await
        .expect("count labels");
    assert_eq!(tasks, 0, "row 1's task rolled back with the failure");
    assert_eq!(labels, 0, "row 1's label rolled back with the failure");
}

#[tokio::test]
async fn an_hourly_repeat_is_dropped_but_the_task_still_imports() {
    let csv = r#""Date: 2026-06-25+0000"

"Folder Name","List Name","Title","Tags","Content","Is Check list","Start Date","Due Date","Reminder","Repeat","Priority","Status","Created Time","Completed Time","Order","Timezone","Is All Day","Is Floating"
"","Work","Hourly ping","","","false","","2026-06-27T07:30:00+0000","","RRULE:FREQ=HOURLY","0","0","2026-06-21T08:00:00+0000","","1","Europe/Amsterdam","false","false"
"#;
    let app = test_app().await;
    let (status, summary) = send(&app, import_req(csv)).await;
    assert_eq!(status, StatusCode::OK, "import failed: {summary}");
    assert_eq!(summary["created"]["tasks"], 1);
    assert_eq!(summary["skipped"], 0);

    let (_, day) = send(&app, get("/api/tasks?date=2026-06-27")).await;
    let ping = titled(&day, "Hourly ping");
    assert_eq!(ping.len(), 1);
    assert_eq!(
        ping[0]["recurrence_rule"],
        Value::Null,
        "the hourly rule was dropped, not stored"
    );
}

#[tokio::test]
async fn a_repeat_with_no_occurrence_is_dropped_but_the_task_still_imports() {
    let csv = r#""Date: 2026-06-25+0000"

"Folder Name","List Name","Title","Tags","Content","Is Check list","Start Date","Due Date","Reminder","Repeat","Priority","Status","Created Time","Completed Time","Order","Timezone","Is All Day","Is Floating"
"","Work","Ended","","","false","","2026-06-27T07:30:00+0000","","RRULE:FREQ=DAILY;UNTIL=20260601","0","0","2026-06-21T08:00:00+0000","","1","Europe/Amsterdam","false","false"
"#;
    let app = test_app().await;
    let (status, summary) = send(&app, import_req(csv)).await;
    assert_eq!(status, StatusCode::OK, "import failed: {summary}");
    assert_eq!(summary["created"]["tasks"], 1);

    let (_, day) = send(&app, get("/api/tasks?date=2026-06-27")).await;
    let ended = titled(&day, "Ended");
    assert_eq!(ended.len(), 1);
    assert_eq!(ended[0]["recurrence_rule"], Value::Null);
}

#[tokio::test]
async fn an_archived_task_without_a_completed_time_imports_as_done() {
    let csv = r#""Date: 2026-06-25+0000"

"Folder Name","List Name","Title","Tags","Content","Is Check list","Start Date","Due Date","Reminder","Repeat","Priority","Status","Created Time","Completed Time","Order","Timezone","Is All Day","Is Floating"
"","Work","Shelved","","","false","","2026-06-24T00:00:00+0000","","","0","2","2026-06-21T08:00:00+0000","","1","UTC","true","false"
"#;
    let app = test_app().await;
    let (status, summary) = send(&app, import_req(csv)).await;
    assert_eq!(status, StatusCode::OK, "import failed: {summary}");
    assert_eq!(summary["created"]["completions"], 1);

    let (_, day) = send(&app, get("/api/tasks?date=2026-06-24")).await;
    let shelved = titled(&day, "Shelved");
    assert_eq!(shelved.len(), 1);
    assert_eq!(shelved[0]["completed"], true);
}

#[tokio::test]
async fn an_import_larger_than_axums_default_body_limit_is_accepted() {
    // Pad past Axum's 2 MB default to prove the raised import limit applies.
    let padding = "x".repeat(3 * 1024 * 1024);
    let csv = format!(
        r#""Date: 2026-06-25+0000"

"Folder Name","List Name","Title","Tags","Content","Is Check list","Start Date","Due Date","Reminder","Repeat","Priority","Status","Created Time","Completed Time","Order","Timezone","Is All Day","Is Floating"
"","Work","Big note","","{padding}","false","","","","","0","0","2026-06-21T08:00:00+0000","","1","Europe/Amsterdam","false","false"
"#
    );
    let app = test_app().await;
    let (status, summary) = send(&app, import_req(&csv)).await;
    assert_eq!(status, StatusCode::OK, "a >2 MB backup must import");
    assert_eq!(summary["created"]["tasks"], 1);
}

#[tokio::test]
async fn an_over_long_multibyte_title_is_clamped_and_kept_whole_in_the_notes() {
    let title = "é🌲".repeat(150);
    let csv = format!(
        r#""Date: 2026-06-25+0000"

"Folder Name","List Name","Title","Tags","Content","Is Check list","Start Date","Due Date","Reminder","Repeat","Priority","Status","Created Time","Completed Time","Order","Timezone","Is All Day","Is Floating"
"","Work","{title}","","original notes","false","","2026-06-27T07:30:00+0000","","","0","0","2026-06-21T08:00:00+0000","","1","Europe/Amsterdam","false","false"
"#
    );
    let app = test_app().await;
    let (status, summary) = send(&app, import_req(&csv)).await;
    assert_eq!(status, StatusCode::OK, "import failed: {summary}");
    assert_eq!(summary["created"]["tasks"], 1);
    assert_eq!(summary["skipped"], 0);

    let (_, day) = send(&app, get("/api/tasks?date=2026-06-27")).await;
    let task = &day.as_array().expect("array")[0];
    let expected: String = title.chars().take(200).collect();
    assert_eq!(task["title"], expected);
    assert_eq!(task["notes"], format!("{title}\n\noriginal notes"));
}

#[tokio::test]
async fn a_completed_repeating_row_imports_as_a_completed_one_off() {
    let csv = r#""Date: 2026-06-25+0000"

"Folder Name","List Name","Title","Tags","Content","Is Check list","Start Date","Due Date","Reminder","Repeat","Priority","Status","Created Time","Completed Time","Order","Timezone","Is All Day","Is Floating"
"","Sport","Fencing","","","false","","2026-06-03T00:00:00+0000","","FREQ=WEEKLY;INTERVAL=1","0","2","2026-06-01T08:00:00+0000","2026-06-03T19:00:00+0000","1","UTC","true","false"
"#;
    let app = test_app().await;
    let (status, summary) = send(&app, import_req(csv)).await;
    assert_eq!(status, StatusCode::OK, "import failed: {summary}");

    let (_, range) = send(&app, get("/api/tasks?from=2026-06-01&to=2026-06-30")).await;
    let fencing = titled(&range, "Fencing");
    assert_eq!(fencing.len(), 1, "history must not repeat: {fencing:?}");
    assert_eq!(fencing[0]["recurrence_rule"], Value::Null);
    assert_eq!(fencing[0]["completed"], true);
}
