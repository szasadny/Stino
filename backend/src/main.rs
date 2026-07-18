//! Binary entry point; server wiring lives in the library crate.

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    stino_backend::run().await
}
