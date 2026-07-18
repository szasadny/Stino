//! Plain data shapes (structs and enums), independent of HTTP and persistence.

mod import;
mod label;
mod task;

pub use import::{ImportCreated, ImportSummary};
pub use label::{Label, LABEL_PALETTE};
pub use task::{BatchOp, NewTask, RolloverSummary, Task, TaskPatch};
