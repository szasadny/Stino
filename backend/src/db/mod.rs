//! Repository layer: every SQL query lives here (compile-time-checked via SQLx).
//! No business rules — callers in `services/` decide what the queries mean.

pub mod label;
