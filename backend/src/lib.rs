pub mod config;
mod db;
mod domain;
pub mod error;
pub mod routes;
pub mod services;

pub use domain::LABEL_PALETTE;

use anyhow::Context;
use tracing_subscriber::EnvFilter;

pub async fn run() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| EnvFilter::new(config::DEFAULT_LOG_FILTER)),
        )
        .init();

    let cfg = config::Config::from_env()?;
    let pool = db::connect(&cfg).await?;
    let app = routes::router(pool, &cfg.static_dir, cfg.allowed_hosts);

    let listener = tokio::net::TcpListener::bind((config::BIND_ADDR, cfg.port))
        .await
        .with_context(|| format!("binding to port {}", cfg.port))?;
    tracing::info!(
        "Stinō listening on http://{}:{}",
        config::BIND_ADDR,
        cfg.port
    );

    axum::serve(listener, app).await.context("server error")?;
    Ok(())
}
