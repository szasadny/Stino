# Stinō Architecture

For agents: what lives where and what each part is for, so nobody has to scan the code. **Do not read top-to-bottom:** check §0, then Grep for `## <n>.`.
Not here: behaviour, how-it-works and history; those live in code and tests. One short sentence per fact. Rules, scope, stack and design language: [AGENTS.md](../AGENTS.md).

| § | Contents |
| --- | --- |
| 0 | Quick Lookup: where does X go? (check this first for any new code) |
| 1 | Guiding principles |
| 2 | Topology |
| 3 | Backend: layers, route/service/db/domain modules, shared helpers, API contract, tests, all in [ARCHITECTURE-BACKEND.md](./ARCHITECTURE-BACKEND.md) |
| 4 | Frontend: layers, feature folders, controllers and state, components, helpers, responsive and drag contract, design tokens, all in [ARCHITECTURE-FRONTEND.md](./ARCHITECTURE-FRONTEND.md) |
| 5 | Data model: tables, indexes, date and recurrence rules, RRULE options, import mapping, mirrored constants, all in [DATA-MODEL.md](./DATA-MODEL.md) |
| 6 | Cross-cutting concerns |
| 7 | Modularity contract: rules with their guards + wrong→right table |
| 8 | When to update these documents |

---

## 0. Quick Lookup: where does X go?

Every row has exactly one correct location; anywhere else is a contract violation (§7).

**Backend** (paths relative to `backend/src/` unless they start with `backend/`):

