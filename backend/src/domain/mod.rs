mod import;
mod label;
mod task;

use serde::{Deserialize, Deserializer, Serialize};

pub use import::ImportSummary;
pub use label::LABEL_PALETTE;
pub(crate) use label::{palette_color, Label, LabelPatch, NewLabel};
pub(crate) use task::{
    BatchOp, MoveOutcome, NewTask, RolloverSummary, Series, Task, TaskPatch, TaskSelector,
};

#[derive(Debug, Serialize)]
pub(crate) struct Health {
    pub status: &'static str,
    pub db: bool,
}

// Present `null` ⇒ `Some(None)` (clear); with `#[serde(default)]` an omitted field stays `None`.
fn double_option<'de, T, D>(deserializer: D) -> Result<Option<Option<T>>, D::Error>
where
    T: Deserialize<'de>,
    D: Deserializer<'de>,
{
    Option::<T>::deserialize(deserializer).map(Some)
}
