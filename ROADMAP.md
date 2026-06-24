# Stinō — Roadmap & Progress

The single source of truth for **what's built and what to build next**. CLAUDE.md is the product
spec + rules; ARCHITECTURE.md is the API + schema contract; **this file is the running plan**.
Update it in the same change that finishes a slice: tick the box and add a one-line note.

## How to resume (start every session here)

1. Find the **first unchecked box** in _Build order_ below — that's the next job.
2. Skim CLAUDE.md (rules + design tokens) and ARCHITECTURE.md (API + schema) for the area you'll touch.
3. Build it as one **vertical slice**, bottom-up: migration (only if the schema changes) → domain → db → service → route → frontend (api.ts → components → view) → tests.
4. Make every gate green and smoke-test it in the running app (`/run` or `/verify`).
5. Tick the box here, move the relevant endpoints in ARCHITECTURE.md from _Planned_ to _Implemented_, and update CLAUDE.md only if a folder / boundary / entity changed.

## Build order

Each slice = **db + service + route + view + test**, ending green. Do them in order.

- [x] **0 · Walking skeleton** — Axum serves the SPA + `/api/health`; SQLite migrates on startup; Svelte shell with nav + view stubs; multi-stage Docker.
- [x] **1 · Labels** — label CRUD, validation + fixed palette, integration tests, and a header **Labels manager** (create / rename / recolor / delete).
- [ ] **2 · Tasks + Inbox** ← **NEXT** — create / edit / delete tasks; the Inbox lists the unscheduled ones (`due_date IS NULL`). _Detailed spec below._
- [ ] **3 · Month** — the month calendar grid; tasks shown on their due day; click a day to zoom.
- [ ] **4 · Day (group-by-label)** — single-day zoom; group that day's tasks by label.
- [ ] **5 · Week** — a seven-day layout.
- [ ] **6 · Today** — everything due today.
- [ ] **7 · Recurrence** — store one task with an RRULE; expand with the `rrule` crate over the visible range; complete one occurrence without completing the rest.
- [ ] **8 · Search** — `LIKE` over title / notes.
- [ ] **9 · Reorder** — drag untimed tasks to set `sort_order` (`svelte-dnd-action`).
- [ ] **10 · Quick-add** — natural-language capture ("tomorrow 9am") parsed client-side with `chrono-node`.
- [ ] **11 · TickTick import** — CSV upload → mapped rows; add-only, per-row tolerant, returns a created/skipped summary.
- [ ] **12 · Polish** — dark mode, empty states, edge cases.

## Done so far — where things live

- **Skeleton:** `backend/src/{main,lib,config}.rs`, `routes/health.rs`, `migrations/0001_init.sql` (defines `label`, `task`, `completion`). Frontend shell in `frontend/src/App.svelte` + `views/*` stubs.
- **Labels:** backend `domain/label.rs`, `db/label.rs`, `services/label_service.rs`, `routes/labels.rs`, single `error.rs`; tests in `backend/tests/labels.rs`. Frontend `lib/api.ts` (`api.labels.*`), `lib/components/LabelChip.svelte` + `LabelManager.svelte`, opened from the header button in `App.svelte`. Compile-time queries use the committed `backend/.sqlx/` offline cache.

## Next slice in detail — 2 · Tasks + Inbox

**Goal:** capture and manage tasks. A task with no `due_date` lives in the **Inbox**; giving it a
date schedules it (moves it onto the calendar) — exactly TickTick's behaviour. No recurrence, no
drag-reorder, no quick-add NL parsing yet (those are later slices).

The `task` and `completion` tables already exist in `0001_init` — **no new migration**.

**Backend**
- `domain/task.rs` — `Task` struct mirroring the table (mirror `frontend/src/lib/types.ts`).
- `db/task.rs` — compile-time-checked queries: list inbox (`due_date IS NULL`), list by date, get, insert, update, delete, next `sort_order`; complete / un-complete via the `completion` table. Run `cargo sqlx prepare` after.
- `services/task_service.rs` — validation (title non-empty); the sort rule (timed tasks first by `due_time` asc, then untimed by `sort_order`); completion writes a `completion` row, never mutates the task.
- `routes/tasks.rs` — thin handlers: `GET /api/tasks?inbox=true` and `?date=YYYY-MM-DD`, `POST /api/tasks`, `PATCH /api/tasks/{id}`, `DELETE /api/tasks/{id}`, `POST`/`DELETE /api/tasks/{id}/completions`.
- Tests in `backend/tests/tasks.rs`: inbox vs scheduled, create/patch/delete, schedule moves out of inbox, complete + un-complete, sort order.

**Frontend**
- `lib/api.ts` — add `api.tasks.*`.
- `lib/components/` — a reusable **task row** (checkbox to complete, title, optional time, label chip) that later views reuse.
- `views/InboxView.svelte` — list unscheduled tasks, add a task (title + optional label), and schedule one by giving it a date.
- Mobile-first; design tokens only (label colors are the sole hex exception).

## Definition of done (every slice)

- `cargo fmt --check`, `cargo clippy -- -D warnings`, `cargo test` all green.
- `npm run check`, `npm run lint`, `npm run build` all green.
- Boundaries intact: handlers thin, SQL only in `db/`, frontend HTTP only via `lib/api.ts`.
- Works on a phone-width screen; mountain-forest tokens, no stray hex (label colors excepted).
- `.sqlx` regenerated if any query changed (`cargo sqlx prepare`).
- ARCHITECTURE.md, this file, and CLAUDE.md (if a folder/boundary/entity changed) updated in the same change.
