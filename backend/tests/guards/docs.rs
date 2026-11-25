use std::collections::BTreeSet;
use std::fs;
use std::path::PathBuf;

use crate::architecture::HISTORY_WORDS;
use crate::source::{assert_none, manifest_dir, or_panic, rust_files};

const ARCHITECTURE: &str = ".claude/ARCHITECTURE.md";
const BACKEND: &str = ".claude/ARCHITECTURE-BACKEND.md";
const DATA_MODEL: &str = ".claude/DATA-MODEL.md";
const AGENTS: &str = "AGENTS.md";
const DOCS: [&str; 3] = [ARCHITECTURE, BACKEND, DATA_MODEL];
const PATH_DOCS: [&str; 4] = [ARCHITECTURE, BACKEND, DATA_MODEL, AGENTS];
// About 20% above the trimmed docs; raising a cap needs the owner's approval.
const SIZE_CAPS: [(&str, usize); 3] = [
    (ARCHITECTURE, 31_900),
    (BACKEND, 15_600),
    (DATA_MODEL, 12_900),
];
const MAX_PROSE_CHARS: usize = 240;
const ROUTE_SECTION: &str = "### 3.2 ";
const PLACEHOLDER_CHARS: [char; 4] = ['<', '*', '{', '…'];
// Each part must appear on one line, in order.
const DOC_HISTORY_PHRASES: [&[&str]; 2] = [&["earlier "], &["before ", " existed"]];

fn repo_path(rel: &str) -> PathBuf {
    manifest_dir().join("..").join(rel)
}

fn read(rel: &str) -> String {
    let path = repo_path(rel);
    fs::read_to_string(&path).unwrap_or_else(or_panic(&path))
}

// Numbered lines outside ``` fences.
fn prose_lines(text: &str) -> Vec<(usize, &str)> {
    let mut fenced = false;
    let mut lines = Vec::new();
    for (index, line) in text.lines().enumerate() {
        if line.trim_start().starts_with("```") {
            fenced = !fenced;
        } else if !fenced {
            lines.push((index + 1, line));
        }
    }
    lines
}

fn backticked(line: &str) -> impl Iterator<Item = &str> {
    line.split('`').skip(1).step_by(2)
}

fn stem(rel: &str) -> &str {
    let name = rel.rsplit('/').next().unwrap_or(rel);
    name.strip_suffix(".rs").unwrap_or(name)
}

fn heading_level(line: &str) -> Option<usize> {
    let hashes = line.chars().take_while(|&c| c == '#').count();
    (hashes > 0 && line[hashes..].starts_with(' ')).then_some(hashes)
}

fn section<'a>(text: &'a str, heading: &str) -> Vec<&'a str> {
    let level = heading_level(heading).unwrap_or(0);
    let mut lines = text.lines().skip_while(|line| !line.starts_with(heading));
    let Some(first) = lines.next() else {
        panic!("{BACKEND} has no {heading:?} heading");
    };
    let inside = |line: &&str| heading_level(line).is_none_or(|l| l > level);
    std::iter::once(first)
        .chain(lines.take_while(inside))
        .collect()
}

#[test]
fn every_backend_source_file_is_documented() {
    let doc = read(BACKEND);
    let named: BTreeSet<&str> = prose_lines(&doc)
        .into_iter()
        .flat_map(|(_, line)| backticked(line))
        .flat_map(|token| token.split(['/', '.', ':']))
        .collect();
    let exempt = |rel: &str| matches!(stem(rel), "main" | "mod") || rel.contains("/tests/");
    let missing = rust_files(&["src"])
        .into_iter()
        .filter(|rel| !exempt(rel) && !named.contains(stem(rel)));
    assert_none(missing, "Name each backend/src file in .claude/ARCHITECTURE-BACKEND.md §3.1–§3.5 (one line: where it lives, what it is for):");
}

#[test]
fn route_list_matches_route_files() {
    let doc = read(BACKEND);
    let listed: BTreeSet<&str> = section(&doc, ROUTE_SECTION)
        .into_iter()
        .filter_map(|line| line.strip_prefix("| `")?.split_once('`'))
        .map(|(name, _)| name)
        .collect();
    let files = rust_files(&["src/routes"]);
    let actual: BTreeSet<&str> = files
        .iter()
        .map(|rel| stem(rel))
        .filter(|s| *s != "mod")
        .collect();
    let missing = actual
        .difference(&listed)
        .map(|name| format!("missing: {name}"));
    let stale = listed
        .difference(&actual)
        .map(|name| format!("stale: {name}"));
    assert_none(missing.chain(stale), "The §3.2 table in .claude/ARCHITECTURE-BACKEND.md must list exactly the files in backend/src/routes/:");
}

#[test]
fn doc_paths_exist() {
    let mut found = Vec::new();
    for doc in PATH_DOCS {
        let text = read(doc);
        for (number, line) in prose_lines(&text) {
            for token in backticked(line).filter(|t| t.starts_with("backend/")) {
                if token.contains(&PLACEHOLDER_CHARS[..]) {
                    continue;
                }
                let path = match token.rsplit_once(':') {
                    Some((path, n)) if !n.is_empty() && n.bytes().all(|b| b.is_ascii_digit()) => {
                        path
                    }
                    _ => token,
                };
                if !repo_path(path).exists() {
                    found.push(format!("{doc}:{number} {token}"));
                }
            }
        }
    }
    assert_none(
        found,
        "A backend/ path in the docs does not exist; correct or remove it:",
    );
}

#[test]
fn docs_describe_the_current_state() {
    let phrases: Vec<Vec<&str>> = HISTORY_WORDS
        .split('|')
        .map(|word| vec![word])
        .chain(DOC_HISTORY_PHRASES.iter().map(|parts| parts.to_vec()))
        .collect();
    let in_order = |hay: &str, parts: &[&str]| {
        let mut rest = hay;
        parts.iter().all(|part| match rest.find(part) {
            Some(at) => {
                rest = &rest[at + part.len()..];
                true
            }
            None => false,
        })
    };
    let mut found = Vec::new();
    for doc in DOCS {
        for (index, line) in read(doc).lines().enumerate() {
            let line = line.to_lowercase();
            for parts in phrases.iter().filter(|parts| in_order(&line, parts)) {
                found.push(format!("{doc}:{} {:?}", index + 1, parts.join("…")));
            }
        }
    }
    assert_none(
        found,
        "Docs describe the current state only; git holds the history:",
    );
}

#[test]
fn docs_stay_within_their_size() {
    let mut found = Vec::new();
    for (doc, cap) in SIZE_CAPS {
        let text = read(doc);
        if text.len() > cap {
            found.push(format!("{doc}: {} bytes (cap {cap})", text.len()));
        }
        for (number, line) in prose_lines(&text) {
            let chars = line.chars().count();
            if !line.starts_with('|') && chars > MAX_PROSE_CHARS {
                found.push(format!(
                    "{doc}:{number} prose line of {chars} chars (max {MAX_PROSE_CHARS})"
                ));
            }
        }
    }
    assert_none(found, "Trim the doc first (how-it-works, duplicates, history); a cap rises only with the owner's approval:");
}
