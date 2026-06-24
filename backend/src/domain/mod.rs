//! Plain data shapes (structs + enums). Depends on nothing else in the crate —
//! no `axum`, `services`, or `db`.

mod label;

pub use label::{Label, LABEL_PALETTE};
