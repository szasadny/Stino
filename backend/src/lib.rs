//! Stinō backend library crate. Module declarations live here (not in `main.rs`)
//! so integration tests in `tests/` can build the router against a temp database
//! — a binary-only crate can't be imported by its own tests.

pub mod config;
pub mod db;
pub mod domain;
pub mod error;
pub mod routes;
pub mod services;

use std::str::FromStr;
use std::time::Duration;

use anyhow::Context;
use sqlx::sqlite::{SqliteConnectOptions, SqliteJournalMode, SqlitePoolOptions, SqliteSynchronous};
use tracing_subscriber::EnvFilter;

/// Boot the server: configure logging, open the pool, run migrations, serve.
pub async fn run() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| EnvFilter::new("info,stino_backend=debug")),
        )
        .init();

    let cfg = config::Config::from_env()?;

    // SQLite can create the database file, but not the directory holding it.
    std::fs::create_dir_all(&cfg.data_dir)
        .with_context(|| format!("creating data dir {}", cfg.data_dir.display()))?;

    let connect_options = match &cfg.database_url {
        Some(url) => SqliteConnectOptions::from_str(url)
            .with_context(|| format!("parsing DATABASE_URL {url}"))?,
        None => SqliteConnectOptions::new().filename(cfg.data_dir.join("stino.db")),
    }
    .create_if_missing(true)
    .foreign_keys(true)
    // WAL + NORMAL: commits append to the write-ahead log and defer fsync to
    // checkpoint instead of fsync-ing on every autocommit (the default
    // DELETE/FULL). A bulk import is thousands of single-row inserts; under the
    // default that's thousands of fsyncs (minutes), under WAL it's a handful.
    // Durable across app/OS crashes; only a power loss mid-checkpoint risks the
    // last commits — fine for a single-user personal app (Hard Rule 8 holds).
    .journal_mode(SqliteJournalMode::Wal)
    .synchronous(SqliteSynchronous::Normal)
    // With up to 5 pooled connections one writer can hold the lock; wait for it
    // rather than failing the request with SQLITE_BUSY.
    .busy_timeout(Duration::from_secs(5));

    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect_with(connect_options)
        .await
        .context("connecting to SQLite")?;

    // Migrations are embedded at compile time from ./migrations.
    sqlx::migrate!()
        .run(&pool)
        .await
        .context("running migrations")?;

    let app = routes::router(pool, &cfg.static_dir, cfg.allowed_hosts.clone());

    let listener = tokio::net::TcpListener::bind(("0.0.0.0", cfg.port))
        .await
        .with_context(|| format!("binding to port {}", cfg.port))?;
    tracing::info!("Stinō listening on http://0.0.0.0:{}", cfg.port);

    axum::serve(listener, app).await.context("server error")?;
    Ok(())
}
