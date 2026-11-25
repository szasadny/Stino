---
name: maintaining-agents-md
description: Keep the agent docs (AGENTS.md, the three ARCHITECTURE files, DATA-MODEL.md) in sync with the code and inside their size caps. Use after adding or removing folders, when a docs guard fails, or when a doc feels stale or bloated.
tools: Read, Glob, Grep, Edit, Bash
---

# Maintaining the agent docs

Keep `AGENTS.md` and the docs in `.claude/` accurate and lean. Every line loads into future
prompts, so it must be true, in the right doc, and worth its place. `CLAUDE.md` stays a shim that
imports `AGENTS.md` plus Claude-only notes.

## When to run

- A **folder** was added, removed or repurposed.
- A docs guard fails: `backend/tests/guards/docs.rs`, or a docs `it(...)` in
  `frontend/src/lib/test/architecture.test.ts`.
- A doc feels out of sync with the code, or is close to its size cap.

A new file directly in `backend/src/`, `frontend/src/`, `frontend/src/lib/` or a shared `lib/`
folder needs its doc line; the guards in step 1 tell you which.

## What belongs where

| Doc | Holds | Never |
| --- | --- | --- |
| `AGENTS.md` | Rules, priorities, routing, conventions, exact commands, the folder map | Feature behaviour, file-level detail, changelogs, task notes |
| `ARCHITECTURE.md` | §0 where does X go, §6 cross-cutting concerns, §7 modularity contract with its enforcers, §8 maintenance | How a feature works |
| `ARCHITECTURE-BACKEND.md` | §3: layers, route files, service, db and domain modules, shared helpers, API contract, tests | Call flows, edge cases |
| `ARCHITECTURE-FRONTEND.md` | §4: layers, feature folders, controllers and state, components, helpers, drag contract, tokens | Component behaviour, walkthroughs |
| `DATA-MODEL.md` | §5: tables, columns, indexes, date and recurrence data rules, RRULE options, import mapping, mirrored constants | Process, flow order |

In every doc: one short sentence per fact, saying where it lives and what it is for. Behaviour
belongs in a test. Describe the current state only; no history words.

## Workflow

### 1. Run the docs guards

```sh
cd backend && cargo test --locked --test guards
cd frontend && npm run test:guards
```

Each failure names the doc and the fix:

- `every_backend_source_file_is_documented`, `route_list_matches_route_files` → a `backend/src/`
  file or route file missing from, or stale in, ARCHITECTURE-BACKEND.md §3.1–§3.5.
- `names every shared file and folder in ARCHITECTURE-FRONTEND.md` → a file directly in
  `frontend/src/`, its `lib/`, `lib/controllers/`, `lib/components/`, `lib/tasks/`,
  `lib/recurrence/` or `lib/dnd/`, a composer entry, or a folder under `lib/`, `views/` or
  `overlays/` that ARCHITECTURE-FRONTEND.md does not name in backticks.
- `doc_paths_exist`, `keeps every repo path named in the agent docs real` → a backticked path that
  does not exist; correct or remove it. Name the gitignored live-DB folders without a path prefix.
- `docs_describe_the_current_state`,
  `keeps AGENTS.md and ARCHITECTURE-FRONTEND.md free of history` → a history word; rewrite it as
  current state.
- `docs_stay_within_their_size`, `keeps AGENTS.md and ARCHITECTURE-FRONTEND.md within their size`
  → a doc over its cap or a prose line over 240 characters (step 5).

### 2. Diff the folder layer against AGENTS.md

Read `## Project structure` in `AGENTS.md`, then list folders only:

```
backend/*/   backend/src/*/   backend/tests/*/
frontend/src/*/   frontend/src/lib/*/   frontend/src/lib/components/*/
frontend/src/views/*/   frontend/src/overlays/*/
scripts/   .jscpd/   .github/*/   .claude/*/   .codex/*/   .agents/*/
```

Find new folders that are not listed, listed folders that are gone or renamed, and folders whose
role changed. View and overlay folders are not listed one by one in `AGENTS.md`; check them
against ARCHITECTURE-FRONTEND.md §4.2.

### 3. Update the docs

- **AGENTS.md, Project structure:** one line per folder in the style of its neighbours, saying what
  kind of files live there. Remove gone folders. No line for a single file.
- **A new shared piece** (module, controller, component, cross-cutting rule): its one line in the
  doc that owns it, per ARCHITECTURE.md §8, plus a §0 row when it is a new home.
- **A new view or overlay folder:** a row in ARCHITECTURE-FRONTEND.md §4.2.
- **A skill added or removed in `.claude/skills/`:** the matching symlink in `.agents/skills/`
  (`ln -s ../../.claude/skills/<name> .agents/skills/<name>`), the AGENTS.md routing row and the
  `CLAUDE.md` skill mapping.
- Leave every other section alone unless a guard or a false statement requires a change.

### 4. Check for stale situational files

List `.claude/*.md` other than the four ARCHITECTURE and DATA-MODEL docs. For each one: still
relevant? If not, delete it and its reference line in `AGENTS.md`.

### 5. When a doc is at its cap: trim first

Caps sit about 20% above the delivered size: `SIZE_CAPS` in `backend/tests/guards/docs.rs` for
ARCHITECTURE.md, ARCHITECTURE-BACKEND.md and DATA-MODEL.md; `DOC_CAPS` in
`frontend/src/lib/test/architecture.test.ts` for `AGENTS.md` and ARCHITECTURE-FRONTEND.md.

1. Remove how-it-works text; the code and its tests already say it.
2. Remove a fact another doc states; keep it in the doc that owns it (table above).
3. Remove history and plans.
4. Shorten what is left to where it lives and what it is for.
5. Wrap prose lines over 240 characters without changing words, never inside backticks. Table rows
   are exempt.

Raising a cap needs the owner's approval. Ask; never raise a cap to get a guard green.

### 6. Verify and report

Run both guard commands again. Report compactly: folders added or removed, doc lines added, what
was trimmed, and anything that needs the owner's decision. Do not print a full diff.

## Rules

- **Never add changelogs or task notes:** git tracks history.
- **Never restructure a doc:** add, correct or remove specific lines; section numbers are
  referenced from code, tests and other docs.
- **Check every statement in the code** before you write or keep it.
- **One source of truth:** a rule lives in `AGENTS.md`, a location in the ARCHITECTURE files;
  never state it twice.
