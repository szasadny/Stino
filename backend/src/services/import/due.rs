use chrono::{DateTime, NaiveDate, NaiveTime};
use chrono_tz::Tz;

use super::csv::is_true;
use crate::config::{TICKTICK_DT_FORMAT, TIME_HINT};
use crate::services::validation::{
    format_date, format_time, parse_date_lenient, parse_time_lenient,
};

#[derive(Debug, Clone, Copy)]
pub(super) enum Clock {
    AllDay,
    Timed,
}

impl Clock {
    pub(super) fn from_all_day(raw: Option<&str>) -> Self {
        if is_true(raw) {
            Self::AllDay
        } else {
            Self::Timed
        }
    }
}

// Floating values and unknown zones are read literally.
pub(super) fn zone(timezone: Option<&str>, floating: Option<&str>) -> Option<Tz> {
    if is_true(floating) {
        return None;
    }
    timezone?.parse().ok()
}

// An unparseable date ⇒ Inbox.
pub(super) fn parse_due(
    raw: Option<&str>,
    clock: Clock,
    zone: Option<Tz>,
) -> (Option<String>, Option<String>) {
    let Some(raw) = raw else {
        return (None, None);
    };
    let (date_part, time_part) = match raw.split_once('T') {
        Some((date, rest)) => (date, Some(rest)),
        None => (raw, None),
    };
    let Some(literal_date) = parse_date_lenient(date_part) else {
        return (None, None);
    };

    // A non-floating Due Date (all-day too) is a UTC instant: convert before reading the date.
    if let Some((date, time)) = zone.and_then(|tz| to_local(raw, tz)) {
        return (Some(format_date(date)), timed(clock, time));
    }

    // Literal read: the leading HH:MM, ignoring seconds and offset.
    let literal_time = time_part
        .and_then(|t| t.get(..TIME_HINT.len()))
        .and_then(parse_time_lenient);
    (
        Some(format_date(literal_date)),
        literal_time.and_then(|t| timed(clock, t)),
    )
}

fn timed(clock: Clock, time: NaiveTime) -> Option<String> {
    match clock {
        Clock::AllDay => None,
        Clock::Timed => Some(format_time(time)),
    }
}

fn to_local(raw: &str, tz: Tz) -> Option<(NaiveDate, NaiveTime)> {
    let instant = DateTime::parse_from_str(raw, TICKTICK_DT_FORMAT).ok()?;
    let local = instant.with_timezone(&tz);
    Some((local.date_naive(), local.time()))
}

#[cfg(test)]
mod tests {
    use chrono_tz::{America, Europe};

    use super::*;

    fn due(raw: &str, clock: Clock, zone: Option<Tz>) -> (Option<String>, Option<String>) {
        parse_due(Some(raw), clock, zone)
    }

    fn day(date: &str, time: Option<&str>) -> (Option<String>, Option<String>) {
        (Some(date.to_string()), time.map(str::to_string))
    }

    #[test]
    fn timed_task_converts_the_utc_instant_into_the_tasks_timezone() {
        let amsterdam = Some(Europe::Amsterdam);
        assert_eq!(
            due("2026-06-24T22:30:00+0000", Clock::Timed, amsterdam),
            day("2026-06-25", Some("00:30"))
        );
        assert_eq!(
            due("2026-06-27T07:30:00+0000", Clock::Timed, amsterdam),
            day("2026-06-27", Some("09:30"))
        );
        assert_eq!(
            due(
                "2026-06-27T01:00:00+0000",
                Clock::Timed,
                Some(America::New_York)
            ),
            day("2026-06-26", Some("21:00"))
        );
    }

    #[test]
    fn all_day_task_converts_its_local_midnight_instant_to_the_right_day() {
        assert_eq!(
            due(
                "2026-06-17T22:00:00+0000",
                Clock::AllDay,
                Some(Europe::Amsterdam)
            ),
            day("2026-06-18", None)
        );
    }

    #[test]
    fn floating_tasks_keep_their_literal_wall_clock() {
        let floating = zone(Some("Europe/Amsterdam"), Some("true"));
        assert_eq!(floating, None);
        assert_eq!(
            due("2026-06-27T07:30:00+0000", Clock::Timed, floating),
            day("2026-06-27", Some("07:30"))
        );
        assert_eq!(
            due(
                "2026-06-27T00:00:00+0000",
                Clock::AllDay,
                zone(None, Some("true"))
            ),
            day("2026-06-27", None)
        );
    }

    #[test]
    fn unknown_or_missing_timezone_falls_back_to_a_literal_read() {
        assert_eq!(
            due("2026-06-27T07:30:00+0000", Clock::Timed, zone(None, None)),
            day("2026-06-27", Some("07:30"))
        );
        assert_eq!(
            due(
                "2026-06-27T07:30:00+0000",
                Clock::Timed,
                zone(Some("Not/AZone"), Some("false"))
            ),
            day("2026-06-27", Some("07:30"))
        );
        assert_eq!(
            parse_due(None, Clock::Timed, zone(Some("Europe/Amsterdam"), None)),
            (None, None)
        );
    }
}
