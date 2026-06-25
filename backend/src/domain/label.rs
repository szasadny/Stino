use serde::Serialize;

/// A color label users assign to tasks. Mirrors the `label` table.
#[derive(Debug, Clone, Serialize)]
pub struct Label {
    pub id: i64,
    pub name: String,
    pub color: String,
    /// Optional emoji glyph shown beside the color dot; `None` ⇒ color-only.
    pub emoji: Option<String>,
    pub sort_order: i64,
}

/// Fixed, nature-derived label palette — the colors a user may assign to a label.
/// This is the backend copy of one source of truth that necessarily spans the
/// language boundary: the frontend defines it once in `frontend/src/lib/palette.js`
/// (which `constants.ts` and `tailwind.config.js` both import); this `const` must
/// stay in sync with that file. The `palette_is_unchanged` test below guards the
/// list against accidental edits. Label colors are the one user-data exception to
/// "use design tokens, no raw hex".
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

    /// Pins the palette to its agreed values, so an accidental edit here fails
    /// CI rather than silently drifting from the frontend's `palette.js` mirror.
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
