# Stinō — Architecture

The concrete contract behind [CLAUDE.md](./CLAUDE.md): system shape, data model, API,
recurrence semantics, and import mapping. CLAUDE.md is the day-to-day guidance; this file is
the source of truth for the schema and endpoints. Update it in the same change as the code.

## 1. System shape

One process, one container. Axum serves the built Svelte SPA as static files **and** the JSON
API under `/api`; the browser SPA renders every view and calls the API.

```
Browser (Svelte SPA) ──HTTP/JSON──▶ Axum ──▶ services ──▶ db (SQLx) ──▶ SQLite
        ▲                                                                  │
        └──────────────── static assets (ServeDir, SPA fallback) ◀─────────┘
```

- Non-`/api` paths: served from `STATIC_DIR`; unknown paths fall back to `index.html` (200) so
  client routing survives refresh/deep-link.
- Unknown `/api/*` paths: JSON `404 {"error":"not found"}` (never the SPA HTML).
- No auth. Access is restricted at the network layer (Tailscale), not in code.

## 2. Backend layering

Dependencies point downward only. See CLAUDE.md § Architecture for the binding "must NOT" rules.

| Layer | Path | Owns |
| --- | --- | --- |
| routes/handlers | `backend/src/routes/` | HTTP shape: parse, call one service, return JSON |
| services | `backend/src/services/` | business logic, recurrence expansion, import, validation |
| db (repository) | `backend/src/db/` | every SQL query (SQLx) |
| domain | `backend/src/domain/` | plain structs + enums |

> Module declarations live in `lib.rs` (a thin `main.rs` just calls `run()`) so the router can be
> built against a temp database in integration tests. The single app error type is in `error.rs`
> (`AppError` → HTTP only at this boundary via `IntoResponse`); services return `AppResult` and
> never touch `axum`.

## 3. Data model

Source of truth is `backend/migrations/`. `0001_init.sql` defines:

- **label** `(id, name, color, sort_order, created_at, updated_at)` — `color` is a hex from the
  fixed nature-derived palette (see `frontend/src/lib/constants.ts`).
- **task** `(id, title, notes?, label_id?→label, due_date?, due_time?, recurrence_rule?,
  sort_order, created_at, updated_at)`.
  - `due_date` NULL ⇒ **Inbox** (unscheduled). `due_time` NULL ⇒ untimed.
  - `recurrence_rule` NULL ⇒ one-off; otherwise an RFC-5545 RRULE with `due_date` as DTSTART.
- **completion** `(id, task_id→task, occurrence_date?, completed_at)`, `UNIQUE(task_id,
  occurrence_date)` — one row per completed occurrence. A one-off is done when a row exists for
  its `due_date`; a recurring task is done **for that date only**, so completing one instance
  never completes the rest.

Indexes: `task(due_date)`, `task(label_id)`, `completion(task_id)`. Foreign keys are enforced
(`PRAGMA foreign_keys = ON` set per connection).

## 4. Time, dates & recurrence

- `due_date` is a **local calendar date** (`YYYY-MM-DD`), `due_time` a **local wall-clock time**
  (`HH:MM`). Stored as text, never converted through UTC — a task due "June 24" must not shift a
  day. Timezone is a single configured value (`TZ`).
- **Sorting in any view:** timed tasks first by `due_time` ascending; untimed tasks after by
  `sort_order` (manual drag order).
- **Recurrence is stored once** as an RRULE. To render the calendar, expand the rule with the
  `rrule` crate over the visible range and overlay completion state per occurrence. Completing
  an occurrence writes a `completion` row; it never mutates the task.
- UI recurrence options map to RRULE in the service layer: Daily (`FREQ=DAILY;INTERVAL=n`),
  Weekly (`FREQ=WEEKLY;INTERVAL=n;BYDAY=…`), Custom (every N days/weeks).

## 5. API contract

`Content-Type: application/json`. Dates/times are the local-text formats above.

**Implemented**

