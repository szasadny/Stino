use axum::http::StatusCode;
use axum::Router;
use serde_json::Value;

use super::app::post;

pub const STATUS_DONE: &str = "1";
pub const STATUS_ARCHIVED: &str = "2";

const PREAMBLE: &str = "\"Date: 2026-06-25+0000\"\n\"Version: 7.1\"\n\"Status: 0 Normal, 1 Completed, 2 Archived\"\n\n";
const HEADER: [&str; 18] = [
    "Folder Name",
    "List Name",
    "Title",
    "Tags",
    "Content",
    "Is Check list",
    "Start Date",
    "Due Date",
    "Reminder",
    "Repeat",
    "Priority",
    "Status",
    "Created Time",
    "Completed Time",
    "Order",
    "Timezone",
    "Is All Day",
    "Is Floating",
];
const CREATED: &str = "2026-06-21T08:00:00+0000";

pub struct TickRow<'a> {
    pub list: &'a str,
    pub title: &'a str,
    pub tags: &'a str,
    pub content: &'a str,
    pub due: &'a str,
    pub repeat: &'a str,
    pub status: &'a str,
    pub completed_at: &'a str,
    pub timezone: &'a str,
    pub all_day: bool,
}

impl Default for TickRow<'_> {
    fn default() -> Self {
        Self {
            list: "Work",
            title: "",
            tags: "",
            content: "",
            due: "",
            repeat: "",
            status: "0",
            completed_at: "",
            timezone: "Europe/Amsterdam",
            all_day: false,
        }
    }
}

impl TickRow<'_> {
    fn fields(&self, order: usize) -> [String; 18] {
        let order = order.to_string();
        let all_day = self.all_day.to_string();
        [
            "",
            self.list,
            self.title,
            self.tags,
            self.content,
            "false",
            "",
            self.due,
            "",
            self.repeat,
            "0",
            self.status,
            CREATED,
            self.completed_at,
            &order,
            self.timezone,
            &all_day,
            "false",
        ]
        .map(str::to_owned)
    }
}

pub fn csv_with(rows: &[TickRow<'_>]) -> String {
    let mut csv = PREAMBLE.to_owned() + &csv_line(&HEADER);
    for (index, row) in rows.iter().enumerate() {
        csv += &csv_line(&row.fields(index + 1));
    }
    csv
}

fn csv_line(fields: &[impl AsRef<str>]) -> String {
    let quoted: Vec<String> = fields
        .iter()
        .map(|field| format!("\"{}\"", field.as_ref()))
        .collect();
    quoted.join(",") + "\n"
}

pub async fn import_csv(app: &Router, csv: &str) -> (StatusCode, Value) {
    post("/api/import/ticktick")
        .raw("text/csv", csv.to_owned())
        .send(app)
        .await
}
