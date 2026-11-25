use std::fs;
use std::path::{Path, PathBuf};

pub(crate) struct Source {
    pub(crate) path: String,
    pub(crate) lines: Vec<Line>,
}

// `code` drops the comment; `bare` also blanks string and char literal contents.
#[derive(Default)]
pub(crate) struct Line {
    pub(crate) code: String,
    pub(crate) bare: String,
    pub(crate) comment: Option<String>,
}

#[derive(Clone, Copy)]
enum Mode {
    Code,
    // `Some(n)`: a raw string, closed by `"` plus n `#`.
    Str(Option<usize>),
}

pub(crate) fn manifest_dir() -> &'static Path {
    Path::new(env!("CARGO_MANIFEST_DIR"))
}

// Paths relative to the manifest dir (`src/…`), sorted.
pub(crate) fn rust_files(dirs: &[&str]) -> Vec<String> {
    let root = manifest_dir();
    let mut pending: Vec<PathBuf> = dirs.iter().map(|dir| root.join(dir)).collect();
    let mut files = Vec::new();
    while let Some(path) = pending.pop() {
        if path.is_dir() {
            for entry in fs::read_dir(&path).unwrap_or_else(or_panic(&path)) {
                pending.push(entry.unwrap_or_else(or_panic(&path)).path());
            }
        } else if path.extension().is_some_and(|ext| ext == "rs") {
            let rel = path.strip_prefix(root).unwrap_or(&path).to_string_lossy();
            files.push(rel.replace('\\', "/"));
        }
    }
    files.sort();
    files
}

pub(crate) fn sources_in(dirs: &[&str]) -> Vec<Source> {
    let read = |path: String| {
        let full = manifest_dir().join(&path);
        let lines = lex(&fs::read_to_string(&full).unwrap_or_else(or_panic(&full)));
        Source { path, lines }
    };
    rust_files(dirs).into_iter().map(read).collect()
}

pub(crate) fn or_panic<T>(path: &Path) -> impl FnOnce(std::io::Error) -> T + '_ {
    move |err| panic!("reading {}: {err}", path.display())
}

fn lex(text: &str) -> Vec<Line> {
    let mut mode = Mode::Code;
    text.lines().map(|raw| lex_line(raw, &mut mode)).collect()
}

fn lex_line(raw: &str, mode: &mut Mode) -> Line {
    let chars: Vec<char> = raw.chars().collect();
    let at = |i: usize| chars.get(i).copied().unwrap_or('\0');
    let mut line = Line::default();
    let mut i = 0;
    while i < chars.len() {
        let c = chars[i];
        let width = match *mode {
            Mode::Str(None) if c == '\\' => 2,
            Mode::Str(raw) if c == '"' && (1..=raw.unwrap_or(0)).all(|k| at(i + k) == '#') => {
                line.bare.push('"');
                *mode = Mode::Code;
                1 + raw.unwrap_or(0)
            }
            Mode::Str(_) => 1,
            Mode::Code if c == '/' && at(i + 1) == '/' => {
                line.comment = Some(raw_slice(&chars, i, chars.len() - i));
                break;
            }
            Mode::Code => lex_code(&chars, i, &mut line, mode),
        };
        line.code.push_str(&raw_slice(&chars, i, width));
        i += width;
    }
    line
}

// Classifies the code char at `i`, updates `bare`, and returns how many chars it spans.
fn lex_code(chars: &[char], i: usize, line: &mut Line, mode: &mut Mode) -> usize {
    let at = |k: usize| chars.get(k).copied().unwrap_or('\0');
    let c = chars[i];
    let hashes = chars[i + 1..].iter().take_while(|&&ch| ch == '#').count();
    let starts_raw = c == 'r' && at(i + 1 + hashes) == '"' && (i == 0 || !is_ident(chars[i - 1]));
    let (width, placeholder) = if c == '"' {
        *mode = Mode::Str(None);
        (1, "\"")
    } else if starts_raw {
        *mode = Mode::Str(Some(hashes));
        (2 + hashes, "\"")
    } else if c == '\'' && at(i + 1) == '\\' {
        let end = (i + 3..chars.len()).find(|&k| chars[k] == '\'');
        (end.map_or(1, |end| end + 1 - i), "''")
    } else if c == '\'' && at(i + 2) == '\'' {
        (3, "''")
    } else {
        line.bare.push(c);
        return 1;
    };
    line.bare.push_str(placeholder);
    width
}

