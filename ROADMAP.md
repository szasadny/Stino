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
- [x] **2 · Tasks + Inbox** — create / edit / delete tasks; complete + reopen (via the `completion` table, never mutating the task); the Inbox lists the unscheduled ones (`due_date IS NULL`) and giving a task a date schedules it onto its day.
- [x] **3 · Month** — the month calendar grid (6×7, Monday-first); tasks shown on their due day; tap a day to zoom into a sheet that lists + completes its tasks. Range endpoint `GET /api/tasks?from=&to=`.
- [x] **4 · Day (group-by-label)** — the day zoom groups its tasks by label (label-chip section headers, "No label" last; timed-first within each group), via a pure `lib/grouping.ts` helper + a reusable `DayAgenda` component the month sheet renders (Today will reuse it). No new endpoint/migration — grouping is client-side over the day's tasks.
- [x] **5 · Week** — a Monday-first seven-day layout reusing the range query over a 7-day window; seven columns on a wide screen reflow to a stacked single column on a phone; tapping a day opens the shared grouped day sheet. New `lib/date.ts` week helpers + a reusable `WeekDayCell`. No new endpoint/migration.
- [x] **6 · Today** — the Today tab: everything due today, grouped by label, as a standing inline view (not a dialog). Reuses `DayAgenda` unchanged over the existing `?date=today` query. No new endpoint/migration.
- [x] **7 · Recurrence** — store one task with an RRULE (`due_date` = DTSTART); `services/recurrence` expands it with the `rrule` crate over the visible range so each occurrence shows on its day; completing one occurrence writes a `(task_id, occurrence_date)` completion and leaves the rest open. Wire field `occurrence_date` keys rows by `(id, occurrence_date)`. No new migration/endpoint.
- [x] **8 · Search** — `GET /api/search?q=`: a case-insensitive `LIKE` over title / notes (the term's `%`/`_` escaped), Inbox + scheduled both searchable, recurring tasks as their series row, ordered by `due_date` (nulls last) then title; a debounced `SearchView` with a flat `TaskRow` results list. No migration.
- [x] **9 · Reorder** — drag untimed tasks to set `sort_order` (`svelte-dnd-action`). `PATCH /api/tasks/reorder` with `{ ids }` rewrites `sort_order` = position in one transaction (atomic, `404` rolls back); global `sort_order`, untimed only, timed/recurring keep their time-sort. A `dragHandle` grip in the Inbox list, persisted optimistically.
- [x] **10 · Quick-add** — the Inbox title box parses a natural-language date/time ("call mum tomorrow 9am") client-side with `chrono-node` via a pure `lib/quickadd.ts`; a live hint previews the result and a parsed date schedules the task straight out of the Inbox. Reuses `POST /api/tasks`; no endpoint, no migration.
- [x] **11 · TickTick import** — `POST /api/import/ticktick` (raw CSV body) maps a TickTick backup → tasks/labels/completions; add-only, per-row tolerant, returns a `{ created, skipped }` summary; an `ImportDialog` opened from the header. Dates read literally (no TZ shift).
- [x] **12 · Polish** — dark mode (System default + Settings toggle); empty/loading/error states audited (all views covered); a Vitest runner with unit tests for the pure helpers; dead `Placeholder` removed.

## Done so far — where things live

- **Skeleton:** `backend/src/{main,lib,config}.rs`, `routes/health.rs`, `migrations/0001_init.sql` (defines `label`, `task`, `completion`). Frontend shell in `frontend/src/App.svelte` + `views/*` stubs.
- **Labels:** backend `domain/label.rs`, `db/label.rs`, `services/label_service.rs`, `routes/labels.rs`, single `error.rs`; tests in `backend/tests/labels.rs`. Frontend `lib/api.ts` (`api.labels.*`), `lib/components/LabelChip.svelte` + `LabelManager.svelte`, opened from the header button in `App.svelte`. Compile-time queries use the committed `backend/.sqlx/` offline cache.
- **Tasks + Inbox:** backend `domain/task.rs` (`Task`/`NewTask`/`TaskPatch`), `db/task.rs` (list inbox/by-date, CRUD, `add`/`remove_completion`), `services/task_service.rs` (validation + the timed-first sort rule + completions), `routes/tasks.rs`; tests in `backend/tests/tasks.rs`. Frontend `api.tasks.*`, reusable `lib/components/TaskRow.svelte`, and the live `views/InboxView.svelte` (capture, complete, inline edit, schedule, delete). `completed` is derived per occurrence; PATCH distinguishes omitted (keep) from `null` (clear).
- **Month:** backend `db::task::list_in_range` + `task_service::list_in_range`, served by extending `GET /api/tasks` with `?from=&to=` (range tests in `backend/tests/tasks.rs`). Frontend `api.tasks.range`, a local-date-safe helper `lib/date.ts` (grid builder, month nav, formatters — never via UTC), `lib/components/CalendarCell.svelte` (titles on wide screens, dots on a phone) and `lib/components/DaySheet.svelte` (the day zoom), composed into the live `views/MonthView.svelte`.
- **Day (group-by-label):** frontend-only. Pure `lib/grouping.ts` (`groupByLabel(tasks, labels) → TaskGroup[]`: labeled groups in label `sort_order`, "No label" last, input order preserved within each group) feeds a reusable `lib/components/DayAgenda.svelte` (label-chip section header, `TaskRow` list, empty state). `DaySheet` now renders `DayAgenda` (its prop changed `labelFor` → `labels`); `MonthView` passes `labels`. Grouping is client-side over the day's already-sorted tasks — no new endpoint/migration. Slice 6 (Today) will reuse `DayAgenda`.
- **Week:** frontend-only. Week helpers in `lib/date.ts` (`startOfWeek` / `buildWeekGrid` / `addWeeks` / `weekdayAbbrev` / `formatWeekRange` — all local-date-safe, never via UTC) feed a reusable `lib/components/WeekDayCell.svelte` (weekday+date header, a few task titles with label dots, "+N more") composed into the live `views/WeekView.svelte`. Mirrors `MonthView`'s data flow over `api.tasks.range` for a 7-day window; prev/next-week + "This week" nav; seven columns at `sm`+ reflow to a stacked single column on a phone; tapping a day opens the shared `DaySheet`. No new endpoint/migration.
- **Today:** frontend-only. The live `views/TodayView.svelte` loads `api.tasks.forDate(toISODate(today))` +
  labels on mount and renders the reusable `lib/components/DayAgenda.svelte` **inline** (a standing view, not a
  `DaySheet` dialog) — the same grouped-by-label layout and complete-toggle the month/week sheets use. Header is
  `formatDayFull(today)` + a task count; a calm dashed empty state ("Nothing due today.") matching `InboxView`'s
  page chrome. No new endpoint/migration — the existing `?date=` query, and `DayAgenda` reused unchanged.
- **Recurrence:** backend + frontend. Backend `services/recurrence.rs` wraps the `rrule` crate to validate and
  expand an RRULE (DTSTART anchored at UTC midnight so dates never shift — Hard Rule 7); `db/task.rs` gains
  `list_recurring_through` + `completed_occurrences` and the one-off range/date queries now exclude
  `recurrence_rule IS NOT NULL`; `task_service` expands each recurring task across the window into one `Task`
  per occurrence (`occurrence_date` set, per-occurrence `completed`), validates recurrence on create/update, and
  returns the toggled occurrence from complete/uncomplete. Wire field `occurrence_date` added to `Task`
  (derived, not a column); `recurrence_rule` added to the create/patch body. Tests: 6 recurrence unit tests +
  5 task integration tests (expansion, per-occurrence completion, weekly BYDAY, for-date, validation). Frontend
  `lib/recurrence.ts` (option⇄RRULE), `lib/components/RecurrencePicker.svelte` (in the Inbox edit panel),
  `TaskRow` repeat affordance; Month/Week/Today group by `occurrence_date` and key rows + toggles by
  `(id, occurrence_date)`, passing `occurrence_date` to the completion API. No new migration/endpoint.
- **Search:** backend + frontend. Backend `db::task::search` (a `LIKE` over `title`/`notes`, `\` as
  the escape char), `services/search_service.rs` (trims `q`, returns `[]` when blank, escapes the
  term's `%`/`_`/`\` then wraps `%term%`), `routes/search.rs` (`GET /api/search?q=`), wired in
  `routes/mod.rs` + `services/mod.rs`; tests in `backend/tests/tasks.rs` (title/notes match,
  case-insensitive, literal wildcards, date ordering, blank `q`) + a `search_service` unit test for
  the escaping. Frontend `api.search(q)` and the live `views/SearchView.svelte` (a debounced ~200ms
  box with a request token guarding out-of-order responses, a flat `TaskRow` results list keyed by
  `(id, occurrence_date)`, and prompt / searching / no-results states). No new migration.
- **Reorder:** backend + frontend. Backend `db::task::reorder` (a transactional batch UPDATE setting
  `sort_order` = position, `RowNotFound` rolls it back), `task_service::reorder` (empty list is a
  no-op; maps `RowNotFound` → 404), `routes/tasks.rs::reorder` (`PATCH /api/tasks/reorder` with
  `{ ids }`), wired in `routes/mod.rs` (static route before `/tasks/{id}`); tests in
  `backend/tests/tasks.rs` (order persists across a re-fetch; timed tasks stay time-sorted; an unknown
  id rolls the batch back). Frontend `api.tasks.reorder(ids)`, a new `leading` snippet on `TaskRow`
  (before the checkbox), and `views/InboxView.svelte` wiring `svelte-dnd-action`'s
  `dragHandleZone` + `dragHandle` (a grip handle; optimistic reorder on drop, reload on failure). No
  new migration.
- **Quick-add:** frontend-only. Pure `lib/quickadd.ts` (`parseQuickAdd(input) → { title, due_date?,
  due_time? }`: chrono-node's first match, the matched phrase + a dangling `on`/`by` stripped from the
  title, date/time formatted **local** — a time only when the hour is certain, `forwardDate` so bare
  weekdays mean the upcoming one; `describeDraft` builds the capture hint) plus `lib/date.ts`
  `fromISODate` / `formatShortDate`. `views/InboxView.svelte` parses the title box on submit, shows a
  live "Scheduling for …" hint, and keeps a now-dated task out of the Inbox list (it scheduled itself).
  Reuses `api.tasks.create`; no endpoint, no migration. (Now covered by Vitest — see slice 12.)
- **TickTick import:** backend + frontend. Backend `domain/import.rs` (`ImportSummary` /
  `ImportCreated`), `db::label::find_by_name` (case-insensitive dedupe), `services/import_service.rs`
  (header detection over the export preamble, literal date/time read with **no TZ math**, `RRULE:`
  prefix stripped + recurrence degraded-not-lost, label find-or-create with a palette color by append
  order, completion from Status/Completed Time; each row created through `task_service::create` so
  validation isn't duplicated; a titleless row is `skipped`, add-only re-run appends), thin
  `routes/import.rs` (`POST /api/import/ticktick`, raw `Bytes` body), `csv` crate added. Tests:
  `backend/tests/import.rs` (counts, skip, label-on-demand, completion, recurring expansion, re-run
  dedupe, no-header 400) + 4 `import_service` unit tests (literal dates, RRULE strip, repeat-drop,
  completion signals). Frontend `api.import.ticktick(file)` (sends the `File` as the raw body),
  `ImportSummary` type, `lib/components/ImportDialog.svelte` (file picker + friendly summary), launched
  from **Settings → Import** (see slice 12). No migration.
- **Polish:** frontend. **Dark mode** — `lib/theme.ts` (System / Light / Dark, persisted), the chrome
  tokens became CSS variables in `src/app.css` (RGB triplets → `rgb(var(--x) / <alpha-value>)` in
  `tailwind.config.js`, so `/opacity` modifiers keep working); a dark `@media` block (guarded with
  `:not([data-theme])`) plus a `:root[data-theme='dark']` override block, with a pre-paint bootstrap in
  `index.html`. Pine/pine-deep go light in the dark so `bg-pine text-surface` stays readable; labels
  unthemed; all text pairs ≥ AA. **Settings** — a header gear opens `SettingsDialog` grouping
  `ThemeToggle` (segmented control) + the Import launcher; the standalone Import button is gone.
  **Tests** — Vitest (`npm test`) over the pure helpers (`date`, `recurrence`, `grouping`, `quickadd`,
  `theme`), 32 cases. Dead `Placeholder` component removed; empty/loading/error states audited across
  all views (no gaps). No backend change.

## Roadmap complete

All build-order slices (0–12) are done. Future work starts a new slice here (keep them small and
vertical, ending green) or lands as a fix — there is no "next unchecked box" right now.

## Definition of done (every slice)

- `cargo fmt --check`, `cargo clippy -- -D warnings`, `cargo test` all green.
- `npm run check`, `npm run lint`, `npm test`, `npm run build` all green.
- Boundaries intact: handlers thin, SQL only in `db/`, frontend HTTP only via `lib/api.ts`.
- Works on a phone-width screen; mountain-forest tokens, no stray hex (label colors excepted).
- `.sqlx` regenerated if any query changed (`cargo sqlx prepare`).
- ARCHITECTURE.md, this file, and CLAUDE.md (if a folder/boundary/entity changed) updated in the same change.
