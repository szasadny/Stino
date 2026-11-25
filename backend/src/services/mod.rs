pub(crate) mod health_service;
pub mod import;
pub(crate) mod label_service;
pub(crate) mod recurrence;
pub(crate) mod search_service;
pub(crate) mod task;
pub(crate) mod validation;

pub(crate) use crate::db::Pool;
use crate::error::{AppError, AppResult};

fn found(hit: bool) -> AppResult<()> {
    if hit {
        Ok(())
    } else {
        Err(AppError::NotFound)
    }
}
