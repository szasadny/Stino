use std::path::PathBuf;

// Domain constants — the single source of truth for validation limits and the
// local date/time wire formats, shared across the service layer so no value is
// written twice. (Runtime, environment-driven settings live in `Config` below.)

/// Cap titles so list rows stay legible; notes are unbounded (free text).
pub const MAX_TITLE_LEN: usize = 200;
/// Cap label names so the UI chips stay legible; imported names are clamped to it.
pub const MAX_LABEL_NAME_LEN: usize = 60;
/// Local calendar-date format (`YYYY-MM-DD`). Stored verbatim, never via UTC
/// (Hard Rule 7). This is the `chrono` pattern, not the human label.
pub const DATE_FORMAT: &str = "%Y-%m-%d";
/// Local wall-clock time format (`HH:MM`, 24-hour). The `chrono` pattern.
pub const TIME_FORMAT: &str = "%H:%M";

/// Runtime configuration, sourced entirely from environment variables so the
/// same binary runs in local dev and in the container without code changes.
#[derive(Clone, Debug)]
pub struct Config {
    /// TCP port the HTTP server binds to.
    pub port: u16,
    /// Directory that holds the SQLite database file (mounted volume in prod).
    pub data_dir: PathBuf,
    /// Optional explicit SQLx connection string. When unset we use
    /// `<data_dir>/stino.db`, which is what dev and the container both rely on.
    pub database_url: Option<String>,
    /// Directory of built frontend assets to serve (prod). In dev the Vite dev
    /// server serves the UI and proxies `/api` here, so this can be absent.
    pub static_dir: PathBuf,
}

impl Config {
    pub fn from_env() -> anyhow::Result<Self> {
        let port = std::env::var("PORT")
            .ok()
            .and_then(|v| v.parse().ok())
            .unwrap_or(8080);
        let data_dir = std::env::var("DATA_DIR")
            .unwrap_or_else(|_| "data".to_string())
            .into();
        let database_url = std::env::var("DATABASE_URL").ok();
        let static_dir = std::env::var("STATIC_DIR")
            .unwrap_or_else(|_| "static".to_string())
            .into();

        Ok(Self {
            port,
            data_dir,
            database_url,
            static_dir,
        })
    }
}
