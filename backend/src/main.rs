#[tokio::main]
async fn main() -> anyhow::Result<()> {
    stino_backend::run().await
}
