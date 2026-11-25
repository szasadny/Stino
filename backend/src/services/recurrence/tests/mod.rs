use chrono::NaiveDate;

mod monthly;

use super::*;
use crate::services::validation::{format_date, parse_date_lenient};

fn date(s: &str) -> NaiveDate {
    parse_date_lenient(s).expect("valid test date")
}

fn days(rule: &str, start: &str, from: &str, to: &str) -> Vec<String> {
    expand(rule, date(start), date(from), date(to))
        .expect("rule expands")
        .into_iter()
        .map(format_date)
        .collect()
}

#[test]
fn normalize_strips_the_rrule_prefix_any_case() {
    assert_eq!(normalize("RRULE:FREQ=DAILY"), "FREQ=DAILY");
    assert_eq!(normalize(" rrule:FREQ=WEEKLY "), "FREQ=WEEKLY");
    assert_eq!(normalize("FREQ=DAILY"), "FREQ=DAILY");
}

#[test]
fn daily_fills_every_day_in_window() {
    assert_eq!(
        days("FREQ=DAILY", "2026-06-01", "2026-06-01", "2026-06-05"),
        [
            "2026-06-01",
            "2026-06-02",
            "2026-06-03",
            "2026-06-04",
            "2026-06-05"
        ]
    );
}

#[test]
fn interval_skips_days_and_respects_the_start_phase() {
    assert_eq!(
        days(
            "FREQ=DAILY;INTERVAL=2",
            "2026-06-01",
            "2026-06-01",
            "2026-06-09"
        ),
        [
            "2026-06-01",
            "2026-06-03",
            "2026-06-05",
            "2026-06-07",
            "2026-06-09"
        ]
    );
}

#[test]
fn weekly_byday_lands_on_selected_weekdays_only() {
    assert_eq!(
        days(
            "FREQ=WEEKLY;BYDAY=MO,WE",
            "2026-06-01",
            "2026-06-01",
            "2026-06-07"
        ),
        ["2026-06-01", "2026-06-03"]
    );
}

#[test]
fn interval_weekly_byday_is_anchored_at_the_start_week() {
    // The start week yields only Wed: its Monday precedes DTSTART.
    let rule = "FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE";
    assert_eq!(
        days(rule, "2026-06-03", "2026-06-01", "2026-07-01"),
        [
            "2026-06-03",
            "2026-06-15",
            "2026-06-17",
            "2026-06-29",
            "2026-07-01"
        ]
    );
    assert_eq!(
        days(rule, "2026-06-03", "2026-06-08", "2026-06-21"),
        ["2026-06-15", "2026-06-17"]
    );
}

#[test]
fn occurrences_before_the_window_are_excluded_but_a_past_series_still_lands() {
    assert_eq!(
        days("FREQ=DAILY", "2026-01-01", "2026-06-10", "2026-06-12"),
        ["2026-06-10", "2026-06-11", "2026-06-12"]
    );
}

#[test]
fn boundary_dates_are_inclusive() {
    assert_eq!(
        days("FREQ=DAILY", "2026-06-10", "2026-06-10", "2026-06-10"),
        ["2026-06-10"]
    );
}

#[test]
fn an_invalid_rule_is_a_validation_error() {
    assert!(validate("FREQ=NONSENSE", date("2026-06-01")).is_err());
    assert!(validate("totally not a rule", date("2026-06-01")).is_err());
}

#[test]
fn a_rule_with_no_occurrence_is_rejected() {
    // Every 4th year from 2025 skips every leap year, so Feb 29 never comes.
    let never = "FREQ=YEARLY;INTERVAL=4;BYMONTH=2;BYMONTHDAY=29";
    assert!(validate(never, date("2025-01-01")).is_err());
    assert!(validate(never, date("2024-01-01")).is_ok());
}

#[test]
fn sub_daily_frequencies_are_rejected() {
    for rule in ["FREQ=HOURLY", "FREQ=MINUTELY", "FREQ=SECONDLY"] {
        assert!(validate(rule, date("2026-06-01")).is_err(), "{rule}");
        assert!(
            expand(
                rule,
                date("2026-06-01"),
                date("2026-06-01"),
                date("2026-06-02")
            )
            .is_err(),
            "{rule} must not expand either"
        );
    }
}

#[test]
fn until_end_date_is_honored_and_inclusive() {
    assert_eq!(
        days(
            "FREQ=DAILY;UNTIL=20260603;INTERVAL=1",
            "2026-06-01",
            "2026-06-01",
            "2026-06-30"
        ),
        ["2026-06-01", "2026-06-02", "2026-06-03"]
    );
}

#[test]
fn a_series_that_ended_before_the_window_validates_but_yields_nothing() {
    let rule = "FREQ=WEEKLY;WKST=MO;UNTIL=20240623;INTERVAL=1;BYDAY=MO";
    assert!(validate(rule, date("2024-01-01")).is_ok());
    assert!(days(rule, "2024-01-01", "2026-06-01", "2026-06-30").is_empty());
}

#[test]
fn yearly_repeats_on_the_start_date_each_year() {
    assert_eq!(
        days("FREQ=YEARLY", "2026-06-24", "2026-01-01", "2028-12-31"),
        ["2026-06-24", "2027-06-24", "2028-06-24"]
    );
}

#[test]
fn weekly_first_and_last_day_of_week() {
    assert_eq!(
        days(
            "FREQ=WEEKLY;BYDAY=MO",
            "2026-06-01",
            "2026-06-01",
            "2026-06-07"
        ),
        ["2026-06-01"]
    );
    assert_eq!(
        days(
            "FREQ=WEEKLY;BYDAY=SU",
            "2026-06-01",
            "2026-06-01",
            "2026-06-07"
        ),
        ["2026-06-07"]
    );
}
