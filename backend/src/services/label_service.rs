use super::{found, Pool};
use crate::config::{MAX_LABEL_EMOJI_LEN, MAX_LABEL_NAME_LEN};
use crate::db::{self, Conn, Executor};
use crate::domain::{palette_color, Label, LabelPatch, NewLabel, LABEL_PALETTE};
use crate::error::{AppError, AppResult, ValidationError};
use crate::services::validation::{clean_optional, validate_label_name};

pub(crate) async fn list(pool: &Pool) -> AppResult<Vec<Label>> {
    Ok(db::label::list(pool).await?)
}

pub(crate) async fn create(pool: &Pool, input: NewLabel) -> AppResult<Label> {
    let name = validate_label_name(&input.name)?;
    ensure_name_free(pool, &name).await?;
    let color = validate_color(&input.color)?;
    let emoji = clean_emoji(input.emoji)?;
    let sort_order = db::label::next_sort_order(pool).await?;
    Ok(db::label::insert(pool, &name, &color, emoji.as_deref(), sort_order).await?)
}

pub(crate) async fn update(pool: &Pool, id: i64, patch: LabelPatch) -> AppResult<Label> {
    let current = db::label::get(pool, id).await?.ok_or(AppError::NotFound)?;
    let name = match patch.name {
        Some(raw) => {
            let name = validate_label_name(&raw)?;
            // Legacy duplicates stay editable as long as the rename adds no new clash.
            if !name.eq_ignore_ascii_case(&current.name) {
                ensure_name_free(pool, &name).await?;
            }
            name
        }
        None => current.name,
    };
    let color = match patch.color {
        Some(raw) => validate_color(&raw)?,
        None => current.color,
    };
    let emoji = match patch.emoji {
        Some(raw) => clean_emoji(raw)?,
        None => current.emoji,
    };
    db::label::update(pool, id, &name, &color, emoji.as_deref())
        .await?
        .ok_or(AppError::NotFound)
}

pub(crate) async fn delete(pool: &Pool, id: i64) -> AppResult<()> {
    found(db::label::delete(pool, id).await?)
}

// `ids` must list every label exactly once, else untouched labels would tie `sort_order`.
pub(crate) async fn reorder(pool: &Pool, ids: &[i64]) -> AppResult<()> {
    let mut existing: Vec<i64> = db::label::list(pool).await?.iter().map(|l| l.id).collect();
    let mut given = ids.to_vec();
    existing.sort_unstable();
    given.sort_unstable();
    if given != existing {
        return Err(ValidationError::LabelOrderMismatch.into());
    }
    let mut tx = pool.begin().await?;
    for (position, id) in (0..).zip(ids) {
        found(db::label::set_sort_order(&mut *tx, *id, position).await?)?;
    }
    Ok(tx.commit().await?)
}

pub(crate) async fn ensure_exists(executor: impl Executor<'_>, id: i64) -> AppResult<()> {
    match db::label::get(executor, id).await? {
        Some(_) => Ok(()),
        None => Err(ValidationError::UnknownLabel.into()),
    }
}

// Imported names are clamped to the cap rather than rejected.
pub(crate) fn clamp_name(raw: &str) -> String {
    raw.trim().chars().take(MAX_LABEL_NAME_LEN).collect()
}

pub(crate) enum Resolved {
    Existing(i64),
    Created(i64),
}

pub(crate) async fn find_or_create_on(conn: &mut Conn, name: &str) -> AppResult<Resolved> {
    if let Some(label) = db::label::find_by_name(&mut *conn, name).await? {
        return Ok(Resolved::Existing(label.id));
    }
    let sort_order = db::label::next_sort_order(&mut *conn).await?;
    let color = palette_color(sort_order);
    let label = db::label::insert(&mut *conn, name, color, None, sort_order).await?;
    Ok(Resolved::Created(label.id))
}

// Case-insensitive, matching how the importer and quick-add dedupe.
async fn ensure_name_free(pool: &Pool, name: &str) -> AppResult<()> {
    if db::label::find_by_name(pool, name).await?.is_some() {
        return Err(ValidationError::DuplicateLabelName.into());
    }
    Ok(())
}

fn clean_emoji(emoji: Option<String>) -> Result<Option<String>, ValidationError> {
    let emoji = clean_optional(emoji);
    if emoji
        .as_ref()
        .is_some_and(|e| e.chars().count() > MAX_LABEL_EMOJI_LEN)
    {
        return Err(ValidationError::EmojiTooLong);
    }
    Ok(emoji)
}

fn validate_color(color: &str) -> Result<String, ValidationError> {
    let candidate = color.trim();
    if LABEL_PALETTE
        .iter()
        .any(|hex| hex.eq_ignore_ascii_case(candidate))
    {
        Ok(candidate.to_ascii_uppercase())
    } else {
        Err(ValidationError::OffPaletteColor)
    }
}