| You are adding / changing… | It goes in… |
| --- | --- |
| A business rule or behaviour | A module in `services/` (§3.3); never in a route or a `db/` function |
| A new endpoint | A `.route(…)` line in `routes::router` (`routes/mod.rs`) + a handler in the resource's route file: extract → one service call → status + JSON; then its row in the API contract (§3.7) |
| A request, patch or response type | `domain/` (`NewTask`, `TaskPatch`, `BatchOp`, `TaskSelector`, `NewLabel`, `LabelPatch`, `Task`, `Label`, …); a field where `null` clears and omitted keeps uses `double_option`; a wrapper for one route's params stays private in its route file |
| A SQL query | A function in `db/label.rs` or `db/task/<concern>.rs` on a `sqlx::query*!` macro; it returns rows, `Option` or `bool` and the service decides `NotFound`; then refresh the offline cache (§6) |
| A column in the task projection | `select_tasks!` in `db/task/mod.rs`; never a second task column list |
| A transaction | Opened in the service (`pool.begin()`); `db/` functions take `impl Executor` or `&mut Conn` and never begin or commit |
| A user-facing error message | A `ValidationError` variant in `error.rs`; tests assert on `ValidationError::X.to_string()` |
| An error → HTTP status mapping | `AppError` and its `IntoResponse` in `error.rs`, the only builder of an `{"error": …}` body |
| The response to a malformed request (bad JSON, query or path) | The extractors in `routes/extract.rs`, which turn axum rejections into `AppError::Rejected` |
| A date or time parse, format or check | `services/validation.rs` (`parse_date`, `canonical_date`, `canonical_time`, `parse_date_lenient`, `parse_time_lenient`, `format_date`, `format_time`); formats `DATE_FORMAT` / `TIME_FORMAT` in `config.rs` |
| A required, trimmed or capped text field | `validate_title`, `validate_label_name`, `clean_optional` in `services/validation.rs` |
| Validation of a task's fields (create, update, import) | `validate_fields` in `services/task/validate.rs`, the one task validator |
| A constant, cap or limit read by ≥ 2 modules, or an env default | `config.rs`; a constant read by one module stays a private `const` there (TickTick column names: `services/import/csv.rs`) |
| A cap, format or type the frontend mirrors | Both homes in DATA-MODEL.md §5.6, changed together |
| An env var | `Config::from_env` in `config.rs`, plus AGENTS.md § Environment |
| DB connection options (foreign keys, WAL, busy timeout, pool size) | `db::connect` in `db/mod.rs` |
| Recurrence expansion or rule validation | `services/recurrence/mod.rs` (`validate`, `expand`, `latest_through`) on the `rrule` crate; never hand-rolled date recursion |
| RRULE normalisation | `services/recurrence/normalize.rs`: `normalize` (stored form, no `RRULE:` prefix), `normalize_until` (TickTick's date-only `UNTIL`, for parsing) |
| Whether a date is an occurrence of a series | `ensure_series_member` in `services/task/mod.rs` |
| A stored rule that fails to expand | `or_warn` in `services/task/mod.rs`: skip with a warning, never fail the listing |
| Task listing (Inbox, day, range) and its sort | `services/task/list.rs` (`list`, `sort_tasks`) |
| Completing or reopening one occurrence | `services/task/completion.rs` |
| Moving or skipping one occurrence | `services/task/occurrence.rs` |
| Overdue rollover | `services/task/rollover.rs` |
| Bulk ops (Inbox multi-select) and manual reorder | `services/task/batch.rs` |
| Keeping a done one-off done when its date changes | `move_completion` in `db/task/completion.rs` |
| TickTick import column mapping | `map_row` in `services/import/row.rs`; column names in `services/import/csv.rs`; Due Date + timezone in `services/import/due.rs`; table in DATA-MODEL.md §5.5 |
| Label creation | `label_service::create` (API) or `label_service::find_or_create_on` (import); an imported label's colour is `palette_color` in `domain/label.rs` |
| The label palette | `LABEL_PALETTE` in `domain/label.rs`; frontend twin in DATA-MODEL.md §5.6 |
| Title/notes search | `services/search_service.rs` (term + LIKE escaping) over `db::task::search` |
| The health probe | `services/health_service.rs` |
| The Host allow-list | `ALLOWED_HOSTS` parsed in `config.rs`, enforced by `routes/host_guard.rs` |
| Startup wiring (tracing, config, pool, router, serve) | `run` in `lib.rs`; `main.rs` only calls it |
| A backend integration test | A module in `backend/tests/api/` registered in `backend/tests/api/main.rs`, one file per resource or concern (§3.9) |
| A unit test of a pure function | `#[cfg(test)] mod tests` beside it; a large set gets its own `tests/` submodule (`services/recurrence/tests/`) |
| A test helper, factory or fixture | `backend/tests/api/common/`: `app.rs` (pool, router, request builder), `api.rs` (endpoint helpers), `fixtures.rs` (named dates, series bodies, colours), `ticktick.rs` (`TickRow`, `csv_with`) |
| A guard (an architecture or docs rule checked by a test) | `backend/tests/guards/`: `architecture.rs` (source scan), `docs.rs` (docs contract), shared lexer in `source.rs` |
| A lint policy | `[lints.clippy]` in `backend/Cargo.toml` + `backend/clippy.toml`; never `#[allow(…)]` |
| A table, column or index | A new file in `backend/migrations/` (never edit an applied one) + DATA-MODEL.md §5.1 |
| The offline query cache after a query or migration change | Regenerate `backend/.sqlx/` (§6, SQLx offline cache) |

**Frontend** (paths relative to `frontend/src/` unless they start with `frontend/`):

| You are adding / changing… | It goes in… |
| --- | --- |
| An HTTP call | A function on `api` in `lib/api.ts`; its request and response types in `lib/types.ts` |
| An API type | `lib/types.ts`, mirroring the backend `domain/` shape (DATA-MODEL.md §5.6) |
| A constant: cap, timing, pixel size, storage key, breakpoint, option list | `lib/constants.ts`; a constant read by one module stays a private `const` there |
| User-facing copy (failure message, title, button text, aria label) | `lib/messages.ts`; counts through `pluralize` / `dayTaskCount` in `lib/format.ts` |
| A look-token class string (field, button, chip, popover, cell, modal size) | `lib/constants.ts` (§4.7) |
| A colour, shadow, font size or z-index | A theme token: CSS variable in `frontend/src/app.css` + its mapping in `frontend/tailwind.config.js` (§4.7) |
| A label colour | `LABEL_PALETTE` in `lib/palette.ts`; rendered through `labelColorVar` (`lib/labels.ts`) |
| A thrown error shown to the user | `errorMessage` in `lib/errors.ts` |
| `localStorage` access | `readStored` / `writeStored` in `lib/storage.ts` |
| Date math, parsing or formatting | `lib/date.ts`; today from `todayKey()` / `todayDate()` in `lib/today.svelte.ts` |
| A pure helper for tasks (order, projection, optimistic mirror, drop plan) | `lib/tasks/` (§4.5) |
| Recurrence options ⇄ RRULE, summaries, typed phrases | `lib/recurrence/` |
| Quick-add parsing | `lib/quickadd.ts` |
| A pure gesture or drag helper | `lib/dnd/<name>.ts` with a sibling test |
| A DOM action or attachment | `lib/dnd/<name>.action.ts` (`.action.svelte.ts` when it uses runes); no unit test |
| Shared view orchestration (a rune factory) | `lib/controllers/` once ≥ 2 folders use it (§4.3); otherwise its feature folder |
| A mutation with busy/error state | The view's task core (`optimistic`, `save`, `run`); outside tasks `createLock()`; never a second lock |
| The add/edit dialog | `createComposer` + `ComposerDialog` or `ComposerForm` |
| A reorderable list | `ReorderList` over a `createDropList` list |
| Month/week navigation | `createPeriodNav`, which fetches first and slides through `navigateWithSlide` |
| A calendar day surface (cell, agenda, panel) | Reads `getCalendarContext()`; zone options from `calendarZone` |
| A reload after an overlay changed data | `bumpRefresh()` in `lib/refresh.svelte.ts` |
| Phone vs wide layout | `isCompact()` in `lib/viewport.svelte.ts`, one layout per view (§4.6) |
| Something used by one view or overlay only | That `views/<view>/` or `overlays/<overlay>/` folder |
| A shared component | `lib/components/` once ≥ 2 folders use it |
| An icon | `lib/components/icons/` on `Icon`; a one-folder icon stays in that folder |
| An overlay (header dialog) | `overlays/<name>/`, its entry mounted by `App.svelte` |
| A new tab | `views/<name>/` + `VIEWS` (`lib/constants.ts`) + `ViewId` (`lib/types.ts`) + `VIEW_COMPONENTS` in `App.svelte` |
| A frontend unit test | `<module>.test.ts` beside the module; `api` stubbed with `vi.mock` |
| A test fixture or factory | `lib/test/factories.ts` |
| A frontend guard | An `it(...)` in `lib/test/architecture.test.ts` (token contrast: `lib/test/contrast.test.ts`); scan helpers in `lib/test/guards/repo.ts` |
| A lint rule | `frontend/eslint.config.js`; never an `eslint-disable` |
| A value mirrored from the backend or `index.html` | Both homes + DATA-MODEL.md §5.6 |

---

## 1. Guiding Principles

1. **Calm and core.** One person, one container, Tailscale-only; scope is AGENTS.md § Scope.
2. **Modularity.** Routes do HTTP, services do behaviour, `db/` does SQL, `domain/` holds plain types; dependencies point downward only.
   In the SPA, views compose, controllers orchestrate, pure helpers compute, and `lib/api.ts` is the only HTTP.
3. **One home per concern.** §0 names it; a second copy is lifted into that home first.
4. **Local dates.** Dates are local calendar text end to end; the backend never computes "today".
5. **Guards over prose.** A rule that matters is enforced by a test or lint (§7); the docs say where things live, the tests pin how they behave.

---

## 2. Topology

```text
Browser (Svelte SPA)
   │ same-origin HTTP/JSON, relative /api
Axum (one process, one container, reachable only over Tailscale)
   ├─ /api/*  → routes → services → db (SQLx) → SQLite on the DATA_DIR volume
   └─ other   → the built SPA from STATIC_DIR, index.html fallback
```

- No auth in code (Hard Rule 9); the optional Host allow-list is the only request filter (§6).
- Migrations are embedded by `sqlx::migrate!()` and run at startup in `db::connect`.

---

## 3. Backend

In [ARCHITECTURE-BACKEND.md](./ARCHITECTURE-BACKEND.md). §3.x references resolve there.

---

## 4. Frontend

In [ARCHITECTURE-FRONTEND.md](./ARCHITECTURE-FRONTEND.md): layers (§4.1), feature folders (§4.2), controllers and state (§4.3), components (§4.4), helpers (§4.5), responsive and drag contract (§4.6), design tokens (§4.7).

---

## 5. Data Model

In [DATA-MODEL.md](./DATA-MODEL.md). §5.x references resolve there.

---

## 6. Cross-cutting Concerns

| Concern | Where it lives | Rule |
| --- | --- | --- |
| Errors | `backend/src/error.rs` | One `AppError`; `IntoResponse` answers `{"error": msg}` with 400 (validation), 404, 403 (host), the extractor's own status, or 500 for a DB error (logged; body `internal error`) |
| Request extraction | `backend/src/routes/extract.rs` | Handlers take input through `Json` / `Query` / `Path` from here, so malformed input also gets the JSON error body |
| Config | `backend/src/config.rs` | Env read once in `Config::from_env`; an unparseable or zero `PORT` fails startup |
| Dates and times | `backend/src/services/validation.rs` | Local text, never UTC; the client supplies today; rules in DATA-MODEL.md §5.2 |
| Sorting | `sort_tasks` in `backend/src/services/task/list.rs`; `ORDER BY` in `backend/src/db/task/read.rs` (Inbox, search) | Per day: timed by `due_time`, then untimed by `sort_order`, then `id`; the by-label projection is frontend-only |
| Recurrence | `backend/src/services/recurrence/` | One task + RRULE, expanded per request over the asked window; rules in DATA-MODEL.md §5.3 |
| Rollover | `backend/src/services/task/rollover.rs` | Runs when the client posts its local today; idempotent per day |
| Import | `backend/src/services/import/` | Add-only, one transaction, a bad row counts as skipped; mapping in DATA-MODEL.md §5.5 |
| Host allow-list | `backend/src/routes/host_guard.rs` | Only with `ALLOWED_HOSTS` set: a Host (port stripped, ASCII case-insensitive) outside the list gets 403 |
| Logging | `run` in `backend/src/lib.rs` | `tracing` filtered by `RUST_LOG`, default `DEFAULT_LOG_FILTER`; `TraceLayer` on every request |
| Mirrored constants | DATA-MODEL.md §5.6 | A value the frontend copies changes on both sides together |
| SQLx offline cache | `backend/.sqlx/`, `backend/.cargo/config.toml` | Every build checks queries against the committed cache (`SQLX_OFFLINE=true`); after a query or migration change run, from `backend/`, `DATABASE_URL=sqlite:///tmp/x.db?mode=rwc sqlx migrate run && cargo sqlx prepare` on a scratch DB; `cargo sqlx prepare --check` verifies |
| Migrations | `backend/migrations/`, `backend/build.rs` | Embedded at compile time; the build script rebuilds when one is added; additive only (Hard Rule 3) |
| Lint policy (BE) | `backend/Cargo.toml`, `backend/clippy.toml` | clippy `unwrap_used`, `expect_used`, `too_many_lines` (60) deny; unwrap and expect are allowed in tests |
| Test boundary (BE) | `backend/tests/api/common/app.rs` | Every integration test runs the real router in-process on a fresh one-connection `sqlite::memory:` pool with all migrations; never a file DB or the live DB |
| HTTP client (FE) | `frontend/src/lib/api.ts` | Relative `/api` (`API_BASE`); every failure throws an `ApiError` (`network`, `server` for a 5xx or unreadable body, `rejected` with the API's reason for a 4xx) |
| Constants and copy (FE) | `frontend/src/lib/constants.ts`, `frontend/src/lib/messages.ts` | One home each; mirrored caps per DATA-MODEL.md §5.6 |
| Theme | `frontend/src/lib/theme.ts`, `frontend/index.html`, `frontend/src/app.css` | System / Light / Dark in `localStorage`; `data-theme` on `<html>` set before first paint; tokens re-point per theme |
| Viewport | `frontend/src/lib/viewport.svelte.ts` | `isCompact()` (≤ `COMPACT_MAX_WIDTH`) and `isCoarsePointer()`, the only media queries in script |
| Refresh | `frontend/src/lib/refresh.svelte.ts` | `bumpRefresh()` makes every core bound with `bindLoad` reload quietly |
| Today | `frontend/src/lib/today.svelte.ts`, `frontend/src/lib/day-change.svelte.ts` | The browser's local date; the rollover posts once per day before today advances |
| Test boundary (FE) | `frontend/vitest.config.ts`, `frontend/src/lib/test/rune-environment.ts` | Node with client-compiled runes; no DOM and no network (`api` stubbed with `vi.mock`) |
| Lint policy (FE) | `frontend/eslint.config.js`, `frontend/knip.json`, `.jscpd/` | ESLint errors fail the build; knip finds unused files, exports and dependencies; jscpd threshold 0 on `backend/src`, `backend/tests`, `frontend/src` |
| Pipeline | `scripts/test.sh` | Fast checks first (fmt, clippy, guards, lint, svelte-check, knip, jscpd), then the test suites and the SPA build; `--guards` stops after the fast checks, `--skip` drops a stage |
| CI | `.github/workflows/ci.yml` | Jobs `backend`, `frontend` and `quality` run `scripts/test.sh` with the other stages skipped; `sast` runs Semgrep `p/ci` |

---

## 7. The Modularity Contract

Every change satisfies all of these. Backend guards live in `backend/tests/guards/` (`cargo test --locked --test guards`), lints in `backend/Cargo.toml` + `backend/clippy.toml`.
Frontend guards are the `it(...)` tests in `frontend/src/lib/test/architecture.test.ts` and `frontend/src/lib/test/contrast.test.ts` (`npm run test:guards`), lints in `frontend/eslint.config.js`. A rule marked *review* has no guard.

**Backend:**

| # | Rule | Enforced by |
| --- | --- | --- |
| 1 | Layers reach downward only: routes → services → db; `domain` uses only `crate::error` and `crate::config`; `config` and `error` use no layer | `layers_only_reach_downward` |
| 2 | A route never reaches `db`; it calls a service | `layers_only_reach_downward` |
| 3 | SQL lives only in `db/` | `sql_lives_only_in_db` |
| 4 | `sqlx` is named only in `db/` and `error.rs`; services use the `db::{Pool, Conn, Executor}` aliases | `sqlx_is_named_only_in_db_and_the_error_boundary` |
| 5 | `axum` is named only in `routes/`, `error.rs` and `lib.rs`; services return `AppResult` and domain types | `axum_is_named_only_in_routes_the_error_boundary_and_lib` |
| 6 | Only `AppError::into_response` builds an error body | `only_app_error_builds_an_error_body` |
| 7 | No lint is silenced with `#[allow(…)]` | `no_lint_is_silenced_with_allow` |
| 8 | No `unwrap()` / `expect()` outside tests | clippy `unwrap_used`, `expect_used` |
| 9 | A function stays within 60 lines | clippy `too_many_lines` |
| 10 | A file stays within 300 lines in `backend/src/` and 500 in `backend/tests/` | `files_stay_short` |
| 11 | Comments: at most two consecutive lines, no dividers, no change history | `comments_stay_short_and_current` |
| 12 | Every file under `backend/src/` is named in ARCHITECTURE-BACKEND.md | `every_backend_source_file_is_documented` |
| 13 | §3.2 lists exactly the files in `backend/src/routes/` | `route_list_matches_route_files` |
| 14 | Every backticked `backend/` path in these docs and `AGENTS.md` exists | `doc_paths_exist` |
| 15 | These docs describe the current state only | `docs_describe_the_current_state` |
| 16 | Each doc stays within its size cap; no prose line over 240 characters | `docs_stay_within_their_size` |
| 17 | No em dash (U+2014) in the project's own files; migrations are out of scope | `own_files_hold_no_em_dash` |
| 18 | `db/` functions hold no business rule: they return rows, `Option` or `bool`, and the service decides | review |
| 19 | A handler makes one service call | review |
| 20 | One home per concern (§0): field primitives, messages, constants, the task projection | review |
| 21 | Migrations are additive and never edited once applied | review; sqlx refuses to run against a DB whose applied migration changed |

**Frontend:**

| # | Rule | Enforced by |
| --- | --- | --- |
| F1 | `fetch` only in `lib/api.ts` | ESLint `no-restricted-globals`, `no-restricted-properties` |
| F2 | A feature folder is imported only by its own files; `App.svelte` imports only its entry | ESLint `stino/boundaries`; `keeps lib/components and lib/controllers shared, and feature folders private` |
| F3 | A file in `lib/components/` (incl. `icons/`) or `lib/controllers/` has ≥ 2 importers, not all in one feature folder | `keeps lib/components and lib/controllers shared, and feature folders private` |
| F4 | `lib/tasks/`, `lib/recurrence/` and `lib/dnd/` stay I/O-free: no `lib/api` import outside `*.action.ts` | ESLint `stino/boundaries` |
| F5 | The composer is used only through `ComposerDialog` / `ComposerForm` | ESLint `stino/boundaries` |
| F6 | No hex, `rgb()` / `hsl()`, `dark:` variant, `text-[Npx]` or off-scale shadow outside `lib/palette.ts` | `styles only with design tokens` |
| F7 | No UTC date conversion (`toISOString`, `Date.UTC`, `getUTC*`, `Date.parse`) | `keeps dates as local calendar dates` |
| F8 | No `matchMedia`, `MediaQuery` or `innerWidth` comparison outside `lib/viewport.svelte.ts` | `keeps isCompact() the only JS breakpoint` |
| F9 | Every module in `lib/tasks/`, `lib/recurrence/`, `lib/dnd/` and every `*.svelte.ts` has a sibling test; DOM-only code is `*.action.ts` | `keeps a test beside every helper and rune module` |
| F10 | Comments: at most two lines, no divider, no history word, no `eslint-disable`, `@ts-ignore`, `@ts-expect-error` or `svelte-ignore` | `keeps comments short, current and free of lint suppressions`; ESLint `reportUnusedDisableDirectives` |
| F11 | Palette, caps, theme key and theme-color equal their mirrors (DATA-MODEL.md §5.6) | `mirrors the constants shared with the backend and index.html` |
| F12 | No `any`, non-null `!` or `as` cast | ESLint `no-explicit-any`, `no-non-null-assertion`, `consistent-type-assertions` |
| F13 | No floating promise; `void` marks a deliberate fire-and-forget | ESLint `no-floating-promises` |
| F14 | A file stays within 300 lines, a `.ts` function within 150; tests are exempt | ESLint `max-lines`, `max-lines-per-function` |
| F15 | No unused file, export or dependency | knip |
| F16 | No duplicated block (10 lines, 50 tokens) | jscpd, threshold 0 (`.jscpd/frontend-src.json`) |
| F17 | Types check; no `{@debug}` or `$inspect` | svelte-check; ESLint `svelte/valid-compile`, `svelte/no-at-debug-tags`, `svelte/no-inspect` |
| F18 | Every shared file and every folder under `lib/`, `views/` and `overlays/` is named in ARCHITECTURE-FRONTEND.md | `names every shared file and folder in ARCHITECTURE-FRONTEND.md` |
| F19 | Every backticked `frontend/`, `.claude/`, `.github/`, `.codex/`, `.jscpd/` or `scripts/` path in `AGENTS.md`, `CLAUDE.md` and these docs exists | `keeps every repo path named in the agent docs real` |
| F20 | `AGENTS.md` and ARCHITECTURE-FRONTEND.md describe the current state only | `keeps AGENTS.md and ARCHITECTURE-FRONTEND.md free of history` |
| F21 | `AGENTS.md` and ARCHITECTURE-FRONTEND.md stay within their size caps; no prose line over 240 characters | `keeps AGENTS.md and ARCHITECTURE-FRONTEND.md within their size` |
| F22 | One layout per view; flat zones; projected drop lists; one live zone per day; `hidden` mid-drag (§4.6) | review |
| F23 | Writes go through a task core or `createLock()`; copy lives in `lib/messages.ts`, shared constants in `lib/constants.ts` | review |
| F24 | Every text token reaches 4.5:1 on every ground token, in both themes | `keeps every text token at AA contrast on every ground, in both themes` |

### Common violations (wrong → right)

| Wrong | Right |
| --- | --- |
| `db::task::get(…)` in a handler | A service call; the service loads (`load_task`) |
| `sqlx::query!` in a service | A `db/` function taking `impl Executor` |
| `Json(json!({"error": …}))` in a route or middleware | Return an `AppError` (`NotFound`, `Forbidden`, `Validation(…)`) |
| An inline message string in a service | A `ValidationError` variant |
| `NaiveDate::parse_from_str(raw, "%Y-%m-%d")` outside `validation.rs` | `parse_date(field, raw)` / `format_date` |
| A literal cap such as `200` | `MAX_TITLE_LEN` in `config.rs` |
| A second task column list | `select_tasks!` |
| A `db/` function that checks a rule or picks `NotFound` | Return `Option` / `bool`; the service decides |
| `#[allow(clippy::too_many_arguments)]` | A parameter struct (`NewTask`) |
| `.unwrap()` outside tests | `?` with `AppError` or `anyhow::Context` |
| Reading the clock for "today" on the server | The client's date (`POST /api/tasks/rollover`) |
| A test that builds its own pool or router | `common::app()` and the helpers in `backend/tests/api/common/` |
| `fetch('/api/…')` in a component | A function on `api` in `lib/api.ts` |
| An import from another `views/` or `overlays/` folder | Lift the piece into `lib/components/` or `lib/controllers/` |
| A `lib/components/` file used by one view | Move it into that view's folder |
| An import of `composer/RecurrencePicker.svelte` from a view | `ComposerForm` or `ComposerDialog` |
| `#2F5D50`, `rgb(…)` or `dark:bg-…` in a component | A theme token such as `bg-pine`; a label colour through `labelColorVar` |
| `shadow-md` | `shadow-soft`, `shadow-lift` or `shadow-overlay` |
| `date.toISOString().slice(0, 10)` | `toISODate(date)` |
| `window.matchMedia('(max-width: …)')` | `isCompact()` |
| Both layouts rendered, one hidden with `sm:hidden` | `{#if isCompact()}` … `{:else}` … |
| A `$state` busy flag and try/catch around an `api` call in a view | `core.optimistic`, `core.save` or `createLock().run` |
| `invisible` on a zone mid-drag | `hidden` |
| A literal `'Couldn’t …'` or a literal duration in a component | A constant in `lib/messages.ts` or `lib/constants.ts` |
| `value as Task`, `task!` | Narrow with a type guard or an early return |
| `// eslint-disable-next-line` | Fix the code |

---

## 8. Maintenance

| When… | Update |
| --- | --- |
| A file is added, renamed or removed under `backend/src/` | ARCHITECTURE-BACKEND.md §3.1–§3.5 (`every_backend_source_file_is_documented` fails until then) |
| A route file or endpoint changes | ARCHITECTURE-BACKEND.md §3.2 and the API contract §3.7 |
| A file lands directly in `frontend/src/`, its `lib/` or a shared `lib/` folder, or a folder lands under `lib/`, `views/` or `overlays/` | ARCHITECTURE-FRONTEND.md §4.2–§4.5 (`names every shared file and folder in ARCHITECTURE-FRONTEND.md` fails until then) |
| A shared controller, component, design token or drag rule lands | ARCHITECTURE-FRONTEND.md §4.3, §4.4, §4.7 or §4.6, plus a §0 row |
| A table, column, index or migration lands | DATA-MODEL.md §5.1 |
| A date, recurrence or import rule changes | DATA-MODEL.md §5.2–§5.5 |
| A mirrored value changes | Both homes + DATA-MODEL.md §5.6 |
| A shared helper or cross-cutting rule lands | A §0 row + §6 or ARCHITECTURE-BACKEND.md §3.6 |
| A guard or lint is added | Its §7 row |
| A folder is added or removed | AGENTS.md project structure (skill `maintaining-agents-md`) |
| A doc reaches its size cap | Trim first; a cap rises only with the owner's approval (`backend/tests/guards/docs.rs` for the three backend-owned docs, `frontend/src/lib/test/architecture.test.ts` for `AGENTS.md` and ARCHITECTURE-FRONTEND.md) |

The docs guards check that named paths exist, that every source file and shared frontend file is documented, that docs hold no history words, and that each doc stays within its cap.

Add only the line that says where a new piece lives and what it is for. Behaviour belongs in code and tests.
