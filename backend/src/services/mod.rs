//! Business logic: validation, recurrence expansion, import mapping, etc.
//! Calls the `db` layer; never imports `axum` types or writes raw SQL.

pub mod label_service;
