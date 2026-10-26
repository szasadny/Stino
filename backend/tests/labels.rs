//! Integration tests for the label API, driven through the real router against a
//! fresh in-memory SQLite database (migrations applied per test for isolation).

use axum::http::StatusCode;
use serde_json::{json, Value};

mod common;
use common::*;

#[tokio::test]
async fn create_list_update_delete_lifecycle() {
    let app = test_app().await;

    let (status, label) = send(
        &app,
        json_req(
            "POST",
            "/api/labels",
            json!({"name":"Work","color":"#2F5D50"}),
        ),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED);
    assert_eq!(label["name"], "Work");
    assert_eq!(label["color"], "#2F5D50");
    assert_eq!(label["sort_order"], 0);
    let id = label["id"].as_i64().expect("id");

    let (status, list) = send(&app, get("/api/labels")).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(list.as_array().expect("array").len(), 1);

    let (status, updated) = send(
        &app,
        json_req(
            "PATCH",
            &format!("/api/labels/{id}"),
            json!({"color":"#6F8F6B"}),
        ),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(
        updated["name"], "Work",
        "name should be unchanged by a partial patch"
    );
    assert_eq!(updated["color"], "#6F8F6B");

    let (status, _) = send(
        &app,
        json_req("DELETE", &format!("/api/labels/{id}"), Value::Null),
    )
    .await;
    assert_eq!(status, StatusCode::NO_CONTENT);

    let (_, list) = send(&app, get("/api/labels")).await;
    assert_eq!(list.as_array().expect("array").len(), 0);
}

#[tokio::test]
async fn emoji_is_optional_and_patch_distinguishes_clear_from_unchanged() {
    let app = test_app().await;

    // Absent emoji on create ⇒ null.
    let (status, plain) = send(
        &app,
        json_req(
            "POST",
            "/api/labels",
            json!({"name":"Plain","color":"#2F5D50"}),
        ),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED);
    assert_eq!(plain["emoji"], Value::Null);

    // Emoji on create round-trips, and is trimmed.
    let (status, home) = send(
        &app,
        json_req(
            "POST",
            "/api/labels",
            json!({"name":"Home","color":"#6F8F6B","emoji":" 🏠 "}),
        ),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED);
    assert_eq!(home["emoji"], "🏠");
    let id = home["id"].as_i64().expect("id");

    // A PATCH that omits emoji leaves it unchanged.
    let (_, kept) = send(
        &app,
        json_req(
            "PATCH",
            &format!("/api/labels/{id}"),
            json!({"name":"House"}),
        ),
    )
    .await;
    assert_eq!(kept["emoji"], "🏠", "omitted emoji must be left unchanged");

    // An explicit null clears it.
    let (_, cleared) = send(
        &app,
        json_req("PATCH", &format!("/api/labels/{id}"), json!({"emoji":null})),
    )
    .await;
    assert_eq!(cleared["emoji"], Value::Null, "null emoji must clear it");

    // A pasted multi-glyph string is rejected.
    let (status, _) = send(
        &app,
        json_req(
            "POST",
            "/api/labels",
            json!({"name":"Too long","color":"#2F5D50","emoji":"way too many characters"}),
        ),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn validation_rejects_blank_name_and_off_palette_color() {
    let app = test_app().await;

    let (status, _) = send(
        &app,
        json_req(
            "POST",
            "/api/labels",
            json!({"name":"   ","color":"#2F5D50"}),
        ),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);

    let (status, _) = send(
        &app,
        json_req("POST", "/api/labels", json!({"name":"X","color":"#123456"})),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);

    // A palette color in lowercase is accepted and normalized to canonical case.
    let (status, label) = send(
        &app,
        json_req("POST", "/api/labels", json!({"name":"X","color":"#2f5d50"})),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED);
    assert_eq!(label["color"], "#2F5D50");
}

#[tokio::test]
async fn sort_order_appends_in_creation_order() {
    let app = test_app().await;

    let (_, a) = send(
        &app,
        json_req("POST", "/api/labels", json!({"name":"A","color":"#2F5D50"})),
    )
    .await;
    let (_, b) = send(
        &app,
        json_req("POST", "/api/labels", json!({"name":"B","color":"#6F8F6B"})),
    )
    .await;
    assert_eq!(a["sort_order"], 0);
    assert_eq!(b["sort_order"], 1);

    let (_, list) = send(&app, get("/api/labels")).await;
    let arr = list.as_array().expect("array");
    assert_eq!(arr[0]["name"], "A");
    assert_eq!(arr[1]["name"], "B");
}

#[tokio::test]
async fn reorder_persists_a_new_label_order_and_rejects_non_permutations() {
    let app = test_app().await;

    // Three labels, created A, B, C (sort_order 0, 1, 2).
    let id = |v: &Value| v["id"].as_i64().expect("id");
    let (_, a) = send(
        &app,
        json_req("POST", "/api/labels", json!({"name":"A","color":"#2F5D50"})),
    )
    .await;
    let (_, b) = send(
        &app,
        json_req("POST", "/api/labels", json!({"name":"B","color":"#6F8F6B"})),
    )
    .await;
    let (_, c) = send(
        &app,
        json_req("POST", "/api/labels", json!({"name":"C","color":"#4F7A4A"})),
    )
    .await;
    let (a, b, c) = (id(&a), id(&b), id(&c));

    let names = |list: &Value| -> Vec<String> {
        list.as_array()
            .expect("array")
            .iter()
            .map(|l| l["name"].as_str().expect("name").to_string())
            .collect()
    };

    // Drag C to the front: C, A, B.
    let (status, _) = send(
        &app,
        json_req("PATCH", "/api/labels/reorder", json!({"ids":[c, a, b]})),
    )
    .await;
    assert_eq!(status, StatusCode::NO_CONTENT);

    let (_, list) = send(&app, get("/api/labels")).await;
    assert_eq!(names(&list), ["C", "A", "B"]);

    // Anything but a permutation of every label id is a 400 and changes nothing.
    for (case, ids) in [
        ("partial", json!([a, b])),
        ("duplicate", json!([a, a, b])),
        ("unknown", json!([a, b, 9999])),
        ("empty", json!([])),
    ] {
        let (status, body) = send(
            &app,
            json_req("PATCH", "/api/labels/reorder", json!({ "ids": ids })),
        )
        .await;
        assert_eq!(status, StatusCode::BAD_REQUEST, "{case} list");
        assert_eq!(body["error"], "ids must list every label exactly once");

        let (_, list) = send(&app, get("/api/labels")).await;
        assert_eq!(
            names(&list),
            ["C", "A", "B"],
            "the rejected {case} reorder changed nothing"
        );
    }
}

#[tokio::test]
async fn update_and_delete_unknown_id_are_404() {
    let app = test_app().await;

    let (status, _) = send(
        &app,
        json_req("PATCH", "/api/labels/9999", json!({"name":"x"})),
    )
    .await;
    assert_eq!(status, StatusCode::NOT_FOUND);

    let (status, _) = send(&app, json_req("DELETE", "/api/labels/9999", Value::Null)).await;
    assert_eq!(status, StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn duplicate_names_are_rejected_case_insensitively() {
    let app = test_app().await;
    let create = |name: &str| {
        json_req(
            "POST",
            "/api/labels",
            json!({"name":name,"color":"#2F5D50"}),
        )
    };

    let (status, work) = send(&app, create("Work")).await;
    assert_eq!(status, StatusCode::CREATED);
    let work_id = work["id"].as_i64().expect("id");
    let (status, errands) = send(&app, create("Errands")).await;
    assert_eq!(status, StatusCode::CREATED);
    let errands_id = errands["id"].as_i64().expect("id");

    for dup in ["Work", "  work  ", "WORK"] {
        let (status, body) = send(&app, create(dup)).await;
        assert_eq!(status, StatusCode::BAD_REQUEST, "{dup:?} should clash");
        assert_eq!(body["error"], "a label with that name already exists");
    }

    let rename =
        |id: i64, name: &str| json_req("PATCH", &format!("/api/labels/{id}"), json!({"name":name}));
    let (status, _) = send(&app, rename(errands_id, "work")).await;
    assert_eq!(status, StatusCode::BAD_REQUEST);

    let (status, same) = send(&app, rename(work_id, "Work")).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(same["name"], "Work");
    let (status, recased) = send(&app, rename(work_id, "work")).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(recased["name"], "work");

    let (_, list) = send(&app, get("/api/labels")).await;
    assert_eq!(list.as_array().expect("array").len(), 2);
}
