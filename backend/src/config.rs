use std::path::PathBuf;
use std::time::Duration;

use anyhow::Context;

pub const MAX_TITLE_LEN: usize = 200;
pub(crate) const MAX_LABEL_NAME_LEN: usize = 60;
// Code points, so multi-codepoint ZWJ/flag glyphs fit but pasted text doesn't.
pub(crate) const MAX_LABEL_EMOJI_LEN: usize = 8;
pub(crate) const DATE_FORMAT: &str = "%Y-%m-%d";
pub(crate) const DATE_HINT: &str = "YYYY-MM-DD";
pub(crate) const TIME_FORMAT: &str = "%H:%M";
pub(crate) const TIME_HINT: &str = "HH:MM";
// TickTick writes the offset without a colon (`+0000`), so `%z`, not RFC-3339.
pub(crate) const TICKTICK_DT_FORMAT: &str = "%Y-%m-%dT%H:%M:%S%z";
// A multi-year TickTick backup can exceed Axum's 2 MB default.
pub(crate) const IMPORT_MAX_BODY_BYTES: usize = 32 * 1024 * 1024;
// Guards a pathological rule; real windows are ≤ 42 days.
pub(crate) const MAX_OCCURRENCES: u16 = 1000;

pub(crate) const DEFAULT_PORT: u16 = 8080;
pub(crate) const DEFAULT_DATA_DIR: &str = "data";
pub(crate) const DEFAULT_STATIC_DIR: &str = "static";
pub(crate) const DB_FILE_NAME: &str = "stino.db";
pub(crate) const DB_BUSY_TIMEOUT: Duration = Duration::from_secs(5);
pub(crate) const DB_MAX_CONNECTIONS: u32 = 5;
pub(crate) const BIND_ADDR: &str = "0.0.0.0";
pub(crate) const DEFAULT_LOG_FILTER: &str = "info,stino_backend=debug";

#[derive(Clone, Debug)]
pub(crate) struct Config {
    pub port: u16,
    pub data_dir: PathBuf,
    pub database_url: Option<String>,
    pub static_dir: PathBuf,
    // DNS-rebinding guard for an auth-less server; `None` accepts any Host.
    pub allowed_hosts: Option<Vec<String>>,
}

impl Config {
    pub(crate) fn from_env() -> anyhow::Result<Self> {
        // 0 would bind a random port no mapping points at.
        let port = match std::env::var("PORT") {
            Ok(raw) => raw
                .trim()
                .parse()
                .ok()
                .filter(|port| *port != 0)
                .with_context(|| format!("parsing PORT {raw:?} (expected a number 1-65535)"))?,
            Err(_) => DEFAULT_PORT,
        };
        let data_dir = std::env::var("DATA_DIR")
            .unwrap_or_else(|_| DEFAULT_DATA_DIR.to_string())
            .into();
        let database_url = std::env::var("DATABASE_URL").ok();
        let static_dir = std::env::var("STATIC_DIR")
            .unwrap_or_else(|_| DEFAULT_STATIC_DIR.to_string())
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

    pub(crate) fn db_path(&self) -> PathBuf {
        self.data_dir.join(DB_FILE_NAME)
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

    // One test for all PORT cases: env mutation from parallel tests would race.
    #[test]
    fn port_defaults_when_absent_parses_when_valid_and_fails_startup_when_not() {
        std::env::remove_var("PORT");
        assert_eq!(
            Config::from_env().expect("absent PORT defaults").port,
            DEFAULT_PORT
        );

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
