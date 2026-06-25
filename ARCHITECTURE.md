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
> never touch `axum`. Cross-cutting validation primitives (the trim + empty + length check, local
> date/time parsing) live once in `services/validation.rs`; the length caps and the `YYYY-MM-DD` /
> `HH:MM` formats are constants in `config.rs` — the single source the task, label, and import
> services share rather than re-declaring per service.

## 3. Data model

Source of truth is `backend/migrations/`. `0001_init.sql` defines:

- **label** `(id, name, color, sort_order, created_at, updated_at)` — `color` is a hex from the
  fixed nature-derived palette (see `frontend/src/lib/constants.ts`).
- **task** `(id, title, notes?, label_id?→label, due_date?, due_time?, recurrence_rule?,
  sort_order, created_at, updated_at)`.
  - `due_date` NULL ⇒ **Inbox** (unscheduled). `due_time` NULL ⇒ untimed.
  - `recurrence_rule` NULL ⇒ one-off; otherwise an RFC-5545 RRULE with `due_date` as DTSTART.
  - The API additionally returns a derived **`occurrence_date`** on each task — the specific
    instance a row represents. It is **not a column**: for a one-off it equals `due_date`; for a
    recurring task the calendar/day queries return one task per expanded occurrence with
    `occurrence_date` set to that instance. Clients key rows by `(id, occurrence_date)`.
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
- **Recurrence is stored once** as an RRULE (`task.recurrence_rule`, `due_date` = DTSTART). To
  render the calendar, `services/recurrence` parses/validates/expands the rule with the `rrule`
  crate over the visible range and the service overlays completion state per occurrence. The
  range (`from`/`to`) and date (`date`) queries return **one task per occurrence** in the window —
  `due_date` stays the series start, `occurrence_date` is the instance, `completed` reflects that
  instance. Completing an occurrence writes a `completion` row for `(task_id, occurrence_date)`; it
  never mutates the task, so other occurrences stay open. To keep occurrences from being counted
  twice, the one-off range/date queries exclude `recurrence_rule IS NOT NULL`.
- Recurrence dates are treated as **calendar dates**: expansion anchors DTSTART at UTC midnight and
  reads back each occurrence's date, so no timezone conversion can shift a day (Hard Rule 7).
- UI recurrence options map to RRULE — Daily (`FREQ=DAILY`), Weekly (`FREQ=WEEKLY;BYDAY=…`), Custom
  (every N days/weeks: `FREQ=DAILY|WEEKLY;INTERVAL=n`). The option⇄RRULE mapping is a presentation
  concern in `frontend/src/lib/recurrence.ts`; the canonical wire/storage form is the RRULE string,
  which the service is the source of truth for validating and expanding.

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
| GET | `/api/tasks?inbox=true` | Inbox: unscheduled tasks (`due_date IS NULL`), by `sort_order` |
| GET | `/api/tasks?date=YYYY-MM-DD` | tasks on that local day, timed-first then by `sort_order` |
| GET | `/api/tasks?from=YYYY-MM-DD&to=YYYY-MM-DD` | scheduled tasks in the inclusive range (the month/week grid), recurring tasks **expanded** into one task per occurrence, by day then timed-first |
| POST | `/api/tasks` | body `{ title, notes?, label_id?, due_date?, due_time?, recurrence_rule? }` → `201` Task |
| PATCH | `/api/tasks/{id}` | partial body (same fields) → Task (`404` if unknown) |
| DELETE | `/api/tasks/{id}` | `204`; cascades the task's `completion` rows |
| PATCH | `/api/tasks/reorder` | body `{ ids: [...] }` (the full ordered list of untimed task ids) → `204`; sets each task's `sort_order` to its position, atomically (`404` if any id is unknown, then nothing changes) |
| POST | `/api/tasks/{id}/completions` | mark done → Task (`completed:true`); idempotent |
| DELETE | `/api/tasks/{id}/completions` | reopen → Task (`completed:false`) |
| GET | `/api/search?q=` | tasks whose `title`/`notes` match `q` (`LIKE`, case-insensitive, the term's `%`/`_` escaped); Inbox + scheduled, recurring as their series row; by `due_date` (nulls last) then `title`. Blank/missing `q` ⇒ `[]` |
| POST | `/api/import/ticktick` | body is the **raw CSV file** (not JSON/multipart — the SPA sends the picked `File` directly); imports a TickTick backup. Returns `{ created: { tasks, labels, completions }, skipped }`. Add-only; per-row tolerant (see §6) |

Every task carries a derived `completed` flag (a `completion` exists for the occurrence the row
represents) and an `occurrence_date` (the instance — equal to `due_date` for a one-off, the
expanded date for a recurring occurrence). The completion endpoints take an optional
`?occurrence_date=YYYY-MM-DD` query param (no body); omitted ⇒ the task's own `due_date` (NULL for
an Inbox task). They write/delete a `completion` row for `(task_id, occurrence_date)` and **never
mutate the task**, and return the **toggled occurrence** (its `occurrence_date` + `completed`) so the
client updates exactly that row.

