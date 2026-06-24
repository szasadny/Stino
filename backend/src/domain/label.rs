use serde::Serialize;

/// A color label users assign to tasks. Mirrors the `label` table.
#[derive(Debug, Clone, Serialize)]
pub struct Label {
    pub id: i64,
    pub name: String,
    pub color: String,
    pub sort_order: i64,
}

/// Fixed, nature-derived label palette — the colors a user may assign to a label.
/// This is the backend copy of one source of truth that necessarily spans the
/// language boundary: keep it in sync with `LABEL_PALETTE` in
/// `frontend/src/lib/constants.ts` and the `label.*` tokens in
/// `frontend/tailwind.config.js`. Label colors are the one user-data exception
/// to "use design tokens, no raw hex".
pub const LABEL_PALETTE: [&str; 8] = [
    "#2F5D50", // pine
    "#6F8F6B", // moss
    "#4F7A4A", // fern
    "#B0714A", // clay
    "#D8A24A", // amber
    "#6E94A8", // slate
    "#7C5A78", // plum
    "#8A8F88", // stone
];
