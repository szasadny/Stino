//! Plain data shapes (structs + enums). Depends on nothing else in the crate —
//! no `axum`, `services`, or `db`.

mod import;
mod label;
mod task;

pub use import::{ImportCreated, ImportSummary};
pub use label::{Label, LABEL_PALETTE};
pub use task::{NewTask, Task, TaskPatch};
