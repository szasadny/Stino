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

Source of truth is `backend/migrations/`. `0001_init.sql` + `0002_label_emoji.sql` +
`0003_task_exception.sql` define:

- **label** `(id, name, color, emoji?, sort_order, created_at, updated_at)` — `color` is a hex from
  the fixed nature-derived palette (defined once in `frontend/src/lib/palette.js` — see §10);
  `emoji` (added in `0002`) is an optional single glyph, NULL ⇒ color-only.
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
- **task_exception** `(id, task_id→task, occurrence_date, created_at)`, `UNIQUE(task_id,
  occurrence_date)` (added in `0003`) — one row per recurring occurrence that has been **detached**
  by a single-instance move (drag one instance of a repeating task to another day). Expansion
  skips these dates, so the series keeps repeating everywhere else while the moved instance lives
  on as its own one-off task on the new day. Same per-occurrence keying as `completion`.

Indexes: `task(due_date)`, `task(label_id)`, `completion(task_id)`, `task_exception(task_id)`.
Foreign keys are enforced (`PRAGMA foreign_keys = ON` set per connection); a deleted task cascades
its `completion` **and** `task_exception` rows.

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
- **Moving a single occurrence** (drag one instance of a recurring task to another day) detaches
  *just that instance*, TickTick-style: the service records a `task_exception` for the original
  `(task_id, occurrence_date)` and creates a **new one-off task** on the target day copying the
  series' title/notes/label/time (no recurrence). Expansion skips excepted dates, so the series
  keeps repeating everywhere else. A same-day drop of a recurring instance is a no-op (it's pinned
  to its day); only a cross-day drop detaches it.
- Recurrence dates are treated as **calendar dates**: expansion anchors DTSTART at UTC midnight and
  reads back each occurrence's date, so no timezone conversion can shift a day (Hard Rule 7).
- UI recurrence options map to RRULE — Daily (`FREQ=DAILY`), Weekly (`FREQ=WEEKLY;BYDAY=…`), Monthly
  (by date `FREQ=MONTHLY;BYMONTHDAY=n`, `n=-1` ⇒ the last day; or by the Nth weekday
  `FREQ=MONTHLY;BYDAY=xx;BYSETPOS=n`, `n=-1` ⇒ last), Custom (every N days/weeks:
  `FREQ=DAILY|WEEKLY;INTERVAL=n`). The option⇄RRULE mapping is a presentation concern in
  `frontend/src/lib/recurrence.ts`; the canonical wire/storage form is the RRULE string, which the
  service is the source of truth for validating and expanding. Months that lack a chosen day (a 31st,
  a fifth Monday) are simply skipped by the `rrule` crate.

## 5. API contract

`Content-Type: application/json`. Dates/times are the local-text formats above.

| Method | Path | Returns |
| --- | --- | --- |
| GET | `/api/health` | `{ "status": "ok", "db": true }` |
| GET | `/api/labels` | `[{ id, name, color, emoji, sort_order }]`, ordered by `sort_order`, then `id` |
| POST | `/api/labels` | body `{ name, color, emoji? }` → `201` Label |
| PATCH | `/api/labels/reorder` | body `{ ids: [...] }` (the full ordered list of label ids) → `204`; sets each label's `sort_order` to its position, atomically (`404` if any id is unknown, then nothing changes). Drives the grouped day view's section order and the Labels manager. Registered before `/api/labels/{id}`; matchit gives the literal segment priority |
| PATCH | `/api/labels/{id}` | partial body `{ name?, color?, emoji? }` → Label (`404` if unknown); an explicit `emoji: null` clears it, an omitted key leaves it unchanged |
| DELETE | `/api/labels/{id}` | `204`; tasks survive but lose the label (`ON DELETE SET NULL`) |
| GET | `/api/tasks?inbox=true` | Inbox: unscheduled tasks (`due_date IS NULL`), by `sort_order` |
| GET | `/api/tasks?date=YYYY-MM-DD` | tasks on that local day, timed-first then by `sort_order` |
| GET | `/api/tasks?from=YYYY-MM-DD&to=YYYY-MM-DD` | scheduled tasks in the inclusive range (the month/week grid), recurring tasks **expanded** into one task per occurrence, by day then timed-first |
| POST | `/api/tasks` | body `{ title, notes?, label_id?, due_date?, due_time?, recurrence_rule? }` → `201` Task |
| PATCH | `/api/tasks/{id}` | partial body (same fields) → Task (`404` if unknown) |
| DELETE | `/api/tasks/{id}` | `204`; cascades the task's `completion` rows |
| PATCH | `/api/tasks/reorder` | body `{ ids: [...] }` (the full ordered list of untimed task ids) → `204`; sets each task's `sort_order` to its position, atomically (`404` if any id is unknown, then nothing changes) |
| POST | `/api/tasks/batch` | bulk edit (Inbox multi-select): body `{ ids: [...], op }` where `op` is a `type`-tagged action — `{type:"label", label_id}` (null clears), `{type:"schedule", due_date}` (moves them out of the Inbox), `{type:"complete"}`, or `{type:"delete"}` → `204`. Atomic per op (`404` if any id is unknown, then nothing changes); empty `ids` is a no-op |
| POST | `/api/tasks/{id}/completions` | mark done → Task (`completed:true`); idempotent |
| DELETE | `/api/tasks/{id}/completions` | reopen → Task (`completed:false`) |
| POST | `/api/tasks/{id}/move_occurrence` | move ONE occurrence of a recurring task: body `{ occurrence_date, new_date }` → `201` the new detached one-off Task. Records a `task_exception` for the old date and creates a one-off on the new day (series keeps repeating). `404` unknown id; `400` if not recurring, `occurrence_date` isn't an instance of the series, or it has already been moved |
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
- `src/lib/palette.js` — the fixed label palette, defined **once** as plain JS data so both
  `constants.ts` and `tailwind.config.js` import it (Tailwind is loaded outside the TS pipeline, so
  the source has to be importable from a plain config). The one frontend home for the label colors;
  the backend keeps a guarded mirror (§10).
