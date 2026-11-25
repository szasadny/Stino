use axum::http::StatusCode;
use axum::Router;
use serde_json::Value;
use stino_backend::config::MAX_TITLE_LEN;
use stino_backend::error::ValidationError;
use stino_backend::services::import::import_ticktick;

use crate::common::*;

const OVER_AXUM_DEFAULT_BODY_LIMIT: usize = 3 * 1024 * 1024;

fn fixture() -> String {
    csv_with(&[
        TickRow {
            list: "Inbox",
            title: "Buy boots",
            tags: "gear",
            content: "Need new boots",
            due: "2026-06-25T22:00:00+0000",
            all_day: true,
            ..TickRow::default()
        },
        TickRow {
            list: "Health",
            title: "Stretch",
            tags: "health",
            due: "2026-06-27T07:30:00+0000",
            status: STATUS_DONE,
            completed_at: "2026-06-27T07:35:00+0000",
            ..TickRow::default()
        },
        TickRow {
            title: "Standup",
            due: "2026-06-29T09:00:00+0000",
            repeat: "RRULE:FREQ=WEEKLY;INTERVAL=1;BYDAY=MO",
            ..TickRow::default()
        },
        TickRow::default(),
        TickRow {
            list: "Inbox",
            title: "Loose note",
            content: "just a thought",
            ..TickRow::default()
        },
    ])
}

async fn import_ok(app: &Router, csv: &str) -> Value {
    let (status, summary) = import_csv(app, csv).await;
    assert_eq!(status, StatusCode::OK, "import failed: {summary}");
    summary
}

#[tokio::test]
async fn imports_tasks_labels_and_completions_with_a_skipped_row() {
    let app = app().await;

    let summary = import_ok(&app, &fixture()).await;
    assert_eq!(summary["created"]["tasks"], 4);
    assert_eq!(summary["created"]["labels"], 3, "gear, health, Work");
    assert_eq!(summary["created"]["completions"], 1);
    assert_eq!(summary["skipped"], 1, "the titleless row");

    let all_labels = labels(&app).await;
    let mut label_names = names(&all_labels);
    label_names.sort_unstable();
    assert_eq!(
        label_names,
        ["Work", "gear", "health"],
        "never the Inbox list"
    );

    let inbox = inbox(&app).await;
    assert_eq!(titles(&inbox), ["Loose note"]);
    assert_eq!(inbox[0]["label_id"], Value::Null);
}

#[tokio::test]
async fn all_day_keeps_its_date_and_timed_tasks_convert_into_the_export_timezone() {
    let app = app().await;
    import_ok(&app, &fixture()).await;

    let june26 = day(&app, "2026-06-26").await;
    let boots = with_title(&june26, "Buy boots");
    assert_eq!(
        boots.len(),
        1,
        "22:00Z on Jun 25 is all-day Jun 26 in Amsterdam"
    );
    assert_eq!(boots[0]["due_date"], "2026-06-26");
    assert_eq!(boots[0]["due_time"], Value::Null);
    assert_eq!(boots[0]["completed"], false);

    let june27 = day(&app, "2026-06-27").await;
    let stretch = with_title(&june27, "Stretch");
    assert_eq!(stretch.len(), 1);
    assert_eq!(stretch[0]["due_time"], "09:30");
    assert_eq!(stretch[0]["completed"], true);
}

#[tokio::test]
async fn an_early_morning_timed_task_imports_on_the_correct_local_day() {
    let app = app().await;
    let csv = csv_with(&[TickRow {
        title: "Midnight ping",
        due: "2026-06-24T22:30:00+0000",
        ..TickRow::default()
    }]);
    import_ok(&app, &csv).await;

    assert!(with_title(&day(&app, "2026-06-24").await, "Midnight ping").is_empty());
    let june25 = day(&app, "2026-06-25").await;
    let ping = with_title(&june25, "Midnight ping");
    assert_eq!(
        ping.len(),
        1,
        "22:30Z on Jun 24 is 00:30 on Jun 25 in Amsterdam"
    );
    assert_eq!(ping[0]["due_date"], "2026-06-25");
    assert_eq!(ping[0]["due_time"], "00:30");
}

