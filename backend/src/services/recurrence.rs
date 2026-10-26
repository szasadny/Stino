//! Occurrences are anchored at UTC midnight and only their date is read back, so
//! timezone conversion can never shift an occurrence to another day.

use chrono::{DateTime, Datelike, NaiveDate, TimeZone};
use rrule::{Frequency, RRule, RRuleSet, Tz, Unvalidated};

use crate::error::{AppError, AppResult};

/// Guards a pathological rule; real windows are ≤ 42 days.
const MAX_OCCURRENCES: u16 = 1000;

fn at_midnight(date: NaiveDate) -> DateTime<Tz> {
    Tz::UTC
        .with_ymd_and_hms(date.year(), date.month(), date.day(), 0, 0, 0)
        .single()
        .expect("UTC midnight exists for every calendar date")
}

fn invalid_rule() -> AppError {
    AppError::Validation("recurrence_rule must be a valid RRULE".into())
}

/// TickTick and hand-written API calls may send a leading `RRULE:`; we store the bare rule.
pub fn normalize(raw: &str) -> String {
    let trimmed = raw.trim();
    let body = match trimmed.get(0..6) {
        Some(prefix) if prefix.eq_ignore_ascii_case("RRULE:") => &trimmed[6..],
        _ => trimmed,
    };
    body.trim().to_string()
}

/// The one gate every stored rule passes through. Sub-daily frequencies are rejected:
/// occurrences are whole dates, so they'd emit the same date many times.
fn build(rule: &str, dtstart: NaiveDate) -> AppResult<RRuleSet> {
    let normalized = normalize_until(rule.trim());
    let parsed: RRule<Unvalidated> = normalized.parse().map_err(|_| invalid_rule())?;
    let set = parsed
        .build(at_midnight(dtstart))
        .map_err(|_| invalid_rule())?;
    if set.get_rrule().iter().any(|r| {
        matches!(
            r.get_freq(),
            Frequency::Hourly | Frequency::Minutely | Frequency::Secondly
        )
    }) {
        return Err(AppError::Validation(
            "recurrence_rule must repeat daily or less often".into(),
        ));
    }
    Ok(set)
}

/// TickTick writes a date-only `UNTIL`, but `rrule` rejects an UNTIL whose type differs
/// from DTSTART's (a UTC DATE-TIME). Promote it to UTC midnight; it stays inclusive.
fn normalize_until(rule: &str) -> String {
    rule.split(';')
        .map(|part| match part.split_once('=') {
            Some((key, value)) if key.eq_ignore_ascii_case("UNTIL") => {
                format!("{key}={}", normalize_until_value(value.trim()))
            }
            _ => part.to_string(),
        })
        .collect::<Vec<_>>()
        .join(";")
}

fn normalize_until_value(value: &str) -> String {
    if value.len() == 8 && value.bytes().all(|b| b.is_ascii_digit()) {
        format!("{value}T000000Z")
    } else if value.contains('T') && !value.ends_with('Z') {
        // `rrule` requires UNTIL in UTC.
        format!("{value}Z")
    } else {
        value.to_string()
    }
}

pub fn validate(rule: &str, dtstart: NaiveDate) -> AppResult<()> {
    // `all` caps the crate's search loop, so a never-matching rule (Feb 30) ends empty, not spins.
    if build(rule, dtstart)?.all(1).dates.is_empty() {
        return Err(AppError::Validation(
            "recurrence_rule never produces an occurrence".into(),
        ));
    }
    Ok(())
}

/// Inclusive window, ascending; empty if inverted.
pub fn expand(
    rule: &str,
    dtstart: NaiveDate,
    from: NaiveDate,
    to: NaiveDate,
) -> AppResult<Vec<NaiveDate>> {
    if to < from {
        return Ok(Vec::new());
    }
    let set = build(rule, dtstart)?
        .after(at_midnight(from))
        .before(at_midnight(to));
    let result = set.all(MAX_OCCURRENCES);
    // Refuse rather than silently truncate the calendar.
    if result.limited {
        return Err(AppError::Validation(
            "recurrence_rule produces too many occurrences".into(),
        ));
    }
    let mut dates: Vec<NaiveDate> = result
        .dates
        .into_iter()
        .map(|dt| dt.date_naive())
        .filter(|d| *d >= from && *d <= to)
        .collect();
    // Collapse distinct datetimes that map to the same calendar date.
    dates.dedup();
    Ok(dates)
}

