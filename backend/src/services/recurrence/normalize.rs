const RRULE_PREFIX: &str = "RRULE:";
const DATE_ONLY_UNTIL_LEN: usize = 8;
const UTC_MIDNIGHT_SUFFIX: &str = "T000000Z";

// TickTick and hand-written API calls may send a leading `RRULE:`; we store the bare rule.
pub(crate) fn normalize(raw: &str) -> String {
    let trimmed = raw.trim();
    let body = match trimmed.split_at_checked(RRULE_PREFIX.len()) {
        Some((prefix, rest)) if prefix.eq_ignore_ascii_case(RRULE_PREFIX) => rest,
        _ => trimmed,
    };
    body.trim().to_string()
}

// `rrule` rejects TickTick's date-only UNTIL beside a DATE-TIME DTSTART; promote to UTC midnight.
pub(super) fn normalize_until(rule: &str) -> String {
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
    if value.len() == DATE_ONLY_UNTIL_LEN && value.bytes().all(|b| b.is_ascii_digit()) {
        format!("{value}{UTC_MIDNIGHT_SUFFIX}")
    } else if value.contains('T') && !value.ends_with('Z') {
        // `rrule` requires UNTIL in UTC.
        format!("{value}Z")
    } else {
        value.to_string()
    }
}
