use crate::db::{self, Pool};
use crate::domain::Health;

const HEALTHY: &str = "ok";

pub(crate) async fn check(pool: &Pool) -> Health {
    Health {
        status: HEALTHY,
        db: db::ping(pool).await,
    }
}
