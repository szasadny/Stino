use super::days;

#[test]
fn monthly_byday_bysetpos_first_monday_crosses_months() {
    assert_eq!(
        days(
            "FREQ=MONTHLY;BYDAY=MO;BYSETPOS=1",
            "2026-01-01",
            "2026-01-01",
            "2026-03-31"
        ),
        ["2026-01-05", "2026-02-02", "2026-03-02"]
    );
}

#[test]
fn monthly_last_friday() {
    assert_eq!(
        days(
            "FREQ=MONTHLY;BYDAY=FR;BYSETPOS=-1",
            "2026-01-01",
            "2026-01-01",
            "2026-02-28"
        ),
        ["2026-01-30", "2026-02-27"]
    );
}

#[test]
fn monthly_bymonthday_fixed() {
    assert_eq!(
        days(
            "FREQ=MONTHLY;BYMONTHDAY=15",
            "2026-01-01",
            "2026-01-01",
            "2026-02-28"
        ),
        ["2026-01-15", "2026-02-15"]
    );
}

#[test]
fn monthly_bymonthday_last_day_handles_short_months() {
    assert_eq!(
        days(
            "FREQ=MONTHLY;BYMONTHDAY=-1",
            "2026-01-01",
            "2026-01-01",
            "2026-03-31"
        ),
        ["2026-01-31", "2026-02-28", "2026-03-31"]
    );
}

#[test]
fn monthly_bymonthday_31_skips_months_without_it() {
    assert_eq!(
        days(
            "FREQ=MONTHLY;BYMONTHDAY=31",
            "2026-01-01",
            "2026-01-01",
            "2026-04-30"
        ),
        ["2026-01-31", "2026-03-31"]
    );
}

#[test]
fn interval_monthly_bymonthday_is_anchored_at_the_start_month() {
    assert_eq!(
        days(
            "FREQ=MONTHLY;INTERVAL=3;BYMONTHDAY=15",
            "2026-02-10",
            "2026-01-01",
            "2026-12-31"
        ),
        ["2026-02-15", "2026-05-15", "2026-08-15", "2026-11-15"]
    );
}

#[test]
fn interval_monthly_phase_holds_for_a_window_after_the_start() {
    assert_eq!(
        days(
            "FREQ=MONTHLY;INTERVAL=2;BYMONTHDAY=15",
            "2026-01-15",
            "2026-04-01",
            "2026-07-31"
        ),
        ["2026-05-15", "2026-07-15"]
    );
}

#[test]
fn interval_monthly_last_workday() {
    assert_eq!(
        days(
            "FREQ=MONTHLY;INTERVAL=2;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-1",
            "2026-01-01",
            "2026-01-01",
            "2026-06-30"
        ),
        ["2026-01-30", "2026-03-31", "2026-05-29"]
    );
}

#[test]
fn interval_monthly_bymonthday_31_skips_its_months_without_it() {
    // Sep and Nov are skipped, not moved to the 30th.
    assert_eq!(
        days(
            "FREQ=MONTHLY;INTERVAL=2;BYMONTHDAY=31",
            "2026-01-31",
            "2026-01-01",
            "2026-12-31"
        ),
        ["2026-01-31", "2026-03-31", "2026-05-31", "2026-07-31"]
    );
}

#[test]
fn monthly_first_workday_skips_weekend_starts() {
    assert_eq!(
        days(
            "FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=1",
            "2026-01-01",
            "2026-01-01",
            "2026-03-31"
        ),
        ["2026-01-01", "2026-02-02", "2026-03-02"]
    );
}

#[test]
fn monthly_last_workday_skips_weekend_ends() {
    assert_eq!(
        days(
            "FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-1",
            "2026-01-01",
            "2026-01-01",
            "2026-03-31"
        ),
        ["2026-01-30", "2026-02-27", "2026-03-31"]
    );
}

#[test]
fn monthly_fifth_weekday_skips_months_without_one() {
    assert_eq!(
        days(
            "FREQ=MONTHLY;BYDAY=MO;BYSETPOS=5",
            "2026-01-01",
            "2026-01-01",
            "2026-03-31"
        ),
        ["2026-03-30"]
    );
}
