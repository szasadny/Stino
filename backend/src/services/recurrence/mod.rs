// Occurrences anchor at UTC midnight and only the date is read back, so no day can shift.

mod normalize;
#[cfg(test)]
mod tests;

use chrono::{DateTime, NaiveDate, NaiveTime};
use rrule::{Frequency, RRule, RRuleSet, Tz, Unvalidated};

use crate::config::MAX_OCCURRENCES;
use crate::error::ValidationError;
pub(crate) use normalize::normalize;

fn at_midnight(date: NaiveDate) -> DateTime<Tz> {
    date.and_time(NaiveTime::MIN)
        .and_utc()
        .with_timezone(&Tz::UTC)
}

// Sub-daily rules are rejected: occurrences are whole dates.
fn build(rule: &str, dtstart: NaiveDate) -> Result<RRuleSet, ValidationError> {
    let normalized = normalize::normalize_until(rule.trim());
    let parsed: RRule<Unvalidated> = normalized
        .parse()
        .map_err(|_| ValidationError::InvalidRule)?;
    let set = parsed
        .build(at_midnight(dtstart))
        .map_err(|_| ValidationError::InvalidRule)?;
    if set.get_rrule().iter().any(|r| {
        matches!(
            r.get_freq(),
            Frequency::Hourly | Frequency::Minutely | Frequency::Secondly
        )
    }) {
        return Err(ValidationError::SubDailyRule);
    }
    Ok(set)
}

pub(crate) fn validate(rule: &str, dtstart: NaiveDate) -> Result<(), ValidationError> {
    // `all` caps the crate's search loop, so a never-matching rule (Feb 30) ends empty, not spins.
    if build(rule, dtstart)?.all(1).dates.is_empty() {
        return Err(ValidationError::RuleNeverOccurs);
    }
    Ok(())
}

// Inclusive window, ascending; empty if inverted.
pub(crate) fn expand(
    rule: &str,
    dtstart: NaiveDate,
    from: NaiveDate,
    to: NaiveDate,
) -> Result<Vec<NaiveDate>, ValidationError> {
    if to < from {
        return Ok(Vec::new());
    }
    let set = build(rule, dtstart)?
        .after(at_midnight(from))
        .before(at_midnight(to));
    let result = set.all(MAX_OCCURRENCES);
    // Refuse rather than silently truncate the calendar.
    if result.limited {
        return Err(ValidationError::TooManyOccurrences);
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

pub(crate) fn latest_through(
    rule: &str,
    dtstart: NaiveDate,
    to: NaiveDate,
) -> Result<Option<NaiveDate>, ValidationError> {
    Ok(build(rule, dtstart)?
        .into_iter()
        .map(|dt| dt.date_naive())
        .take_while(|d| *d <= to)
        .last())
}
