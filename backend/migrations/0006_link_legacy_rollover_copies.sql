-- Rollover copies made before 0004 carry no series link, so rollover would stack a new copy
-- beside them. Adopt each open one, matched on the fields a copy inherits from its series.
UPDATE task
SET detached_from = (
    SELECT s.id FROM task s
    WHERE s.recurrence_rule IS NOT NULL
      AND s.title = task.title
      AND s.notes IS task.notes
      AND s.label_id IS task.label_id
      AND s.due_time IS task.due_time
      AND EXISTS (SELECT 1 FROM task_exception e WHERE e.task_id = s.id)
    ORDER BY s.id
    LIMIT 1
)
WHERE detached_from IS NULL
  AND recurrence_rule IS NULL
  AND due_date IS NOT NULL
  AND NOT EXISTS (
      SELECT 1 FROM completion c WHERE c.task_id = task.id AND c.occurrence_date IS task.due_date
  );