Recurrence validation (service layer): a `recurrence_rule` must be a parseable RRULE **and** the
task must have a `due_date` (the DTSTART) — otherwise `400`. The rule is stored verbatim.

Label validation (service layer): `name` non-empty after trim, ≤ 60 chars; `color` must be one of
the fixed palette hexes (case-insensitive, stored uppercase). Task validation: `title` non-empty,
≤ 200 chars; `due_date` a real `YYYY-MM-DD`, `due_time` a real `HH:MM`; a `due_time` requires a
`due_date`; an unknown `label_id` is rejected. Failures return `400 {"error": msg}`; the message is
safe to show in the UI. New tasks/labels get the next `sort_order` (append to the end). On PATCH, an
omitted field keeps its current value while an explicit `null` clears a nullable one.

The `GET /api/tasks` selectors are tried most-specific first — `from`+`to` (range) → `date` (one
day) → Inbox — and are mutually exclusive. A range needs **both** bounds; giving only one is a
`400`. The range excludes Inbox tasks (`due_date IS NULL` never falls in `[from, to]`).

Reorder (service layer): `sort_order` is a single global counter — only the relative order within a
filtered list (the Inbox or a day's untimed tasks) is meaningful, so reassigning a contiguous run is
safe. `PATCH /api/tasks/reorder` rewrites `sort_order` = position for the given ids in one
transaction; the client sends only untimed task ids (timed/recurring tasks keep their time-sort). An
empty list is a no-op; an unknown id rolls the whole batch back as a `404`.

**Planned** — none; every planned endpoint above is implemented. New endpoints get added here
first when a future slice needs them.

## 6. TickTick import mapping

`POST /api/import/ticktick` (raw CSV request body) parses a TickTick CSV backup → our model.
Add-only (never deletes — Hard Rule 3), per-row tolerant (a bad row is skipped, not fatal), returns
a `{ created: { tasks, labels, completions }, skipped }` summary. Implemented in
`services/import_service.rs`; the handler just hands the bytes over.

| TickTick CSV | → Stinō |
| --- | --- |
| Title / Content | `task.title` / `task.notes` |
| Tags / List | `label` (first **Tag**, else the **List** name unless it's "Inbox"; created on demand, deduped by name case-insensitively, next palette color by append order) |
| Due Date, Is All Day, time | `task.due_date` / `task.due_time` |
| Repeat (RRULE) | `task.recurrence_rule` |
| Status / Completed Time | a `completion` row (for the task's own occurrence) |
| Reminder, Priority, Start Date, Order, … | **ignored** (out of scope / not modelled) |

Behaviours that matter:

- **Header detection.** A TickTick export prefixes metadata lines ("Date: …", "Version: …", a blank
  line) before the real header. The parser scans for the first row that has a `Title` column and
  treats everything after it as data — so the preamble is ignored and column **order doesn't
  matter** (cells are read by name, case-insensitively).
- **Dates are literal (Hard Rule 7).** The calendar date and `HH:MM` wall-clock time are read
  **straight from the export string** (`2026-06-24T09:00:00+0000` → `2026-06-24` / `09:00`); the
  trailing offset is never used to convert, so a task can't shift a day. `Is All Day` drops the time.
- **Recurrence.** A leading `RRULE:` is stripped to our bare stored form; the rule is kept only if it
  parses against the task's start date — otherwise it's dropped and the task is still imported (we
  degrade, never lose the task).
- **Completion.** A row counts as done if `Status` is `1` or a `Completed Time` is present; that
  writes a `completion` for the task's own occurrence (the series start for a recurring task; NULL
  for an undated Inbox task).
- **Tolerance & idempotency.** Mapping is validated through `task_service::create` (the single task
  validator); a row whose data is unusable — chiefly a missing title — is counted in `skipped`, not
  fatal. Only a real database error aborts. Tasks have no trustworthy id in the export, so the import
  is purely additive: re-running **appends** tasks while labels dedupe by name.

## 7. Frontend structure

- `src/lib/api.ts` — the only HTTP client; one typed function per endpoint.
- `src/lib/types.ts` — types mirroring the API contract (single source of truth).
- `src/lib/constants.ts` — view list, the fixed label palette (mirrors `tailwind.config.js`), the
  input length caps (`TITLE_MAX_LENGTH` / `LABEL_NAME_MAX_LENGTH`, mirroring the backend
  `config.rs`), and the calendar-cell overflow thresholds (`MONTH_CELL_MAX_TITLES` / `…MAX_DOTS` /
  `WEEK_CELL_MAX_TITLES`).
- `src/lib/errors.ts` — `errorMessage(err, fallback)`: the single place that turns a thrown value
  into a UI string (every view used to re-declare it).
- `src/lib/labels.ts` — `labelLookup(labels) → (task) => Label | undefined`: the id→label lookup
  (handling no/deleted label) shared by the views that decorate task rows.
- `src/lib/task-actions.ts` — `toggleCompletion(task)` (complete/reopen the occurrence via the API)
  + `replaceOccurrence(tasks, updated)` (swap the `(id, occurrence_date)` row): the complete-toggle
  flow shared by Inbox / Today / Month / Week / Search, so each view keeps only its own busy/error
  state.
- `src/lib/date.ts` — all calendar date math (month-grid builder, month nav, week helpers —
  `startOfWeek` / `buildWeekGrid` / `addWeeks` / `formatWeekRange` — and formatters). Treats dates as
  **local** calendar dates — never serializes through `toISOString()` (UTC), per Hard Rule 7.
  Views/components call it; they don't do date math inline.
- `src/lib/grouping.ts` — `groupByLabel(tasks, labels) → TaskGroup[]`: the day-zoom's group-by-label
  logic, kept pure and out of the views. Labeled groups in label `sort_order`, a trailing "No label"
  group (tasks with no label or a deleted one), input order preserved within each group. Also
  `groupByDate(tasks) → Map<occurrence_date, Task[]>` — the per-day index the month and week grids
  share. Grouping is a **client-side presentation concern** — no SQL/endpoint does it.
- `src/lib/recurrence.ts` — the option⇄RRULE mapping (`buildRRule` / `parseRRule` / `summarize`): the
  single place that turns the small set of UI repeat options (Daily / Weekly+weekdays / Custom every-N)
  into an RRULE string and back. Presentation only — the backend validates/expands the rule.
- `src/lib/quickadd.ts` — `parseQuickAdd(input) → { title, due_date?, due_time? }`: natural-language
  capture parsed **client-side** with `chrono-node` (per "External Solutions First" — never on the
  server). Takes chrono's first match, strips its phrase (and a dangling `on`/`by`) from the title, and
  formats the date/time as **local** `YYYY-MM-DD` / `HH:MM` (Hard Rule 7) — a time only when the hour is
  certain. `describeDraft` renders the compact capture hint. Pure given a reference date.
- `src/lib/theme.ts` — theme preference (System / Light / Dark). System follows `prefers-color-scheme`;
  Light/Dark set a `data-theme` override on `<html>` (the CSS vars in `app.css` key off it) and persist
  in `localStorage`. `normalizeThemePref` / `getThemePref` / `setThemePref`.
- Pure helpers above are unit-tested with **Vitest** (`*.test.ts` beside each; `npm test`).
- `src/lib/components/` — reusable UI. `Modal` is the shared dialog shell (native `<dialog>`,
  standard header + close button, backdrop + sheet-in animation, the open/close effect, and an
  `onOpen` hook for dialogs that load/reset on open) that **DaySheet, SettingsDialog, ImportDialog,
  and LabelManager** all build on, so none re-implements dialog scaffolding; `TaskDot` (the calendar
  label-color dot) and `EmptyState` (the dashed "nothing here" panel) are shared the same way.
  Then: `Cairn` mark, `LabelChip`, `LabelManager`,
  `TaskRow` (complete-toggle + title + time + a repeat affordance for recurring tasks + chip, with a
  `trailing` snippet for view actions and an optional `leading` snippet before the checkbox — e.g. a
  drag handle), `RecurrencePicker` (the repeat control in the task edit panel:
  None / Daily / Weekly+weekdays / Custom every-N; emits an RRULE),
  `CalendarCell` (a month-grid day: titles on wide screens, dots on a phone), `WeekDayCell` (a week
  day: weekday+date header + a few task titles with label dots + "+N more"; a column at `sm`+, a
  full-width section when stacked on a phone), `DayAgenda` (a day's tasks grouped by label via
  `groupByLabel` — chip section headers + `TaskRow` rows + empty state), `DaySheet` (the day-zoom
  dialog: renders `DayAgenda` for the tapped day; driven by a `date` prop), `ImportDialog` (the
  TickTick CSV import: file picker → `api.import.ticktick(file)` → a friendly created/skipped
  summary), `ThemeToggle` (the segmented System / Light / Dark control), and `SettingsDialog`
  (groups Appearance = `ThemeToggle` and Data = an Import launcher; opened from the header gear).
- `src/views/` — `Inbox` (**natural-language capture** — the title box parses a date/time via
  `parseQuickAdd` and shows a live "Scheduling for …" hint; a parsed date schedules the task straight
  out of the Inbox / complete / edit / schedule / **set recurrence** / **drag to
  reorder** the untimed list via `svelte-dnd-action`'s `dragHandleZone`/`dragHandle`, persisted with
  `api.tasks.reorder`), `Month`
  (the 6×7 grid with month nav + the grouped day sheet; recurring tasks shown on every occurrence),
  `Week` (Monday-first seven-day layout over the range query;
  prev/next-week + "This week" nav; seven columns reflow to a stacked column on a phone; taps open
  the shared day sheet), and `Today` (everything due today over the `?date=` query, grouped by label
  via `DayAgenda` rendered inline — a standing view, not a dialog; full-date header + task count +
  "Nothing due today." empty state), and `Search` (a debounced `?q=` box over `api.search`; a flat
  `TaskRow` results list with complete-toggle; prompt / searching / no-results states; recurring
  tasks shown as their series row) are live. `App.svelte` is the shell: header + nav (desktop pills /
  mobile bottom bar) + the active view + a connection indicator, plus a **Labels** button and a
  **Settings** gear (icon-only) that open `LabelManager` / `SettingsDialog` (the gear groups the theme
  toggle and the TickTick import).

## 8. Build & run

- **Dev:** `cargo run` (API :8080) + `vite dev` (SPA :5173, proxies `/api`).
- **Prod:** `docker compose up --build` → one container on :8080; SQLite on the `./data` volume;
  migrations run at startup via the compiled-in `sqlx::migrate!()`.
- **SQLx offline cache:** `query!` macros are checked at compile time. Dev builds verify against a
  live DB via `DATABASE_URL` (`backend/.env`); the Docker build has no DB, so it builds offline
  against the committed `backend/.sqlx/` cache (`SQLX_OFFLINE=true` in the Dockerfile). After
  changing any query, regenerate from `backend/` (dev DB migrated + `DATABASE_URL` set) with
  `cargo sqlx prepare`, and commit the updated `.sqlx/` JSON. CI can assert the cache is current
  with `cargo sqlx prepare --check`.

## 9. Open decisions (revisit when their slice arrives)

- **Multi-label per task:** single `label_id` now; add a `task_label` join table (new additive
  migration) if needed — don't overload existing columns.
- **Search:** shipped as a case-insensitive `LIKE` over `title`/`notes` (§5). Add an FTS5 virtual
  table only if it ever feels slow at personal scale.
- **Dark mode:** shipped (slice 12). Defaults to the OS via `prefers-color-scheme`, with a Settings →
  Appearance toggle (System / Light / Dark) that overrides it via a `data-theme` attribute (`theme.ts`).
  The chrome tokens are CSS variables flipped in `src/app.css`, so no per-component `dark:` classes and
  label colors stay fixed. See CLAUDE.md § Design Language.
