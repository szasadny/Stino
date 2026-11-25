# Stinō Architecture: Backend

For: what lives where in `backend/` and what each part is for, without scanning the code.
Not here: behaviour, history and how-it-works; those live in the code and its tests.
This is §3 of [ARCHITECTURE.md](./ARCHITECTURE.md), split out so the backend map only loads when it is the task; §3.x references elsewhere resolve here.
Paths are relative to `backend/src/` unless they start with `backend/`.

---

## 3. Backend

### 3.1 Layer responsibilities

| Layer | Path | Responsibility | Must NOT |
| --- | --- | --- | --- |
| Entry | `backend/src/main.rs`, `backend/src/lib.rs` | `main` calls `run`; `run` wires tracing, `Config`, `db::connect`, `routes::router` and serves | Name `sqlx`; write SQL |
| Routes | `backend/src/routes/` | Extract input, call one service, pick the status, return JSON; `routes::router` in `mod.rs` mounts `/api`, the SPA fallback and the Host guard | Name `crate::db` or `db::`; write SQL; build an error body |
| Services | `backend/src/services/` | Business rules, validation, recurrence, import; open transactions | Name `axum` or `sqlx`; write SQL |
| DB | `backend/src/db/` | Every SQL query (compile-time-checked macros); connection setup and migrations | Use `crate::services` or `crate::routes`; name `axum` |
| Domain | `backend/src/domain/` | Plain structs and enums: API shapes, request and patch types, the palette | Use any layer but `crate::error` and `crate::config`; name `axum` or `sqlx` |
| Error | `backend/src/error.rs` | `AppError`, `ValidationError`, the one `IntoResponse` | Use `routes`, `services`, `db` or `domain` |
| Config | `backend/src/config.rs` | `Config::from_env` and the shared constants | Use `routes`, `services`, `db` or `domain`; name `axum` or `sqlx` |
| Migrations | `backend/migrations/` | Schema and data migrations, embedded by `sqlx::migrate!()` | Be edited once applied; drop data unless the owner asks |
| Tests | `backend/tests/` | `api/` integration binary, `guards/` source and docs scan | Exceed 500 lines a file; silence a lint with `#[allow(…)]` |

### 3.2 Route files

One handler file per resource plus two shared files; `mod.rs` holds `routes::router` (state: the `Pool`) and `IdList`.

| File | Serves |
| --- | --- |
| `health` | `GET /api/health` via `health_service`; container probe, not called by the SPA |
| `labels` | `/api/labels`: list, create, update, delete, reorder |
| `tasks` | `/api/tasks`: listing, create, update, delete, reorder, batch, rollover, completions, move and skip one occurrence |
| `search` | `GET /api/search` |
| `import` | `POST /api/import/ticktick` (raw CSV body, own body limit `IMPORT_MAX_BODY_BYTES`) |
| `extract` | `Json`, `Query`, `Path` extractors whose rejections become `AppError::Rejected` |
| `host_guard` | `check_host`: the `ALLOWED_HOSTS` middleware |

### 3.3 Service modules (`backend/src/services/`)

