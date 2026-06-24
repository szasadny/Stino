//! Binary entry point. All wiring lives in the library crate (`lib.rs`) so it
//! can be exercised by integration tests; `main` just runs it.

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    stino_backend::run().await
}
