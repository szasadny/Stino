# Stinō: a self-hosted TickTick replacement

A personal, self-hosted task + calendar web app for one person, reachable only over Tailscale, running in a single Docker container.
Guiding principle: **calm and core**, meaning the month calendar and the task list, done well, with a calm mountain-forest feel, and nothing else.
When a detail is unspecified, **do it the way TickTick does it**, then strip anything that isn't core.
The name **Stinō** (ō = U+014D, reads "Stee-noo") appears only in user-facing copy; the logo is a **cairn**, three stacked trail stones.

> **This file is the single source of truth for agent instructions**; `CLAUDE.md` is a thin shim that imports it.
> For: the rules, routing and conventions every agent follows. Not here: what each file is for (the ARCHITECTURE files), how a feature works (code and tests); never changelogs or task notes.

## Agent roles

The main session plans, hands subagents self-contained steps, and reviews every diff against the Hard Rules before reporting done; trivial one-file fixes stay in the main session.

- **codex:** main session `.codex/config.toml`; subagents `.codex/agents/executor.toml` (implements one plan step) and `.codex/agents/explorer.toml` (read-only research).
- **Claude Code:** main session `CLAUDE.md`; subagents `.claude/agents/executor.md` and `.claude/agents/explorer.md`, same roles.
- Each harness pins its models in those files only; a subagent never runs on another model. A subagent does not see your conversation: give it the files, the pattern, the checks and the comment rule.

## Task routing

Match the task and do the listed action **before** reading code or writing anything. Skills live in `.claude/skills/`, symlinked into `.agents/skills/` for codex.

