# Stinō — Architecture

The concrete contract behind [CLAUDE.md](./CLAUDE.md): system shape, data model, API, recurrence
semantics, import mapping, frontend module map, and calendar layout/drag rules. CLAUDE.md is the
day-to-day guidance; this file is the source of truth. Update it in the same change as the code.

## 1. System shape

One process, one container. Axum serves the built Svelte SPA as static files **and** the JSON API
under `/api`; the browser SPA renders every view and calls the API.

```
Browser (Svelte SPA) ──HTTP/JSON──▶ Axum ──▶ services ──▶ db (SQLx) ──▶ SQLite
        ▲                                                                  │
        └──────────────── static assets (ServeDir, SPA fallback) ◀─────────┘
```

- Non-`/api` paths: served from `STATIC_DIR`; unknown paths fall back to `index.html` (200) so
  client routing survives refresh/deep-link.
- Unknown `/api/*` paths: JSON `404 {"error":"not found"}` (never the SPA HTML).
- No auth — access is restricted by Tailscale, not in code. Optional `ALLOWED_HOSTS` env var
  (comma-separated hostnames, no ports) adds a Host-header allowlist as a DNS-rebinding guard:
  when set, a request whose Host (port stripped, case-insensitive) isn't listed gets `403`;
  unset ⇒ unchanged behavior.

## 2. Backend layering

Dependencies point downward only. Binding "must NOT" rules: CLAUDE.md § Architecture.

| Layer | Path | Owns |
| --- | --- | --- |
| routes/handlers | `backend/src/routes/` | HTTP shape: parse, call one service, return JSON |
| services | `backend/src/services/` | business logic, recurrence expansion, import, validation |
| db (repository) | `backend/src/db/` | every SQL query (SQLx) |
| domain | `backend/src/domain/` | plain structs + enums |

- Module declarations live in `lib.rs`; a thin `main.rs` calls `run()` — so integration tests can
  build the router against a temp database.
- `error.rs` holds the single `AppError`, mapped to HTTP only at the boundary (`IntoResponse`).
  Services return `AppResult` and never touch `axum`.
- Cross-cutting validation primitives (trim + empty + length check, local date/time parsing) live
  once in `services/validation.rs`; the length caps and `YYYY-MM-DD` / `HH:MM` formats are
  constants in `config.rs` — the single source the task, label, and import services share.

## 3. Data model

Source of truth: `backend/migrations/` (`0001_init.sql`, `0002_label_emoji.sql`,
`0003_task_exception.sql`).

- **label** `(id, name, color, emoji?, sort_order, created_at, updated_at)` — `color` is a hex from
  the fixed palette (one frontend home: `frontend/src/lib/palette.js` — see §11); `emoji` is an
  optional single glyph, NULL ⇒ color-only.
- **task** `(id, title, notes?, label_id?→label, due_date?, due_time?, recurrence_rule?,
  sort_order, created_at, updated_at)`.
  - `due_date` NULL ⇒ **Inbox** (unscheduled). `due_time` NULL ⇒ untimed.
  - `recurrence_rule` NULL ⇒ one-off; otherwise an RFC-5545 RRULE with `due_date` as DTSTART.
  - The API additionally returns a derived **`occurrence_date`** on each task — the instance a row
    represents. **Not a column**: equals `due_date` for a one-off; for a recurring task the
    calendar/day queries return one row per expanded occurrence. Clients key rows by
    `(id, occurrence_date)`.
- **completion** `(id, task_id→task, occurrence_date?, completed_at)`,
  `UNIQUE(task_id, occurrence_date)` — one row per completed occurrence. A one-off is done when a
  row exists for its `due_date`; a recurring task is done **for that date only**.
- **task_exception** `(id, task_id→task, occurrence_date, created_at)`,
  `UNIQUE(task_id, occurrence_date)` — one row per recurring occurrence **detached** by a
  single-instance move. Expansion skips these dates, so the moved instance lives on as its own
  one-off while the series keeps repeating elsewhere.

Indexes: `task(due_date)`, `task(label_id)`, `completion(task_id)`, `task_exception(task_id)`.
Foreign keys enforced (`PRAGMA foreign_keys = ON` per connection); deleting a task cascades its
`completion` **and** `task_exception` rows.

## 4. Time, dates & recurrence

- `due_date` is a **local calendar date** (`YYYY-MM-DD`), `due_time` a **local wall-clock time**
  (`HH:MM`). Stored as text, never converted through UTC — a task due "June 24" must not shift a
  day. There is **no server-side timezone**: the backend never computes "today"; the browser is the
  single source of "now", and the importer converts using the CSV's own `Timezone` column (§6).
- **Sorting in any view:** timed tasks first by `due_time` ascending; untimed after, by
  `sort_order` (manual drag order).
