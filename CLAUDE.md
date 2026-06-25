# Stinō — a self-hosted TickTick replacement

> **Stinō** is the product name — the **ō** (o-macron, U+014D) is pronounced *oo*/*oe* (like Dutch *moe*), so it reads roughly "Stee-noo". The **logo stays a cairn** — the stack of trail stones that marks the way ahead — so the mountain-forest identity carries through even though the name changed. The name only ever appears in user-facing copy, so it's trivial to change.

A personal, self-hosted task + calendar web app. It replaces TickTick for one person, reachable only over Tailscale, running in a single Docker container. The guiding principle is **calm and core**: the month calendar and the task list, done well, with a calm mountain-forest feel — and nothing else. When a detail is unspecified, **do it the way TickTick does it**, then strip anything that isn't core.

## Start Here — Task Routing

Match the task against this table and do the listed action **before** reading code or writing anything:

| If the task involves… | Then first… |
| --- | --- |
| Any frontend / UI work (a view, component, styling, layout, mobile) | The `frontend-design` skill loads automatically — follow it, and stay inside the design tokens in [§ Design Language](#design-language--calm-mountain-forest) |
| A DB schema change (table, column, index) | Read [§ Data Model](#data-model) and [§ Hard Rules](#hard-rules--quick-index) 3; add a **new** SQLx migration, never edit an applied one |
| Deciding where a new piece of code belongs | Use [§ Architecture & Module Boundaries](#architecture--module-boundaries) — every concern has exactly one home |
| Anything touching dates, times, or recurrence | Read [§ Time, Dates & Recurrence](#time-dates--recurrence) — the timezone and recurrence rules are easy to get subtly wrong |
| The API contract, exact DDL, recurrence or import detail | Read [ARCHITECTURE.md](./ARCHITECTURE.md) — the concrete contract + schema; update it in the same change |
| Reviewing your own diff before finishing | Run `/code-review` (bugs) and `/simplify` (cleanups) |
| The CLAUDE.md itself drifting from reality | Run `/revise-claude-md` |
| Confirming a change works in the real app | Run `/run` (launch it) or `/verify` (drive it and observe) |

## Hard Rules — quick index

Breaking any of these is never acceptable, including during debugging or quick fixes.

1. **Handlers stay thin.** HTTP handlers parse input, call one service, and shape the response. All business logic lives in `services/`; all SQL lives in the repository layer. No SQL in handlers, no `axum` types in services. ([§ Architecture](#architecture--module-boundaries))
2. **The frontend talks to the backend only through the single API client** (`lib/api.ts`). No `fetch`/`axios` scattered in components. Label colors, enums, and shared types come from one source, never hardcoded twice. ([§ Architecture](#architecture--module-boundaries))
3. **Migrations are additive and permanent.** Never edit a migration that has been applied — add a new one. Never `DROP`/`DELETE`/`TRUNCATE` or do a data-losing type change unless the user explicitly asks for that exact removal. This app holds real, imported personal data. ([§ Data Model](#data-model))
4. **Core only — no bloat.** Reminders, push notifications, alerts, pomodoro, habits, collaboration, AI assistants, "smart" lists beyond what is specified are explicitly **out of scope**. Do not add them, even if TickTick has them. If a feature feels like an addition rather than the calendar/task core, stop and ask. ([§ Scope](#scope--what-this-is-and-is-not))
5. **Mobile is a first-class target, not an afterthought.** Every view must be usable on a phone (touch targets, single-column reflow, the calendar legible). Design mobile-first, then widen. ([§ Design Language](#design-language--calm-mountain-forest))
6. **Stay inside the design tokens.** Colors, spacing, and radii come from the Tailwind theme tokens in [§ Design Language](#design-language--calm-mountain-forest). No ad-hoc hex values in components. Label colors are the one exception (user data), and they come from a fixed, nature-derived palette.
7. **Dates are calendar dates in the user's local timezone, never UTC instants.** A task due "June 24" must never shift a day because of a timezone conversion. ([§ Time, Dates & Recurrence](#time-dates--recurrence))
8. **State survives restarts.** The SQLite file lives on a mounted volume; nothing important is written to the container's ephemeral filesystem. Config comes from env vars. ([§ Environment](#environment))
9. **No auth in code, but never assume public exposure.** Access control is Tailscale's job. Don't build login, and don't add anything that only makes sense for a publicly-exposed multi-user app.

## Scope — what this is and is not

**In scope (the must-haves):**

- **Month calendar** — the primary view; see what's upcoming at a glance.
- **Day zoom** — open a single day to see everything on it when the month cell is too full.
- **Week view** — a seven-day layout.
- **Color labels** — create labels with colors; tasks carry one (or more) labels.
- **Today** tab — everything due today.
- **Inbox** tab — captured-but-not-yet-scheduled tasks (no due date yet).
- **Recurring tasks** — daily, weekly, and custom intervals (every N days/weeks, specific weekdays).
- **Times on tasks** — a task may have a time, not just a date.
- **Search** — find tasks by title / notes.
- **Group by label** when viewing a single day.
- **Time-sorted ordering** — within any day/list view, timed tasks sort by time; untimed tasks have a manual drag-to-reorder order.
- **Import from TickTick** — migrate existing data from a TickTick export (CSV backup).

**Out of scope (deliberately — see Hard Rule 4):** reminders / notifications / alerts, pomodoro & focus timers, habit tracking, sub-tasks/checklists depth, priorities beyond what import needs, collaboration / sharing, accounts & auth, calendar (ICS) subscriptions, AI features. Keep the surface small and the app calm.

## Architecture & Module Boundaries

> The concrete API contract, DDL, recurrence semantics, and import mapping live in [ARCHITECTURE.md](./ARCHITECTURE.md) — the source of truth. This section is orientation; keep the two in sync.

One process, one container. The Axum server serves the built Svelte SPA as static files and exposes a JSON API under `/api`. The browser SPA renders all views and calls the API.

```
Browser (Svelte SPA)  ──HTTP/JSON──▶  Axum  ──▶  services  ──▶  repository (SQLx)  ──▶  SQLite
        ▲                                                                                  │
        └──────────────────  static assets served by Axum  ◀───────────────────────────────┘
```

**Backend layers — each has one job; dependencies point downward only:**

| Layer | Owns | Must NOT |
| --- | --- | --- |
| `routes`/`handlers` | HTTP shape: parse request, call one service, return JSON/status | contain business logic or SQL |
| `services` | all business logic, recurrence expansion, import mapping, validation | import `axum` types or write raw SQL |
| `repository` (`db`) | every SQL query (SQLx, compile-time checked) | contain business rules |
| `domain`/`models` | plain Rust structs + enums (the data shapes) | depend on `axum`, `services`, or `db` |

**Frontend boundaries:**

- **All HTTP goes through `lib/api.ts`** — typed functions, one per endpoint. Components never call `fetch` directly.
- **Shared types live in `lib/types.ts`** — mirror the API contract; single source of truth.
- **Reusable UI** (calendar cell, task row, label chip, day sheet) lives in `lib/components/`; views compose them, never re-implement them.
- **Constants** (label palette, view names, layout sizes) live in `lib/constants.ts`.

**One source of truth per concern.** If you write the same block in a second place, lift it into the shared module first.

## Stack

| Layer | Technology |
| --- | --- |
| Backend | Rust + Axum (async) on Tokio |
| DB access | SQLx with compile-time-checked queries + SQLite |
| Migrations | SQLx migrations (`migrations/`, applied at startup) |
| Recurrence | `rrule` crate (RFC-5545 RRULE parsing + expansion) |
| Frontend | Svelte 5 + Vite (SPA) + TypeScript |
| Styling | Tailwind CSS (theme tokens — see Design Language) |
| Reorder | `svelte-dnd-action` (drag-to-reorder untimed tasks) |
| Natural-language dates | `chrono-node` (parse "tomorrow 9am" in quick-add, client-side) |
| Packaging | Single multi-stage Docker image |
| Access | No auth; reachable over Tailscale only |
| Persistence | SQLite file on a mounted Docker volume |

**External Solutions First:** before hand-rolling, reach for a maintained crate/package. Recurrence → `rrule` (do not write a date-recursion engine). CSV parsing for import → `csv` crate + `serde`. NL date parsing → `chrono-node` (client-side, do not parse free text on the server). Date math → `chrono`/`time`. If a well-maintained crate or npm package solves ≥80% of a problem, use it and flag the dependency.

## Environment

**Dev:** backend `cargo run` (serves `/api`); frontend `vite dev` with a proxy from `/api` to the backend, so the SPA and API feel like one origin. SQLite path and any config come from env (`DATABASE_URL`, `DATA_DIR`, `TZ`, `PORT`). `.env` for local values — never commit it.

**Prod:** one container. Multi-stage Dockerfile: (1) build the Svelte SPA with Vite, (2) build the Rust binary, (3) a slim runtime image that bundles the static assets and the binary. The container serves both. The SQLite database lives on a **mounted volume** so data survives restarts and image rebuilds. Migrations run automatically on startup. Exposed only on the Tailscale network.

Write code that works in dev and in the container — no absolute local paths, no hardcoded `localhost` in the frontend (use the proxy / relative `/api`), no state that doesn't survive a restart.

**Gotcha — keep the project path colon-free.** Rust (`LD_LIBRARY_PATH`), npm (`PATH`), and Docker bind mounts (`host:container`) all use `:` as a separator, so a `:` anywhere in the absolute project path breaks `cargo run`/`cargo build`, `npm run`, **and** `docker compose up` (the `./data:/data` mount). The folder is now `Stino` (colon-free), so `cargo`, `npm run`, and `docker compose` all work normally — no `CARGO_TARGET_DIR` or direct `./node_modules/.bin` workarounds needed. Don't reintroduce a colon in the path. The Docker *image build* is unaffected either way (it copies into `/app`).

## Data Model

The single source of truth for the schema is the SQLx migrations in `migrations/`. This is the agreed shape; exact DDL is written when the backend is scaffolded.

- **task** — the core entity.
  - `id`, `title`, `notes` (nullable)
  - `label_id` (nullable FK → label) — see grouping note below
  - `due_date` (local calendar date, nullable) — **null ⇒ the task lives in the Inbox** (unscheduled)
  - `due_time` (local time, nullable) — present ⇒ timed; null ⇒ all-day/untimed
  - `recurrence_rule` (RRULE string, nullable) — present ⇒ recurring; `due_date` is the series start (DTSTART)
  - `sort_order` (integer) — manual drag order for untimed tasks within a day/list
  - `created_at`, `updated_at`
- **label** — `id`, `name`, `color` (hex from the fixed palette), `sort_order`.
- **completion** — records a done occurrence: `task_id`, `occurrence_date`, `completed_at`.
  - A non-recurring task is "done" when a completion row exists for it.
  - A recurring task is done **for a specific date** when a completion exists for `(task_id, occurrence_date)`; other occurrences stay open. This is how completing one instance of a daily task doesn't complete them all.

**Inbox = `due_date IS NULL`.** Scheduling a task (giving it a date) moves it out of the Inbox and onto the calendar — exactly TickTick's behaviour.

**Labels for grouping.** "Group by label when viewing a day" is the driving requirement. Start with a single `label_id` per task (simplest, sorts cleanly into groups). If multi-label is needed later, introduce a `task_label` join table in a new additive migration — do not retrofit by overloading existing columns.

**Search.** SQLite `LIKE` over `title`/`notes` is enough at personal scale for the MVP. Add an FTS5 virtual table only if search feels slow — and only then.

## Time, Dates & Recurrence

This is the easiest area to introduce subtle bugs. Rules:

- **`due_date` is a calendar date in the user's local timezone**, stored as a plain date (e.g. `2026-06-24`), not a UTC timestamp. Never convert it through UTC — that's how a task jumps to the wrong day. The timezone is a single configured value (`TZ`), since there is one user.
- **`due_time` is a local wall-clock time.** Combine with `due_date` only at the edges (display, sorting) using the configured timezone.
- **Sorting within a view:** timed tasks first, ordered by `due_time` ascending; untimed tasks after, ordered by `sort_order`. This is the "time has to be sorted" requirement.
- **Recurrence is stored as one task with an RRULE**, not as materialized rows. To render the calendar, **expand the rule with the `rrule` crate over the visible date range** (the month/week window) and overlay completion state per occurrence. Completing an occurrence writes a `completion` row keyed by `(task_id, occurrence_date)`; it does not mutate the task. The range/date queries return **one `Task` per expanded occurrence** carrying a derived **`occurrence_date`** (the instance; `due_date` stays the series start) — so clients key rows by `(id, occurrence_date)`, not `id` alone. See [ARCHITECTURE.md](./ARCHITECTURE.md) §4–§5.
- **Custom intervals** map to RRULE (`FREQ=DAILY;INTERVAL=n`, `FREQ=WEEKLY;INTERVAL=n;BYDAY=MO,WE`). Keep the UI's recurrence options as: Daily, Weekly (pick weekdays), and Custom (every N days/weeks) — and translate to/from RRULE in the service layer.

## Import from TickTick

TickTick exports a CSV backup. Provide an importer (an upload endpoint + a service that maps rows → our model). Mapping intent:

- Title → `task.title`; Content → `task.notes`.
- Tags / List → **label** (create labels on the fly, assign a palette color deterministically).
- Due Date (+ Is All Day / time) → `due_date` / `due_time`, respecting the export's timezone but storing as local date/time per the rules above.
- Repeat (RRULE) → `recurrence_rule` directly.
- Status / Completed Time → a `completion` row.
- Reminder column → **ignored** (reminders are out of scope, Hard Rule 4).

The importer must be **idempotent-ish and safe**: it adds data, never deletes existing data, and should be runnable against an empty DB for the initial migration. Surface a summary (counts created, rows skipped) rather than failing the whole import on one bad row.

## Project Structure (target)

The repo is greenfield — this is the layout to scaffold toward. Keep it flat and obvious.

```text
backend/
  src/
    main.rs            # binary entry point — just calls lib::run()
    lib.rs             # crate root: module declarations + run() (pool, migrations, serve)
    routes/            # one module per resource (tasks, labels, search, import) — thin handlers
    services/          # business logic: task_service, recurrence, import, search
    db/                # SQLx repository functions (all SQL lives here)
    domain/            # plain structs + enums (Task, Label, Recurrence, ...)
    error.rs           # single AppError mapped to HTTP at the boundary (IntoResponse)
    config.rs          # env-driven config (DATABASE_URL, TZ, PORT, DATA_DIR)
  migrations/          # SQLx migrations — additive, never edit an applied one
  .sqlx/               # committed offline query cache (compile-time checks in the Docker build)
  tests/               # integration tests against a temp SQLite DB

frontend/
  src/
    lib/
      api.ts           # the ONLY place that talks HTTP
      types.ts         # shared types mirroring the API contract
      constants.ts     # label palette, view names, layout sizes
      components/       # calendar cell, task row, label chip, day sheet, quick-add
    views/             # MonthView, WeekView, DayView, Today, Inbox, Search
    app.css            # Tailwind entry + theme tokens
  index.html, vite.config.ts, tailwind.config.*

Dockerfile             # multi-stage: build SPA -> build Rust -> slim runtime
docker-compose.yml     # mounts the SQLite volume, sets env
```

**Navigation rule:** read only the folder relevant to the task. Grep before scanning.

## Design Language — calm mountain forest

The feel is a quiet morning in a pine forest: soft light, mist, stone, evergreen, warm wood. Calm, spacious, professional — never busy, never neon. Implement these as Tailwind theme tokens (in `tailwind.config`), and use the tokens, not raw hex.

**Palette (light):**

| Token | Hex | Use |
| --- | --- | --- |
| `fog` | `#F4F6F3` | app background (soft misty green-white) |
| `surface` | `#FBFCFA` | cards, calendar cells |
| `pine` | `#2F5D50` | primary actions, active state |
| `pine-deep` | `#1E3A34` | headers, emphasis |
| `moss` | `#6F8F6B` | secondary accents, success |
| `bark` | `#8B6F52` | warm accent, subtle highlights |
| `mist` | `#8FB3C7` | info / cool accent (sky between peaks) |
| `ink` | `#2B332E` | primary text |
| `sage` | `#6B7770` | secondary text, muted labels |
| `lichen` | `#DDE3DD` | borders, dividers |

**Dark mode** ("forest at night") — **implemented**. Defaults to **System** (`prefers-color-scheme`), with a **Settings → Appearance** toggle (System / Light / Dark) that overrides the OS; the choice persists in `localStorage` (`theme.ts`). Mechanism: the chrome tokens are CSS variables (RGB channel triplets) in `frontend/src/app.css`; the dark `@media` block (guarded with `:not([data-theme])` so an explicit choice wins) and a `:root[data-theme='dark']` block re-point the same variables, so every `bg-fog` / `text-ink` adapts with **no per-component `dark:` classes**. A manual override sets `data-theme` on `<html>` (applied pre-paint by a tiny inline bootstrap in `index.html` to avoid a flash). Deep charcoal-greens for background/surface; pine/pine-deep go **light** in the dark so `bg-pine text-surface` buttons stay readable (dark text on a light fill); accents lifted for contrast (all text pairs verified ≥ AA). Tokens stay in `tailwind.config.js` as `rgb(var(--x) / <alpha-value>)` so `/opacity` modifiers keep working. **Label colors are user data and are not themed** (Hard Rule 6) — a `LabelChip` shows the color as a small dot, legible on either ground.

**Label palette** (the colors a user can assign — nature-derived but distinguishable): pine, moss, fern, clay, amber, slate-blue, plum, stone. Fixed set in `constants.ts`.

**Logo / mark:** a simple **cairn** — a small stack of trail stones — rendered as a clean, minimal mark in `pine`. It is the one piece of explicit mountain iconography; keep it to a few stacked stones so it reads at favicon size as well as in the header.

**Principles:** generous whitespace; soft rounded corners (`rounded-lg`/`rounded-xl`); subtle shadows (`shadow-sm`), never heavy; calm, short transitions; one clean readable sans (e.g. Inter) for a professional look; low visual noise so the calendar content is the focus. Motion is gentle (fades, small slides), never bouncy.

## Conventions

**Backend (Rust):** `cargo fmt` + `cargo clippy` clean (treat warnings as failures); errors as `Result` with a single app error type mapped to HTTP at the boundary; `async` throughout on Tokio; SQLx compile-time-checked queries (no string-built SQL); business logic in `services/`, never in handlers.

**Frontend (Svelte + TS):** strict TypeScript, no `any`; small composable components; all HTTP through `lib/api.ts`; Tailwind utility classes with the theme tokens; keep view components thin — push logic into small helpers.

**General:** config via env, never commit secrets; no dead code, commented-out blocks, or half-finished features left in main; no magic values — constants live in `config.rs` (backend) / `constants.ts` (frontend).

## Testing & Lint

Run before considering a change done. (Commands assume the toolchain is installed — see [§ Toolchain](#toolchain).)

1. **Backend lint:** `cd backend && cargo fmt --check && cargo clippy -- -D warnings`
2. **Backend tests:** `cd backend && cargo test` — integration tests run against a temporary SQLite database.
3. **Frontend lint + types:** `cd frontend && npm run lint && npm run check` (svelte-check / tsc).
4. **Frontend unit tests:** `cd frontend && npm test` — Vitest over the pure `lib/*.ts` helpers (date, recurrence, grouping, quickadd, theme). Node env, no DOM; component testing is out of scope.
5. **Frontend build smoke:** `cd frontend && npm run build` — catches type and bundling errors.

Treat any clippy/eslint/svelte-check error as a failing build — fix it in the same change. **Turn manual checks into tests:** verified a recurrence or import edge case by hand? Capture it as a `cargo test` (backend) or a Vitest case (a pure frontend helper).

## Working Approach

**Before writing:** read only the files you'll touch plus their direct dependencies; grep for the existing pattern and match it; pick a maintained crate/package over building in-house. **Ask when genuinely split** — if two sound designs have real trade-offs, present them rather than picking arbitrarily. When TickTick's behaviour is the reference and it's unambiguous, just match it.

**While writing:** scope changes tightly; keep handlers thin and SQL in the repository layer; stay inside the design tokens; keep `cargo clippy` / `svelte-check` green as you go. Never weaken a boundary "to test quickly" — find the root cause.

**Definition of done (all must hold):** lint green (clippy + svelte-check); tests cover the change; no boundary violations (handlers thin, HTTP only via `lib/api.ts`); schema change ⇒ a new additive migration; the change works on a phone-width screen; mountain-forest tokens used, no stray hex; CLAUDE.md updated in the same change if a folder, boundary, or entity changed.

## Maintaining CLAUDE.md

- When a top-level folder, a layer boundary, the data model, or a core decision changes, update this file in the **same** change — it is the reference future sessions rely on. Run `/revise-claude-md` to audit it against reality.
- Keep this file as living guidance: no changelogs, no task notes, no "done" lists — git tracks what changed.
- For deep situational context that spans many prompts, create `.claude/<topic>.md` and add one reference line here; delete it when no longer relevant.

## Toolchain

- **Installed:** Rust 1.96 (cargo, clippy, rustfmt, **rust-analyzer**) via rustup; `sqlx-cli` 0.8.6 (sqlite/rustls) via `cargo install`; Node 22 + npm 10; `typescript-language-server` 5.3 + `tsc` 6.0 in `~/.local/bin` (npm user prefix set to `~/.local`, which is on PATH); Docker 29.
- **Claude plugins enabled** (user scope): `rust-analyzer-lsp`, `typescript-lsp`, `frontend-design`, `claude-md-management`.
- **SQLx offline cache:** compile-time `query!` checks use the committed `backend/.sqlx/`; regenerate with `cargo sqlx prepare` after changing any query (details in ARCHITECTURE.md §8).
