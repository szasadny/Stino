use sqlx::SqlitePool;

use crate::db;
use crate::domain::Task;
use crate::error::AppResult;

/// A blank query returns no rows rather than an error.
pub async fn search(pool: &SqlitePool, q: &str) -> AppResult<Vec<Task>> {
    let term = q.trim();
    if term.is_empty() {
        return Ok(Vec::new());
    }
    let pattern = format!("%{}%", escape_like(term));
    Ok(db::task::search(pool, &pattern).await?)
}

/// Backslash first, so the escapes added afterwards aren't re-escaped.
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
