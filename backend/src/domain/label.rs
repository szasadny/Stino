use serde::{Deserialize, Serialize};

use super::double_option;

#[derive(Debug, Clone, Serialize)]
pub(crate) struct Label {
    pub id: i64,
    pub name: String,
    pub color: String,
    pub emoji: Option<String>,
    pub sort_order: i64,
}

#[derive(Debug, Deserialize)]
pub(crate) struct NewLabel {
    pub name: String,
    pub color: String,
    pub emoji: Option<String>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct LabelPatch {
    pub name: Option<String>,
    pub color: Option<String>,
    #[serde(default, deserialize_with = "double_option")]
    pub emoji: Option<Option<String>>,
}

// Mirrors `frontend/src/lib/palette.ts`; the frontend architecture test checks they match.
pub const LABEL_PALETTE: [&str; 8] = [
    "#2F5D50", "#6F8F6B", "#4F7A4A", "#B0714A", "#D8A24A", "#6E94A8", "#7C5A78", "#8A8F88",
];

// Deterministic: a new label takes the palette color at its append position.
pub(crate) fn palette_color(sort_order: i64) -> &'static str {
    LABEL_PALETTE[(sort_order as usize) % LABEL_PALETTE.len()]
}
