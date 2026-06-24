-- Stinō initial schema.
-- Dates/times are stored as local-timezone text (no UTC conversion):
--   due_date  = 'YYYY-MM-DD'  (NULL => task lives in the Inbox / unscheduled)
--   due_time  = 'HH:MM'       (NULL => untimed / all-day)

CREATE TABLE label (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT    NOT NULL,
    color      TEXT    NOT NULL,            -- hex from the fixed nature-derived palette
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE task (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    title           TEXT    NOT NULL,
    notes           TEXT,
    label_id        INTEGER REFERENCES label(id) ON DELETE SET NULL,
    due_date        TEXT,                   -- NULL => Inbox
    due_time        TEXT,                   -- NULL => untimed
    recurrence_rule TEXT,                   -- RFC-5545 RRULE; NULL => one-off
    sort_order      INTEGER NOT NULL DEFAULT 0,
    created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_task_due_date ON task (due_date);
CREATE INDEX idx_task_label_id ON task (label_id);

-- One row per completed occurrence. A one-off task is done when a row exists
-- with occurrence_date = its due_date; a recurring task is done for a specific
-- date only, so completing one instance never completes the rest.
CREATE TABLE completion (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id         INTEGER NOT NULL REFERENCES task(id) ON DELETE CASCADE,
    occurrence_date TEXT,
    completed_at    TEXT    NOT NULL DEFAULT (datetime('now')),
    UNIQUE (task_id, occurrence_date)
);

CREATE INDEX idx_completion_task ON completion (task_id);
