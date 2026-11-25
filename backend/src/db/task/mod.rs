// `query_as!` needs a literal, so the one task projection is spliced in by this macro.
macro_rules! select_tasks {
    ($tail:literal $(, $arg:expr)* $(,)?) => {
        sqlx::query_as!(
            crate::domain::Task,
            r#"SELECT
                id              AS "id!",
                title           AS "title!",
                notes,
                label_id,
                due_date,
                due_time,
                recurrence_rule,
                due_date        AS occurrence_date,
                sort_order      AS "sort_order!",
                EXISTS(
                    SELECT 1 FROM completion c
                    WHERE c.task_id = task.id AND c.occurrence_date IS task.due_date
                ) AS "completed!: bool"
            FROM task "# + $tail $(, $arg)*
        )
    };
}

mod batch;
mod completion;
mod occurrence;
mod read;
mod write;

pub(crate) use batch::{move_overdue_one_offs, set_due_date, set_label, set_sort_order};
pub(crate) use completion::{
    add_completion, delete_completion, is_completed, move_completion, rekey_completion,
    series_completions_between,
};
pub(crate) use occurrence::{
    delete_exceptions, exceptions_between, has_open_rollover_copy, insert_detached_copy,
    insert_exception, is_excepted, latest_settled_through,
};
pub(crate) use read::{get, list_inbox, list_one_offs_between, list_recurring_through, search};
pub(crate) use write::{delete, insert, next_sort_order, update};
