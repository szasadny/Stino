# Stinō — a self-hosted TickTick replacement

A personal, self-hosted task + calendar web app for one person, reachable only over Tailscale, running in a single Docker container. Guiding principle: **calm and core** — the month calendar and the task list, done well, with a calm mountain-forest feel, and nothing else. When a detail is unspecified, **do it the way TickTick does it**, then strip anything that isn't core. (The name **Stinō** — ō = U+014D, reads "Stee-noo" — appears only in user-facing copy; the logo is a **cairn**, three stacked trail stones.)

## Start Here — Task Routing

Match the task against this table and do the listed action **before** reading code or writing anything:

| If the task involves… | Then first… |
| --- | --- |
| Frontend / UI work (view, component, styling, layout, mobile) | Follow the `frontend-design` skill and stay inside the tokens in [§ Design Language](#design-language--calm-mountain-forest) |
| A DB schema change (table, column, index) | Read [§ Data Model](#data-model) + Hard Rule 3; add a **new** SQLx migration, never edit an applied one |
| Deciding where new code belongs | [§ Architecture & Module Boundaries](#architecture--module-boundaries) — every concern has exactly one home |
| Dates, times, or recurrence | Read [§ Time, Dates & Recurrence](#time-dates--recurrence) — easy to get subtly wrong |
| The API contract, exact DDL, frontend module map, calendar layout/drag detail, import detail | Read [ARCHITECTURE.md](./ARCHITECTURE.md) — the source of truth; update it in the same change |
| Reviewing your own diff before finishing | Run `/code-review` (bugs) and `/simplify` (cleanups) |
| CLAUDE.md drifting from reality | Run `/revise-claude-md` |
| Confirming a change works in the real app | Run `/run` (launch it) or `/verify` (drive it and observe) |

## Hard Rules

Breaking any of these is never acceptable, including during debugging or quick fixes.

1. **Handlers stay thin.** Parse input, call one service, shape the response. Business logic lives in `services/`; all SQL in `db/`. No SQL in handlers, no `axum` types in services.
2. **Frontend HTTP only through `lib/api.ts`.** No `fetch`/`axios` in components. Label colors, enums, and shared types come from one source, never hardcoded twice.
3. **Migrations are additive and permanent.** Never edit an applied migration — add a new one. Never `DROP`/`DELETE`/`TRUNCATE` or make a data-losing type change unless the user explicitly asks for that exact removal. The app holds real, imported personal data.
4. **Core only — no bloat.** Reminders, notifications, alerts, pomodoro, habits, collaboration, AI assistants, "smart" lists are **out of scope**. Don't add them even if TickTick has them. If a feature feels like an addition rather than the calendar/task core, stop and ask.
5. **Mobile is first-class.** Every view must be usable on a phone (touch targets, single-column reflow, legible calendar). Design mobile-first, then widen.
6. **Stay inside the design tokens.** Colors, spacing, and radii come from the Tailwind theme tokens. No ad-hoc hex in components. One exception: label colors (user data), from the fixed palette.
7. **Dates are local calendar dates, never UTC instants.** A task due "June 24" must never shift a day because of a timezone conversion.
8. **State survives restarts.** SQLite lives on a mounted volume; config comes from env vars; nothing important is written to the container's ephemeral filesystem.
9. **No auth in code, but never assume public exposure.** Access control is Tailscale's job. Don't build login, and don't add anything that only makes sense for a public multi-user app.

## Scope

**In scope:** month calendar (primary view) · day zoom · week view · color labels · Today tab · Inbox tab (unscheduled tasks) · recurring tasks (daily; weekly by weekdays; monthly by date incl. last day, by Nth weekday incl. last, first/last workday; yearly on the start date; every N days/weeks) · times on tasks · search over title/notes · group-by-label in a day view · time-sorted ordering (timed by time, untimed by manual drag order) · automatic rollover of overdue uncompleted tasks onto today (on app open/new day; recurring tasks excluded) · TickTick CSV import.

**Out of scope (deliberate — Hard Rule 4):** reminders/notifications/alerts, pomodoro & focus timers, habit tracking, sub-task/checklist depth, priorities beyond what import needs, collaboration/sharing, accounts & auth, ICS subscriptions, AI features.

## Architecture & Module Boundaries

> The concrete API contract, DDL, recurrence semantics, import mapping, frontend module map, and calendar layout/drag rules live in [ARCHITECTURE.md](./ARCHITECTURE.md) — the source of truth. Keep the two files in sync.

One process, one container. Axum serves the built Svelte SPA as static files and the JSON API under `/api`.

```
Browser (Svelte SPA) ──HTTP/JSON──▶ Axum ──▶ services ──▶ db (SQLx) ──▶ SQLite
        ▲                                                                │
        └───────────────── static assets served by Axum ◀────────────────┘
```

**Backend layers — dependencies point downward only:**

| Layer | Owns | Must NOT |
| --- | --- | --- |
| `routes/` | HTTP shape: parse request, call one service, return JSON/status | contain business logic or SQL |
| `services/` | business logic, recurrence expansion, import mapping, validation | import `axum` types or write raw SQL |
| `db/` | every SQL query (SQLx, compile-time checked) | contain business rules |
| `domain/` | plain structs + enums | depend on `axum`, `services`, or `db` |

**Frontend boundaries:**

- **All HTTP through `lib/api.ts`** (typed, one function per endpoint). **Shared types in `lib/types.ts`.** **Constants in `lib/constants.ts`.** Reusable UI in `lib/components/` — views compose components, never re-implement them.
- **Shared view orchestration lives in `lib/controllers/`** (rune factories, `*.svelte.ts`). `createTaskCore()` owns task/label state + load/toggle/reorder/remove/save behind ONE in-flight lock with uniform optimistic-then-revert updates; `createCalendarBoard()` adds the month/week drop zones; `createGridComposer()` owns the month/week add/edit dialog. Every standing view (Today/Month/Week/Inbox) binds to a core — never fork this logic back into a view.
- **Responsive rule:** calendar views go compact at ≤ `COMPACT_MAX_WIDTH` (639px, below Tailwind's `sm`). The reactive `isCompact()` (`lib/viewport.svelte.ts`) picks exactly **ONE layout per view** — never CSS-toggle both layouts (that mounts duplicate drag zones). Per-view layout + drag map: ARCHITECTURE.md §8.
- **Drag-and-drop invariants** (details and per-view wiring: ARCHITECTURE.md §8):
  - Flat, non-nested `svelte-dnd-action` zones only — nesting breaks the inner drag.
  - A drop list is owned `$state`, mutated only by `consider`/`finalize`, and re-projected from source data only while no gesture is live (guard the `$effect` with a `dragging` flag read via `untrack`).
  - At most ONE live zone holds a given day's items — freeze any duplicate (render it statically, no zone), e.g. a grid cell freezes while `DayPanel` or the phone-month agenda is that day's live zone.
  - Mid-drag, hide a zone with `hidden` (display:none zeroes its rects, so it can't capture the pointer) — never unmount it (the origin zone must stay registered) and never `invisible`/`visibility:hidden` (an invisible zone keeps its rects and phantom-captures the pointer).
  - Pure drag/gesture logic lives in `lib/` (`move.ts`, `fit.ts`, `drag-scroll.ts`, `swipe.ts`, `panel-pos.ts`), unit-tested.
- **Period navigation (month/week) is a directional slide, not an instant swap.** Phone calendars swipe horizontally to the previous/next period (`lib/swipe.ts` — touch-only, drag-aware: it ignores a gesture while svelte-dnd-action's dragged clone exists). Every navigation (swipe or header arrows, all widths) goes through `lib/nav-transition.ts`'s `navigateWithSlide`: a View-Transitions slide scoped to the `vt-calendar` pane (`view-transition-name: calendar-pane`, keyframes in `app.css`) — snapshot-based, so the outgoing grid never mounts twice (no duplicate dnd zones) — that **awaits the range fetch inside the transition**, so the new period slides in already populated. No API support or `prefers-reduced-motion` ⇒ the update applies instantly.
- **One source of truth per concern.** If you write the same block in a second place, lift it into the shared module first.

## Stack

| Layer | Technology |
| --- | --- |
| Backend | Rust + Axum (async) on Tokio |
| DB access | SQLx with compile-time-checked queries + SQLite |
| Migrations | SQLx migrations (`migrations/`, applied at startup) |
| Recurrence | `rrule` crate (RFC-5545 RRULE parsing + expansion) |
| Frontend | Svelte 5 + Vite (SPA) + TypeScript |
| Styling | Tailwind CSS (theme tokens — see Design Language) |
| Reorder / drag | `svelte-dnd-action` |
| Natural-language dates | `chrono-node` (client-side quick-add parsing) |
| Packaging | Single multi-stage Docker image |
| Access | No auth; reachable over Tailscale only |
| Persistence | SQLite file on a mounted Docker volume |

**External Solutions First:** prefer a maintained crate/package over hand-rolling. Recurrence → `rrule` (never write a date-recursion engine); CSV → `csv` + `serde`; NL dates → `chrono-node` (client-side only, never parse free text on the server); date math → `chrono`. If a maintained package solves ≥80% of a problem, use it and flag the dependency.

## Environment

**Dev:** backend `cargo run` (API on :8080); frontend `vite dev` (:5173, proxies `/api` so SPA and API feel like one origin). Config from env: `DATABASE_URL`, `DATA_DIR`, `STATIC_DIR`, `PORT`, optional `ALLOWED_HOSTS`. `.env` holds local values — never commit it. There is deliberately **no `TZ` config** — the backend never computes "today": dates are stored and returned as plain local text, the browser supplies the local timezone, and the importer uses the CSV's own timezone column.

**Prod:** one container (`docker compose up --build`). Multi-stage Dockerfile: build the SPA → build the Rust binary → slim runtime serving both. SQLite on a **mounted volume**; migrations run at startup; exposed only on Tailscale.

Write code that works in dev and in the container: no absolute local paths, no hardcoded `localhost` in the frontend (use relative `/api`), no state that doesn't survive a restart.

**Gotcha — keep the absolute project path colon-free.** `:` is the separator in `LD_LIBRARY_PATH` (cargo), `PATH` (npm), and Docker bind mounts, so a colon anywhere in the path breaks `cargo`, `npm run`, and `docker compose up`.

## Data Model

Source of truth: `backend/migrations/` (exact DDL and indexes: ARCHITECTURE.md §3).

- **task** — `id, title, notes?, label_id?→label, due_date?, due_time?, recurrence_rule?, sort_order, created_at, updated_at`. `due_date` NULL ⇒ **Inbox** (unscheduled; giving it a date moves it onto the calendar, TickTick-style). `due_time` NULL ⇒ untimed. `recurrence_rule` set ⇒ recurring, with `due_date` as the series start (DTSTART).
- **label** — `id, name, color` (hex from the fixed palette), `emoji?` (optional single glyph), `sort_order`.
- **completion** — one row per done occurrence: `(task_id, occurrence_date, completed_at)`. A recurring task is done **per date** — completing one instance never completes the rest.
- **task_exception** — `(task_id, occurrence_date)`: a recurring occurrence **detached** by a single-instance move. Expansion skips these dates; cascades on task delete.

**Single `label_id` per task** by design. If multi-label is ever needed, add a `task_label` join table in a new additive migration — never overload existing columns. **Search** is SQLite `LIKE` over title/notes; add FTS5 only if it ever feels slow.

## Time, Dates & Recurrence

The easiest area for subtle bugs. Rules:

- **`due_date` is a local calendar date** stored as plain text (`2026-06-24`) — **never** converted through UTC. **`due_time` is local wall-clock** (`HH:MM`); combine with the date only at the edges (display, sorting), in the browser's timezone. The backend never computes "today".
- **Sorting in any view:** timed tasks first by `due_time` ascending, then untimed by `sort_order`.
- **Recurrence is one task + an RRULE**, never materialized rows. The range/date queries expand the rule (`rrule` crate) over the visible window and return **one Task per occurrence** with a derived `occurrence_date` (`due_date` stays the series start) — clients key rows by `(id, occurrence_date)`, never `id` alone. Completing an occurrence writes a `completion` row; it never mutates the task.
- **Moving a single occurrence** (`POST /api/tasks/{id}/move_occurrence`) detaches just that instance: a `task_exception` for the old date + a new one-off on the new day; the series keeps repeating. A same-day drop of a recurring instance is a no-op. Drop classification (reorder vs reschedule vs detach) is pure logic in `lib/move.ts` (`dropKind`).
- The UI options ⇄ RRULE mapping lives in `frontend/src/lib/recurrence.ts`; quick-add parses typed recurrence phrases (`parseRecurrencePhrase`) and inline `#tag` labels (`parseQuickAdd`). Full mapping and validation rules: ARCHITECTURE.md §4–§5.

## Import from TickTick

`POST /api/import/ticktick` takes a raw TickTick CSV backup. **Add-only** (never deletes — Hard Rule 3), per-row tolerant (a bad row is counted in `skipped`, not fatal), returns a created/skipped summary. Reminder/priority columns are ignored (out of scope). Full column mapping, timezone handling, and atomicity rules: ARCHITECTURE.md §6.

## Project Structure

```text
backend/
  src/
    main.rs            # thin entry — calls lib::run()
    lib.rs             # module declarations + run() (pool, migrations, serve)
    routes/            # thin handlers: health, labels, tasks, search, import
    services/          # business logic: task, label, search, recurrence, import, validation
    db/                # SQLx repository functions (all SQL)
    domain/            # plain structs + enums (Task, Label, import rows)
    error.rs           # single AppError → HTTP at the boundary (IntoResponse)
    config.rs          # env config + shared constants (date/time formats, length caps, body limit)
  migrations/          # SQLx migrations — additive, never edit an applied one
  .sqlx/               # committed offline query cache (the Docker build compiles offline)
  tests/               # integration tests against a temp SQLite DB

frontend/
  src/
    lib/
      api.ts           # the ONLY place that talks HTTP
      types.ts         # shared types mirroring the API contract
      palette.js       # fixed label palette — one source for constants.ts AND tailwind.config.js
      constants.ts     # caps, breakpoints, durations, look-tokens, view list
      *.ts             # pure helpers, one concern each, unit-tested (*.test.ts beside each)
      *.svelte.ts      # reactive module state (viewport, group-view, refresh)
      controllers/     # rune factories: task-core, calendar-board, calendar-selection, grid-composer
      components/      # reusable UI (calendar cells, task row, day sheet/panel, dialogs)
    views/             # MonthView, WeekView, TodayView, InboxView (search is an overlay, not a tab)
    app.css            # Tailwind entry + theme CSS variables
  index.html, vite.config.ts, tailwind.config.js

Dockerfile             # multi-stage: build SPA → build Rust → slim runtime
docker-compose.yml     # mounts the SQLite volume, sets env
```

Full frontend module map (every helper, what it exports, who uses it): ARCHITECTURE.md §7. **Navigation rule:** read only the folder relevant to the task; grep before scanning.

## Design Language — calm mountain forest

A quiet morning in a pine forest: soft light, mist, stone, evergreen. Calm, spacious, professional — never busy, never neon. All chrome colors are Tailwind theme tokens (CSS variables in `app.css`, mapped in `tailwind.config.js`) — use the tokens, not raw hex.

**Palette (light):**

| Token | Hex | Use |
| --- | --- | --- |
| `fog` | `#F4F6F3` | app background |
| `surface` | `#FBFCFA` | cards, calendar cells |
| `pine` | `#2F5D50` | primary actions, active state |
| `pine-deep` | `#1E3A34` | headers, emphasis |
| `moss` | `#6F8F6B` | secondary accents, success |
| `bark` | `#8B6F52` | warm accent |
| `mist` | `#8FB3C7` | info / cool accent |
| `ink` | `#2B332E` | primary text |
| `sage` | `#6B7770` | secondary text, muted labels |
| `lichen` | `#DDE3DD` | borders, dividers |

**Dark mode** ("forest at night") — implemented:

- Defaults to **System** (`prefers-color-scheme`); Settings → Appearance toggle (System/Light/Dark) persists in `localStorage` (`lib/theme.ts`) and sets `data-theme` on `<html>`, applied pre-paint by an inline bootstrap in `index.html` (no flash).
- Tokens are CSS variables (RGB triplets) in `app.css`. The dark `@media` block (guarded `:not([data-theme])` so an explicit choice wins) and `:root[data-theme='dark']` re-point the same variables — **no per-component `dark:` classes**. Tailwind maps them as `rgb(var(--x) / <alpha-value>)` so `/opacity` modifiers keep working.
- The dark ground is a cool blue-charcoal (deliberately not green-tinted); evergreen lives in the accents. `pine`/`pine-deep` go **light** in dark so `bg-pine text-surface` buttons stay readable; all text pairs ≥ AA.
- Calendar cells use `--cell` / `--cell-out` tokens that swap per theme: light = in-month cells on `surface`, other-month days recede to fog; dark = inverted. Weekends are not tinted differently.
- **Label colors are user data — never themed** (Hard Rule 6); a `LabelChip` shows the color as a small dot, legible on either ground.

**Label palette** (user-assignable, nature-derived, fixed set in `palette.js`): pine, moss, fern, clay, amber, slate-blue, plum, stone.

**Logo:** a cairn — three stacked stones (`pine`/`moss`/`sage`) with clear gaps and a slight lean, legible at favicon size. `Cairn.svelte` fills from theme tokens (adapts in dark); `favicon.svg` uses the light hexes. Keep it three distinct stones — the one piece of mountain iconography.

**Typography:** headings/wordmark/modal titles = **Hanken Grotesk** (`font-display`, self-hosted `@fontsource-variable/hanken-grotesk`, imported in `main.ts`); body/UI = **Inter** (`font-sans`). Hierarchy from size and weight, not ornament.

**Atmosphere & depth (restrained):** one soft token-driven gradient over `fog` (`app.css` `body::before`) — adapts to dark automatically. Depth via the pine-tinted elevation scale in `tailwind.config.js` (`shadow-soft` cards, `shadow-overlay` modals), used sparingly. Shared look-tokens in `constants.ts`: `INPUT_CLASS` (field border + focus ring) and `PRIMARY_BTN_CLASS` (solid pine CTA, no gradient) keep fields and buttons identical everywhere.

**Principles:** minimal, slick, clean; generous whitespace; soft corners (`rounded-lg`/`rounded-xl`); no hover lifts or motion flourishes; gentle motion (`animate-rise-in` on view mount) that respects `prefers-reduced-motion`; low visual noise so the calendar content is the focus.

## Conventions

**Backend (Rust):** `cargo fmt` + `cargo clippy` clean (warnings are failures); errors as `Result` with the single `AppError` mapped to HTTP at the boundary; `async` throughout on Tokio; SQLx compile-time-checked queries (no string-built SQL); business logic in `services/`, never in handlers.

**Frontend (Svelte + TS):** strict TypeScript, no `any`; small composable components; all HTTP through `lib/api.ts`; Tailwind utilities with the theme tokens; keep view components thin — push logic into small pure helpers.

**General:** config via env, never commit secrets; no dead code, commented-out blocks, or half-finished features in main; no magic values — constants live in `config.rs` (backend) / `constants.ts` (frontend).

## Testing & Lint

Run before considering a change done:

1. **Backend lint:** `cd backend && cargo fmt --check && cargo clippy -- -D warnings`
2. **Backend tests:** `cd backend && cargo test` — integration tests against a temp SQLite DB.
3. **Frontend lint + types:** `cd frontend && npm run lint && npm run check` (prettier + svelte-check).
4. **Frontend unit tests:** `cd frontend && npm test` — Vitest over the pure `lib/*.ts` helpers. Node env, no DOM; component testing is out of scope.
5. **Frontend build smoke:** `cd frontend && npm run build`

Treat any clippy/prettier/svelte-check error as a failing build — fix it in the same change. **Turn manual checks into tests:** verified a recurrence or import edge case by hand? Capture it as a `cargo test` or a Vitest case.

## Working Approach

**Before writing:** read only the files you'll touch plus their direct dependencies; grep for the existing pattern and match it; pick a maintained package over building in-house. **Ask when genuinely split** — if two sound designs have real trade-offs, present them rather than picking arbitrarily. When TickTick's behaviour is the unambiguous reference, just match it.

**While writing:** scope changes tightly; keep handlers thin and SQL in `db/`; stay inside the design tokens; keep clippy/svelte-check green as you go. Never weaken a boundary "to test quickly" — find the root cause.

**Definition of done (all must hold):** lint green; tests cover the change; no boundary violations; schema change ⇒ a new additive migration; works on a phone-width screen; tokens used, no stray hex; CLAUDE.md/ARCHITECTURE.md updated in the same change if a folder, boundary, or entity changed.

## Maintaining CLAUDE.md

- When a top-level folder, a layer boundary, the data model, or a core decision changes, update this file in the **same** change. Run `/revise-claude-md` to audit it against reality.
- Living guidance only: no changelogs, no task notes, no "done" lists — git tracks what changed.
- For deep situational context spanning many prompts, create `.claude/<topic>.md` and add one reference line here; delete it when no longer relevant.

## Toolchain

- **Installed:** Rust 1.96 (cargo, clippy, rustfmt, rust-analyzer) via rustup; `sqlx-cli` 0.8.6 (sqlite/rustls); Node 22 + npm 10; `typescript-language-server` 5.3 + `tsc` 6.0 in `~/.local/bin` (on PATH); Docker 29.
- **Claude plugins enabled** (user scope): `rust-analyzer-lsp`, `typescript-lsp`, `frontend-design`, `claude-md-management`.
- **SQLx offline cache:** compile-time `query!` checks use the committed `backend/.sqlx/`; regenerate with `cargo sqlx prepare` after changing any query (details: ARCHITECTURE.md §9).
