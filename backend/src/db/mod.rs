pub(crate) mod label;
pub(crate) mod task;

use std::str::FromStr;

use anyhow::Context;
use sqlx::sqlite::{SqliteConnectOptions, SqliteJournalMode, SqlitePoolOptions, SqliteSynchronous};

use crate::config::{self, Config};

pub(crate) type Pool = sqlx::SqlitePool;
pub(crate) type Conn = sqlx::SqliteConnection;
pub(crate) use sqlx::SqliteExecutor as Executor;

pub(crate) async fn connect(cfg: &Config) -> anyhow::Result<Pool> {
    // SQLite can create the database file, but not the directory holding it.
    std::fs::create_dir_all(&cfg.data_dir)
        .with_context(|| format!("creating data dir {}", cfg.data_dir.display()))?;

    let options = match &cfg.database_url {
        Some(url) => SqliteConnectOptions::from_str(url)
            .with_context(|| format!("parsing DATABASE_URL {url}"))?,
        None => SqliteConnectOptions::new().filename(cfg.db_path()),
    }
    .create_if_missing(true)
    .foreign_keys(true)
    // WAL + NORMAL avoids an fsync per import row while staying crash-durable.
    .journal_mode(SqliteJournalMode::Wal)
    .synchronous(SqliteSynchronous::Normal)
    .busy_timeout(config::DB_BUSY_TIMEOUT);

    let pool = SqlitePoolOptions::new()
        .max_connections(config::DB_MAX_CONNECTIONS)
        .connect_with(options)
        .await
        .context("connecting to SQLite")?;

    sqlx::migrate!()
        .run(&pool)
        .await
        .context("running migrations")?;
    Ok(pool)
}

pub(crate) async fn ping(executor: impl Executor<'_>) -> bool {
    sqlx::query("SELECT 1").execute(executor).await.is_ok()
}
