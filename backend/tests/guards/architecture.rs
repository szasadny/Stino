use std::collections::BTreeSet;

use crate::source::{
    assert_none, bare, confine, crate_refs, has_token, offenders, sources_in, squashed_code,
};

const MAX_SRC_LINES: usize = 300;
const MAX_TEST_LINES: usize = 500;
const MAX_COMMENT_RUN: usize = 2;
pub(crate) const HISTORY_WORDS: &str = "previously|formerly|no longer|used to|was renamed";
const QUERY_TOKENS: [&str; 4] = ["sqlx::query", "query!", "query_as!", "query_scalar!"];

fn forbidden_modules(path: &str) -> fn(&str) -> bool {
    if path.starts_with("src/routes/") {
        |module| module == "db"
    } else if path.starts_with("src/services/") {
        |module| module == "routes"
    } else if path.starts_with("src/db/") {
        |module| matches!(module, "services" | "routes")
    } else if path.starts_with("src/domain/") {
        |module| !matches!(module, "error" | "config")
    } else if path == "src/config.rs" || path == "src/error.rs" {
        |module| matches!(module, "routes" | "services" | "db" | "domain")
    } else {
        |_| false
    }
}

#[test]
fn sqlx_is_named_only_in_db_and_the_error_boundary() {
    let fix = "Name sqlx only in src/db/ (and src/error.rs); elsewhere use the db::{Pool, Conn, Executor} aliases:";
    confine(&["src"], &["src/db/", "src/error.rs"], bare, &["sqlx"], fix);
}

#[test]
fn axum_is_named_only_in_routes_the_error_boundary_and_lib() {
    let fix = "Name axum only in src/routes/, src/error.rs and src/lib.rs; services return AppError and domain types:";
    let allowed = ["src/routes/", "src/error.rs", "src/lib.rs"];
    confine(&["src"], &allowed, bare, &["axum"], fix);
}

#[test]
fn layers_only_reach_downward() {
    let mut found = BTreeSet::new();
    for file in sources_in(&["src"]) {
        let forbidden = forbidden_modules(&file.path);
        for (line, module) in crate_refs(&file).into_iter().filter(|(_, m)| forbidden(m)) {
            found.insert(format!("{}:{line} crate::{module}", file.path));
        }
        if file.path.starts_with("src/routes/") {
            found.extend(offenders(&[file], &[], |line| {
                has_token(&line.bare, &["db::"])
            }));
        }
    }
    assert_none(found, "routes → services → db, never back up; domain may use only crate::error and crate::config; config and error use no layer. Call through the layer below instead:");
}

#[test]
fn only_app_error_builds_an_error_body() {
    let fix = "Only AppError::into_response in src/error.rs builds an error body; return an AppError instead:";
    let token = ["json!({\"error\""];
    confine(&["src"], &["src/error.rs"], squashed_code, &token, fix);
}

#[test]
fn no_lint_is_silenced_with_allow() {
    let fix = "Fix the lint instead of allowing it (tests may unwrap/expect via clippy.toml):";
    let tokens = ["#[allow(", "#![allow("];
    confine(&["src", "tests"], &[], bare, &tokens, fix);
}

#[test]
fn files_stay_short() {
    let mut found = Vec::new();
    for file in sources_in(&["src", "tests"]) {
        let src = file.path.starts_with("src/");
        let max = if src { MAX_SRC_LINES } else { MAX_TEST_LINES };
        if file.lines.len() > max {
            found.push(format!("{}:{} (limit {max})", file.path, file.lines.len()));
        }
    }
    let fix = "Split the file along its concerns (src ≤ 300 lines, tests ≤ 500):";
    assert_none(found, fix);
}

#[test]
fn comments_stay_short_and_current() {
    let mut found = Vec::new();
    for file in sources_in(&["src", "tests"]) {
        let mut run = 0;
        for (index, line) in file.lines.iter().enumerate() {
            let at = format!("{}:{}", file.path, index + 1);
            let full_line = line.comment.is_some() && line.bare.trim().is_empty();
            run = if full_line { run + 1 } else { 0 };
            if run == MAX_COMMENT_RUN + 1 {
                found.push(format!("{at} comment block over {MAX_COMMENT_RUN} lines"));
            }
            let Some(comment) = &line.comment else {
                continue;
            };
            let text = comment.trim_start_matches(['/', '!']).trim().to_lowercase();
            if text.starts_with("---") || text.starts_with("===") {
                found.push(format!("{at} section divider"));
            }
            if let Some(word) = HISTORY_WORDS.split('|').find(|word| text.contains(word)) {
                found.push(format!("{at} history word {word:?}"));
            }
        }
    }
    assert_none(found, "Comments: at most two lines of non-obvious why, no dividers, no change history (git holds it):");
}

#[test]
fn sql_lives_only_in_db() {
    let fix = "Write SQL only in src/db/ and call it through a db:: function:";
    confine(&["src"], &["src/db/"], bare, &QUERY_TOKENS, fix);
}
