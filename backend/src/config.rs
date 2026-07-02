use std::path::PathBuf;

use anyhow::Context;

// Domain constants — the single source of truth for validation limits and the
// local date/time wire formats, shared across the service layer so no value is
// written twice. (Runtime, environment-driven settings live in `Config` below.)

/// Cap titles so list rows stay legible; notes are unbounded (free text).
pub const MAX_TITLE_LEN: usize = 200;
/// Cap label names so the UI chips stay legible; imported names are clamped to it.
pub const MAX_LABEL_NAME_LEN: usize = 60;
/// Cap a label's emoji by code-point count — enough for a single glyph including
/// multi-codepoint ZWJ/flag sequences, while rejecting pasted sentences.
pub const MAX_LABEL_EMOJI_LEN: usize = 8;
/// Local calendar-date format (`YYYY-MM-DD`). Stored verbatim, never via UTC
/// (Hard Rule 7). This is the `chrono` pattern, not the human label.
pub const DATE_FORMAT: &str = "%Y-%m-%d";
/// Local wall-clock time format (`HH:MM`, 24-hour). The `chrono` pattern.
pub const TIME_FORMAT: &str = "%H:%M";
/// Request-body cap for the TickTick CSV import route. Axum's default limit is
/// 2 MB, which a real multi-year backup can exceed; 32 MB is far beyond any
/// plausible export while still bounding the upload.
pub const IMPORT_MAX_BODY_BYTES: usize = 32 * 1024 * 1024;

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
    /// Optional Host-header allowlist (from `ALLOWED_HOSTS`, comma-separated
    /// hostnames without ports) — a DNS-rebinding guard for a server that runs
    /// without auth. `None` (unset/blank) accepts any Host, unchanged.
    pub allowed_hosts: Option<Vec<String>>,
}

impl Config {
    pub fn from_env() -> anyhow::Result<Self> {
        // A present-but-unusable PORT fails startup loudly — silently falling
        // back to 8080 would hide a broken deployment config, and 0 would bind
        // an OS-assigned random port no port mapping points at. Absent still
        // defaults.
        let port = match std::env::var("PORT") {
            Ok(raw) => raw
                .trim()
                .parse()
                .ok()
                .filter(|port| *port != 0)
                .with_context(|| format!("parsing PORT {raw:?} (expected a number 1-65535)"))?,
            Err(_) => 8080,
        };
        let data_dir = std::env::var("DATA_DIR")
            .unwrap_or_else(|_| "data".to_string())
            .into();
        let database_url = std::env::var("DATABASE_URL").ok();
        let static_dir = std::env::var("STATIC_DIR")
            .unwrap_or_else(|_| "static".to_string())
            .into();
        let allowed_hosts = std::env::var("ALLOWED_HOSTS")
            .ok()
            .map(parse_allowed_hosts)
            .filter(|hosts| !hosts.is_empty());

        Ok(Self {
            port,
            data_dir,
            database_url,
            static_dir,
            allowed_hosts,
        })
    }
}

/// Split `ALLOWED_HOSTS` into trimmed, lowercased hostnames; empty entries (a
/// trailing comma) are dropped.
fn parse_allowed_hosts(raw: String) -> Vec<String> {
    raw.split(',')
        .map(|host| host.trim().to_ascii_lowercase())
        .filter(|host| !host.is_empty())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    /// One test covers all PORT cases so the env-var mutation stays sequential
    /// (tests run in parallel threads; nothing else reads PORT, but two tests
    /// setting it would race each other).
    #[test]
    fn port_defaults_when_absent_parses_when_valid_and_fails_startup_when_not() {
        std::env::remove_var("PORT");
        assert_eq!(Config::from_env().expect("absent PORT defaults").port, 8080);

        std::env::set_var("PORT", "9090");
        assert_eq!(Config::from_env().expect("valid PORT parses").port, 9090);

        std::env::set_var("PORT", "not-a-port");
        let err = Config::from_env().expect_err("garbage PORT must fail startup");
        assert!(err.to_string().contains("PORT"), "error names the variable");

        // 0 parses as a u16 but binds an OS-assigned random port that no
        // compose port mapping would reach — reject it like garbage.
        std::env::set_var("PORT", "0");
        Config::from_env().expect_err("PORT=0 must fail startup");

        std::env::remove_var("PORT");
    }

    #[test]
    fn allowed_hosts_are_trimmed_lowercased_and_blank_entries_dropped() {
        assert_eq!(
            parse_allowed_hosts("Stino.Example, tail1234.ts.net ,".into()),
            vec!["stino.example".to_string(), "tail1234.ts.net".to_string()]
        );
        assert!(parse_allowed_hosts("  ".into()).is_empty());
    }
}
