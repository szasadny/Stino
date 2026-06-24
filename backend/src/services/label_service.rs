//! Label business rules: validate input, assign ordering, delegate SQL to `db`.

use sqlx::SqlitePool;

use crate::db;
use crate::domain::{Label, LABEL_PALETTE};
use crate::error::{AppError, AppResult};

/// Cap label names at a sane length so the UI chips stay legible.
const MAX_NAME_LEN: usize = 60;

pub async fn list(pool: &SqlitePool) -> AppResult<Vec<Label>> {
    Ok(db::label::list(pool).await?)
}

pub async fn create(pool: &SqlitePool, name: &str, color: &str) -> AppResult<Label> {
    let name = validate_name(name)?;
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
        Some(n) => validate_name(n)?,
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

fn validate_name(name: &str) -> AppResult<String> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err(AppError::Validation("label name must not be empty".into()));
    }
    if trimmed.chars().count() > MAX_NAME_LEN {
        return Err(AppError::Validation(format!(
            "label name must be at most {MAX_NAME_LEN} characters"
        )));
    }
    Ok(trimmed.to_string())
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
