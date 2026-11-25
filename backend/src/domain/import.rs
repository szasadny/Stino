use serde::Serialize;

#[derive(Debug, Clone, Default, Serialize)]
pub struct ImportCreated {
    pub tasks: usize,
    pub labels: usize,
    pub completions: usize,
}

// Mirror `ImportSummary` in `frontend/src/lib/types.ts`.
#[derive(Debug, Clone, Default, Serialize)]
pub struct ImportSummary {
    pub created: ImportCreated,
    pub skipped: usize,
}