pub fn latest_through(
    rule: &str,
    dtstart: NaiveDate,
    to: NaiveDate,
) -> AppResult<Option<NaiveDate>> {
    Ok(build(rule, dtstart)?
        .into_iter()
        .map(|dt| dt.date_naive())
        .take_while(|d| *d <= to)
        .last())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_strips_the_rrule_prefix_any_case() {
        assert_eq!(normalize("RRULE:FREQ=DAILY"), "FREQ=DAILY");
        assert_eq!(normalize(" rrule:FREQ=WEEKLY "), "FREQ=WEEKLY");
        assert_eq!(normalize("FREQ=DAILY"), "FREQ=DAILY");
    }

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
    fn interval_weekly_byday_is_anchored_at_the_start_week() {
        // Start week yields only Wed (Mon precedes DTSTART); off weeks are skipped, and a
        // window opening in an off week keeps the phase.
        let rule = "FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE";
        let got = expand(
            rule,
            date("2026-06-03"),
            date("2026-06-01"),
            date("2026-07-01"),
        )
        .unwrap();
        assert_eq!(
            got,
            vec![
                date("2026-06-03"),
                date("2026-06-15"),
                date("2026-06-17"),
                date("2026-06-29"),
                date("2026-07-01"),
            ]
        );
        let later = expand(
            rule,
            date("2026-06-03"),
            date("2026-06-08"),
            date("2026-06-21"),
        )
        .unwrap();
        assert_eq!(later, vec![date("2026-06-15"), date("2026-06-17")]);
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
        // TickTick's bare `UNTIL=YYYYMMDD`; the UNTIL date itself is included.
        let got = expand(
            "FREQ=DAILY;UNTIL=20260603;INTERVAL=1",
            date("2026-06-01"),
            date("2026-06-01"),
            date("2026-06-30"),
        )
        .unwrap();
        assert_eq!(
            got,
            vec![date("2026-06-01"), date("2026-06-02"), date("2026-06-03")]
        );
    }

    #[test]
    fn a_series_that_ended_before_the_window_validates_but_yields_nothing() {
        // A past "repeat until" must still validate (so it imports) yet yield nothing.
        let rule = "FREQ=WEEKLY;WKST=MO;UNTIL=20240623;INTERVAL=1;BYDAY=MO";
        assert!(validate(rule, date("2024-01-01")).is_ok());
        let got = expand(
            rule,
            date("2024-01-01"),
            date("2026-06-01"),
            date("2026-06-30"),
        )
        .unwrap();
        assert!(got.is_empty());
    }

    #[test]
    fn monthly_byday_bysetpos_first_monday_crosses_months() {
        // The first Monday of each month, Jan–Mar 2026 (Jan 1 is a Thursday).
        let got = expand(
            "FREQ=MONTHLY;BYDAY=MO;BYSETPOS=1",
            date("2026-01-01"),
            date("2026-01-01"),
            date("2026-03-31"),
        )
        .unwrap();
        assert_eq!(
            got,
            vec![date("2026-01-05"), date("2026-02-02"), date("2026-03-02")]
        );
    }

    #[test]
    fn monthly_last_friday() {
        // The last Friday of Jan and Feb 2026.
        let got = expand(
            "FREQ=MONTHLY;BYDAY=FR;BYSETPOS=-1",
            date("2026-01-01"),
            date("2026-01-01"),
            date("2026-02-28"),
        )
        .unwrap();
        assert_eq!(got, vec![date("2026-01-30"), date("2026-02-27")]);
    }

    #[test]
    fn monthly_bymonthday_fixed() {
        let got = expand(
            "FREQ=MONTHLY;BYMONTHDAY=15",
            date("2026-01-01"),
            date("2026-01-01"),
            date("2026-02-28"),
        )
        .unwrap();
        assert_eq!(got, vec![date("2026-01-15"), date("2026-02-15")]);
    }

    #[test]
    fn monthly_bymonthday_last_day_handles_short_months() {
        // -1 = the actual last day, so it tracks 31/28/31 across months.
        let got = expand(
            "FREQ=MONTHLY;BYMONTHDAY=-1",
            date("2026-01-01"),
            date("2026-01-01"),
            date("2026-03-31"),
        )
        .unwrap();
        assert_eq!(
            got,
            vec![date("2026-01-31"), date("2026-02-28"), date("2026-03-31")]
        );
    }

    #[test]
    fn monthly_bymonthday_31_skips_months_without_it() {
        // Only Jan and Mar have a 31st in this window; Feb and Apr are skipped.
        let got = expand(
            "FREQ=MONTHLY;BYMONTHDAY=31",
            date("2026-01-01"),
            date("2026-01-01"),
            date("2026-04-30"),
        )
        .unwrap();
        assert_eq!(got, vec![date("2026-01-31"), date("2026-03-31")]);
    }

    #[test]
    fn interval_monthly_bymonthday_is_anchored_at_the_start_month() {
        // Every 3 months on the 15th from Feb: the phase follows DTSTART's month.
        let got = expand(
            "FREQ=MONTHLY;INTERVAL=3;BYMONTHDAY=15",
            date("2026-02-10"),
            date("2026-01-01"),
            date("2026-12-31"),
        )
        .unwrap();
        assert_eq!(
            got,
            vec![
                date("2026-02-15"),
                date("2026-05-15"),
                date("2026-08-15"),
                date("2026-11-15"),
            ]
        );
    }

    #[test]
    fn interval_monthly_phase_holds_for_a_window_after_the_start() {
        // Odd months only; a window opening in an off month (Apr) still lands on May and Jul.
        let got = expand(
            "FREQ=MONTHLY;INTERVAL=2;BYMONTHDAY=15",
            date("2026-01-15"),
            date("2026-04-01"),
            date("2026-07-31"),
        )
        .unwrap();
        assert_eq!(got, vec![date("2026-05-15"), date("2026-07-15")]);
    }

    #[test]
    fn interval_monthly_last_workday() {
        // Jan 31 is a Saturday ⇒ Fri Jan 30; May 31 is a Sunday ⇒ Fri May 29.
        let got = expand(
            "FREQ=MONTHLY;INTERVAL=2;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-1",
            date("2026-01-01"),
            date("2026-01-01"),
            date("2026-06-30"),
        )
        .unwrap();
        assert_eq!(
            got,
            vec![date("2026-01-30"), date("2026-03-31"), date("2026-05-29")]
        );
    }

    #[test]
    fn interval_monthly_bymonthday_31_skips_its_months_without_it() {
        // Sep and Nov have no 31st and are skipped, not moved to the 30th.
        let got = expand(
            "FREQ=MONTHLY;INTERVAL=2;BYMONTHDAY=31",
            date("2026-01-31"),
            date("2026-01-01"),
            date("2026-12-31"),
        )
        .unwrap();
        assert_eq!(
            got,
            vec![
                date("2026-01-31"),
                date("2026-03-31"),
                date("2026-05-31"),
                date("2026-07-31"),
            ]
        );
    }

    #[test]
    fn monthly_first_workday_skips_weekend_starts() {
        // Feb 1 and Mar 1 are Sundays, so the first workday is the 2nd.
        let got = expand(
            "FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=1",
            date("2026-01-01"),
            date("2026-01-01"),
            date("2026-03-31"),
        )
        .unwrap();
        assert_eq!(
            got,
            vec![date("2026-01-01"), date("2026-02-02"), date("2026-03-02")]
        );
    }

    #[test]
    fn monthly_last_workday_skips_weekend_ends() {
        // Jan 31 and Feb 28 are Saturdays ⇒ the preceding Friday.
        let got = expand(
            "FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-1",
            date("2026-01-01"),
            date("2026-01-01"),
            date("2026-03-31"),
        )
        .unwrap();
        assert_eq!(
            got,
            vec![date("2026-01-30"), date("2026-02-27"), date("2026-03-31")]
        );
    }

    #[test]
    fn monthly_fifth_weekday_skips_months_without_one() {
        // Only March 2026 has a fifth Monday (Mar 30) in Jan–Mar; Jan and Feb don't.
        let got = expand(
            "FREQ=MONTHLY;BYDAY=MO;BYSETPOS=5",
            date("2026-01-01"),
            date("2026-01-01"),
            date("2026-03-31"),
        )
        .unwrap();
        assert_eq!(got, vec![date("2026-03-30")]);
    }

    #[test]
    fn yearly_repeats_on_the_start_date_each_year() {
        let got = expand(
            "FREQ=YEARLY",
            date("2026-06-24"),
            date("2026-01-01"),
            date("2028-12-31"),
        )
        .unwrap();
        assert_eq!(
            got,
            vec![date("2026-06-24"), date("2027-06-24"), date("2028-06-24")]
        );
    }

    #[test]
    fn weekly_first_and_last_day_of_week() {
        // Monday-first: first day = Monday, last day = Sunday.
        let first = expand(
            "FREQ=WEEKLY;BYDAY=MO",
            date("2026-06-01"),
            date("2026-06-01"),
            date("2026-06-07"),
        )
        .unwrap();
        assert_eq!(first, vec![date("2026-06-01")]);

        let last = expand(
            "FREQ=WEEKLY;BYDAY=SU",
            date("2026-06-01"),
            date("2026-06-01"),
            date("2026-06-07"),
        )
        .unwrap();
        assert_eq!(last, vec![date("2026-06-07")]);
    }
}
