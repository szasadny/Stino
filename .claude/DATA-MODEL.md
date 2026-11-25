# Stinō — Data Model

This is §5 of [ARCHITECTURE.md](./ARCHITECTURE.md), split out so the data model only loads when it is the task; §5.x references elsewhere resolve here.
Maintenance rule (ARCHITECTURE.md §8): every table, column, index or rule change updates this file alongside its migration or code.

For: what each table and column means, keys and indexes, how dates and recurrence are stored, the import mapping and the mirrored constants.
Not here: process and flow; those live in the code and its tests.

## 5. Data Model

### 5.1 Tables

Source of truth: `backend/migrations/`, embedded at compile time; foreign keys are enforced on every connection (`db::connect`).

**label** — a user-defined colour tag; a task has at most one.

| Column | Type | Meaning |
| --- | --- | --- |
| `id` | INTEGER PK AUTOINCREMENT | |
| `name` | TEXT NOT NULL | Display name; unique ASCII-case-insensitively by service rule, no DB constraint |
| `color` | TEXT NOT NULL | Uppercase hex from `LABEL_PALETTE` |
| `emoji` | TEXT NULL | Optional glyph, ≤ 8 code points; NULL = colour only |
| `sort_order` | INTEGER NOT NULL DEFAULT 0 | Label order; reorder writes 0-based positions, a new label appends |
| `created_at`, `updated_at` | TEXT NOT NULL DEFAULT `datetime('now')` | Bookkeeping |

**task** — one row per one-off task or per recurring series.

| Column | Type | Meaning |
| --- | --- | --- |
| `id` | INTEGER PK AUTOINCREMENT | |
| `title` | TEXT NOT NULL | Trimmed, 1–200 chars |
| `notes` | TEXT NULL | Free text; blank is stored as NULL |
| `label_id` | INTEGER NULL → `label(id)` ON DELETE SET NULL | The task's label |
| `due_date` | TEXT NULL | Local `YYYY-MM-DD`; NULL = Inbox; for a series, its start (DTSTART) |
| `due_time` | TEXT NULL | Local `HH:MM`; NULL = untimed; needs `due_date` |
| `recurrence_rule` | TEXT NULL | Bare RFC-5545 RRULE (no `RRULE:` prefix); NULL = one-off; needs `due_date` |
| `sort_order` | INTEGER NOT NULL DEFAULT 0 | Manual order of untimed tasks; one global counter, a new task appends |
| `detached_from` | INTEGER NULL → `task(id)` ON DELETE SET NULL | The series a rollover copy came from; NULL for every other task, moved occurrences included |
| `created_at`, `updated_at` | TEXT NOT NULL DEFAULT `datetime('now')` | Bookkeeping |

**completion** — one row per done occurrence.

| Column | Type | Meaning |
| --- | --- | --- |
| `id` | INTEGER PK AUTOINCREMENT | |
| `task_id` | INTEGER NOT NULL → `task(id)` ON DELETE CASCADE | The done task or series |
| `occurrence_date` | TEXT NULL | The done occurrence: a one-off's `due_date`, a series' occurrence date; NULL = a done Inbox task |
| `completed_at` | TEXT NOT NULL DEFAULT `datetime('now')` | Bookkeeping |

`UNIQUE (task_id, occurrence_date)`; SQLite treats NULLs as distinct, so `add_completion` keeps a NULL-date completion single.

**task_exception** — one row per occurrence a series hides.

| Column | Type | Meaning |
| --- | --- | --- |
| `id` | INTEGER PK AUTOINCREMENT | |
| `task_id` | INTEGER NOT NULL → `task(id)` ON DELETE CASCADE | The series |
| `occurrence_date` | TEXT NOT NULL | The hidden occurrence: moved to a one-off, skipped, or rolled over |
| `created_at` | TEXT NOT NULL DEFAULT `datetime('now')` | Bookkeeping |

`UNIQUE (task_id, occurrence_date)`.

**imported_history_rule** — backup written by migration 0005, never read by the app.

