use axum::http::StatusCode;
use axum::Router;
use serde_json::{json, Value};

use super::app::{delete, get, patch, post};

pub const UNKNOWN_ID: i64 = 9999;

pub async fn create_task(app: &Router, body: Value) -> Value {
    let (status, task) = post("/api/tasks").json(body).send(app).await;
    assert_eq!(status, StatusCode::CREATED, "create failed: {task}");
    task
}

pub async fn create_task_id(app: &Router, body: Value) -> i64 {
    id_of(&create_task(app, body).await)
}

pub async fn create_label(app: &Router, name: &str, color: &str) -> Value {
    let body = json!({"name": name, "color": color});
    let (status, label) = post("/api/labels").json(body).send(app).await;
    assert_eq!(status, StatusCode::CREATED, "create label failed: {label}");
    label
}

pub async fn patch_task(app: &Router, id: i64, body: Value) -> (StatusCode, Value) {
    patch(&format!("/api/tasks/{id}"))
        .json(body)
        .send(app)
        .await
}

pub async fn complete(app: &Router, id: i64, occurrence: Option<&str>) -> (StatusCode, Value) {
    post(&completions_uri(id, occurrence)).send(app).await
}

pub async fn uncomplete(app: &Router, id: i64, occurrence: Option<&str>) -> (StatusCode, Value) {
    delete(&completions_uri(id, occurrence)).send(app).await
}

fn completions_uri(id: i64, occurrence: Option<&str>) -> String {
    match occurrence {
        Some(date) => format!("/api/tasks/{id}/completions?occurrence_date={date}"),
        None => format!("/api/tasks/{id}/completions"),
    }
}

pub async fn batch(app: &Router, ids: &[i64], op: Value) -> StatusCode {
    let body = json!({"ids": ids, "op": op});
    post("/api/tasks/batch").json(body).send(app).await.0
}

pub async fn rollover(app: &Router, today: &str) -> (StatusCode, Value) {
    let body = json!({"today": today});
    post("/api/tasks/rollover").json(body).send(app).await
}

pub async fn move_occurrence(app: &Router, id: i64, from: &str, to: &str) -> (StatusCode, Value) {
    let body = json!({"occurrence_date": from, "new_date": to});
    let uri = format!("/api/tasks/{id}/move_occurrence");
    post(&uri).json(body).send(app).await
}

pub async fn skip(app: &Router, id: i64, date: &str) -> StatusCode {
    let body = json!({"occurrence_date": date});
    let uri = format!("/api/tasks/{id}/skip_occurrence");
    post(&uri).json(body).send(app).await.0
}

pub async fn list(app: &Router, uri: &str) -> Vec<Value> {
    let (status, body) = get(uri).send(app).await;
    assert_eq!(status, StatusCode::OK, "GET {uri}: {body}");
    let Value::Array(items) = body else {
        panic!("GET {uri} did not return an array: {body}");
    };
    items
}

pub async fn inbox(app: &Router) -> Vec<Value> {
    list(app, "/api/tasks?inbox=true").await
}

pub async fn day(app: &Router, date: &str) -> Vec<Value> {
    list(app, &format!("/api/tasks?date={date}")).await
}

pub async fn range(app: &Router, from: &str, to: &str) -> Vec<Value> {
    list(app, &format!("/api/tasks?from={from}&to={to}")).await
}

pub async fn labels(app: &Router) -> Vec<Value> {
    list(app, "/api/labels").await
}

pub async fn series_dates(app: &Router, id: i64, from: &str, to: &str) -> Vec<String> {
    let tasks = range(app, from, to).await;
    occurrence_dates(with_id(&tasks, id))
        .into_iter()
        .map(str::to_owned)
        .collect()
}

pub fn id_of(item: &Value) -> i64 {
    item["id"].as_i64().expect("id")
}

pub fn with_id(items: &[Value], id: i64) -> Vec<&Value> {
    items.iter().filter(|item| item["id"] == id).collect()
}

pub fn with_title<'a>(items: &'a [Value], title: &str) -> Vec<&'a Value> {
    items.iter().filter(|item| item["title"] == title).collect()
}

pub fn titles<'a>(items: impl IntoIterator<Item = &'a Value>) -> Vec<&'a str> {
    strings(items, "title")
}

pub fn names<'a>(items: impl IntoIterator<Item = &'a Value>) -> Vec<&'a str> {
    strings(items, "name")
}

pub fn occurrence_dates<'a>(items: impl IntoIterator<Item = &'a Value>) -> Vec<&'a str> {
    strings(items, "occurrence_date")
}

pub fn completed_flags<'a>(items: impl IntoIterator<Item = &'a Value>) -> Vec<bool> {
    items
        .into_iter()
        .map(|item| item["completed"].as_bool().expect("completed"))
        .collect()
}

fn strings<'a>(items: impl IntoIterator<Item = &'a Value>, key: &str) -> Vec<&'a str> {
    items
        .into_iter()
        .map(|item| item[key].as_str().expect(key))
        .collect()
}
