use serde::Serialize;

/// What a TickTick import wrote, by entity. Mirror `ImportSummary` in
/// `frontend/src/lib/types.ts`.
#[derive(Debug, Clone, Default, Serialize)]
pub struct ImportCreated {
    pub tasks: usize,
    pub labels: usize,
    pub completions: usize,
}

/// Result of a TickTick CSV import: the counts created and how many rows were
/// skipped (couldn't be mapped — e.g. a row with no title). The import is
/// **add-only** — it never deletes existing data — so a re-run appends.
#[derive(Debug, Clone, Default, Serialize)]
pub struct ImportSummary {
    pub created: ImportCreated,
    pub skipped: usize,
}
