//! Label business rules: validate input, assign ordering, delegate SQL to `db`.

use sqlx::SqlitePool;

use crate::config;
use crate::db;
use crate::domain::{Label, LABEL_PALETTE};
use crate::error::{AppError, AppResult};
use crate::services::validation::non_empty_capped;

pub async fn list(pool: &SqlitePool) -> AppResult<Vec<Label>> {
    Ok(db::label::list(pool).await?)
}

pub async fn create(pool: &SqlitePool, name: &str, color: &str) -> AppResult<Label> {
    let name = non_empty_capped(name, "label name", config::MAX_LABEL_NAME_LEN)?;
    let color = validate_color(color)?;
    let sort_order = db::label::next_sort_order(pool).await?;
    Ok(db::label::insert(pool, &name, &color, sort_order).await?)
}

/// Partial update: `None` fields keep their current value. 404 if the id is unknown.
pub async fn update(
    pool: &SqlitePool,
    id: i64,
    name: Option<&str>,
    color: Option<&str>,
) -> AppResult<Label> {
    let current = db::label::get(pool, id).await?.ok_or(AppError::NotFound)?;
    let name = match name {
        Some(n) => non_empty_capped(n, "label name", config::MAX_LABEL_NAME_LEN)?,
        None => current.name,
    };
    let color = match color {
        Some(c) => validate_color(c)?,
        None => current.color,
    };
    db::label::update(pool, id, &name, &color)
        .await?
        .ok_or(AppError::NotFound)
}

pub async fn delete(pool: &SqlitePool, id: i64) -> AppResult<()> {
    if db::label::delete(pool, id).await? {
        Ok(())
    } else {
        Err(AppError::NotFound)
    }
}

/// Accept only colors from the fixed palette (case-insensitive), storing the
/// canonical uppercase hex.
fn validate_color(color: &str) -> AppResult<String> {
    let candidate = color.trim();
    if LABEL_PALETTE
        .iter()
        .any(|hex| hex.eq_ignore_ascii_case(candidate))
    {
        Ok(candidate.to_ascii_uppercase())
    } else {
        Err(AppError::Validation(
            "label color must be one of the palette colors".into(),
        ))
    }
}
