use serde_json::json;

use crate::common::*;

#[tokio::test]
async fn search_matches_title_or_notes_case_insensitively() {
    let app = app().await;
    create_task(&app, json!({"title": "Buy hiking boots"})).await;
    create_task(
        &app,
        json!({"title": "Trip prep", "notes": "reserve the BOOTS at the rental"}),
    )
    .await;
    create_task(&app, json!({"title": "Unrelated errand"})).await;

    let hits = list(&app, "/api/search?q=boots").await;
    assert_eq!(titles(&hits), ["Buy hiking boots", "Trip prep"]);
}

#[tokio::test]
async fn search_treats_wildcards_in_the_term_as_literal_text() {
    let app = app().await;
    create_task(&app, json!({"title": "Pay 50% deposit"})).await;
    create_task(&app, json!({"title": "Read 50 pages"})).await;

    let hits = list(&app, "/api/search?q=50%25").await;
    assert_eq!(
        titles(&hits),
        ["Pay 50% deposit"],
        "the literal % matched only one"
    );
}

#[tokio::test]
async fn search_orders_by_due_date_then_title_with_inbox_last() {
    let app = app().await;
    create_task(&app, json!({"title": "trail: inbox one"})).await;
    create_task(
        &app,
        json!({"title": "trail: later", "due_date": "2026-07-10"}),
    )
    .await;
    create_task(
        &app,
        json!({"title": "trail: soon", "due_date": "2026-07-01"}),
    )
    .await;

    let hits = list(&app, "/api/search?q=trail").await;
    assert_eq!(
        titles(&hits),
        ["trail: soon", "trail: later", "trail: inbox one"]
    );
}

#[tokio::test]
async fn search_with_blank_or_missing_query_is_an_empty_list() {
    let app = app().await;
    create_task(&app, json!({"title": "Something"})).await;

    for uri in ["/api/search", "/api/search?q=", "/api/search?q=%20%20"] {
        assert!(
            list(&app, uri).await.is_empty(),
            "{uri} should return no rows"
        );
    }
}
