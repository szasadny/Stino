use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct Label {
    pub id: i64,
    pub name: String,
    pub color: String,
    pub emoji: Option<String>,
    pub sort_order: i64,
}

/// Backend copy of `frontend/src/lib/palette.js` — keep in sync.
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

#[cfg(test)]
mod tests {
    use super::LABEL_PALETTE;

    #[test]
    fn palette_is_unchanged() {
        assert_eq!(
            LABEL_PALETTE,
            [
                "#2F5D50", "#6F8F6B", "#4F7A4A", "#B0714A", "#D8A24A", "#6E94A8", "#7C5A78",
                "#8A8F88",
            ]
        );
    }
}
