// cfg(test) lets clippy's allow-expect-in-tests reach the shared helpers, not only #[test] fns.
#[cfg(test)]
mod common;

mod errors;
mod hosts;
mod import;
mod labels;
mod migrations;
mod search;
mod task_batch;
mod task_completion;
mod task_crud;
mod task_listing;
mod task_occurrences;
mod task_recurrence;
mod task_rollover;
