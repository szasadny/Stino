use chrono::{NaiveDate, TimeDelta};
use serde_json::{json, Value};
use stino_backend::LABEL_PALETTE;

pub const PINE: &str = LABEL_PALETTE[0];
pub const MOSS: &str = LABEL_PALETTE[1];
pub const FERN: &str = LABEL_PALETTE[2];

pub const THU_JAN_1: &str = "2026-01-01";
pub const SUN_MAY_31: &str = "2026-05-31";
pub const MON_JUN_1: &str = "2026-06-01";
pub const WED_JUN_3: &str = "2026-06-03";
pub const SUN_JUN_7: &str = "2026-06-07";
pub const MON_JUN_8: &str = "2026-06-08";
pub const MON_JUN_15: &str = "2026-06-15";
pub const IMPOSSIBLE_DATE: &str = "2026-13-40";

pub const TODAY: &str = "2026-07-07";

pub const FIRST_MONDAY_MONTHLY: &str = "FREQ=MONTHLY;BYDAY=MO;BYSETPOS=1";

pub fn from_today(offset_days: i64) -> String {
    let today: NaiveDate = TODAY.parse().expect("TODAY is an ISO date");
    (today + TimeDelta::days(offset_days)).to_string()
}

pub fn weekly_monday_series() -> Value {
    json!({"title": "Standup", "due_date": MON_JUN_1, "recurrence_rule": "FREQ=WEEKLY;BYDAY=MO"})
}

pub fn daily_series() -> Value {
    json!({"title": "Water plants", "due_date": MON_JUN_1, "recurrence_rule": "FREQ=DAILY"})
}