#[tokio::test]
async fn recurring_task_expands_across_the_window() {
    let app = app().await;
    import_ok(&app, &fixture()).await;

    let window = range(&app, "2026-06-29", "2026-07-13").await;
    let standups = with_title(&window, "Standup");
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
    let app = app().await;
    let rule = "FREQ=WEEKLY;WKST=MO;UNTIL=20260713;INTERVAL=1;BYDAY=MO";
    let csv = csv_with(&[TickRow {
        title: "Sprint",
        due: "2026-06-29T09:00:00+0000",
        repeat: &format!("RRULE:{rule}"),
        ..TickRow::default()
    }]);
    let summary = import_ok(&app, &csv).await;
    assert_eq!(summary["created"]["tasks"], 1);

    let window = range(&app, "2026-06-29", "2026-08-31").await;
    let sprints = with_title(&window, "Sprint");
    assert_eq!(sprints.len(), 3, "expected the series to stop at UNTIL");
    assert_eq!(sprints[0]["occurrence_date"], "2026-06-29");
    assert_eq!(sprints[2]["occurrence_date"], "2026-07-13");
    assert_eq!(sprints[0]["recurrence_rule"], rule);
}

#[tokio::test]
async fn re_running_appends_tasks_but_dedupes_labels() {
    let app = app().await;
    import_ok(&app, &fixture()).await;

    let summary = import_ok(&app, &fixture()).await;
    assert_eq!(summary["created"]["tasks"], 4);
    assert_eq!(summary["created"]["labels"], 0);
    assert_eq!(labels(&app).await.len(), 3);
}

#[tokio::test]
async fn label_names_dedupe_by_ascii_case_like_the_label_rule() {
    let app = app().await;
    let row = |tags| TickRow {
        title: "Hike",
        tags,
        ..TickRow::default()
    };
    let csv = csv_with(&[row("Trail"), row("TRAIL"), row("Élan"), row("élan")]);

    let summary = import_ok(&app, &csv).await;
    assert_eq!(summary["created"]["labels"], 3);
    assert_eq!(names(&labels(&app).await), ["Trail", "Élan", "élan"]);

    let again = import_ok(&app, &csv_with(&[row("élan"), row("trail")])).await;
    assert_eq!(again["created"]["labels"], 0);
}

#[tokio::test]
async fn imported_rows_keep_file_order_after_the_existing_tasks() {
    let app = app().await;
    create_task(&app, serde_json::json!({ "title": "Already here" })).await;
    let row = |title| TickRow {
        list: "Inbox",
        title,
        ..TickRow::default()
    };

    import_ok(&app, &csv_with(&[row("First"), row(""), row("Second")])).await;

    let inbox = inbox(&app).await;
    assert_eq!(titles(&inbox), ["Already here", "First", "Second"]);
    let orders: Vec<_> = inbox.iter().map(|t| t["sort_order"].as_i64()).collect();
    assert_eq!(orders, [Some(0), Some(1), Some(2)]);
}

#[tokio::test]
async fn a_file_without_a_header_is_a_clean_validation_error() {
    let app = app().await;
    let (status, body) = import_csv(&app, "just some text\nnot a csv export\n").await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert_eq!(body["error"], ValidationError::NotTickTickCsv.to_string());
}

#[tokio::test]
async fn a_mid_file_database_error_rolls_the_whole_import_back() {
    let pool = pool_with(sqlx::migrate!()).await;
    sqlx::query("DROP TABLE completion")
        .execute(&pool)
        .await
        .expect("drop completion table");
    let csv = csv_with(&[
        TickRow {
            title: "First row",
            ..TickRow::default()
        },
        TickRow {
            title: "Second row done",
            status: STATUS_DONE,
            completed_at: "2026-06-22T08:00:00+0000",
            ..TickRow::default()
        },
    ]);

    // Row 1 writes its label and task, then its re-read fails; empty tables prove the rollback.
    let result = import_ticktick(&pool, csv.as_bytes()).await;
    assert!(result.is_err(), "the database error must abort the import");

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
    let app = app().await;
    let csv = csv_with(&[TickRow {
        title: "Hourly ping",
        due: "2026-06-27T07:30:00+0000",
        repeat: "RRULE:FREQ=HOURLY",
        ..TickRow::default()
    }]);
    let summary = import_ok(&app, &csv).await;
    assert_eq!(summary["created"]["tasks"], 1);
    assert_eq!(summary["skipped"], 0);

    let june27 = day(&app, "2026-06-27").await;
    let ping = with_title(&june27, "Hourly ping");
    assert_eq!(ping.len(), 1);
    assert_eq!(
        ping[0]["recurrence_rule"],
        Value::Null,
        "the hourly rule was dropped, not stored"
    );
}

