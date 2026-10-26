//! Label business rules: validate input, assign ordering, delegate SQL to `db`.

use sqlx::SqlitePool;

use crate::config;
use crate::db;
use crate::domain::{Label, LABEL_PALETTE};
use crate::error::{map_row_not_found, AppError, AppResult};
use crate::services::validation::non_empty_capped;

pub async fn list(pool: &SqlitePool) -> AppResult<Vec<Label>> {
    Ok(db::label::list(pool).await?)
}

pub async fn create(
    pool: &SqlitePool,
    name: &str,
    color: &str,
    emoji: Option<&str>,
) -> AppResult<Label> {
    let name = non_empty_capped(name, "label name", config::MAX_LABEL_NAME_LEN)?;
    ensure_name_free(pool, &name).await?;
    let color = validate_color(color)?;
    let emoji = clean_emoji(emoji)?;
    let sort_order = db::label::next_sort_order(pool).await?;
    Ok(db::label::insert(pool, &name, &color, emoji.as_deref(), sort_order).await?)
}

/// Partial update: an absent field keeps its current value; an explicit `null`
/// emoji clears it (the `Option<Option<…>>` mirrors the task PATCH semantics).
/// 404 if the id is unknown.
pub async fn update(
    pool: &SqlitePool,
    id: i64,
    name: Option<&str>,
    color: Option<&str>,
    emoji: Option<Option<&str>>,
) -> AppResult<Label> {
    let current = db::label::get(pool, id).await?.ok_or(AppError::NotFound)?;
    let name = match name {
        Some(n) => {
            let name = non_empty_capped(n, "label name", config::MAX_LABEL_NAME_LEN)?;
            // Legacy duplicates stay editable as long as the rename adds no new clash.
            if !name.eq_ignore_ascii_case(&current.name) {
                ensure_name_free(pool, &name).await?;
            }
            name
        }
        None => current.name,
    };
    let color = match color {
        Some(c) => validate_color(c)?,
        None => current.color,
    };
    let emoji = match emoji {
        Some(provided) => clean_emoji(provided)?,
        None => current.emoji,
    };
    db::label::update(pool, id, &name, &color, emoji.as_deref())
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

/// Each label's `sort_order` becomes its position in `ids`, atomically. `ids` must
/// list every label exactly once, else untouched labels would tie `sort_order`.
pub async fn reorder(pool: &SqlitePool, ids: &[i64]) -> AppResult<()> {
    let mut existing: Vec<i64> = db::label::list(pool).await?.iter().map(|l| l.id).collect();
    let mut given = ids.to_vec();
    existing.sort_unstable();
    given.sort_unstable();
    if given != existing {
        return Err(AppError::Validation(
            "ids must list every label exactly once".into(),
        ));
    }
    db::label::reorder(pool, ids)
        .await
        .map_err(map_row_not_found)
}

/// Case-insensitive, matching how the importer and quick-add dedupe.
async fn ensure_name_free(pool: &SqlitePool, name: &str) -> AppResult<()> {
    if db::label::find_by_name(pool, name).await?.is_some() {
        return Err(AppError::Validation(
            "a label with that name already exists".into(),
        ));
    }
    Ok(())
}

/// Normalize an optional emoji: trim it, treat blank as "no emoji" (`None`), and
/// cap its length so a single glyph is allowed but a pasted sentence is rejected.
fn clean_emoji(emoji: Option<&str>) -> AppResult<Option<String>> {
    let Some(trimmed) = emoji.map(str::trim).filter(|e| !e.is_empty()) else {
        return Ok(None);
    };
    if trimmed.chars().count() > config::MAX_LABEL_EMOJI_LEN {
        return Err(AppError::Validation(
            "label emoji must be a single emoji".into(),
        ));
    }
    Ok(Some(trimmed.to_string()))
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
