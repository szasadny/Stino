-- A detached occurrence of a recurring task. When the user drags ONE instance of a
-- repeating task to a different day, that instance becomes its own one-off task and
-- the series must skip the original date while continuing to repeat everywhere else.
-- One row per skipped (task_id, occurrence_date) — the same per-occurrence keying as
-- `completion`. Expansion (services/task_service::append_recurring) filters these out.
CREATE TABLE task_exception (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id         INTEGER NOT NULL REFERENCES task(id) ON DELETE CASCADE,
    occurrence_date TEXT    NOT NULL,          -- 'YYYY-MM-DD' of the skipped instance
    created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
    UNIQUE (task_id, occurrence_date)
);

CREATE INDEX idx_task_exception_task ON task_exception (task_id);