#[tokio::test]
async fn a_repeat_with_no_occurrence_is_dropped_but_the_task_still_imports() {
    let app = app().await;
    let csv = csv_with(&[TickRow {
        title: "Ended",
        due: "2026-06-27T07:30:00+0000",
        repeat: "RRULE:FREQ=DAILY;UNTIL=20260601",
        ..TickRow::default()
    }]);
    let summary = import_ok(&app, &csv).await;
    assert_eq!(summary["created"]["tasks"], 1);

    let june27 = day(&app, "2026-06-27").await;
    let ended = with_title(&june27, "Ended");
    assert_eq!(ended.len(), 1);
    assert_eq!(ended[0]["recurrence_rule"], Value::Null);
}

#[tokio::test]
async fn an_archived_task_without_a_completed_time_imports_as_done() {
    let app = app().await;
    let csv = csv_with(&[TickRow {
        title: "Shelved",
        due: "2026-06-24T00:00:00+0000",
        status: STATUS_ARCHIVED,
        timezone: "UTC",
        all_day: true,
        ..TickRow::default()
    }]);
    let summary = import_ok(&app, &csv).await;
    assert_eq!(summary["created"]["completions"], 1);

    let june24 = day(&app, "2026-06-24").await;
    assert_eq!(completed_flags(with_title(&june24, "Shelved")), [true]);
}

#[tokio::test]
async fn an_import_larger_than_axums_default_body_limit_is_accepted() {
    let app = app().await;
    let padding = "x".repeat(OVER_AXUM_DEFAULT_BODY_LIMIT);
    let csv = csv_with(&[TickRow {
        title: "Big note",
        content: &padding,
        ..TickRow::default()
    }]);
    let (status, summary) = import_csv(&app, &csv).await;
    assert_eq!(status, StatusCode::OK, "a >2 MB backup must import");
    assert_eq!(summary["created"]["tasks"], 1);
}

#[tokio::test]
async fn an_over_long_multibyte_title_is_clamped_and_kept_whole_in_the_notes() {
    let app = app().await;
    let title = "é🌲".repeat(MAX_TITLE_LEN);
    let csv = csv_with(&[TickRow {
        title: &title,
        content: "original notes",
        due: "2026-06-27T07:30:00+0000",
        ..TickRow::default()
    }]);
    let summary = import_ok(&app, &csv).await;
    assert_eq!(summary["created"]["tasks"], 1);
    assert_eq!(summary["skipped"], 0);

    let task = &day(&app, "2026-06-27").await[0];
    let clamped: String = title.chars().take(MAX_TITLE_LEN).collect();
    assert_eq!(task["title"], clamped);
    assert_eq!(task["notes"], format!("{title}\n\noriginal notes"));
}

#[tokio::test]
async fn a_completed_repeating_row_imports_as_a_completed_one_off() {
    let app = app().await;
    let csv = csv_with(&[TickRow {
        list: "Sport",
        title: "Fencing",
        due: "2026-06-03T00:00:00+0000",
        repeat: "FREQ=WEEKLY;INTERVAL=1",
        status: STATUS_ARCHIVED,
        completed_at: "2026-06-03T19:00:00+0000",
        timezone: "UTC",
        all_day: true,
        ..TickRow::default()
    }]);
    import_ok(&app, &csv).await;

    let june = range(&app, "2026-06-01", "2026-06-30").await;
    let fencing = with_title(&june, "Fencing");
    assert_eq!(fencing.len(), 1, "history must not repeat: {fencing:?}");
    assert_eq!(fencing[0]["recurrence_rule"], Value::Null);
    assert_eq!(fencing[0]["completed"], true);
}
