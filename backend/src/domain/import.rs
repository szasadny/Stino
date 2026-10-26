use serde::Serialize;

/// Mirror `ImportSummary` in `frontend/src/lib/types.ts`.
#[derive(Debug, Clone, Default, Serialize)]
pub struct ImportCreated {
    pub tasks: usize,
    pub labels: usize,
    pub completions: usize,
}

/// Add-only, so a re-run appends; `skipped` counts rows that couldn't be mapped.
#[derive(Debug, Clone, Default, Serialize)]
pub struct ImportSummary {
    pub created: ImportCreated,
    pub skipped: usize,
}