| Module | Purpose |
| --- | --- |
| `services/mod.rs` | Module list; `found` turns a missed write into `NotFound`; re-exports `Pool` |
| `task/mod.rs` | Shared task helpers: `load_task`, `series_start`, `ensure_series_member`, `or_warn` |
| `task/list.rs` | Inbox, day and range listing; merges expanded recurring occurrences; `sort_tasks` |
| `task/write.rs` | `create`, `create_on` (on a caller's connection and sort order, for import), `update`, `delete` |
| `task/validate.rs` | `validate_fields`, the one task validator |
| `task/completion.rs` | Complete or reopen one occurrence |
| `task/occurrence.rs` | Move or skip one occurrence of a series |
| `task/rollover.rs` | Overdue rollover onto the client's today |
| `task/batch.rs` | Bulk label, schedule, complete, delete; manual reorder |
| `recurrence/mod.rs` | `validate`, `expand`, `latest_through` on the `rrule` crate |
| `recurrence/normalize.rs` | `normalize` (storage form), `normalize_until` (parse form) |
| `recurrence/tests/` | Unit tests of expansion (`mod.rs`, `monthly.rs`) |
| `import/mod.rs` | `import_ticktick`: one transaction, label resolution, summary |
| `import/csv.rs` | Decoding, header-row detection, column names, `Row::get` |
| `import/row.rs` | `map_row`: one CSV row → `NewTask` + label name + done flag |
| `import/due.rs` | `parse_due`, `zone`: TickTick Due Date → local date and time |
| `label_service.rs` | Label CRUD and reorder; name, colour and emoji rules; `ensure_exists`, `clamp_name`, `find_or_create_on` |
| `search_service.rs` | Blank-term short-circuit and LIKE escaping before `db::task::search` |
| `health_service.rs` | The health payload |
| `validation.rs` | Field primitives and every date/time parse and format |

### 3.4 DB modules (`backend/src/db/`)

| Module | Holds |
| --- | --- |
| `db/mod.rs` | `connect` (pool, foreign keys, WAL, busy timeout, migrations), `ping`, the aliases `Pool`, `Conn`, `Executor` |
| `db/label.rs` | Label queries; `find_by_name` matches ASCII-case-insensitively (`COLLATE NOCASE`) |
| `db/task/mod.rs` | `select_tasks!`, the one task projection (with `completed` for `due_date`); re-exports |
| `db/task/read.rs` | `get`, `list_inbox` (open tasks only), `list_one_offs_between`, `list_recurring_through`, `search` |
| `db/task/write.rs` | `insert`, `update`, `delete`, `next_sort_order` |
| `db/task/completion.rs` | `add_completion` (idempotent, also for a NULL date), `delete_completion`, `rekey_completion`, `move_completion` (a one-off's done state follows its date), `is_completed`, `series_completions_between` |
| `db/task/occurrence.rs` | `insert_exception`, `delete_exceptions`, `is_excepted`, `exceptions_between`, `latest_settled_through`, `insert_detached_copy`, `has_open_rollover_copy` |
| `db/task/batch.rs` | `set_sort_order`, `set_label`, `set_due_date`, `move_overdue_one_offs` |

### 3.5 Domain types (`backend/src/domain/`)

| Module | Types |
| --- | --- |
| `domain/mod.rs` | `Health`; `double_option` (PATCH field: `null` clears, omitted keeps) |
| `domain/task.rs` | `Task` (API row; derived `occurrence_date`, `completed`), `Series` (`Task::series`), `NewTask`, `TaskPatch` (`apply_to`), `BatchOp`, `TaskSelector` (`from_params`), `MoveOutcome`, `RolloverSummary` |
| `domain/label.rs` | `Label`, `NewLabel`, `LabelPatch`, `LABEL_PALETTE`, `palette_color` |
| `domain/import.rs` | `ImportSummary`, `ImportCreated` |

### 3.6 Shared helpers (reuse before writing a new one)

- `services/validation.rs`: every field primitive and date/time parse or format.
- `found` (`services/mod.rs`): a `bool` from a `db/` write becomes `NotFound`.
- `load_task`, `ensure_series_member`, `or_warn` (`services/task/mod.rs`); `db::task::move_completion`.
- `label_service::ensure_exists`, `clamp_name`, `find_or_create_on`; `recurrence::normalize`, `recurrence::expand`.
- `select_tasks!` (`db/task/mod.rs`), `label_query!` (`db/label.rs`) and the `db::{Pool, Conn, Executor}` aliases.
- `Task::series`, `TaskPatch::apply_to`, `TaskSelector::from_params`, `double_option` (`domain/`).
- `Json`, `Query`, `Path` (`routes/extract.rs`); `IdList` (`routes/mod.rs`) for an `{ids}` body.

### 3.7 API contract

JSON in and out, under `/api`; errors are `{"error": msg}` (statuses in ARCHITECTURE.md §6); any other `/api/*` path is a JSON 404.
A bad date is a 400 `<field> must be a valid YYYY-MM-DD date` naming the field it came from (`due_date`, `date`, `from`, `to`, `today`, `occurrence_date`, `new_date`).

- **Task:** `{id, title, notes, label_id, due_date, due_time, recurrence_rule, occurrence_date, sort_order, completed}`; clients key rows by `(id, occurrence_date)`.
- **Label:** `{id, name, color, emoji, sort_order}`.

| Method | Path | Request | Response / status |
| --- | --- | --- | --- |
| GET | `/api/health` | none | 200 `{status: "ok", db: bool}` |
| GET | `/api/labels` | none | 200 `[Label]` by `sort_order`, then `id` |
| POST | `/api/labels` | `{name, color, emoji?}` | 201 Label; 400 per the field rules below |
| PATCH | `/api/labels/reorder` | `{ids}`: every label id exactly once | 204, positions become `sort_order`; 400 if not a permutation, nothing changes |
| PATCH | `/api/labels/{id}` | `{name?, color?, emoji?}`; `emoji: null` clears, omitted keeps | 200 Label; 404 unknown id |
| DELETE | `/api/labels/{id}` | none | 204, its tasks keep living unlabelled; 404 unknown id |
| GET | `/api/tasks`, `/api/tasks?inbox=true` | none | 200 open Inbox tasks (`due_date` NULL; completed ones excluded) by `sort_order`, `id`; `?inbox=false` is a 400 |
| GET | `/api/tasks?date=YYYY-MM-DD` | none | 200 that day's one-offs plus its expanded recurring occurrences, timed first |
| GET | `/api/tasks?from=…&to=…` | inclusive range | 200 one row per one-off and per recurring occurrence, by day then timed first; one bound alone is a 400 |
| POST | `/api/tasks` | `{title, notes?, label_id?, due_date?, due_time?, recurrence_rule?}` | 201 Task; 400 per the field rules below |
| PATCH | `/api/tasks/{id}` | any subset of the create fields; `null` clears a nullable field, omitted keeps | 200 Task; 404 unknown id |
| DELETE | `/api/tasks/{id}` | none | 204, cascades its completions and exceptions; 404 unknown id |
| PATCH | `/api/tasks/reorder` | `{ids}` | 204, positions become `sort_order` in one transaction; empty list is a no-op; unknown id 404, nothing changes |
| POST | `/api/tasks/batch` | `{ids, op}`; `op` is `{type: "label", label_id}`, `{type: "schedule", due_date}`, `{type: "complete"}` or `{type: "delete"}` | 204, one transaction; empty `ids` is a no-op; unknown id 404, nothing changes; unknown label or a recurring task in `schedule` is a 400 |
| POST | `/api/tasks/rollover` | `{today}`: the client's local date | 200 `{moved}`; a re-run the same day moves nothing |
| POST | `/api/tasks/{id}/completions?occurrence_date=…` | no body; date defaults to `due_date` | 200 Task with `completed: true` for that occurrence; idempotent; 400 unless the date is the one-off's `due_date` or a series occurrence that was not moved or skipped; 404 |
| DELETE | `/api/tasks/{id}/completions?occurrence_date=…` | as above | 200 Task with `completed: false` |
| POST | `/api/tasks/{id}/move_occurrence` | `{occurrence_date, new_date}` | 201 the new one-off; same-day target 200 the unchanged series task; 400 not recurring, not an occurrence, or already moved or skipped; 404 |
| POST | `/api/tasks/{id}/skip_occurrence` | `{occurrence_date}` | 204, idempotent; 400 not recurring, not an occurrence, or completed; 404 |
| GET | `/api/search?q=…` | none | 200 `[Task]` whose title or notes contain `q` (ASCII case-insensitive; `%` `_` `\` literal), a series as its own row, by `due_date` (nulls last) then `title`; blank `q` gives `[]` |
| POST | `/api/import/ticktick` | the raw CSV file as the body, ≤ 32 MiB | 200 `{created: {tasks, labels, completions}, skipped}`; 400 not CSV or no `Title` header row |

Selector precedence for `GET /api/tasks`: `from`+`to`, then `date`, then Inbox; an unknown query parameter is a 400.
For completions, move and skip, the series start (`due_date`) counts as an occurrence, also when the rule does not generate it.

| Field | Rule (400 otherwise) |
| --- | --- |
| `title` | Trimmed, 1–200 chars (`MAX_TITLE_LEN`) |
| `notes` | Trimmed; blank becomes null |
| `label_id` | An existing label |
| `due_date` | A real date; required by `due_time` and by `recurrence_rule` |
| `due_time` | A real `HH:MM` |
| `recurrence_rule` | A parseable RRULE, daily or less often, with an occurrence on or after `due_date`; stored without `RRULE:` |
| label `name` | Trimmed, 1–60 chars (`MAX_LABEL_NAME_LEN`), unique ASCII-case-insensitively; a label may re-case its own name |
| label `color` | One of `LABEL_PALETTE`, any case; stored uppercase |
| label `emoji` | Trimmed, ≤ 8 code points (`MAX_LABEL_EMOJI_LEN`); blank becomes null |

### 3.8 Request lifecycle

```text
Request → check_host (only with ALLOWED_HOSTS) → TraceLayer → /api router → extract (Json / Query / Path)
        → handler → one service → db (SQLx) → domain type → JSON; any AppError → IntoResponse → {"error": msg}
```

### 3.9 Tests

| Path | Holds |
| --- | --- |
| `backend/tests/api/main.rs` | The one integration-test binary; declares the modules below |
| `backend/tests/api/common/` | `app.rs` (one-connection `sqlite::memory:` pool + migrations, router, `Req` with `get`/`post`/`patch`/`delete`), `api.rs` (endpoint helpers and readers), `fixtures.rs` (named dates, `TODAY`, series bodies, palette colours), `ticktick.rs` (`TickRow`, `csv_with`, `import_csv`) |
| `backend/tests/api/` modules | `task_crud`, `task_listing`, `task_completion`, `task_recurrence`, `task_occurrences`, `task_batch`, `task_rollover`, `labels`, `search`, `import`, `errors` (malformed requests), `hosts` (allow-list), `migrations` (data migrations) |
| `backend/tests/guards/` | `main.rs` (binary), `source.rs` (Rust lexer and scan helpers), `architecture.rs` (layer, error-body, lint, length and comment guards), `docs.rs` (docs contract) |
| Unit tests | `#[cfg(test)]` beside the code: `config.rs`, `search_service.rs`, `import/row.rs`, `import/due.rs`, `recurrence/tests/` |
