-- Links a rollover copy to its series so later rollovers reuse it instead of stacking one per day.
ALTER TABLE task ADD COLUMN detached_from INTEGER REFERENCES task(id) ON DELETE SET NULL;

CREATE INDEX idx_task_detached_from ON task (detached_from);
