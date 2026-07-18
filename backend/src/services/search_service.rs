//! Case-insensitive task search over title and notes.

use sqlx::SqlitePool;

use crate::db;
use crate::domain::Task;
use crate::error::AppResult;

/// Find tasks whose `title` or `notes` contain `q`. A blank query (empty after
/// trim) returns no rows — a calm empty state, not an error. The term's LIKE
/// wildcards (`%`, `_`) and the escape char (`\`) are escaped so they match
/// literally rather than as patterns.
pub async fn search(pool: &SqlitePool, q: &str) -> AppResult<Vec<Task>> {
    let term = q.trim();
    if term.is_empty() {
        return Ok(Vec::new());
    }
    let pattern = format!("%{}%", escape_like(term));
    Ok(db::task::search(pool, &pattern).await?)
}

/// Escape LIKE metacharacters so a literal `%`/`_`/`\` in the term is matched as
/// itself (paired with `ESCAPE '\'` in the query). Backslash first, so the
/// escapes added afterwards aren't themselves re-escaped.
fn escape_like(term: &str) -> String {
    term.replace('\\', "\\\\")
        .replace('%', "\\%")
        .replace('_', "\\_")
}

#[cfg(test)]
mod tests {
    use super::escape_like;

    #[test]
    fn escapes_like_wildcards_and_the_escape_char() {
        assert_eq!(escape_like("100%"), "100\\%");
        assert_eq!(escape_like("a_b"), "a\\_b");
        assert_eq!(escape_like("c:\\path"), "c:\\\\path");
        assert_eq!(escape_like("plain"), "plain");
    }
}