fn raw_slice(chars: &[char], start: usize, len: usize) -> String {
    chars.iter().skip(start).take(len).collect()
}

fn is_ident(c: char) -> bool {
    c.is_alphanumeric() || c == '_'
}

// Byte offsets where `token` starts and is not the tail of a longer identifier.
fn token_starts<'a>(hay: &'a str, token: &'a str) -> impl Iterator<Item = usize> + 'a {
    let bounded = |&pos: &usize| !hay[..pos].chars().next_back().is_some_and(is_ident);
    hay.match_indices(token).map(|(pos, _)| pos).filter(bounded)
}

pub(crate) fn has_token(hay: &str, tokens: &[&str]) -> bool {
    tokens.iter().any(|t| token_starts(hay, t).count() > 0)
}

pub(crate) fn bare(line: &Line) -> String {
    line.bare.clone()
}

pub(crate) fn squashed_code(line: &Line) -> String {
    line.code.split_whitespace().collect()
}

pub(crate) fn offenders(
    files: &[Source],
    allowed: &[&str],
    hit: impl Fn(&Line) -> bool,
) -> Vec<String> {
    let mut found = Vec::new();
    for file in files {
        if allowed.iter().any(|prefix| file.path.starts_with(prefix)) {
            continue;
        }
        for (index, _) in file.lines.iter().enumerate().filter(|(_, line)| hit(line)) {
            found.push(format!("{}:{}", file.path, index + 1));
        }
    }
    found
}

pub(crate) fn assert_none(found: impl IntoIterator<Item = String>, fix: &str) {
    let found: Vec<String> = found.into_iter().collect();
    assert!(found.is_empty(), "{fix}\n  {}", found.join("\n  "));
}

pub(crate) fn confine(
    dirs: &[&str],
    allowed: &[&str],
    view: fn(&Line) -> String,
    tokens: &[&str],
    fix: &str,
) {
    let hit = |line: &Line| has_token(&view(line), tokens);
    assert_none(offenders(&sources_in(dirs), allowed, hit), fix);
}

// Each `crate::` path's first segment (every member of a `crate::{..}` group), by line.
pub(crate) fn crate_refs(file: &Source) -> Vec<(usize, String)> {
    let text = file.lines.iter().map(bare).collect::<Vec<_>>().join("\n");
    let mut refs = Vec::new();
    for pos in token_starts(&text, "crate::") {
        let line = text[..pos].matches('\n').count() + 1;
        let rest = &text[pos + "crate::".len()..];
        refs.extend(path_heads(rest).into_iter().map(|head| (line, head)));
    }
    refs
}

fn path_heads(rest: &str) -> Vec<String> {
    let ident_at = |s: &str| s.chars().take_while(|&c| is_ident(c)).collect::<String>();
    let Some(group) = rest.strip_prefix('{') else {
        return vec![ident_at(rest)];
    };
    let (mut heads, mut depth, mut wants_head) = (Vec::new(), 0, true);
    for (index, c) in group.char_indices() {
        match c {
            '}' if depth == 0 => break,
            '{' => depth += 1,
            '}' => depth -= 1,
            ',' if depth == 0 => wants_head = true,
            c if wants_head && is_ident(c) => {
                heads.push(ident_at(&group[index..]));
                wants_head = false;
            }
            _ => {}
        }
    }
    heads
}