| Column | Type | Meaning |
| --- | --- | --- |
| `task_id` | INTEGER PK → `task(id)` ON DELETE CASCADE | An imported TickTick history row that 0005 turned into a completed one-off |
| `recurrence_rule` | TEXT NOT NULL | The rule 0005 removed from that row, kept so the change is reversible |

**Indexes** (besides the PKs and the two UNIQUE constraints):

| Index | On |
| --- | --- |
| `idx_task_due_date` | `task(due_date)` |
| `idx_task_label_id` | `task(label_id)` |
| `idx_task_detached_from` | `task(detached_from)` |
| `idx_completion_task` | `completion(task_id)` |
| `idx_task_exception_task` | `task_exception(task_id)` |

**Migrations** (data migrations are pinned by `backend/tests/api/migrations.rs`):

| File | Adds |
| --- | --- |
| `0001_init.sql` | `label`, `task`, `completion` and their indexes |
| `0002_label_emoji.sql` | `label.emoji` |
| `0003_task_exception.sql` | `task_exception` |
| `0004_task_detached_from.sql` | `task.detached_from` and its index |
| `0005_imported_history_one_offs.sql` | Data: a series dated before its creation day whose only completion is at `due_date` (a TickTick history row) becomes a completed one-off; rule backed up in `imported_history_rule` |
| `0006_link_legacy_rollover_copies.sql` | Data: open one-offs without `detached_from` that match a series with exceptions on title, notes, label and time get linked to it |

### 5.2 Dates and times

| Rule | Fact |
| --- | --- |
| Storage | `due_date` (`YYYY-MM-DD`) and `due_time` (`HH:MM`) are local calendar and wall-clock text, never converted through UTC (Hard Rule 7); formats `DATE_FORMAT`, `TIME_FORMAT` in `backend/src/config.rs` |
| Today | The backend never computes today and has no timezone config; the client sends its local date (`POST /api/tasks/rollover`) |
| Canonical form | Input is trimmed and re-formatted (`canonical_date`, `canonical_time`); a bad value is a 400 naming its field |
| Recurrence anchoring | Expansion anchors DTSTART at UTC midnight and reads back only the date, so no timezone can shift an occurrence (`backend/src/services/recurrence/mod.rs`) |
| Import | TickTick Due Dates are UTC instants converted into the row's `Timezone` before the date is read; floating rows and unknown zones are read literally |
| Bookkeeping | `created_at`, `updated_at`, `completed_at` are SQLite `datetime('now')` UTC text and are not in the API |

### 5.3 Recurrence data rules

| Rule | Fact |
| --- | --- |
| One row per series | A recurring task is one `task` row with a `recurrence_rule`; occurrences are never stored as rows |
| Occurrence key | API rows carry a derived `occurrence_date` (not a column): `due_date` for a one-off, the expanded date for a series occurrence |
| Done per occurrence | Completing writes one `completion` row for `(task_id, occurrence_date)` and never mutates the task |
| Hidden occurrences | Moving or skipping one occurrence, and rolling a missed one over, write a `task_exception`; expansion skips those dates |
| Moved occurrence | A move also inserts a one-off copy on the target day and re-keys a completion of the source occurrence to it |
| Settled mark | For rollover, a series' latest completion or exception date settles every occurrence up to that date |
| Rollover copy | One open copy per behind series, linked by `detached_from` and reused on later days |
| Rule removed | Turning a series' rule off deletes its exceptions; its completions stay |
| One-off re-dated | Its completion moves to the new date (PATCH and batch `schedule`) |
| Manual order | `sort_order` is one global counter per task, so reordering a day that holds an untimed recurring occurrence moves that series on every day it appears |
| Unexpandable stored rule | Skipped with a warning in listings; search still returns the task |

### 5.4 RRULE ⇄ UI options

The backend accepts any RRULE that repeats daily or less often and yields an occurrence; the picker models these shapes.