- `src/lib/constants.ts` — view list, the input length caps (`TITLE_MAX_LENGTH` /
  `LABEL_NAME_MAX_LENGTH`, mirroring the backend `config.rs`), the calendar-cell overflow thresholds
  (`MONTH_CELL_MAX_TITLES` / `…MAX_DOTS` / `WEEK_CELL_MAX_TITLES`), the drag-FLIP and search-debounce
  durations (`DND_FLIP_MS` / `SEARCH_DEBOUNCE_MS`), and the shared input class (`INPUT_CLASS`). Also
  re-exports `LABEL_PALETTE` from `palette.js` so the rest of the UI still imports it from here.
- `src/lib/controllers/calendar-selection.svelte.ts` — `createCalendarSelection(core)` (the
  `labelFor` + per-day index + selected-day state the Month and Week views share) and
  `preloadLabels(core)` (the graceful label load for the calendar's color dots), so neither view
  re-derives that block.
- `src/lib/errors.ts` — `errorMessage(err, fallback)`: the single place that turns a thrown value
  into a UI string (every view used to re-declare it).
- `src/lib/labels.ts` — `labelLookup(labels) → (task) => Label | undefined`: the id→label lookup
  (handling no/deleted label) shared by the views that decorate task rows. Also the label-reorder
  pair used when dragging label sections in the day view: `mergeLabelOrder(allLabels, visibleOrder)`
  folds a reordering of the day's *visible* labels back into the full global order, and
  `applyLabelOrder(labels, ids)` reorders + renumbers `sort_order` locally (the optimistic mirror of
  `api.labels.reorder`).
- `src/lib/task-actions.ts` — `toggleCompletion(task)` (complete/reopen the occurrence via the API)
  + `replaceOccurrence(tasks, updated)` (swap the `(id, occurrence_date)` row): the complete-toggle
  primitives the shared `task-core` controller (and the Search overlay) build on, so the flow lives in
  one place.
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
  single place that turns the UI repeat options (Daily / Weekly+weekdays / Monthly by-date or
  Nth-weekday / Custom every-N) into an RRULE string and back. Also `parseRecurrencePhrase(text)` —
  rule-based extraction of a recurrence from quick-add typing ("first Monday of every month"), returning
  the RRULE and the matched substring to strip. Presentation only — the backend validates/expands.
- `src/lib/quickadd.ts` — `parseQuickAdd(input) → { title, label?, due_date?, due_time?, recurrence_rule? }`:
  natural-language capture parsed **client-side**. First pulls a recurrence phrase via
  `parseRecurrencePhrase` and strips it (so a weekday inside it isn't read as a one-off date), then a
  `#tag` (TickTick-style inline label — a single non-space token; the **first** of several becomes the
  one label, all are stripped from the title), then `chrono-node` (per "External Solutions First" —
  never on the server) takes the date/time off the rest, formatted as **local** `YYYY-MM-DD` / `HH:MM`
  (Hard Rule 7) — a time only when the hour is certain. A recurrence with no explicit date defaults its
  DTSTART to the reference date. `describeDraft` renders the compact capture hint (date + repeat
  summary). `activeLabelToken(text, caret)` / `removeActiveToken(text, caret)` back the Inbox `#tag`
  suggestion menu (the tag under the cursor, and cutting it once picked). Pure given a reference date.
- `src/lib/theme.ts` — theme preference (System / Light / Dark). System follows `prefers-color-scheme`;
  Light/Dark set a `data-theme` override on `<html>` (the CSS vars in `app.css` key off it) and persist
  in `localStorage`. `normalizeThemePref` / `getThemePref` / `setThemePref`.
- `src/lib/move.ts` — pure cross-day-move logic for the month/week grid drag: `dropKind` classifies a
  drop (same-cell untimed reorder / plain reschedule / single recurring-occurrence detach / no-op) and
  `applyMove` projects the optimistic result. No state, no HTTP — unit-tested.
- `src/lib/ordering.ts` — `applyUntimedOrder(tasks, ids)`: renumber the untimed `sort_order` to match a
  dragged id list (the optimistic mirror of `api.tasks.reorder`), timed/recurring rows untouched.
- `src/lib/composer.ts` — `taskToDraft` / draft types for the add/edit dialog: the pure shape that maps a
  `Task` to/from the editable form fields, shared by the Inbox and grid composers.
- `src/lib/controllers/` — **rune factories** (`*.svelte.ts`) holding the shared view orchestration so no
  view re-implements CRUD. `task-core.svelte.ts` (`createTaskCore`) owns the task/label state + load /
  toggle / reorder / reorderLabels / remove / save behind ONE `pending` lock with a uniform
  optimistic-then-revert update — plus `dayCrud(reload)`, the throwing create/update/delete the Month/Week
  `DaySheet` binds (same lock, reloads the range on success, rethrows so the sheet renders its own inline
  error over the grid) so neither grid view forks day-zoom CRUD; `calendar-board.svelte.ts` (`createCalendarBoard`) adds the month/week
  drop zones (live drop list as owned `$state`, re-projected only when no gesture is live — see
  `calendar-board.ts` for the pure projection it builds on); `grid-composer.svelte.ts`
  (`createGridComposer`) owns the month/week add/edit dialog (create/update/delete through the lock,
  exposing the dialog's derived props). Every standing view (Today/Month/Week/Inbox) binds to a core.
- Pure helpers above are unit-tested with **Vitest** (`*.test.ts` beside each — incl. `move`, `ordering`,
  `composer`, `calendar-board`; `npm test`).
- `src/lib/components/` — reusable UI. `Modal` is the shared dialog shell (native `<dialog>`,
  standard header + close button, backdrop + sheet-in animation, the open/close effect, and an
  `onOpen` hook for dialogs that load/reset on open) that **DaySheet, SettingsDialog, ImportDialog,
  and LabelManager** all build on, so none re-implements dialog scaffolding; `TaskDot` (the calendar
  label-color dot), `EmptyState` (the dashed "nothing here" panel), `ErrorAlert` (the bark-toned
  error banner every view/dialog shows, callers passing only margins), and `DeleteConfirm` (the
  two-step "Delete? Yes/No" affordance, used by the task editor and the Labels manager) are shared
  the same way.
  Then: `Cairn` mark, `LabelChip`, `LabelManager`,
  `TaskRow` (complete-toggle + title + time + a repeat affordance for recurring tasks + chip, with a
  `trailing` snippet for view actions and an optional `leading` snippet before the checkbox — e.g. a
  drag handle), `RecurrencePicker` (the repeat control in the task edit panel:
  None / Daily / Weekly+weekdays / Monthly by-date or Nth-weekday / Custom every-N; emits an RRULE),
  `LabelSelect` (the inline label dropdown), `TaskPill` (a compact calendar-grid task chip with its
  label dot), `TaskComposer` + `TaskComposerDialog` (the shared add/edit form and its modal shell, used
  by the Inbox details editor and the month/week grid composer), `QuickAddButton` (the grid cell's add
  affordance), `SearchDialog` (the search overlay — see views below),
  `CalendarCell` (a month-grid day: titles on wide screens, dots on a phone), `WeekDayCell` (a week
  day: weekday+date header + a few task titles with label dots + "+N more"; a column at `sm`+, a
  full-width section when stacked on a phone), `DayAgenda` (a day's tasks grouped by label via
  `groupByLabel` — chip section headers + `TaskRow` rows + empty state; untimed tasks reorder within a
  group by a handle-scoped drag (`onReorder` → `api.tasks.reorder`), while the labeled sections
  themselves reorder by **up/down controls** on the chip header (`onReorderLabels` → `api.labels.reorder`)
  — not a drag, since nesting a section-drag zone inside the per-group task-drag zone would break the
  inner drag (Rule 4); the "No label" group pinned last), `DaySheet` (the day-zoom
  dialog: renders `DayAgenda` for the tapped day; driven by a `date` prop), `ImportDialog` (the
  TickTick CSV import: file picker → `api.import.ticktick(file)` → a friendly created/skipped
  summary), `ThemeToggle` (the segmented System / Light / Dark control), and `SettingsDialog`
  (groups Appearance = `ThemeToggle` and Data = an Import launcher; opened from the header gear).
- `src/views/` — `Inbox` (**natural-language capture** — the title box parses a date/time *and a
  recurrence phrase* *and a `#tag` label* via `parseQuickAdd` and shows a live "Scheduling for …" hint
  plus the label chip; a `#tag` opens a suggestion menu of matching labels (or "Create …", which adds
  the label on the fly with the next palette color, like the importer) — picking one shows it as a chip,
  else a typed `#tag` is resolved/created on submit; a parsed date or
  recurrence schedules the task straight
  out of the Inbox / complete / edit / schedule / **set recurrence** / **drag to
  reorder** the untimed list via `svelte-dnd-action`'s `dragHandleZone`/`dragHandle` (a locally-owned
  `$state` drop list, persisted through the shared `task-core`'s `reorder` under its lock), and
  **multi-select / bulk edit** — a "Select" toggle turns rows into
  checkboxes and a sticky bar applies one `api.tasks.batch` op to all selected: set label, schedule,
  complete, or delete; `TaskRow` renders the selection checkbox in its `selectable` mode), `Month`
  (the 6×7 grid with month nav + the grouped day sheet; recurring tasks shown on every occurrence),
  `Week` (Monday-first seven-day layout over the range query;
  prev/next-week + "This week" nav; seven columns reflow to a stacked column on a phone; taps open
  the shared day sheet), and `Today` (everything due today over the `?date=` query, grouped by label
  via `DayAgenda` rendered inline — a standing view, not a dialog; full-date header + task count +
  "Nothing due today." empty state) are the four standing views. **Search is an overlay, not a tab**:
  `SearchDialog` (a debounced `?q=` box over `api.search`; a flat `TaskRow` results list — each row
  complete-toggles and shows its planned day, or "Inbox" when unscheduled, since results span every
  date; tapping a row opens the editor inline, swapping the list like the day sheet so no second modal
  stacks, and saving/deleting re-runs the search; prompt / searching / no-results states; recurring
  tasks shown as their series row), opened from the header. `App.svelte` is the shell: header + nav
  (desktop pills / mobile bottom bar) + the active view + a connection indicator, plus a **Labels**
  button, a **Search** launcher, and a **Settings** gear (icon-only) that open `LabelManager` /
  `SearchDialog` / `SettingsDialog` (the gear groups the theme toggle and the TickTick import).

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

## 9. Open decisions

- **Multi-label per task:** single `label_id` now; add a `task_label` join table (new additive
  migration) if needed — don't overload existing columns.
- **Search:** shipped as a case-insensitive `LIKE` over `title`/`notes` (§5). Add an FTS5 virtual
  table only if it ever feels slow at personal scale.

## 10. Mirrored constants

A few facts necessarily live in more than one place because they span the language boundary (no
shared codegen). Each is centralized to ONE home per side; the pairs below can only drift by a manual
edit, so change them together.

| Value | Frontend home | Backend home | Drift guard |
| --- | --- | --- | --- |
| Label palette (8 hexes) | `src/lib/palette.js` (imported by `constants.ts` + `tailwind.config.js`) | `domain/label.rs` `LABEL_PALETTE` | `palette_is_unchanged` test in `domain/label.rs` pins the backend list |
| Title / label-name / emoji caps | `src/lib/constants.ts` (`TITLE_MAX_LENGTH`, …) | `config.rs` (`MAX_TITLE_LEN`, …) | comments on both sides; UI bounds input, service re-validates |
| Local date/time formats (`YYYY-MM-DD` / `HH:MM`) | `src/lib/date.ts` (string building) | `config.rs` (`DATE_FORMAT` / `TIME_FORMAT`) | documented in §4; both treat dates as local text |

Within each side the value has a single source — the work above collapsed the palette's two frontend
copies (constants + Tailwind) into `palette.js`. The cross-language copy is the irreducible one.
