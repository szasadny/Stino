//! Parse, validate, and expand RFC-5545 RRULEs over local calendar-date windows.
//! Occurrences are anchored at UTC midnight and only their date component is
//! used, so timezone conversion cannot shift an occurrence to another day.

use chrono::{DateTime, Datelike, NaiveDate, TimeZone};
use rrule::{Frequency, RRule, RRuleSet, Tz, Unvalidated};

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
/// validation failure to a UI-safe error. Sub-daily frequencies are rejected
/// here — the one gate every stored rule passes through (create, update,
/// import) — because occurrences are whole calendar dates: an hourly repeat is
/// meaningless on a calendar and would emit the same date many times over.
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

/// TickTick writes a recurrence end date as a bare `UNTIL=YYYYMMDD` (an RFC-5545
/// DATE value), but we anchor DTSTART at UTC midnight — a DATE-TIME — and the
/// `rrule` crate rejects a rule whose `UNTIL` value type differs from DTSTART's.
/// Left unfixed, every "repeat until <date>" task silently loses its recurrence
/// on import. Promote a date-only `UNTIL` to the matching UTC DATE-TIME
/// (`…T000000Z`); the end date stays inclusive because every occurrence also
/// lands at UTC midnight. A rule without `UNTIL`, or one already carrying a UTC
/// time, is returned unchanged.
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
        // DATE form (YYYYMMDD) → UTC midnight DATE-TIME, matching DTSTART.
        format!("{value}T000000Z")
    } else if value.contains('T') && !value.ends_with('Z') {
        // A local DATE-TIME → UTC (`rrule` requires UNTIL be in UTC).
        format!("{value}Z")
    } else {
        value.to_string()
    }
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
    // Apply the explicit date bounds after expansion as the authoritative filter.
    let set = build(rule, dtstart)?
        .after(at_midnight(from))
        .before(at_midnight(to));
    let result = set.all(MAX_OCCURRENCES);
    // With sub-daily frequencies rejected above, no real rule can produce 1000
    // occurrences inside a calendar window — but if one somehow does, refuse
    // rather than silently truncate the calendar. Validation fits: the rule is
    // client-supplied input and the message is safe to show.
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

    #[test]
    fn sub_daily_frequencies_are_rejected() {
        // Occurrences are calendar dates; an hourly (or finer) repeat is
        // meaningless and would emit the same date many times over.
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
        // TickTick exports the end date as a bare `UNTIL=YYYYMMDD` (DATE form).
        // Daily from Jun 1 ending Jun 3 must yield exactly Jun 1, 2, 3 — the
        // UNTIL date itself included — not run on to the end of the window.
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
        // The reported bug: a real TickTick "repeat until" rule whose end date is
        // in the past must still *validate* (so the recurrence imports rather than
        // being silently dropped) yet produce no occurrences in a future window.
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
    fn monthly_first_workday_skips_weekend_starts() {
        // First weekday (Mon–Fri) of each month, Jan–Mar 2026. Jan 1 is a Thursday
        // (a workday); Feb 1 and Mar 1 are Sundays, so the first workday is the 2nd.
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
        // Last weekday of each month, Jan–Mar 2026. Jan 31 and Feb 28 are Saturdays,
        // so the last workday is the preceding Friday; Mar 31 is a Tuesday.
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
