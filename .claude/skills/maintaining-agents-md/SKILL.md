---
name: maintaining-agents-md
description: Sync the root AGENTS.md (single source of truth for agent instructions) with the current codebase state. Use after adding or removing folders, or when AGENTS.md feels stale.
tools: Read, Glob, Grep, Edit
---

# Maintaining AGENTS.md

Keep the root `AGENTS.md` accurate and lean. It is the **single source of truth** for agent instructions (`CLAUDE.md` is only a shim that imports it). Every line loads into every future session — nothing stale, nothing missing, nothing redundant.

## When to run

- A new **folder** was added or removed in `backend/src/`, `frontend/src/`, or their subfolders
- A folder's purpose changed significantly
- AGENTS.md feels out of sync with reality

Adding a file inside an existing folder does **not** require an update.

## Workflow

### 1. Read the current AGENTS.md

Read the root `AGENTS.md` in full. Note what the Project structure section claims exists.

### 2. Diff against the actual folder structure

List only the folder layer — do not list individual files:

```
backend/src/*/          (routes, services, db, domain)
frontend/src/*/         (lib, views)
frontend/src/lib/*/     (controllers, components)
```

Identify new folders not listed, deleted/renamed folders still listed, and repurposed folders.

### 3. Update the Project structure section

Edit only the `## Project structure` section of `AGENTS.md`:
- Add new folders with a one-line role comment (≤8 words)
- Remove deleted/renamed entries; update comments for repurposed folders

**Format rule:** the section deliberately names a handful of load-bearing files (`api.ts`, `palette.js`, `error.rs`, …) — keep those entries accurate, but new additions are folder-level with generic role comments.

### 4. Check references and shims

- If a doc under `.claude/` (ARCHITECTURE.md, situational `<topic>.md`) was added, removed, or renamed, sync its reference in AGENTS.md; delete stale situational files.
- If a skill under `.claude/skills/` was added or removed, sync the matching symlink in `.agents/skills/` and the AGENTS.md task-routing table.
- `CLAUDE.md` (root shim) should still only import AGENTS.md plus Claude-specific pointers — if project knowledge leaked into it, move that into AGENTS.md.

### 5. Report changes

Output a compact summary: folders added/removed, doc/skill references changed. No full diff.

## Rules

- **Never add changelogs or task notes** — git tracks history
- **Do not restructure AGENTS.md** — only update the Project structure section and specific lines; leave all other sections intact
- **One source of truth** — never duplicate a rule between AGENTS.md, CLAUDE.md, and ARCHITECTURE.md; AGENTS.md holds the rule, ARCHITECTURE.md holds the detail
