use axum::http::StatusCode;
use serde_json::json;
use stino_backend::error::ValidationError;

use crate::common::*;

#[tokio::test]
async fn a_recurring_task_expands_to_one_occurrence_per_day_in_range() {
    let app = app().await;
    let task = create_task(
        &app,
        json!({"title": "Stretch", "due_date": MON_JUN_1, "recurrence_rule": "FREQ=DAILY"}),
    )
    .await;
    assert_eq!(task["recurrence_rule"], "FREQ=DAILY");

    let days = range(&app, MON_JUN_1, WED_JUN_3).await;
    assert_eq!(
        occurrence_dates(&days),
        [MON_JUN_1, "2026-06-02", WED_JUN_3],
        "one occurrence per day in the window"
    );
    for occurrence in &days {
        assert_eq!(occurrence["id"], task["id"]);
        assert_eq!(occurrence["due_date"], MON_JUN_1, "due_date is the DTSTART");
        assert_eq!(occurrence["completed"], false);
    }
}

#[tokio::test]
async fn create_and_update_store_the_rule_without_an_rrule_prefix() {
    let app = app().await;
    let task = create_task(
        &app,
        json!({"title": "Stretch", "due_date": MON_JUN_1, "recurrence_rule": "RRULE:FREQ=DAILY"}),
    )
    .await;
    assert_eq!(task["recurrence_rule"], "FREQ=DAILY");

    let (status, updated) = patch_task(
        &app,
        id_of(&task),
        json!({"recurrence_rule": " rrule:FREQ=WEEKLY;BYDAY=MO "}),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(updated["recurrence_rule"], "FREQ=WEEKLY;BYDAY=MO");

    assert_eq!(
        range(&app, MON_JUN_1, MON_JUN_1).await[0]["recurrence_rule"],
        "FREQ=WEEKLY;BYDAY=MO",
        "stored bare"
    );
}

#[tokio::test]
async fn weekly_byday_only_lands_on_chosen_weekdays() {
    let app = app().await;
    create_task(
        &app,
        json!({"title": "Class", "due_date": MON_JUN_1, "recurrence_rule": "FREQ=WEEKLY;BYDAY=MO,WE"}),
    )
    .await;

    assert_eq!(
        occurrence_dates(&range(&app, MON_JUN_1, SUN_JUN_7).await),
        [MON_JUN_1, WED_JUN_3]
    );
}

#[tokio::test]
async fn a_monthly_ordinal_weekday_task_expands_across_a_range() {
    let app = app().await;
    let id = create_task_id(
        &app,
        json!({"title": "Pay rent", "due_date": THU_JAN_1, "recurrence_rule": FIRST_MONDAY_MONTHLY}),
    )
    .await;

    let days = range(&app, THU_JAN_1, "2026-03-31").await;
    assert_eq!(
        occurrence_dates(&days),
        ["2026-01-05", "2026-02-02", "2026-03-02"]
    );
    for occurrence in &days {
        assert_eq!(occurrence["id"], id);
        assert_eq!(
            occurrence["due_date"], THU_JAN_1,
            "due_date stays the DTSTART"
        );
    }
}

#[tokio::test]
async fn a_monthly_last_day_task_tracks_short_months() {
    let app = app().await;
    create_task(
        &app,
        json!({"title": "Close books", "due_date": THU_JAN_1, "recurrence_rule": "FREQ=MONTHLY;BYMONTHDAY=-1"}),
    )
    .await;

    assert_eq!(
        occurrence_dates(&range(&app, THU_JAN_1, "2026-03-31").await),
        ["2026-01-31", "2026-02-28", "2026-03-31"]
    );
}

#[tokio::test]
async fn for_date_includes_recurring_occurrences_alongside_one_offs() {
    let app = app().await;
    create_task(
        &app,
        json!({"title": "Daily standup", "due_date": MON_JUN_1, "due_time": "09:00", "recurrence_rule": "FREQ=DAILY"}),
    )
    .await;
    create_task(&app, json!({"title": "One-off", "due_date": WED_JUN_3})).await;

    assert_eq!(
        titles(&day(&app, WED_JUN_3).await),
        ["Daily standup", "One-off"]
    );
}

#[tokio::test]
async fn recurrence_validation_rejects_a_missing_date_or_a_bad_rule() {
    let app = app().await;

    let (status, _) = post("/api/tasks")
        .json(json!({"title": "No start", "recurrence_rule": "FREQ=DAILY"}))
        .send(&app)
        .await;
    assert_eq!(status, StatusCode::BAD_REQUEST, "recurrence needs a date");

    let (status, _) = post("/api/tasks")
        .json(
            json!({"title": "Bad rule", "due_date": MON_JUN_1, "recurrence_rule": "FREQ=NONSENSE"}),
        )
        .send(&app)
        .await;
    assert_eq!(status, StatusCode::BAD_REQUEST, "rule must parse");
}

#[tokio::test]
async fn recurrence_validation_rejects_a_rule_with_no_occurrence() {
    let app = app().await;
    for rule in [
        "FREQ=DAILY;COUNT=0",
        "FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=30",
        "FREQ=DAILY;UNTIL=20260501",
    ] {
        let (status, body) = post("/api/tasks")
            .json(json!({"title": "Never", "due_date": MON_JUN_1, "recurrence_rule": rule}))
            .send(&app)
            .await;
        assert_eq!(status, StatusCode::BAD_REQUEST, "{rule} was accepted");
        assert!(body["error"].is_string());
    }
}

#[tokio::test]
async fn a_start_date_off_the_rule_still_has_occurrences_and_is_accepted() {
    let app = app().await;
    create_task(
        &app,
        json!({"title": "Gym", "due_date": SUN_MAY_31, "recurrence_rule": "FREQ=WEEKLY;BYDAY=MO"}),
    )
    .await;

    assert_eq!(
        occurrence_dates(&range(&app, SUN_MAY_31, SUN_JUN_7).await),
        [MON_JUN_1]
    );
}

#[tokio::test]
async fn moving_a_series_start_past_its_until_is_rejected() {
    let app = app().await;
    let id = create_task_id(
        &app,
        json!({"title": "Sprint", "due_date": MON_JUN_1, "recurrence_rule": "FREQ=DAILY;UNTIL=20260610"}),
    )
    .await;

    let (status, _) = patch_task(&app, id, json!({"due_date": "2026-06-20"})).await;
    assert_eq!(status, StatusCode::BAD_REQUEST);

    assert_eq!(
        day(&app, MON_JUN_1).await[0]["due_date"],
        MON_JUN_1,
        "the rejected update wrote nothing"
    );
}

#[tokio::test]
async fn an_hourly_recurrence_rule_is_rejected() {
    let app = app().await;

    let (status, body) = post("/api/tasks")
        .json(json!({"title": "Tick", "due_date": MON_JUN_1, "recurrence_rule": "FREQ=HOURLY"}))
        .send(&app)
        .await;
    assert_eq!(status, StatusCode::BAD_REQUEST, "hourly must be rejected");
    assert_eq!(body["error"], ValidationError::SubDailyRule.to_string());
}

#[tokio::test]
async fn a_stored_rule_that_no_longer_expands_does_not_break_the_calendar() {
    let pool = pool_with(sqlx::migrate!()).await;
    let app = app_with(pool.clone(), None);

    let legacy = create_task_id(
        &app,
        json!({"title": "Legacy", "due_date": MON_JUN_1, "recurrence_rule": "FREQ=DAILY"}),
    )
    .await;
    // Planted behind the API, which rejects a sub-daily rule.
    sqlx::query("UPDATE task SET recurrence_rule = 'FREQ=HOURLY' WHERE id = ?")
        .bind(legacy)
        .execute(&pool)
        .await
        .expect("plant the hourly rule");
    create_task(&app, json!({"title": "Healthy", "due_date": "2026-06-02"})).await;

    assert_eq!(
        titles(&range(&app, MON_JUN_1, "2026-06-30").await),
        ["Healthy"],
        "the bad series is skipped, not fatal"
    );
    assert_eq!(list(&app, "/api/search?q=Legacy").await.len(), 1);
}