| If the task involves… | Then first… |
| --- | --- |
| Deciding where new code goes | [ARCHITECTURE.md](./.claude/ARCHITECTURE.md) §0, where every concern has exactly one home |
| A change crossing layers, a new shared abstraction, or the data model | ARCHITECTURE.md §0/§7, [ARCHITECTURE-BACKEND.md](./.claude/ARCHITECTURE-BACKEND.md) §3, [ARCHITECTURE-FRONTEND.md](./.claude/ARCHITECTURE-FRONTEND.md) §4, [DATA-MODEL.md](./.claude/DATA-MODEL.md) §5; add only the line that says where the new piece lives |
| Frontend / UI work | Stay inside the [design tokens](#design-language-calm-mountain-forest) and the responsive + drag contract (ARCHITECTURE-FRONTEND.md §4.6); a new UI primitive (modal, popover, form, scroll effect) → skill `modern-web-guidance` |
| A DB schema change | DATA-MODEL.md §5.1 + Hard Rule 3: a **new** migration, never an edit; regenerate `backend/.sqlx/` (ARCHITECTURE.md §6) |
| Dates, times or recurrence | [§ Time, dates and recurrence](#time-dates-and-recurrence) + DATA-MODEL.md §5.2–§5.4 |
| The API contract or the TickTick import | ARCHITECTURE-BACKEND.md §3.7; DATA-MODEL.md §5.5 |
| Confirming a change in the real app (drag-and-drop, phone widths) | Skill `verify` (scratch DB + Playwright) |
| A folder added or removed, or a failing docs guard | Skill `maintaining-agents-md` |
| Creating or editing a skill | Skill `skill-creator` |

## Hard Rules

Breaking any of these is never acceptable, including during debugging or quick fixes.

1. **Handlers stay thin.** Parse input, call one service, shape the response; business logic in `services/`, all SQL in `db/` (guarded by `backend/tests/guards/architecture.rs`; one service call is review).
2. **Frontend HTTP only through `lib/api.ts`** (ESLint `no-restricted-globals`). Label colours, enums and shared types have one source; values mirrored from the backend are guarded (DATA-MODEL.md §5.6).
3. **Migrations are additive and permanent.** Never edit an applied migration; never `DROP`/`DELETE`/`TRUNCATE` or make a data-losing type change unless the user explicitly asks for that exact removal.
   The app holds real, imported personal data: never run anything against the live DB (any `DATA_DIR`, locally the gitignored `data/` folders at the repo root and in the backend); tests use a temp or scratch DB.
4. **Core only, no bloat.** Reminders, notifications, alerts, pomodoro, habits, collaboration, AI assistants and "smart" lists are **out of scope**, even if TickTick has them. If a feature feels like an addition, stop and ask.
5. **Mobile is first-class.** Every view is usable on a phone (44px touch targets via `.hit-area`, single-column reflow, legible calendar); design mobile-first. One layout per view through `isCompact()`, the only JS breakpoint (guarded).
6. **Stay inside the design tokens.** Colours, shadows, font sizes and radii come from the Tailwind theme tokens, no ad-hoc hex (guard `styles only with design tokens`). Exception: label colours, user data from the fixed palette.
7. **Dates are local calendar dates, never UTC instants.** A task due "June 24" never shifts a day (frontend guard `keeps dates as local calendar dates`; the backend parses dates only in `services/validation.rs`).
8. **State survives restarts.** SQLite lives on a mounted volume; config comes from env vars; nothing important is written to the container's ephemeral filesystem.
9. **No auth in code, but never assume public exposure.** Access control is Tailscale's job: build no login, and nothing that only makes sense for a public multi-user app.

## Priorities

When two valid approaches conflict, resolve in this order; a lower item never outweighs a higher one:

1. **Data safety:** the live personal DB, additive migrations, add-only import.
2. **Correctness of dates and recurrence.**
3. **Clean architecture:** one home per concern, one source of truth per fact, no cross-layer shortcuts (ARCHITECTURE.md §0/§7).
4. **Scope discipline:** calm and core.
5. **Implementation effort:** last, by a wide margin.

Extra work is never an argument against the right design: an additive migration, an extra helper or an extra layer costs once; a shortcut costs on every future change.
A solution that works but weakens the architecture is a defect, not a trade-off. If the clean option needs more work, do the work.

## Scope

**In scope:** month calendar (primary view) · day zoom · week view · color labels · Today tab · Inbox tab (unscheduled tasks) · recurring tasks (daily; weekly by weekdays; monthly by date incl. last
day, by Nth weekday incl. last, first/last workday; yearly on the start date; every N days/weeks; every N months with the same monthly options) · delete one occurrence or the whole series of a
recurring task · times on tasks · search over title/notes · by-label ordering as the app-wide default (calendar cells + day views; a persisted List/By-label preference switches back to manual order) ·
time-sorted ordering (timed by time first; untimed by label, then manual drag order within a label) · automatic rollover of overdue uncompleted tasks onto today (on app open/new day; a recurring
series' missed occurrences collapse into one standalone one-off on today, while the series keeps repeating; unticked past occurrences are hidden, TickTick-style) · TickTick CSV import.

**Out of scope (deliberate, Hard Rule 4):** reminders/notifications/alerts, pomodoro & focus timers, habit tracking, sub-task/checklist depth, priorities beyond what import needs,
collaboration/sharing, accounts & auth, ICS subscriptions, AI features.

## Architecture

One process, one container: Axum serves the built Svelte SPA as static files and the JSON API under `/api` (topology: ARCHITECTURE.md §2).
[ARCHITECTURE.md](./.claude/ARCHITECTURE.md) is the authoritative reference: §0 answers "where does X go?", §6 lists the cross-cutting concerns and §7 is the modularity contract, each rule with its guard.
The layer rules live in ARCHITECTURE-BACKEND.md (§3) and ARCHITECTURE-FRONTEND.md (§4), the data model in DATA-MODEL.md (§5).
Code is **modular by contract**: routes hold no business logic, services own behaviour, `db/` owns SQL, views compose shared components and controllers, `lib/api.ts` is the only HTTP, and every concern has one home.
When a structure, shared abstraction or entity changes, add in the same change only the line that says where the new piece lives and what it is for; behaviour belongs in a test.

## Stack

| Layer | Technology |
| --- | --- |
| Backend | Rust + Axum (async) on Tokio |
| DB access | SQLx compile-time-checked queries + SQLite; SQLx migrations, applied at startup |
| Recurrence | `rrule` crate (RFC-5545 RRULE parsing + expansion) |
| Frontend | Svelte 5 + Vite (SPA) + TypeScript; Tailwind CSS (theme tokens); `svelte-dnd-action` for drag; `chrono-node` for quick-add dates, client-side only |
| Quality gates | clippy deny-lints, ESLint, svelte-check, knip, jscpd; guard tests in both stacks; Semgrep in CI |
| Packaging / access | Single multi-stage Docker image; no auth, Tailscale-only; SQLite on a mounted volume |

**External Solutions First:** prefer a maintained crate or package over hand-rolling; if one solves ≥ 80% of a problem, use it and flag the dependency.
Recurrence expansion → the backend's `rrule` (the frontend only maps picker options and snaps a quick-add start); CSV → `csv` + `serde`; NL dates → `chrono-node`, client-side only; date math → `chrono`.

## Environment

- **Dev:** backend `cargo run` (API on :8080); frontend `npm run dev` (:5173, proxies `/api`). Config from env: `DATABASE_URL`, `DATA_DIR`, `STATIC_DIR`, `PORT`, optional `ALLOWED_HOSTS`.
  `.env` holds local values (template: `backend/.env.example`). Never commit it. There is deliberately **no `TZ` config**: the backend never computes "today".
- **Prod:** one container (`docker compose up --build`); the multi-stage `Dockerfile` builds the SPA, then the Rust binary, then a slim runtime serving both.
  SQLite sits on a **mounted volume**; `docker-entrypoint.sh` fixes its ownership before dropping to the app user; migrations run at startup; exposed only on Tailscale.
  A `docker-prune` sidecar (docker socket) weekly prunes images unused > 7 days and build cache > 14 days, but never volumes.
- Write code that works in dev and in the container: no absolute local paths, no hardcoded `localhost` in the frontend (use relative `/api`), no state that doesn't survive a restart.
- **Gotcha: keep the absolute project path colon-free.** `:` separates entries in `LD_LIBRARY_PATH` (cargo), `PATH` (npm) and Docker bind mounts, so a colon in the path breaks `cargo`, `npm run` and `docker compose up`.

## Data model

Defined in `backend/migrations/`; every column, index and migration is described in DATA-MODEL.md §5.1.
- **task:** one row per one-off task or recurring series: `due_date` NULL ⇒ **Inbox**, `due_time` NULL ⇒ untimed, `recurrence_rule` set ⇒ a series starting at `due_date`.
- **label:** name, palette colour, optional emoji, order; **one label per task** by design (multi-label would be a new `task_label` join table, never an overloaded column).
- **completion:** one row per done occurrence, so a series is done **per date**. **task_exception:** an occurrence a series hides (moved, skipped, rolled over).
- **imported_history_rule:** backup of rules a migration stripped from imported TickTick history rows. **Search** is SQLite `LIKE` over title and notes; add FTS5 only if it ever feels slow.

## Time, dates and recurrence

The easiest area for subtle bugs. Binding rules (detail: DATA-MODEL.md §5.2–§5.4):

- `due_date` is local calendar text (`2026-06-24`), `due_time` local wall-clock `HH:MM`; never converted through UTC, combined only at the edges, in the browser. Frontend date math lives in `lib/date.ts`.
- The backend never computes "today": the browser sends its local date (rollover); the importer reads the CSV's own timezone column.
- Recurrence is one task + an RRULE, never materialized rows; listings expand it per request into one row per occurrence with a derived `occurrence_date`, so clients key rows by `(id, occurrence_date)`.
- Completing an occurrence writes a `completion` row; moving or skipping one writes a `task_exception`; neither mutates the series.
- Day order: timed tasks by `due_time`, then untimed by `sort_order`; the by-label order is a frontend projection only. Picker options ⇄ RRULE live in `frontend/src/lib/recurrence/`.

## Import from TickTick

`POST /api/import/ticktick` takes a raw TickTick CSV backup: **add-only** (Hard Rule 3), one transaction, a bad row counts as `skipped`, reminder and priority columns are ignored. Mapping: DATA-MODEL.md §5.5.

## Project structure

Read only the folder relevant to the task; grep before scanning.

```text
backend/
  src/                 # main.rs → lib.rs; routes/, services/, db/, domain/, error.rs, config.rs
  migrations/          # SQLx migrations: additive, never edit an applied one
  .sqlx/, .cargo/      # committed offline query cache; SQLX_OFFLINE=true so builds never read a DB
  tests/api/           # integration tests on in-memory SQLite; common/ holds app, helpers, fixtures
  tests/guards/        # architecture and docs guards (source scan, no DB)
  build.rs, Cargo.toml, clippy.toml   # migration rebuild trigger; deny-lints
frontend/
  src/                 # App.svelte shell, NavTabs.svelte, main.ts, app.css (theme variables)
  src/views/           # one folder per tab: inbox, today, week, month
  src/overlays/        # one folder per header dialog: search, labels, settings, import
  src/lib/             # api.ts, types.ts, constants.ts, messages.ts, date.ts, module-level rune state
  src/lib/controllers/ # shared rune factories: task core, lock, composer, drop list, period nav, calendar
  src/lib/components/  # shared UI; composer/ (add/edit form), icons/
  src/lib/tasks/, src/lib/recurrence/, src/lib/dnd/   # pure helpers; dnd *.action.ts touch the DOM
  src/lib/test/        # factories, Vitest rune environment, architecture and docs guards
  public/, index.html, eslint.config.js, knip.json, tailwind.config.js, vite*.ts   # icons, entry, config
scripts/, .jscpd/      # test.sh runs the full local pipeline (CI parity); jscpd thresholds per target
.github/               # CI workflow, Dependabot
.claude/               # ARCHITECTURE*.md, DATA-MODEL.md, agents/, skills/ (.agents/skills/ links them)
.codex/                # codex main-session config + agents/
Dockerfile, docker-entrypoint.sh, docker-compose.yml   # image; volume ownership; app + prune sidecar
```

## Design language: calm mountain forest

A quiet morning in a pine forest: soft light, mist, stone, evergreen. Calm, spacious, professional. Never busy, never neon.
All chrome colours are Tailwind theme tokens (CSS variables in `app.css`, mapped in `tailwind.config.js`; map: ARCHITECTURE-FRONTEND.md §4.7). Use the tokens, not raw hex.

**Palette (light):**

| Token | Hex | Use |
| --- | --- | --- |
| `fog` | `#F4F6F3` | app background |
| `surface` | `#FBFCFA` | cards, calendar cells |
| `pine` | `#2F5D50` | primary actions, active state |
| `pine-deep` | `#1E3A34` | headers, emphasis |
| `moss` | `#6F8F6B` | secondary accents, success |
| `bark` | `#8B6F52` | warm accent, errors |
| `mist` | `#8FB3C7` | the background gradient (CSS variable only, no Tailwind class) |
| `ink` | `#2B332E` | primary text |
| `sage` | `#6B7770` | secondary text, muted labels |
| `lichen` | `#DDE3DD` | borders, dividers |

- **Dark mode** ("forest at night"):
  - Defaults to **System** (`prefers-color-scheme`); Settings → Appearance (System/Light/Dark) persists in `localStorage` (`lib/theme.ts`) and sets `data-theme` on `<html>`, applied pre-paint by an inline script in `index.html`.
  - The dark `@media` block (guarded `:not([data-theme])` so an explicit choice wins) and `:root[data-theme='dark']` re-point the same variables, which Tailwind maps as `rgb(var(--x) / <alpha-value>)`; no `dark:` classes.
  - The dark ground is a cool blue-charcoal, deliberately not green-tinted; evergreen lives in the accents. `pine`/`pine-deep` go **light** in dark so `bg-pine text-surface` stays readable; all text pairs ≥ AA.
  - Calendar cells use `cell` / `cell-out`: light = in-month cells on `surface`, other-month days recede to fog; dark = inverted. Weekends are not tinted differently.
  - **Label colours are user data, never themed** (Hard Rule 6): rows and pills take a label tint, a `LabelChip` shows a small dot, legible on either ground.
- **Label palette** (user-assignable, nature-derived, fixed set in `lib/palette.ts`): pine, moss, fern, clay, amber, slate, plum, stone.
- **Logo:** a cairn of three stacked stones (`pine`/`moss`/`sage`) with clear gaps and a slight lean, legible at favicon size. `Cairn.svelte` fills from theme tokens; `favicon.svg` uses the light hexes.
  `icon.svg` (cairn on a fog square) is the source for `icon-192.png`, `icon-512.png`, `apple-touch-icon.png` and `favicon-48.png`; re-render them with `magick` if the logo changes. Keep it three distinct stones.
- **Typography:** headings, wordmark and modal titles = **Hanken Grotesk** (`font-display`, self-hosted, imported in `main.ts`); body/UI = **Inter** (`font-sans`); extra sizes `text-wordmark`, `text-2xs`, `text-3xs`.
- **Atmosphere & depth (restrained):** one soft gradient over `fog` (`body::before`); depth via `shadow-soft` (cards), `shadow-lift` (popovers) and `shadow-overlay` (modals) on the `--shadow` variables.
  Stacking uses `z-sticky`, `z-chrome`, `z-popover`, `z-floating`; field, button, chip and cell looks are the class constants in `lib/constants.ts` (`INPUT_CLASS`, `PRIMARY_BTN_CLASS`, …).
- **Principles:** minimal, clean, generous whitespace, soft corners (`rounded-lg`/`rounded-xl`), no hover lifts or motion flourishes; gentle motion (`animate-rise-in`) that respects `prefers-reduced-motion`.

## Conventions

- **Backend (Rust):** `cargo fmt`; clippy with `-D warnings` plus the deny-lints in `backend/Cargo.toml` (`unwrap_used`, `expect_used`, `too_many_lines` at 60 via `backend/clippy.toml`); never `#[allow(…)]` (guarded).
  Errors as `Result` with the single `AppError`; `async` on Tokio; compile-time-checked SQLx queries only; files ≤ 300 lines in `backend/src/`, 500 in `backend/tests/` (guarded).
- **Frontend (Svelte 5 + TS):** strict TypeScript. ESLint forbids `any`, non-null `!`, `as` casts and floating promises, caps files at 300 lines and `.ts` functions at 150, and enforces the folder boundaries (`stino/boundaries`).
  knip rejects unused files, exports and dependencies; jscpd rejects duplicated blocks. Views stay thin: logic goes into a controller or a pure helper.
- **General:** config via env, never commit secrets; no dead code, commented-out blocks or half-finished features; never suppress a lint, fix the code.
  No em dash (U+2014) in the project's own files; rewrite the sentence instead (guarded).
  No magic values: app-wide constants in `backend/src/config.rs` / `frontend/src/lib/constants.ts`, user-facing copy in `frontend/src/lib/messages.ts`, a one-module constant as a named `const` in that module.
- **Comments (default: none):** write code that needs no comment. Add one only for a *why* the code can't show: a constraint, a gotcha, a non-obvious invariant ("mirrors X"), a library or browser quirk, or a deliberate trade-off.
  Then one short line. Never: restating the code or the name, doc prose that paraphrases the code, change history or narration of past edits, bug, ticket or plan references, section dividers, or ARCHITECTURE prose.
  Both stacks reject comments over two lines, dividers and history words (guards). This applies equally to subagents, so include this rule when delegating code work.

## Testing & lint: exact commands

Run from the repo root. Treat any clippy, ESLint, prettier, svelte-check, knip or jscpd error as a failing build and fix it in the same change.

1. **Fast checks (while working):** `scripts/test.sh --guards` runs backend fmt, clippy and guards; frontend prettier + ESLint, svelte-check, knip and guards; jscpd. No tests, no database.
2. **Full pipeline (before every push):** `scripts/test.sh` runs the fast checks, then `cargo test`, Vitest and the SPA build. `--skip backend|frontend|quality` (comma list allowed) drops a stage.
   CI runs the same script per job, plus Semgrep `p/ci`.
3. **Backend alone:** `cd backend && cargo fmt --check && cargo clippy --locked --all-targets -- -D warnings`; tests `cargo test --locked`; guards only `cargo test --locked --test guards`.
4. **Frontend alone:** `cd frontend && npm run lint && npm run check && npm run knip`; tests `npm test`; guards only `npm run test:guards`; build `npm run build`.

- **SQLx offline cache:** after changing a query or migration, regenerate `backend/.sqlx/` with the scratch-DB command in ARCHITECTURE.md §6; `cargo sqlx prepare --check` verifies.
- **Turn manual checks into tests:** backend → a module in `backend/tests/api/` on the helpers in `backend/tests/api/common/`; frontend → a `*.test.ts` beside the module, fixtures from `frontend/src/lib/test/factories.ts`.
  Frontend tests run in Node with the rune environment (`frontend/src/lib/test/rune-environment.ts`) and stub `api` with `vi.mock`; DOM-only code lives in `*.action.ts` and has no unit test.

## Working approach

- **Before writing:** read only the files you'll touch plus their direct dependencies; grep for the existing pattern and match it; pick a maintained package over building in-house.
  **Ask when genuinely split:** if two sound designs have real trade-offs, present them; weigh them by the Priorities, never by effort. When TickTick's behaviour is the unambiguous reference, match it.
- **While writing:** scope changes tightly; run `scripts/test.sh --guards` as you go. Never weaken a boundary "to test quickly". Find the root cause.

**Definition of done (all must hold):**

- `scripts/test.sh` is green, and no guard gained an exception list or allowance; tests cover the change; no modularity-contract violation (ARCHITECTURE.md §7).
- Schema change ⇒ a new additive migration + regenerated `backend/.sqlx/`. Works on a phone-width screen; tokens used, no stray hex.
- The docs line lands in the same change: where a new piece lives and what it is for (ARCHITECTURE.md §8); a folder added or removed → skill `maintaining-agents-md`.
- **Never commit unless the user explicitly asks.**

## Maintaining these docs

- Five docs, one job each: this file (rules, routing, conventions, folder map), ARCHITECTURE.md (§0 lookup, §6 cross-cutting, §7 contract), ARCHITECTURE-BACKEND.md (§3), ARCHITECTURE-FRONTEND.md (§4), DATA-MODEL.md (§5).
- Skill `maintaining-agents-md` keeps them in sync with the code and within their size caps; trim before asking for a higher cap.
  One short sentence per fact, current state only (no changelogs, no task notes); git tracks what changed.
- For deep situational context spanning many prompts, create `.claude/<topic>.md` and add one reference line here; delete it once it is obsolete.
