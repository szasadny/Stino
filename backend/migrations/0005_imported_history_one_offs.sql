-- Earlier imports kept the repeat rule on TickTick's completed history rows, turning each
-- ticked-off instance into a live series. Make them completed one-offs; the rule is kept here.
CREATE TABLE imported_history_rule (
    task_id         INTEGER PRIMARY KEY REFERENCES task(id) ON DELETE CASCADE,
    recurrence_rule TEXT    NOT NULL
);

INSERT INTO imported_history_rule (task_id, recurrence_rule)
SELECT t.id, t.recurrence_rule
FROM task t
WHERE t.recurrence_rule IS NOT NULL
  AND t.due_date < date(t.created_at)
  AND EXISTS (
      SELECT 1 FROM completion c WHERE c.task_id = t.id AND c.occurrence_date = t.due_date
  )
  AND NOT EXISTS (
      SELECT 1 FROM completion c WHERE c.task_id = t.id AND c.occurrence_date <> t.due_date
  );

UPDATE task
SET recurrence_rule = NULL, updated_at = datetime('now')
WHERE id IN (SELECT task_id FROM imported_history_rule);