- **Recurrence is stored once** as an RRULE (`task.recurrence_rule`, `due_date` = DTSTART).
  `services/recurrence` parses/validates/expands the rule with the `rrule` crate over the visible
  range; the service overlays completion state per occurrence. The range (`from`/`to`) and date
  (`date`) queries return **one task per occurrence** — `due_date` stays the series start,
  `occurrence_date` is the instance, `completed` reflects that instance. To avoid double-counting,
  the one-off range/date queries exclude `recurrence_rule IS NOT NULL`.
- **Completing an occurrence** writes a `completion` row for `(task_id, occurrence_date)`; it never
  mutates the task, so other occurrences stay open.
- **Moving a single occurrence** (drag one instance to another day) detaches *just that instance*,
  TickTick-style: the service records a `task_exception` for the original
  `(task_id, occurrence_date)` and creates a **new one-off task** on the target day copying the
  series' title/notes/label/time (no recurrence). A **completed** source occurrence carries its
  done state: the `completion` row is re-keyed to the new one-off in the same transaction. A
  same-day drop of a recurring instance is a no-op; only a cross-day drop detaches.
- Recurrence dates are **calendar dates**: expansion anchors DTSTART at UTC midnight and reads back
  each occurrence's date, so no timezone conversion can shift a day (Hard Rule 7).
