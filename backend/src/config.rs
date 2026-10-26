use std::path::PathBuf;

use anyhow::Context;

/// Notes are unbounded free text.
pub const MAX_TITLE_LEN: usize = 200;
/// Cap label names so the UI chips stay legible; imported names are clamped to it.
pub const MAX_LABEL_NAME_LEN: usize = 60;
/// Counted in code points so multi-codepoint ZWJ/flag glyphs fit but pasted text doesn't.
pub const MAX_LABEL_EMOJI_LEN: usize = 8;
/// Local calendar date, stored verbatim — never via UTC.
pub const DATE_FORMAT: &str = "%Y-%m-%d";
pub const TIME_FORMAT: &str = "%H:%M";
/// A multi-year TickTick backup can exceed Axum's 2 MB default.
pub const IMPORT_MAX_BODY_BYTES: usize = 32 * 1024 * 1024;

#[derive(Clone, Debug)]
pub struct Config {
    pub port: u16,
    /// Mounted volume in prod.
    pub data_dir: PathBuf,
    /// Defaults to `<data_dir>/stino.db`.
    pub database_url: Option<String>,
    /// Absent in dev, where Vite serves the UI.
    pub static_dir: PathBuf,
    /// DNS-rebinding guard for an auth-less server. `None` accepts any Host.
    pub allowed_hosts: Option<Vec<String>>,
}

impl Config {
    pub fn from_env() -> anyhow::Result<Self> {
        // A present-but-unusable PORT fails loudly rather than silently defaulting;
        // 0 would bind a random port no mapping points at.
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

fn parse_allowed_hosts(raw: String) -> Vec<String> {
    raw.split(',')
        .map(|host| host.trim().to_ascii_lowercase())
        .filter(|host| !host.is_empty())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    /// One test for all PORT cases: env mutation from parallel tests would race.
    #[test]
    fn port_defaults_when_absent_parses_when_valid_and_fails_startup_when_not() {
        std::env::remove_var("PORT");
        assert_eq!(Config::from_env().expect("absent PORT defaults").port, 8080);

        std::env::set_var("PORT", "9090");
        assert_eq!(Config::from_env().expect("valid PORT parses").port, 9090);

        std::env::set_var("PORT", "not-a-port");
        let err = Config::from_env().expect_err("garbage PORT must fail startup");
        assert!(err.to_string().contains("PORT"), "error names the variable");

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