| Method | Path | Returns |
| --- | --- | --- |
| GET | `/api/health` | `{ "status": "ok", "db": true }` |
| GET | `/api/labels` | `[{ id, name, color, sort_order }]`, ordered by `sort_order`, then `id` |
| POST | `/api/labels` | body `{ name, color }` → `201` Label |
| PATCH | `/api/labels/{id}` | partial body `{ name?, color? }` → Label (`404` if unknown) |
| DELETE | `/api/labels/{id}` | `204`; tasks survive but lose the label (`ON DELETE SET NULL`) |

Label validation (service layer): `name` non-empty after trim, ≤ 60 chars; `color` must be one of
the fixed palette hexes (case-insensitive, stored uppercase). Failures return `400 {"error": msg}`;
the message is safe to show in the UI. New labels get the next `sort_order` (append to the end).

**Planned** (built per feature slice; shapes may refine — keep this table in sync)

| Method | Path | Purpose |
| --- | --- | --- |
| GET/POST | `/api/tasks`, `PATCH/DELETE /api/tasks/{id}` | task CRUD |
| POST/DELETE | `/api/tasks/{id}/completions` | complete / un-complete an occurrence (body: `occurrence_date`) |
| GET | `/api/calendar?from=&to=` | tasks + expanded recurring occurrences in a date range (month/week/day) |
| GET | `/api/tasks?inbox=true` / `?date=` | Inbox / Today lists |
| PATCH | `/api/tasks/reorder` | persist drag order (`sort_order`) |
| GET | `/api/search?q=` | search title/notes |
| POST | `/api/import/ticktick` | upload a TickTick CSV backup |

## 6. TickTick import mapping

`POST /api/import/ticktick` parses a TickTick CSV backup → our model. Add-only (never deletes),
per-row tolerant (a bad row is skipped, not fatal), returns a `{created, skipped}` summary.

| TickTick CSV | → Stinō |
| --- | --- |
| Title / Content | `task.title` / `task.notes` |
| Tags / List | `label` (created on demand; color assigned from the palette) |
| Due Date, Is All Day, time | `task.due_date` / `task.due_time` (stored local) |
| Repeat (RRULE) | `task.recurrence_rule` |
| Status / Completed Time | a `completion` row |
| Reminder | **ignored** (reminders are out of scope) |

## 7. Frontend structure

- `src/lib/api.ts` — the only HTTP client; one typed function per endpoint.
- `src/lib/types.ts` — types mirroring the API contract (single source of truth).
- `src/lib/constants.ts` — view list + the fixed label palette (mirrors `tailwind.config.js`).
- `src/lib/components/` — reusable UI (`Cairn` mark, `Placeholder`; calendar cell, task row,
  label chip, day sheet to come).
- `src/views/` — `Month`, `Week`, `Today`, `Inbox`, `Search`. `App.svelte` is the shell:
  header + nav (desktop pills / mobile bottom bar) + the active view + a connection indicator.

## 8. Build & run

- **Dev:** `cargo run` (API :8080) + `vite dev` (SPA :5173, proxies `/api`).
- **Prod:** `docker compose up --build` → one container on :8080; SQLite on the `./data` volume;
  migrations run at startup via the compiled-in `sqlx::migrate!()`.
- **SQLx offline cache:** `query!` macros are checked at compile time. Dev builds verify against a
  live DB via `DATABASE_URL` (`backend/.env`); the Docker build has no DB, so it builds offline
  against the committed `backend/.sqlx/` cache (`SQLX_OFFLINE=true` in the Dockerfile). Regenerate
  the cache whenever a query changes. `cargo sqlx prepare` is currently broken on this toolchain
  (it can't parse cargo 1.96's metadata), so regenerate with — from `backend/`, with the dev DB
  migrated and `DATABASE_URL` set — `SQLX_OFFLINE_DIR="$PWD/.sqlx" cargo check --all-targets`, then
  commit the resulting `.sqlx/` JSON.

## 9. Open decisions (revisit when their slice arrives)

- **Multi-label per task:** single `label_id` now; add a `task_label` join table (new additive
  migration) if needed — don't overload existing columns.
- **Search:** `LIKE` for the MVP; add an FTS5 virtual table only if it feels slow.
- **Dark mode:** Tailwind `dark:` wired from the start; ship after the core views.