- **UI options ⇄ RRULE** (mapping is presentation, in `frontend/src/lib/recurrence.ts`; the RRULE
  string is the canonical wire/storage form, validated/expanded by the service):
  - Daily: `FREQ=DAILY`
  - Weekly (picked weekdays): `FREQ=WEEKLY;BYDAY=…`
  - Monthly by date: `FREQ=MONTHLY;BYMONTHDAY=n` (`n=-1` ⇒ last day)
  - Monthly by Nth weekday: `FREQ=MONTHLY;BYDAY=xx;BYSETPOS=n` (`n=-1` ⇒ last)
  - Monthly first/last **workday**: same BYSETPOS rule over the full Mon–Fri set
    `FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=n` (picker models it via a `WD` sentinel weekday)
  - Yearly (on the start date's month and day): `FREQ=YEARLY`
  - Custom every N days/weeks: `FREQ=DAILY|WEEKLY;INTERVAL=n`
  - Months lacking a chosen day (a 31st, a fifth Monday) are simply skipped by the `rrule` crate.

## 5. API contract

`Content-Type: application/json`. Dates/times use the local-text formats above.

| Method | Path | Returns |
| --- | --- | --- |
| GET | `/api/health` | `{ "status": "ok", "db": true }` |
| GET | `/api/labels` | `[{ id, name, color, emoji, sort_order }]`, ordered by `sort_order`, then `id` |
| POST | `/api/labels` | body `{ name, color, emoji? }` → `201` Label |
| PATCH | `/api/labels/reorder` | body `{ ids: [...] }` (the full ordered list of label ids) → `204`; sets each label's `sort_order` to its position, atomically (`404` if any id is unknown, then nothing changes). Registered before `/api/labels/{id}`; matchit gives the literal segment priority |
| PATCH | `/api/labels/{id}` | partial body `{ name?, color?, emoji? }` → Label (`404` if unknown); explicit `emoji: null` clears it, an omitted key leaves it unchanged |
| DELETE | `/api/labels/{id}` | `204`; tasks survive but lose the label (`ON DELETE SET NULL`) |
| GET | `/api/tasks?inbox=true` | Inbox: unscheduled tasks (`due_date IS NULL`), by `sort_order` |
| GET | `/api/tasks?date=YYYY-MM-DD` | tasks on that local day, timed-first then by `sort_order` |
| GET | `/api/tasks?from=YYYY-MM-DD&to=YYYY-MM-DD` | scheduled tasks in the inclusive range (the month/week grid), recurring tasks **expanded** into one task per occurrence, by day then timed-first |
| POST | `/api/tasks` | body `{ title, notes?, label_id?, due_date?, due_time?, recurrence_rule? }` → `201` Task |
| PATCH | `/api/tasks/{id}` | partial body (same fields) → Task (`404` if unknown) |
| DELETE | `/api/tasks/{id}` | `204`; cascades the task's `completion` rows |
| PATCH | `/api/tasks/reorder` | body `{ ids: [...] }` (the full ordered list of untimed task ids) → `204`; sets each task's `sort_order` to its position, atomically (`404` if any id is unknown, then nothing changes) |
| POST | `/api/tasks/batch` | bulk edit (Inbox multi-select): body `{ ids: [...], op }` where `op` is `type`-tagged — `{type:"label", label_id}` (null clears), `{type:"schedule", due_date}`, `{type:"complete"}`, or `{type:"delete"}` → `204`. Atomic per op (`404` if any id unknown ⇒ nothing changes); empty `ids` is a no-op. `schedule` mirrors the single-task PATCH's completion semantics and rejects a recurring task id with `400` |
| POST | `/api/tasks/rollover` | move every **overdue, uncompleted, non-recurring** task onto today: body `{ today: "YYYY-MM-DD" }` (the client's local date — the backend never computes "today") → `{ moved }`. One UPDATE over `due_date < today`, keeping `due_time`; completed tasks stay on their day, recurring series are untouched (the rule already generates today's occurrence). Idempotent; bad date ⇒ `400` |
| POST | `/api/tasks/{id}/completions` | mark done → Task (`completed:true`); idempotent |
| DELETE | `/api/tasks/{id}/completions` | reopen → Task (`completed:false`) |
| POST | `/api/tasks/{id}/move_occurrence` | move ONE occurrence of a recurring task: body `{ occurrence_date, new_date }` → `201` the new detached one-off Task. `404` unknown id; `400` if not recurring, `occurrence_date` isn't an instance of the series, or already moved |
| GET | `/api/search?q=` | tasks whose `title`/`notes` match `q` (`LIKE`, case-insensitive, `%`/`_` escaped); Inbox + scheduled, recurring as their series row; by `due_date` (nulls last) then `title`. Blank/missing `q` ⇒ `[]` |
| POST | `/api/import/ticktick` | body is the **raw CSV file** (not JSON/multipart — the SPA sends the picked `File` directly), up to **32 MB** (`config::IMPORT_MAX_BODY_BYTES` raises axum's 2 MB default). Returns `{ created: { tasks, labels, completions }, skipped }`. Add-only; per-row tolerant; all-or-nothing on a database error (§6) |

**Occurrences & completion.** Every task carries a derived `completed` flag and an
`occurrence_date` (equal to `due_date` for a one-off; the expanded date for a recurring
occurrence). The completion endpoints take an optional `?occurrence_date=YYYY-MM-DD` query param
(no body); omitted ⇒ the task's own `due_date` (NULL for an Inbox task). The date must be a **real
occurrence** — for a recurring task a member of the series that hasn't been detached (an instance
the rule generates, **or the series start itself**: search returns the canonical row keyed at
`due_date` and import records completions there even when the rule wouldn't regenerate that date);
for a one-off exactly its `due_date` — otherwise `400` (an orphan completion row would claim
`completed:true` for a date the client never shows). `move_occurrence` uses the same membership
rule. They write/delete a `completion` row and
**never mutate the task**, returning the toggled occurrence (`occurrence_date` + `completed`) so
the client updates exactly that row.

**Recurrence validation (service layer).** A `recurrence_rule` must be a parseable RRULE **and**
the task must have a `due_date` (the DTSTART) — otherwise `400`. Sub-daily frequencies
(`FREQ=HOURLY/MINUTELY/SECONDLY`) are rejected — occurrences are whole calendar dates. The rule is
stored verbatim. Writes gate; reads tolerate: a **stored** rule that no longer expands (e.g. one
accepted before a stricter gate) is skipped with a warning by the range/day queries rather than
failing the whole listing — one bad row must not brick the calendar.

**Completed reschedule.** Rescheduling a completed non-recurring task (single PATCH or bulk
`schedule`) carries its `completion` row to the new date **in the same transaction**, so the task
stays done on its new day (recurring tasks key completions per instance and are untouched).

**Validation (service layer).** Label: `name` non-empty after trim, ≤ 60 chars; `color` must be one
of the fixed palette hexes (case-insensitive, stored uppercase). Task: `title` non-empty, ≤ 200
chars; `due_date` a real `YYYY-MM-DD`, `due_time` a real `HH:MM`; a `due_time` requires a
`due_date`; unknown `label_id` rejected. Failures return `400 {"error": msg}` (message safe for the
UI). New tasks/labels get the next `sort_order` (append). On PATCH, an omitted field keeps its
value; an explicit `null` clears a nullable one.

**Task selectors.** `GET /api/tasks` tries most-specific first — `from`+`to` (range) → `date` (one
day) → Inbox — mutually exclusive. A range needs **both** bounds; only one is a `400`. An unknown
query param is a `400` (`deny_unknown_fields` — a typo'd selector must not silently return the
Inbox). The range excludes Inbox tasks.

**Reorder (service layer).** `sort_order` is a single global counter — only the relative order
within a filtered list (the Inbox or a day's untimed tasks) matters, so reassigning a contiguous
run is safe. `PATCH /api/tasks/reorder` rewrites `sort_order` = position for the given ids in one
transaction; the client sends only untimed task ids (timed/recurring keep their time-sort). Empty
list ⇒ no-op; an unknown id rolls the whole batch back as `404`.

## 6. TickTick import mapping

`POST /api/import/ticktick` (raw CSV request body) parses a TickTick CSV backup → our model.
Add-only (never deletes — Hard Rule 3), per-row tolerant (a bad row is skipped, not fatal), returns
`{ created: { tasks, labels, completions }, skipped }`. Implemented in
`services/import_service.rs`; the handler just hands the bytes over.

| TickTick CSV | → Stinō |
| --- | --- |
| Title / Content | `task.title` / `task.notes` |
| Tags / List | `label` (first **Tag**, else the **List** name unless "Inbox"; created on demand, deduped by name case-insensitively, next palette color by append order) |
| Due Date, Is All Day, Is Floating, Timezone | `task.due_date` / `task.due_time` (timed tasks converted from the UTC instant into the export's `Timezone`; see below) |
| Repeat (RRULE) | `task.recurrence_rule` |
| Status / Completed Time | a `completion` row (for the task's own occurrence) |
| Reminder, Priority, Start Date, Order, … | **ignored** (out of scope / not modelled) |

Behaviours that matter:

- **Header detection.** The export prefixes metadata lines ("Date: …", "Version: …", a blank line)
  before the real header. The parser scans for the first row with a `Title` column and treats
  everything after as data — the preamble is ignored and column **order doesn't matter** (cells are
  read by name, case-insensitively).
- **Dates honour the export's timezone (Hard Rule 7).** TickTick stores every Due Date as a **UTC
  instant** (`…+0000`) shown in its `Timezone` column's zone. Convert the instant into that zone
  before reading the local date + `HH:MM`. This includes **all-day** tasks: TickTick stores those
  as *local midnight expressed in UTC* (`2026-06-17T22:00:00+0000` = midnight 18 Jun in Amsterdam),
  so a literal read of the UTC date put every all-day task a day early; conversion recovers the
  right day, then `Is All Day` drops the time. **Floating** tasks (`Is Floating=true`) carry a
  zone-independent wall-clock and are kept **literally**. Missing/unrecognised `Timezone` or an
  unparseable instant ⇒ fall back to the literal read (degrade, never lose the task).
- **Recurrence.** A leading `RRULE:` is stripped to our bare stored form; the rule is kept only if
  it parses against the task's start date — otherwise dropped and the task still imports.
- **Completion.** A row counts as done if `Status` is `1` or a `Completed Time` is present ⇒ a
  `completion` for the task's own occurrence (series start for a recurring task; NULL for an
  undated Inbox task).
- **Tolerance & atomicity.** Mapping is validated through `task_service::create_on` (the single
  task validator, on the import's connection); a row with unusable data — chiefly a missing
  title — is counted in `skipped`, not fatal. Only a real database error aborts — and the whole
  import runs in **one transaction**, so an abort rolls every row back (a partial import can never
  commit; a re-run after failure can't duplicate). Tasks have no trustworthy id in the export, so a
  successful import is purely additive: re-running **appends** tasks while labels dedupe by name.

## 7. Frontend module map

### Contract & constants

- `lib/api.ts` — the only HTTP client; one typed function per endpoint.
- `lib/types.ts` — types mirroring the API contract; single source of truth.
- `lib/palette.js` — the fixed label palette as plain JS data, imported by BOTH `constants.ts` and
  `tailwind.config.js` (Tailwind loads outside the TS pipeline). Backend keeps a guarded mirror (§11).
- `lib/constants.ts` — view list; length caps mirroring `config.rs` (`TITLE_MAX_LENGTH`,
  `LABEL_NAME_MAX_LENGTH`, `LABEL_EMOJI_MAX_LENGTH`); `COMPACT_MAX_WIDTH`; drag/gesture timings
  (`DND_FLIP_MS`, `DND_TOUCH_HOLD_MS`, `DND_GRID_TOUCH_HOLD_MS`, `MONTH_EXPAND_ZONE_PX`,
  `MONTH_EXPAND_HOLD_MS`, `GHOST_CLICK_WINDOW_MS`, `SEARCH_DEBOUNCE_MS`); look-tokens
  (`INPUT_CLASS`, `PRIMARY_BTN_CLASS`, `DROP_TARGET_RING_CLASSES` — the shared drop-zone
  hover highlight; callers prepend only their corner radius); re-exports `LABEL_PALETTE`.

### Pure helpers (`lib/*.ts` — unit-tested with Vitest, `*.test.ts` beside each; `npm test`)

- `date.ts` — all calendar date math: month-grid builder, `monthWeekCount`, month/week nav helpers
  (`startOfWeek`, `buildWeekGrid`, `addWeeks`, `formatWeekRange`, `clampDayToMonth` — the same
  day-of-month in another month, clamped, so month navigation can carry an open day along),
  formatters. Local dates only — never `toISOString()` (Hard Rule 7). Views/components call it; no
  inline date math.
- `grouping.ts` — `groupByLabel(tasks, labels)` (label sections in label `sort_order`, "No label"
  pinned last, input order kept within groups); `dayViewGroups(tasks, labels, grouped)` (flat = one
  unlabeled section, so one render/drag path serves flat and grouped); `groupByDate(tasks)` (the
  per-day index the month/week grids share). Grouping is client-side presentation — no SQL does it.
- `recurrence.ts` — option⇄RRULE mapping (`buildRRule` / `parseRRule` / `summarize`) +
  `parseRecurrencePhrase(text)` (rule-based extraction of typed phrases like "first Monday of every
  month", returning the RRULE and the matched substring to strip). Presentation only — the backend
  validates/expands.
- `quickadd.ts` — `parseQuickAdd(input) → { title, label?, due_date?, due_time?, recurrence_rule? }`:
  client-side natural-language capture. Order matters: first strip a recurrence phrase (so a weekday
  inside it isn't read as a one-off date), then a `#tag` label (single non-space token; the first of
  several wins, all stripped), then `chrono-node` takes the date/time — local `YYYY-MM-DD`/`HH:MM`,
  a time only when the hour is certain. A recurrence with no explicit date defaults DTSTART to the
  reference date. Also `describeDraft` (capture hint) and `activeLabelToken` / `removeActiveToken`
  (the `#tag` suggestion menu). Pure given a reference date.
- `move.ts` — `dropKind` classifies a grid drop (same-cell untimed reorder / plain reschedule /
  recurring single-occurrence detach / no-op); `applyMove` projects the optimistic result.
- `ordering.ts` — `applyUntimedOrder(tasks, ids)`: renumber untimed `sort_order` to a dragged id
  list (optimistic mirror of `api.tasks.reorder`); timed/recurring rows untouched.
- `labels.ts` — `labelLookup(labels)` (id→label, handles no/deleted label);
  `mergeLabelOrder(allLabels, visibleOrder)` (fold a reorder of a day's *visible* labels back into
  the full global order) + `applyLabelOrder(labels, ids)` (optimistic mirror of
  `api.labels.reorder`).
- `composer.ts` — `taskToDraft` + draft types: the pure shape mapping a `Task` to/from the add/edit
  form fields, shared by the Inbox and grid composers.
- `task-actions.ts` — `toggleCompletion(task)` + `replaceOccurrence(tasks, updated)` (swap the
  `(id, occurrence_date)` row): the complete-toggle primitives `task-core` and Search build on.
- `errors.ts` — `errorMessage(err, fallback)`: the single thrown-value → UI-string conversion.
- `calendar-board.ts` — the pure cell projection the `calendar-board` controller builds on.
- `fit.ts` — how many task lines fit a measured cell height (accounting for the inter-line row gap) —
  used by every calendar cell (phone month, desktop month, week) so "+N more" appears only once the
  cell is genuinely full. No hardcoded per-cell line cap anywhere.
- `panel-pos.ts` — `DayPanel` placement math: given the anchor cell rect, panel size, and viewport,
  keep the panel beside the cell and fully on screen.
- `drag-scroll.ts` — `dragEdgeScroll` action + pure `edgeScrollStep`: scrolls a container while a
  held task sits near — or slightly past — its top/bottom edge (svelte-dnd-action's own auto-scroll
  needs the pointer ~30px *inside* the edge, unreachable by thumb). Also `pointFrom` (touch/mouse →
  one client point) and `createBottomDwell` (pure hold-timer state machine behind MonthView's
  grid-expand — see §8 Month/phone).
- `swipe.ts` — `swipe` action + pure `swipeDirection`: phone calendars' horizontal swipe to the
  previous/next period. Touch-only (never fires for mouse/trackpad); drag-aware (ignores a gesture
  while svelte-dnd-action's dragged clone exists, so a finished press-and-hold drag never doubles
  as a swipe).
- `nav-transition.ts` — `navigateWithSlide(dir, apply)`: directional month/week navigation as a
  View-Transitions slide scoped to the `vt-calendar` pane (`view-transition-name: calendar-pane`,
  keyframes in `app.css`). Snapshot-based, so the outgoing grid never exists twice in the DOM (no
  duplicate dnd zones); `apply` (including the range fetch) runs and is awaited *inside* the
  transition, so the new period slides in already populated. No API support or
  `prefers-reduced-motion` ⇒ applies instantly.
- `phantom-click.ts` — swallows the ONE stray "compatibility" click a touch tap emits on the
  `delayTouchStart` path (the library dispatches a synthetic tap→click AND the browser fires the
  native one), so it can't hit the editor that mounts at the tap point. Arms only on
  `pointer: coarse` — on a fine pointer there is no phantom and arming would eat a real click.
  One home so `DayAgenda` and `DayListSection` can't drift.
- `theme.ts` — theme preference (`normalizeThemePref` / `getThemePref` / `setThemePref`):
  System/Light/Dark, persisted in `localStorage`, manual override via `data-theme` on `<html>`.

### Reactive module state (`lib/*.svelte.ts` — module-level runes, exported through functions)

- `viewport.svelte.ts` — `isCompact()`: one app-wide `matchMedia(max-width: COMPACT_MAX_WIDTH)`
  listener; picks the phone vs wide layout.
- `group-view.svelte.ts` — the shared, persisted flat vs by-label day-list preference, so `DaySheet`
  and Today flip together (localStorage, like the theme).
- `refresh.svelte.ts` — cross-view refresh signal: overlays that mutate data outside a view's own
  core (Search edits, `LabelManager`, a TickTick import) call `bumpRefresh()` on close; each
  standing view re-runs its load via `onRefresh(reload)` (skips the init value to avoid a double
  fetch with `onMount`).

### Controllers (`lib/controllers/` — rune factories, `*.svelte.ts`)

- `task-core.svelte.ts` — `createTaskCore()`: task/label state + load / toggle / reorder /
  reorderLabels / remove / save behind ONE `pending` lock with uniform optimistic-then-revert
  updates. Also `dayCrud(reload)`: the throwing create/update/delete the Month/Week day zoom binds —
  same lock, reloads the range on success, rethrows so the sheet/panel shows its own inline error.
- `calendar-board.svelte.ts` — `createCalendarBoard(core, keys, reload)`: the month/week drop zones
  (live drop lists as owned `$state`, re-projected only while no gesture is live).
- `calendar-selection.svelte.ts` — `createCalendarSelection(core)`: the `labelFor` + per-day index +
  selected-day state Month and Week share; plus `preloadLabels(core)` (graceful label load for the
  calendar's color dots).
- `grid-composer.svelte.ts` — `createGridComposer(core, reload)`: the month/week add/edit dialog —
  state + create/update/delete through the lock, exposing the dialog's derived props.

### Components (`lib/components/`)

- **Shell/shared:** `Modal` (native `<dialog>` scaffold — header + close, backdrop + sheet-in
  animation, `onOpen` hook — that `DaySheet`, `SettingsDialog`, `ImportDialog`, and `LabelManager`
  build on), `EmptyState` (dashed "nothing here" panel), `ErrorAlert` (bark-toned error banner),
  `DeleteConfirm` (two-step "Delete? Yes/No"), `Cairn` (the logo mark).
- **Task UI:** `TaskRow` (complete-toggle + title + time + repeat affordance + label chip;
  `leading`/`trailing` snippets, `selectable` mode, `holdToDrag`; `slim` = the one-line phone
  day-list row — label-colour dot + truncated title + inline time, no meta line; `completing` =
  the Inbox send-off state — renders as done with the checkmark pop before the row leaves; the
  toggle is top-aligned on phone, vertically centered from `sm:` up), `TaskPill` (compact grid
  chip with label dot), `TaskComposer` + `TaskComposerDialog` (the shared add/edit form + its modal
  shell), `RecurrencePicker` (None / Daily / Weekly+weekdays / Monthly by-date or Nth-weekday /
  Custom every-N; emits an RRULE), `LabelChip`, `LabelSelect`, `QuickAddButton`.
- **Calendar:** `CalendarCell` (wide month cell — interactive pills), `CalendarCellMobile` (phone
  month cell — measured line fit, drop-only zone), `WeekDayCell` (wide week column),
  `DayListSection` (a weekday/date header over a day's `TaskRow`s — the phone Week days and the
  phone Month split agenda), `DayAgenda` (a day's list, flat or grouped — see §8), `DaySheet` (the
  phone full-screen day zoom, editor embedded inline), `DayPanel` (the desktop floating non-modal
  day zoom).
- **Chrome:** `SearchDialog`, `SettingsDialog` (Appearance = `ThemeToggle`, Data = import launcher;
  opened from the header gear), `ImportDialog` (file picker → `api.import.ticktick(file)` →
  created/skipped summary), `ThemeToggle`, `LabelManager`.

### Views (`src/views/`) — every standing view binds a `task-core`

- `InboxView` — natural-language capture: the title box parses date/time + recurrence phrase +
  `#tag` label via `parseQuickAdd`, with a live "Scheduling for …" hint and label chip; a `#tag`
  opens a suggestion menu of matching labels or "Create …" (next palette color, like the importer);
  a parsed date or recurrence schedules the task straight out of the Inbox. Complete / edit /
  schedule / set recurrence / drag-to-reorder — the drag gesture adapts to input like every list
  (wide: `dragHandleZone` + grip; phone: whole-row press-and-hold `dndzone`, tap-to-edit row, delete
  inside the editor). **Multi-select bulk edit:** a "Select" toggle turns rows into checkboxes and a
  sticky bar applies one `api.tasks.batch` op (label / schedule / complete / delete).
- `MonthView`, `WeekView` — the calendar grids + period nav (layouts and drag wiring: §8). Week is
  Monday-first over the range query.
- `TodayView` — everything due today (`?date=`), rendered inline via `DayAgenda`; full-date header +
  task count + empty state.
- `App.svelte` — the shell: header + nav (desktop pills / phone bottom bar), the active view, and
  launchers for `LabelManager`, `SearchDialog`, and `SettingsDialog`. Also owns the **overdue
  rollover**: on mount — and on `visibilitychange` when the tab returns on a later local day — it
  posts `api.tasks.rollover(today)` (at most once per local day, retried after a failure) and
  bumps the refresh signal when anything moved, so the standing view reloads.
- **Search is an overlay, not a tab:** `SearchDialog` debounces `?q=` over `api.search`; flat
  `TaskRow` results (each shows its planned day, or "Inbox"); a row tap opens the editor inline,
  swapping the list so no second modal stacks; saving/deleting re-runs the search; recurring tasks
  appear as their series row.

## 8. Calendar layouts & drag-and-drop

The invariants (one layout per width, flat zones, one live zone per day, `hidden` not unmounted,
owned `$state` drop lists) are in CLAUDE.md § Architecture. This is the per-view wiring.

**Breakpoint.** `COMPACT_MAX_WIDTH` = 639px (below Tailwind `sm`). `isCompact()` picks exactly ONE
layout per view.

**Month:**

- Every width keeps the real calendar grid. Wide: fixed 6×7 of `CalendarCell` — interactive pills,
  drag between cells.
- Phone: the grid of `CalendarCellMobile` cells (each task one line: label dot + title) fills the
  screen by default — no day selected. Tapping a cell opens the TickTick-style **split**: that
  day's agenda underneath (a reused `DayListSection`). Tapping the selected cell again or the
  agenda's close "×" collapses the split back to the full-height grid; there is no separate day
  popup on phone Month. Navigating months does NOT collapse it — see Period navigation below.
- Phone drag: the agenda rows and the cells share ONE `type: 'calendar'` zone bound to the same
  `calendar-board`, so a press-and-held agenda row drops onto any cell to reschedule. The cells are
  **drop-only** (`dragDisabled` — their lines are too small to grab); the selected day's cell
  **freezes** (no zone) while its agenda is that day's live zone.
- Dwelling a held task near the bottom of the view hides the agenda (`hidden` — see invariants) so
  the whole grid becomes the drop surface (`MONTH_EXPAND_ZONE_PX` / `MONTH_EXPAND_HOLD_MS`; the
  dwell state machine is `createBottomDwell` in `lib/drag-scroll.ts`, fed by both `touchmove` and
  `mousemove` so a mouse drag in a narrow window expands the grid too).
- **No hardcoded line cap anywhere**: `CalendarCellMobile` (phone month), `CalendarCell` (desktop
  month), and `WeekDayCell` (desktop week) each measure the list height (`bind:clientHeight`), one
  rendered pill/line's height, and the list's row gap, then fit exactly as many as the cell allows
  (`lib/fit.ts`), so "+N more" appears only once the cell is genuinely full. Each zone renders
  **every** item for svelte-dnd-action's child↔item parity — overflow pills/lines are `invisible` but
  keep their child slot (never the drag shadow, which stays visible as the drop preview); the
  "+N more" row sits outside the `<ul>`.
- The phone grid renders only the month's actual week-rows (`monthWeekCount`, 4–6) via a dynamic
  `grid-template-rows`, so no all-spill-over row wastes height (the data layer keeps the full
  42-cell grid). Desktop keeps the fixed 6×7.

**Week:**

- Wide: 7-column `WeekDayCell` grid.
- Phone: a scrollable stack of `DayListSection`s (7 columns are unreadable). The rows are a shared
  `type: 'calendar'` zone bound to the SAME `calendar-board`, so a held row drags **day-to-day**
  (reschedule) or reorders within its day. Whole-row press-and-hold (`dndzone` +
  `delayTouchStart`) — a tap still edits, a swipe still scrolls.

**Period navigation:** phone calendars swipe horizontally (`lib/swipe.ts`); every navigation (swipe
or header arrows, all widths) goes through `nav-transition.ts`'s `navigateWithSlide` (§7) — a
directional slide that never mounts the outgoing grid twice. In Month, an open day zoom (the phone
split agenda / the desktop `DayPanel`) STAYS open across a navigation: the selection follows the
same day-of-month into the target month (`clampDayToMonth` — Jan 31 → Feb 28), and "Today" with a
day open lands on today's agenda. Week keeps its existing collapse-on-navigate.

**Day zoom (differs by view and width):**

- Phone Month → the split agenda above (no popup).
- Phone Week → a header tap opens the full-screen `DaySheet` modal; its single `DayAgenda` is the
  only untimed drag zone live. A full-screen modal needs no per-cell freeze — the zones behind it
  are never live at the same time.
- Desktop Month/Week → `DayPanel`: a floating **non-modal** card anchored beside the tapped cell
  (`lib/panel-pos.ts`). No backdrop ⇒ the grid stays live, so a task can be dragged **out of the
  panel onto another day**: the panel is just another `type: 'calendar'` zone bound to the same
  board cell (shared `consider`/`finalize`; every gesture reuses `move.ts`). Add/edit reuse the
  grid composer; complete uses the shared toggle. Its list is flat, grid-ordered (label = pill
  color) — never label sections (a single shared zone can't split into per-label zones). While
  open, the matching grid cell **freezes** (its `open` prop renders pills statically, no zone) —
  two zones holding one day's items would corrupt drag tracking.

**DayAgenda (phone DaySheet + Today):**

- Flat, drag-sorted list by **default** (timed-first, then the shared `sort_order`), so a day zoom
  reads the same order as the month/week cell it opened from. A **List / By label** toggle switches
  to label sections, whose order changes via **up/down controls** on the chip header — not a drag
  (nesting a section zone inside the task zone would break the inner drag). Flat is modelled as one
  unlabeled section (`dayViewGroups`), so one render/drag path serves both; the preference is
  shared + persisted (`group-view.svelte.ts`).
- Untimed reorder adapts to input: wide screens drag the 6-dot grip (`dragHandleZone`); a phone
  press-and-holds the whole row (`dndzone` + `delayTouchStart`). `isCompact()` picks one zone.
  `DaySheet` is phone-only ⇒ always hold-to-drag; the grip shows on wide Today. This grip-vs-hold
  split is universal — every reorder list (`InboxView`, `LabelManager` included) follows it; no
  grip handles at phone width, ever.

**Gesture plumbing:**

- svelte-dnd-action won't start a drag from a `<button>` (any element with a `.value`), so a
  hold-to-drag row's tap-to-edit surface is a `div role=button` (`TaskRow`'s `holdToDrag`).
- `phantom-click.ts` (§7) swallows the stray post-tap click in `DayAgenda` and `DayListSection`.
- Scrollable drag surfaces (the phone Week stack, the `DaySheet` body) attach `drag-scroll.ts`'s
  `dragEdgeScroll` (§7).
- The task editor is **full-screen on a phone in every view**: `TaskComposerDialog`
  (Month/Week/Today/Inbox) mirrors `DaySheet`'s full-screen panel, and `DaySheet` embeds its editor
  inline; desktop keeps the centered card.

## 9. Build & run

- **Dev:** `cargo run` (API :8080) + `vite dev` (SPA :5173, proxies `/api`).
- **Env:** `PORT` (default 8080 — a present-but-unparseable value fails startup rather than
  silently falling back), `DATA_DIR`, `DATABASE_URL`, `STATIC_DIR`, optional `ALLOWED_HOSTS` (§1).
- **Prod:** `docker compose up --build` → one container on :8080; SQLite on the `./data` volume;
  migrations run at startup via the compiled-in `sqlx::migrate!()`.
- **SQLx offline cache:** `query!` macros are checked at compile time. Dev builds verify against a
  live DB via `DATABASE_URL` (`backend/.env`); the Docker build has no DB, so it compiles offline
  against the committed `backend/.sqlx/` (`SQLX_OFFLINE=true` in the Dockerfile). After changing
  any query, regenerate from `backend/` (dev DB migrated + `DATABASE_URL` set) with
  `cargo sqlx prepare` and commit the updated `.sqlx/` JSON. CI can assert the cache is current
  with `cargo sqlx prepare --check`.

## 10. Open decisions

- **Multi-label per task:** single `label_id` now; add a `task_label` join table (new additive
  migration) if needed — don't overload existing columns.
- **Search:** shipped as case-insensitive `LIKE` over `title`/`notes` (§5). Add FTS5 only if it
  ever feels slow at personal scale.

## 11. Mirrored constants

A few facts span the language boundary (no shared codegen), so they live once per side. The pairs
can only drift by a manual edit — change them together.

| Value | Frontend home | Backend home | Drift guard |
| --- | --- | --- | --- |
| Label palette (8 hexes) | `src/lib/palette.js` (imported by `constants.ts` + `tailwind.config.js`) | `domain/label.rs` `LABEL_PALETTE` | `palette_is_unchanged` test in `domain/label.rs` pins the backend list |
| Title / label-name / emoji caps | `src/lib/constants.ts` (`TITLE_MAX_LENGTH`, …) | `config.rs` (`MAX_TITLE_LEN`, …) | comments on both sides; UI bounds input, service re-validates |
| Local date/time formats (`YYYY-MM-DD` / `HH:MM`) | `src/lib/date.ts` (string building) | `config.rs` (`DATE_FORMAT` / `TIME_FORMAT`) | documented in §4; both treat dates as local text |
