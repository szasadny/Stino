use std::collections::HashMap;

use csv::StringRecord;

use crate::error::ValidationError;

// Lowercased TickTick columns we read; unmapped ones (Reminder, Priority, …) are never looked up.
pub(super) const COL_TITLE: &str = "title";
pub(super) const COL_CONTENT: &str = "content";
pub(super) const COL_TAGS: &str = "tags";
pub(super) const COL_LIST: &str = "list name";
pub(super) const COL_DUE: &str = "due date";
pub(super) const COL_ALL_DAY: &str = "is all day";
pub(super) const COL_TIMEZONE: &str = "timezone";
pub(super) const COL_FLOATING: &str = "is floating";
pub(super) const COL_REPEAT: &str = "repeat";
pub(super) const COL_STATUS: &str = "status";
pub(super) const COL_COMPLETED: &str = "completed time";

const UTF8_BOM: &[u8] = b"\xEF\xBB\xBF";
const CSV_TRUE: &str = "true";

pub(super) struct Sheet {
    headers: HashMap<String, usize>,
    records: Vec<StringRecord>,
}

#[derive(Clone, Copy)]
pub(super) struct Row<'a> {
    headers: &'a HashMap<String, usize>,
    record: &'a StringRecord,
}

impl Sheet {
    pub(super) fn rows(&self) -> impl Iterator<Item = Row<'_>> {
        self.records.iter().map(|record| Row {
            headers: &self.headers,
            record,
        })
    }
}

impl<'a> Row<'a> {
    pub(super) fn get(&self, column: &str) -> Option<&'a str> {
        let index = *self.headers.get(column)?;
        let value = self.record.get(index)?.trim();
        (!value.is_empty()).then_some(value)
    }
}

// Lossy, to tolerate stray bytes.
pub(super) fn decode(bytes: &[u8]) -> String {
    let bytes = bytes.strip_prefix(UTF8_BOM).unwrap_or(bytes);
    String::from_utf8_lossy(bytes).into_owned()
}

// TickTick prefixes metadata lines of varying width, so the header is the first row with a Title.
pub(super) fn parse(text: &str) -> Result<Sheet, ValidationError> {
    let mut reader = csv::ReaderBuilder::new()
        .has_headers(false)
        .flexible(true)
        .from_reader(text.as_bytes());

    let mut headers = None;
    let mut records = Vec::new();
    for result in reader.records() {
        let record = result.map_err(|_| ValidationError::InvalidCsv)?;
        match headers {
            None => headers = header_map(&record),
            Some(_) => records.push(record),
        }
    }
    let headers = headers.ok_or(ValidationError::NotTickTickCsv)?;
    Ok(Sheet { headers, records })
}

fn header_map(record: &StringRecord) -> Option<HashMap<String, usize>> {
    let map: HashMap<String, usize> = record
        .iter()
        .enumerate()
        .map(|(index, name)| (name.trim().to_lowercase(), index))
        .collect();
    map.contains_key(COL_TITLE).then_some(map)
}

pub(super) fn is_true(raw: Option<&str>) -> bool {
    raw.is_some_and(|v| v.eq_ignore_ascii_case(CSV_TRUE))
}