| UI option | RRULE |
| --- | --- |
| Daily | `FREQ=DAILY` |
| Weekly on picked weekdays | `FREQ=WEEKLY;BYDAY=MO,WE` |
| Monthly on day n (−1 = last day) | `FREQ=MONTHLY;BYMONTHDAY=n` |
| Monthly on the Nth weekday (−1 = last) | `FREQ=MONTHLY;BYDAY=MO;BYSETPOS=n` |
| Monthly on the first / last workday | `FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=1` / `-1` |
| Yearly on the start date | `FREQ=YEARLY` |
| Every N days | `FREQ=DAILY;INTERVAL=n` |
| Every N weeks, optionally on picked weekdays | `FREQ=WEEKLY;INTERVAL=n` + optional `;BYDAY=…` |
| Every N months, any monthly shape above | `FREQ=MONTHLY;INTERVAL=n;…` |
| Ends on a date | `;UNTIL=…` on any shape |

- A month without the chosen day (a 31st, a fifth Monday) has no occurrence.
- Any other shape, including one with `COUNT`, is shown read-only by the picker.

### 5.5 TickTick import mapping

Columns are read by header name, case-insensitively; the header is the first row with a `Title` column.

| TickTick column | Stinō | Rule |
| --- | --- | --- |
| Title | `task.title` | Over 200 chars: clamped, full title prepended to the notes; missing: row skipped |
| Content | `task.notes` | |
| Tags | label | First tag |
| List Name | label | Used when there is no tag, unless it is `Inbox` |
| Due Date, Is All Day, Timezone, Is Floating | `task.due_date`, `task.due_time` | §5.2 Import; all-day drops the time; an unparseable date leaves the task in the Inbox |
| Repeat | `task.recurrence_rule` | `RRULE:` stripped; dropped on a done row, without a due date, or when it fails validation |
| Status (`1` completed, `2` archived), Completed Time | a `completion` row | At the task's `due_date` (NULL in the Inbox) |
| Reminder, Priority, Start Date, Order, other columns | — | Ignored |

| Rule | Fact |
| --- | --- |
| Labels | Created on demand, matched by name case-insensitively, name clamped to 60 chars; colour `palette_color` at the append position |
| Atomicity | One transaction: a row that fails validation counts as `skipped`; a database error rolls the whole file back |
| Re-import | Add-only: tasks are appended again (the export has no stable id), labels are reused |

### 5.6 Mirrored constants and types

No codegen spans the language boundary; each pair is changed together.

| Value | Backend or HTML home | Frontend home | Drift guard |
| --- | --- | --- | --- |
| Label palette (8 hexes) | `LABEL_PALETTE` in `backend/src/domain/label.rs` | `LABEL_PALETTE` in `frontend/src/lib/palette.ts` | `architecture.test.ts`: 'mirrors the constants shared with the backend and index.html' |
| Title, label-name and emoji caps | `MAX_TITLE_LEN`, `MAX_LABEL_NAME_LEN`, `MAX_LABEL_EMOJI_LEN` in `backend/src/config.rs` | `TITLE_MAX_LENGTH`, `LABEL_NAME_MAX_LENGTH`, `LABEL_EMOJI_MAX_LENGTH` in `frontend/src/lib/constants.ts` | same guard |
| Theme storage key | `localStorage.getItem` in the bootstrap script of `frontend/index.html` | `THEME_STORAGE_KEY` in `frontend/src/lib/constants.ts` | same guard |
| Browser theme colour per scheme | The `theme-color` metas in `frontend/index.html` | `--fog` (light, dark) in `frontend/src/app.css` | same guard |
| Date and time text formats | `DATE_FORMAT`, `TIME_FORMAT` in `backend/src/config.rs` | `toISODate`, `toLocalTime` in `frontend/src/lib/date.ts` | none (review) |
| API shapes | `Task`, `Label`, `RolloverSummary`, `ImportSummary` in `backend/src/domain/` | `frontend/src/lib/types.ts` | none (review) |
| Day order (timed by `due_time`, then `sort_order`, then `id`) | `sort_tasks` in `backend/src/services/task/list.rs` | `sortForView` in `frontend/src/lib/tasks/sort.ts` | none (review) |
| A new label's colour (palette at its append position) | `palette_color` in `backend/src/domain/label.rs` | `nextPaletteColor` in `frontend/src/lib/labels.ts` | none (review) |
