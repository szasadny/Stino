//! Recurrence: parse / validate an RFC-5545 RRULE and expand it over a date
//! window. The `rrule` crate does the RFC heavy lifting — we never hand-roll a
//! date-recursion engine (External Solutions First).
//!
//! Per Hard Rule 7 occurrences are **calendar dates**, not instants: the series
//! start is anchored at UTC midnight and we only ever read each occurrence's
//! *date* back. Because nothing is converted between timezones, no occurrence can
//! be shifted to the wrong day. (The single configured `TZ` governs how a date is
//! displayed, not how the rule expands — a daily rule lands on the same calendar
//! dates everywhere.)

use chrono::{DateTime, Datelike, NaiveDate, TimeZone};
use rrule::{RRule, RRuleSet, Tz, Unvalidated};

use crate::error::{AppError, AppResult};

/// Upper bound on occurrences from one expansion. The window bounds keep real
/// counts tiny (a month grid is ≤ 42 days); this only guards a pathological rule.
const MAX_OCCURRENCES: u16 = 1000;

/// Anchor a local calendar date at UTC midnight for the rrule datetime math. We
/// read only the date component back, so UTC keeps that date stable.
fn at_midnight(date: NaiveDate) -> DateTime<Tz> {
    Tz::UTC
        .with_ymd_and_hms(date.year(), date.month(), date.day(), 0, 0, 0)
        .single()
        .expect("UTC midnight exists for every calendar date")
}

fn invalid_rule() -> AppError {
    AppError::Validation("recurrence_rule must be a valid RRULE".into())
}

/// Build the rrule set for `rule` starting at `dtstart`, mapping any parse /
/// validation failure to a UI-safe error.
fn build(rule: &str, dtstart: NaiveDate) -> AppResult<RRuleSet> {
    let parsed: RRule<Unvalidated> = rule.trim().parse().map_err(|_| invalid_rule())?;
    parsed
        .build(at_midnight(dtstart))
        .map_err(|_| invalid_rule())
}

/// Validate that `rule` is a usable RRULE for a task starting on `dtstart`.
pub fn validate(rule: &str, dtstart: NaiveDate) -> AppResult<()> {
    build(rule, dtstart).map(|_| ())
}

/// The occurrence dates of `rule` (series starting `dtstart`) that fall within
/// the inclusive window `[from, to]`, ascending. Empty if the window is inverted
/// or the series has no occurrence inside it.
pub fn expand(
    rule: &str,
    dtstart: NaiveDate,
    from: NaiveDate,
    to: NaiveDate,
) -> AppResult<Vec<NaiveDate>> {
    if to < from {
        return Ok(Vec::new());
    }
    // `after`/`before` are inclusive in the rrule crate; the explicit date filter
    // below is the exact, authoritative bound (belt and suspenders).
    let set = build(rule, dtstart)?
        .after(at_midnight(from))
        .before(at_midnight(to));
    let dates = set
        .all(MAX_OCCURRENCES)
        .dates
        .into_iter()
        .map(|dt| dt.date_naive())
        .filter(|d| *d >= from && *d <= to)
        .collect();
    Ok(dates)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn date(s: &str) -> NaiveDate {
        NaiveDate::parse_from_str(s, "%Y-%m-%d").unwrap()
    }

    #[test]
    fn daily_fills_every_day_in_window() {
        let got = expand(
            "FREQ=DAILY",
            date("2026-06-01"),
            date("2026-06-01"),
            date("2026-06-05"),
        )
        .unwrap();
        assert_eq!(
            got,
            vec![
                date("2026-06-01"),
                date("2026-06-02"),
                date("2026-06-03"),
                date("2026-06-04"),
                date("2026-06-05"),
            ]
        );
    }

    #[test]
    fn interval_skips_days_and_respects_the_start_phase() {
        // Every 2 days from Jun 1: 1,3,5,7,9 — never the even days.
        let got = expand(
            "FREQ=DAILY;INTERVAL=2",
            date("2026-06-01"),
            date("2026-06-01"),
            date("2026-06-09"),
        )
        .unwrap();
        assert_eq!(
            got,
            vec![
                date("2026-06-01"),
                date("2026-06-03"),
                date("2026-06-05"),
                date("2026-06-07"),
                date("2026-06-09"),
            ]
        );
    }

    #[test]
    fn weekly_byday_lands_on_selected_weekdays_only() {
        // Mondays and Wednesdays in the first full week of June 2026.
        // 2026-06-01 is a Monday.
        let got = expand(
            "FREQ=WEEKLY;BYDAY=MO,WE",
            date("2026-06-01"),
            date("2026-06-01"),
            date("2026-06-07"),
        )
        .unwrap();
        assert_eq!(got, vec![date("2026-06-01"), date("2026-06-03")]);
    }

    #[test]
    fn occurrences_before_the_window_are_excluded_but_a_past_series_still_lands() {
        // A daily series that started months earlier still yields the in-window days.
        let got = expand(
            "FREQ=DAILY",
            date("2026-01-01"),
            date("2026-06-10"),
            date("2026-06-12"),
        )
        .unwrap();
        assert_eq!(
            got,
            vec![date("2026-06-10"), date("2026-06-11"), date("2026-06-12")]
        );
    }

    #[test]
    fn boundary_dates_are_inclusive() {
        let got = expand(
            "FREQ=DAILY",
            date("2026-06-10"),
            date("2026-06-10"),
            date("2026-06-10"),
        )
        .unwrap();
        assert_eq!(got, vec![date("2026-06-10")]);
    }

    #[test]
    fn an_invalid_rule_is_a_validation_error() {
        assert!(validate("FREQ=NONSENSE", date("2026-06-01")).is_err());
        assert!(validate("totally not a rule", date("2026-06-01")).is_err());
    }
}
