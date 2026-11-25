mod csv;
mod due;
mod row;

use std::collections::HashMap;

use self::row::{map_row, RowDraft};
use super::label_service::{self, Resolved};
use super::{task, Pool};
use crate::db::{self, Conn};
use crate::domain::ImportSummary;
use crate::error::{AppError, AppResult};

// One transaction: a bad row is skipped, a database error rolls the whole file back.
pub async fn import_ticktick(pool: &Pool, csv_bytes: &[u8]) -> AppResult<ImportSummary> {
    let sheet = csv::parse(&csv::decode(csv_bytes))?;
    let mut tx = pool.begin().await?;
    let mut import = Import {
        next_sort_order: db::task::next_sort_order(&mut *tx).await?,
        ..Import::default()
    };
    for row in sheet.rows() {
        match map_row(row) {
            Some(draft) => import.persist(&mut tx, draft).await?,
            None => import.summary.skipped += 1,
        }
    }
    tx.commit().await?;
    Ok(import.summary)
}

#[derive(Default)]
struct Import {
    summary: ImportSummary,
    // Lowercased name → id, so a file reuses its own labels case-insensitively.
    labels: HashMap<String, i64>,
    // Read once: asking the table per row would rescan it for every imported task.
    next_sort_order: i64,
}

impl Import {
    async fn persist(&mut self, conn: &mut Conn, draft: RowDraft) -> AppResult<()> {
        let mut new_task = draft.task;
        if let Some(name) = draft.label {
            new_task.label_id = Some(self.resolve_label(conn, &name).await?);
        }
        match task::create_on(conn, new_task, self.next_sort_order).await {
            Ok(created) => {
                self.next_sort_order += 1;
                self.summary.created.tasks += 1;
                if draft.completed {
                    db::task::add_completion(&mut *conn, created.id, created.due_date.as_deref())
                        .await?;
                    self.summary.created.completions += 1;
                }
                Ok(())
            }
            Err(AppError::Validation(_)) => {
                self.summary.skipped += 1;
                Ok(())
            }
            Err(e) => Err(e),
        }
    }

    async fn resolve_label(&mut self, conn: &mut Conn, raw: &str) -> AppResult<i64> {
        let name = label_service::clamp_name(raw);
        let key = name.to_ascii_lowercase();
        if let Some(id) = self.labels.get(&key) {
            return Ok(*id);
        }
        let id = match label_service::find_or_create_on(conn, &name).await? {
            Resolved::Existing(id) => id,
            Resolved::Created(id) => {
                self.summary.created.labels += 1;
                id
            }
        };
        self.labels.insert(key, id);
        Ok(id)
    }
}
