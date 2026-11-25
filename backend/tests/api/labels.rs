use axum::http::StatusCode;
use serde_json::{json, Value};
use stino_backend::error::ValidationError;

use crate::common::*;

#[tokio::test]
async fn create_list_update_delete_lifecycle() {
    let app = app().await;

    let label = create_label(&app, "Work", PINE).await;
    assert_eq!(label["name"], "Work");
    assert_eq!(label["color"], PINE);
    assert_eq!(label["sort_order"], 0);
    let uri = format!("/api/labels/{}", id_of(&label));

    assert_eq!(labels(&app).await.len(), 1);

    let (status, updated) = patch(&uri).json(json!({"color": MOSS})).send(&app).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(
        updated["name"], "Work",
        "name should be unchanged by a partial patch"
    );
    assert_eq!(updated["color"], MOSS);

    let (status, _) = delete(&uri).send(&app).await;
    assert_eq!(status, StatusCode::NO_CONTENT);
    assert!(labels(&app).await.is_empty());
}

#[tokio::test]
async fn emoji_is_optional_and_patch_distinguishes_clear_from_unchanged() {
    let app = app().await;

    let plain = create_label(&app, "Plain", PINE).await;
    assert_eq!(plain["emoji"], Value::Null);

    let (status, home) = post("/api/labels")
        .json(json!({"name": "Home", "color": MOSS, "emoji": " 🏠 "}))
        .send(&app)
        .await;
    assert_eq!(status, StatusCode::CREATED);
    assert_eq!(home["emoji"], "🏠");
    let uri = format!("/api/labels/{}", id_of(&home));

    let (_, kept) = patch(&uri).json(json!({"name": "House"})).send(&app).await;
    assert_eq!(kept["emoji"], "🏠", "omitted emoji must be left unchanged");

    let (_, cleared) = patch(&uri).json(json!({"emoji": null})).send(&app).await;
    assert_eq!(cleared["emoji"], Value::Null, "null emoji must clear it");

    let (status, _) = post("/api/labels")
        .json(json!({"name": "Too long", "color": PINE, "emoji": "way too many characters"}))
        .send(&app)
        .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn validation_rejects_blank_name_and_off_palette_color() {
    let app = app().await;

    for (case, body) in [
        ("blank name", json!({"name": "   ", "color": PINE})),
        (
            "off-palette color",
            json!({"name": "X", "color": "#123456"}),
        ),
    ] {
        let (status, _) = post("/api/labels").json(body).send(&app).await;
        assert_eq!(status, StatusCode::BAD_REQUEST, "{case}");
    }

    let label = create_label(&app, "X", &PINE.to_lowercase()).await;
    assert_eq!(label["color"], PINE);
}

#[tokio::test]
async fn sort_order_appends_in_creation_order() {
    let app = app().await;

    let a = create_label(&app, "A", PINE).await;
    let b = create_label(&app, "B", MOSS).await;
    assert_eq!(a["sort_order"], 0);
    assert_eq!(b["sort_order"], 1);

    assert_eq!(names(&labels(&app).await), ["A", "B"]);
}

#[tokio::test]
async fn reorder_persists_a_new_label_order_and_rejects_non_permutations() {
    let app = app().await;
    let a = id_of(&create_label(&app, "A", PINE).await);
    let b = id_of(&create_label(&app, "B", MOSS).await);
    let c = id_of(&create_label(&app, "C", FERN).await);
    let reorder = |ids: Value| patch("/api/labels/reorder").json(json!({ "ids": ids }));

    let (status, _) = reorder(json!([c, a, b])).send(&app).await;
    assert_eq!(status, StatusCode::NO_CONTENT);
    assert_eq!(names(&labels(&app).await), ["C", "A", "B"]);

    for (case, ids) in [
        ("partial", json!([a, b])),
        ("duplicate", json!([a, a, b])),
        ("unknown", json!([a, b, UNKNOWN_ID])),
        ("empty", json!([])),
    ] {
        let (status, body) = reorder(ids).send(&app).await;
        assert_eq!(status, StatusCode::BAD_REQUEST, "{case} list");
        assert_eq!(
            body["error"],
            ValidationError::LabelOrderMismatch.to_string()
        );
        assert_eq!(
            names(&labels(&app).await),
            ["C", "A", "B"],
            "the rejected {case} reorder changed nothing"
        );
    }
}

#[tokio::test]
async fn update_and_delete_unknown_id_are_404() {
    let app = app().await;
    let uri = format!("/api/labels/{UNKNOWN_ID}");

    let (status, _) = patch(&uri).json(json!({"name": "x"})).send(&app).await;
    assert_eq!(status, StatusCode::NOT_FOUND);

    let (status, _) = delete(&uri).send(&app).await;
    assert_eq!(status, StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn duplicate_names_are_rejected_case_insensitively() {
    let app = app().await;
    let work = id_of(&create_label(&app, "Work", PINE).await);
    let errands = id_of(&create_label(&app, "Errands", PINE).await);

    for dup in ["Work", "  work  ", "WORK"] {
        let (status, body) = post("/api/labels")
            .json(json!({"name": dup, "color": PINE}))
            .send(&app)
            .await;
        assert_eq!(status, StatusCode::BAD_REQUEST, "{dup:?} should clash");
        assert_eq!(
            body["error"],
            ValidationError::DuplicateLabelName.to_string()
        );
    }

    let rename =
        |id: i64, name: &str| patch(&format!("/api/labels/{id}")).json(json!({"name": name}));
    let (status, _) = rename(errands, "work").send(&app).await;
    assert_eq!(status, StatusCode::BAD_REQUEST);

    let (status, same) = rename(work, "Work").send(&app).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(same["name"], "Work");
    let (status, recased) = rename(work, "work").send(&app).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(recased["name"], "work");

    assert_eq!(labels(&app).await.len(), 2);
}
