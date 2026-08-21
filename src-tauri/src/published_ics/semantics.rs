use chrono::{DateTime, Days, NaiveDate, NaiveDateTime, TimeDelta, TimeZone, Utc};
use chrono_tz::Tz;
use rrule::{RRuleSet, Tz as RRuleTz};
use serde::Serialize;
use std::{
    collections::BTreeMap,
    time::{Duration, Instant},
};
use windows_timezones::WindowsTimezone;

const MAX_SEMANTIC_PARSE_TIME: Duration = Duration::from_millis(750);
const MAX_LOGICAL_LINE_BYTES: usize = 256 * 1024;
const MAX_SUBJECT_CHARS: usize = 512;
const MAX_EVENT_DURATION: TimeDelta = TimeDelta::days(31);
const RECURRENCE_LOOKBACK: TimeDelta = TimeDelta::days(31);
const RECURRENCE_LOOKAHEAD: TimeDelta = TimeDelta::days(366);
const MAX_OCCURRENCES_PER_SERIES: u16 = 4_096;
const MAX_EXPANDED_OCCURRENCES: usize = 20_000;

#[derive(Clone, Copy, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum EventClassification {
    Active,
    Upcoming,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EventSelection {
    pub subject: String,
    pub start: String,
    pub end: String,
    pub all_day: bool,
    pub classification: EventClassification,
    pub meeting_link_present: Option<bool>,
    #[serde(skip_serializing)]
    pub meeting_url: Option<String>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SemanticFailureReason {
    MalformedEvent,
    UnsupportedTimezone,
    AmbiguousTime,
    UnsupportedRecurrence,
    RecurrenceLimit,
    ParseTime,
    NoEligibleEvent,
}

#[derive(Debug)]
pub struct SemanticFailure {
    pub reason: SemanticFailureReason,
    pub diagnostic: &'static str,
}

#[derive(Debug)]
pub struct SemanticScan {
    pub selection: EventSelection,
    pub overlapping_selections: Vec<EventSelection>,
    pub next_selection: Option<EventSelection>,
    pub eligible_candidate_count: u32,
    pub active_candidate_count: u32,
    pub expanded_occurrence_count: u32,
    pub private_title_redacted: bool,
}

#[derive(Clone, Debug)]
struct DateSpec {
    value: String,
    tzid: Option<String>,
    value_is_date: bool,
}

#[derive(Clone, Debug, Default)]
struct RawEvent {
    uid: Option<String>,
    start: Option<DateSpec>,
    end: Option<DateSpec>,
    duration: Option<String>,
    recurrence_id: Option<DateSpec>,
    recurrence_range_this_and_future: bool,
    rrule: Option<String>,
    rdates: Vec<DateSpec>,
    exdates: Vec<DateSpec>,
    summary: Option<String>,
    class: Option<String>,
    status: Option<String>,
    sequence: u32,
    meeting_link_present: bool,
    meeting_url: Option<String>,
    source_order: u32,
}

#[derive(Clone, Debug)]
struct NormalizedEvent {
    uid: String,
    start: DateTime<Tz>,
    end: DateTime<Tz>,
    all_day: bool,
    recurrence_id: Option<DateTime<Tz>>,
    recurrence_range_this_and_future: bool,
    rrule: Option<String>,
    rdates: Vec<DateTime<Tz>>,
    exdates: Vec<DateTime<Tz>>,
    subject: Option<String>,
    private: bool,
    cancelled: bool,
    sequence: u32,
    meeting_link_present: bool,
    meeting_url: Option<String>,
    source_order: u32,
}

#[derive(Clone, Debug)]
struct Candidate {
    uid: String,
    start: DateTime<Utc>,
    end: DateTime<Utc>,
    all_day: bool,
    subject: String,
    private: bool,
    meeting_link_present: bool,
    meeting_url: Option<String>,
    source_order: u32,
}

#[derive(Default)]
struct ParseState {
    in_event: bool,
    current_event: Option<RawEvent>,
    events: Vec<RawEvent>,
    calendar_timezone: Option<String>,
    next_source_order: u32,
}

pub fn extract_current_or_next(
    body: &[u8],
    now: DateTime<Utc>,
    viewer_timezone: Tz,
    started: Instant,
) -> Result<SemanticScan, SemanticFailure> {
    let text = std::str::from_utf8(body).map_err(|_| {
        failure(
            SemanticFailureReason::MalformedEvent,
            "The calendar was not valid UTF-8 semantic input.",
        )
    })?;
    let mut state = ParseState::default();
    let mut logical_line = String::new();

    for (index, raw_line) in text.split('\n').enumerate() {
        if index % 1_024 == 0 && started.elapsed() > MAX_SEMANTIC_PARSE_TIME {
            return Err(failure(
                SemanticFailureReason::ParseTime,
                "The bounded semantic scan exceeded its fixed parse-time limit.",
            ));
        }

        let line = raw_line.strip_suffix('\r').unwrap_or(raw_line);
        if line.starts_with([' ', '\t']) {
            let continuation = &line[1..];
            if logical_line.len().saturating_add(continuation.len()) > MAX_LOGICAL_LINE_BYTES {
                return Err(failure(
                    SemanticFailureReason::MalformedEvent,
                    "One unfolded iCalendar content line exceeded the semantic line limit.",
                ));
            }
            logical_line.push_str(continuation);
            continue;
        }

        if !logical_line.is_empty() {
            process_logical_line(&mut state, &logical_line)?;
        }
        logical_line.clear();
        logical_line.push_str(line);
    }

    if !logical_line.is_empty() {
        process_logical_line(&mut state, &logical_line)?;
    }
    logical_line.clear();

    if state.in_event || state.current_event.is_some() {
        return Err(failure(
            SemanticFailureReason::MalformedEvent,
            "The semantic scan ended inside an incomplete VEVENT.",
        ));
    }

    let default_timezone = state
        .calendar_timezone
        .as_deref()
        .map(resolve_timezone)
        .transpose()?;
    let mut grouped: BTreeMap<String, Vec<NormalizedEvent>> = BTreeMap::new();
    for raw in state.events {
        let event = normalize_event(raw, default_timezone, viewer_timezone)?;
        grouped.entry(event.uid.clone()).or_default().push(event);
    }

    let window_start = now - RECURRENCE_LOOKBACK;
    let window_end = now + RECURRENCE_LOOKAHEAD;
    let mut candidates = Vec::new();
    let mut expanded_occurrence_count = 0usize;

    for series in grouped.into_values() {
        expand_series(
            series,
            now,
            window_start,
            window_end,
            &mut candidates,
            &mut expanded_occurrence_count,
        )?;
    }

    candidates.retain(|candidate| candidate.end > now && candidate.start < window_end);
    let active_candidate_count = candidates
        .iter()
        .filter(|candidate| candidate.start <= now && candidate.end > now)
        .count();
    let eligible_candidate_count = candidates.len();

    candidates.sort_by(|left, right| {
        let left_active = left.start <= now && left.end > now;
        let right_active = right.start <= now && right.end > now;
        let left_rank = candidate_rank(left_active, left.all_day);
        let right_rank = candidate_rank(right_active, right.all_day);
        left_rank.cmp(&right_rank).then_with(|| {
            if left_active && right_active {
                right
                    .start
                    .cmp(&left.start)
                    .then_with(|| left.end.cmp(&right.end))
                    .then_with(|| left.uid.cmp(&right.uid))
                    .then_with(|| left.source_order.cmp(&right.source_order))
            } else {
                left.start
                    .cmp(&right.start)
                    .then_with(|| left.end.cmp(&right.end))
                    .then_with(|| left.uid.cmp(&right.uid))
                    .then_with(|| left.source_order.cmp(&right.source_order))
            }
        })
    });

    let selected = candidates.first().cloned().ok_or_else(|| {
        failure(
            SemanticFailureReason::NoEligibleEvent,
            "No active or upcoming event was present inside the bounded 366-day selection window.",
        )
    })?;
    let selected_is_active = selected.start <= now && selected.end > now;
    let overlapping_selected = if !selected.all_day {
        candidates
            .iter()
            .skip(1)
            .filter(|candidate| {
                !candidate.all_day
                    && if selected_is_active {
                        candidate.start <= now && candidate.end > now
                    } else {
                        candidate.start == selected.start
                    }
            })
            .take(1)
            .cloned()
            .collect()
    } else {
        Vec::new()
    };
    let next_selected = selected_is_active
        .then(|| {
            candidates
                .iter()
                .filter(|candidate| candidate.start > now)
                .min_by(|left, right| compare_upcoming_candidates(left, right))
                .cloned()
        })
        .flatten();
    let private_title_redacted = selected.private
        || overlapping_selected.iter().any(|event| event.private)
        || next_selected.as_ref().is_some_and(|event| event.private);

    Ok(SemanticScan {
        selection: selection_from_candidate(selected, now),
        overlapping_selections: overlapping_selected
            .into_iter()
            .map(|candidate| selection_from_candidate(candidate, now))
            .collect(),
        next_selection: next_selected.map(|candidate| selection_from_candidate(candidate, now)),
        eligible_candidate_count: u32::try_from(eligible_candidate_count).unwrap_or(u32::MAX),
        active_candidate_count: u32::try_from(active_candidate_count).unwrap_or(u32::MAX),
        expanded_occurrence_count: u32::try_from(expanded_occurrence_count).unwrap_or(u32::MAX),
        private_title_redacted,
    })
}

fn compare_upcoming_candidates(left: &Candidate, right: &Candidate) -> std::cmp::Ordering {
    left.all_day
        .cmp(&right.all_day)
        .then_with(|| left.start.cmp(&right.start))
        .then_with(|| left.end.cmp(&right.end))
        .then_with(|| left.uid.cmp(&right.uid))
        .then_with(|| left.source_order.cmp(&right.source_order))
}

fn selection_from_candidate(candidate: Candidate, now: DateTime<Utc>) -> EventSelection {
    let classification = if candidate.start <= now && candidate.end > now {
        EventClassification::Active
    } else {
        EventClassification::Upcoming
    };
    EventSelection {
        subject: if candidate.private {
            "Private event".to_owned()
        } else {
            candidate.subject
        },
        start: candidate.start.to_rfc3339(),
        end: candidate.end.to_rfc3339(),
        all_day: candidate.all_day,
        classification,
        meeting_link_present: (!candidate.private).then_some(candidate.meeting_link_present),
        meeting_url: (!candidate.private)
            .then_some(candidate.meeting_url)
            .flatten(),
    }
}

fn candidate_rank(active: bool, all_day: bool) -> u8 {
    match (active, all_day) {
        (true, false) => 0,
        (false, false) => 1,
        (true, true) => 2,
        (false, true) => 3,
    }
}

fn process_logical_line(state: &mut ParseState, line: &str) -> Result<(), SemanticFailure> {
    let Some(colon_index) = find_property_colon(line) else {
        return Ok(());
    };
    let head = &line[..colon_index];
    let value = &line[colon_index + 1..];
    let mut head_parts = split_outside_quotes(head, ';');
    let name = head_parts.next().unwrap_or_default();

    if name.eq_ignore_ascii_case("BEGIN") && value.eq_ignore_ascii_case("VEVENT") {
        if state.in_event {
            return Err(failure(
                SemanticFailureReason::MalformedEvent,
                "Nested VEVENT components are not accepted.",
            ));
        }
        state.in_event = true;
        state.current_event = Some(RawEvent {
            source_order: state.next_source_order,
            ..RawEvent::default()
        });
        state.next_source_order = state.next_source_order.saturating_add(1);
        return Ok(());
    }

    if name.eq_ignore_ascii_case("END") && value.eq_ignore_ascii_case("VEVENT") {
        if !state.in_event {
            return Err(failure(
                SemanticFailureReason::MalformedEvent,
                "A VEVENT ended without a matching start.",
            ));
        }
        state.in_event = false;
        if let Some(event) = state.current_event.take() {
            state.events.push(event);
        }
        return Ok(());
    }

    if !state.in_event {
        if name.eq_ignore_ascii_case("X-WR-TIMEZONE") {
            let timezone = unescape_text(value).trim().to_owned();
            if !timezone.is_empty() {
                match &state.calendar_timezone {
                    Some(existing) if existing != &timezone => {
                        return Err(failure(
                            SemanticFailureReason::UnsupportedTimezone,
                            "The calendar declared conflicting default timezones.",
                        ));
                    }
                    None => state.calendar_timezone = Some(timezone),
                    _ => {}
                }
            }
        }
        return Ok(());
    }

    let event = state.current_event.as_mut().ok_or_else(|| {
        failure(
            SemanticFailureReason::MalformedEvent,
            "VEVENT state was unavailable during semantic parsing.",
        )
    })?;
    let parameters = parse_parameters(head_parts);

    if name.eq_ignore_ascii_case("UID") {
        set_once(&mut event.uid, value, "UID")?;
    } else if name.eq_ignore_ascii_case("DTSTART") {
        set_date_once(&mut event.start, value, &parameters, "DTSTART")?;
    } else if name.eq_ignore_ascii_case("DTEND") {
        set_date_once(&mut event.end, value, &parameters, "DTEND")?;
    } else if name.eq_ignore_ascii_case("DURATION") {
        set_once(&mut event.duration, value, "DURATION")?;
    } else if name.eq_ignore_ascii_case("RECURRENCE-ID") {
        set_date_once(
            &mut event.recurrence_id,
            value,
            &parameters,
            "RECURRENCE-ID",
        )?;
        event.recurrence_range_this_and_future = parameters.iter().any(|(key, value)| {
            key.eq_ignore_ascii_case("RANGE") && value.eq_ignore_ascii_case("THISANDFUTURE")
        });
    } else if name.eq_ignore_ascii_case("RRULE") {
        set_once(&mut event.rrule, value, "RRULE")?;
    } else if name.eq_ignore_ascii_case("RDATE") {
        if parameters.iter().any(|(key, value)| {
            key.eq_ignore_ascii_case("VALUE") && value.eq_ignore_ascii_case("PERIOD")
        }) {
            return Err(failure(
                SemanticFailureReason::UnsupportedRecurrence,
                "RDATE period values are outside the bounded semantic contract.",
            ));
        }
        event.rdates.extend(date_specs(value, &parameters));
    } else if name.eq_ignore_ascii_case("EXDATE") {
        event.exdates.extend(date_specs(value, &parameters));
    } else if name.eq_ignore_ascii_case("SUMMARY") {
        if event.summary.is_some() {
            return Err(failure(
                SemanticFailureReason::MalformedEvent,
                "An event contained multiple SUMMARY properties.",
            ));
        }
        event.summary = Some(sanitize_subject(value)?);
    } else if name.eq_ignore_ascii_case("CLASS") {
        set_once(&mut event.class, value, "CLASS")?;
    } else if name.eq_ignore_ascii_case("STATUS") {
        set_once(&mut event.status, value, "STATUS")?;
    } else if name.eq_ignore_ascii_case("SEQUENCE") {
        event.sequence = value.trim().parse().map_err(|_| {
            failure(
                SemanticFailureReason::MalformedEvent,
                "An event contained an invalid SEQUENCE value.",
            )
        })?;
    }

    if let Some(url) = extract_meeting_url(value) {
        event.meeting_link_present = true;
        if event.meeting_url.is_none() {
            event.meeting_url = Some(url);
        }
    } else if is_meeting_link_signal(name, value) {
        event.meeting_link_present = true;
    }
    Ok(())
}

fn normalize_event(
    raw: RawEvent,
    default_timezone: Option<Tz>,
    viewer_timezone: Tz,
) -> Result<NormalizedEvent, SemanticFailure> {
    let uid = raw
        .uid
        .filter(|uid| !uid.trim().is_empty())
        .ok_or_else(|| {
            failure(
                SemanticFailureReason::MalformedEvent,
                "Every semantic VEVENT must contain one non-empty UID.",
            )
        })?;
    let start_spec = raw.start.ok_or_else(|| {
        failure(
            SemanticFailureReason::MalformedEvent,
            "Every semantic VEVENT must contain one DTSTART.",
        )
    })?;
    let all_day = start_spec.value_is_date;
    let start = parse_date_spec(&start_spec, default_timezone, viewer_timezone)?;
    let end = match (raw.end, raw.duration) {
        (Some(end), None) => parse_date_spec(&end, default_timezone, viewer_timezone)?,
        (None, Some(duration)) => start + parse_duration(&duration)?,
        (Some(_), Some(_)) => {
            return Err(failure(
                SemanticFailureReason::MalformedEvent,
                "An event supplied both DTEND and DURATION.",
            ))
        }
        (None, None) if all_day => {
            let next_date = start
                .date_naive()
                .checked_add_days(Days::new(1))
                .ok_or_else(|| {
                    failure(
                        SemanticFailureReason::MalformedEvent,
                        "An all-day event exceeded the supported date range.",
                    )
                })?;
            start
                .timezone()
                .from_local_datetime(&next_date.and_hms_opt(0, 0, 0).unwrap())
                .single()
                .ok_or_else(|| {
                    failure(
                        SemanticFailureReason::AmbiguousTime,
                        "An all-day event boundary fell in an ambiguous timezone transition.",
                    )
                })?
        }
        (None, None) => {
            return Err(failure(
                SemanticFailureReason::MalformedEvent,
                "A timed event must contain DTEND or DURATION.",
            ))
        }
    };
    let duration = end.with_timezone(&Utc) - start.with_timezone(&Utc);
    if duration <= TimeDelta::zero() || duration > MAX_EVENT_DURATION {
        return Err(failure(
            SemanticFailureReason::MalformedEvent,
            "An event duration was non-positive or exceeded the 31-day semantic bound.",
        ));
    }

    Ok(NormalizedEvent {
        uid,
        start,
        end,
        all_day,
        recurrence_id: raw
            .recurrence_id
            .as_ref()
            .map(|value| parse_date_spec(value, default_timezone, viewer_timezone))
            .transpose()?,
        recurrence_range_this_and_future: raw.recurrence_range_this_and_future,
        rrule: raw.rrule,
        rdates: raw
            .rdates
            .iter()
            .map(|value| parse_date_spec(value, default_timezone, viewer_timezone))
            .collect::<Result<_, _>>()?,
        exdates: raw
            .exdates
            .iter()
            .map(|value| parse_date_spec(value, default_timezone, viewer_timezone))
            .collect::<Result<_, _>>()?,
        subject: raw.summary,
        private: raw.class.as_deref().is_some_and(|value| {
            value.eq_ignore_ascii_case("PRIVATE") || value.eq_ignore_ascii_case("CONFIDENTIAL")
        }),
        cancelled: raw
            .status
            .as_deref()
            .is_some_and(|value| value.eq_ignore_ascii_case("CANCELLED")),
        sequence: raw.sequence,
        meeting_link_present: raw.meeting_link_present,
        meeting_url: raw.meeting_url,
        source_order: raw.source_order,
    })
}

fn expand_series(
    mut series: Vec<NormalizedEvent>,
    now: DateTime<Utc>,
    window_start: DateTime<Utc>,
    window_end: DateTime<Utc>,
    candidates: &mut Vec<Candidate>,
    expanded_count: &mut usize,
) -> Result<(), SemanticFailure> {
    let mut masters = series.iter().filter(|event| event.recurrence_id.is_none());
    let master = masters.next().cloned();
    if masters.next().is_some() {
        return Err(failure(
            SemanticFailureReason::UnsupportedRecurrence,
            "A recurrence UID contained multiple master events.",
        ));
    }

    let mut overrides = series
        .drain(..)
        .filter(|event| event.recurrence_id.is_some())
        .collect::<Vec<_>>();
    if overrides
        .iter()
        .any(|event| event.recurrence_range_this_and_future)
    {
        return Err(failure(
            SemanticFailureReason::UnsupportedRecurrence,
            "RANGE=THISANDFUTURE recurrence overrides are outside the bounded semantic contract.",
        ));
    }
    overrides.sort_by(|left, right| {
        left.recurrence_id
            .cmp(&right.recurrence_id)
            .then_with(|| right.sequence.cmp(&left.sequence))
            .then_with(|| right.source_order.cmp(&left.source_order))
    });
    let mut selected_overrides: Vec<NormalizedEvent> = Vec::with_capacity(overrides.len());
    for override_event in overrides {
        if selected_overrides
            .last()
            .and_then(|event| event.recurrence_id)
            == override_event.recurrence_id
        {
            continue;
        }
        selected_overrides.push(override_event);
    }
    let mut overrides = selected_overrides;

    if let Some(master) = master {
        for override_event in &mut overrides {
            if override_event.subject.is_none() {
                override_event.subject.clone_from(&master.subject);
            }
            override_event.private |= master.private;
            override_event.meeting_link_present |= master.meeting_link_present;
            if override_event.meeting_url.is_none() {
                override_event.meeting_url.clone_from(&master.meeting_url);
            }
        }
        if !master.cancelled {
            if let Some(rule) = &master.rrule {
                let mut set = recurrence_set(&master, rule)?;
                let recurrence_timezone = RRuleTz::from(master.start.timezone());
                for override_event in &overrides {
                    if let Some(recurrence_id) = override_event.recurrence_id {
                        set = set.exdate(recurrence_id.with_timezone(&recurrence_timezone));
                    }
                }
                let result = set
                    .after(window_start.with_timezone(&recurrence_timezone))
                    .before(window_end.with_timezone(&recurrence_timezone))
                    .all(MAX_OCCURRENCES_PER_SERIES);
                if result.limited {
                    return Err(failure(
                        SemanticFailureReason::RecurrenceLimit,
                        "A recurrence series exceeded the fixed occurrence limit.",
                    ));
                }
                for start in result.dates {
                    *expanded_count = expanded_count.saturating_add(1);
                    if *expanded_count > MAX_EXPANDED_OCCURRENCES {
                        return Err(failure(
                            SemanticFailureReason::RecurrenceLimit,
                            "The calendar exceeded the fixed expanded-occurrence limit.",
                        ));
                    }
                    push_candidate(&master, start.with_timezone(&Utc), candidates);
                }
            } else {
                push_candidate(&master, master.start.with_timezone(&Utc), candidates);
            }
        }
    } else if overrides.iter().any(|event| {
        !event.cancelled
            && event.end.with_timezone(&Utc) > now
            && event.start.with_timezone(&Utc) < window_end
    }) {
        return Err(failure(
            SemanticFailureReason::UnsupportedRecurrence,
            "A current or upcoming recurrence override was present without one master event.",
        ));
    }

    for override_event in overrides {
        if !override_event.cancelled {
            push_candidate(
                &override_event,
                override_event.start.with_timezone(&Utc),
                candidates,
            );
        }
    }
    Ok(())
}

fn recurrence_set(event: &NormalizedEvent, rule: &str) -> Result<RRuleSet, SemanticFailure> {
    if event.all_day && event.start.timezone() == Tz::UTC {
        return Err(failure(
            SemanticFailureReason::AmbiguousTime,
            "A recurring all-day event lacked an explicit calendar timezone.",
        ));
    }
    let timezone = event.start.timezone();
    let start_line = if timezone == Tz::UTC {
        format!("DTSTART:{}Z", event.start.format("%Y%m%dT%H%M%S"))
    } else {
        format!(
            "DTSTART;TZID={}:{}",
            timezone.name(),
            event.start.format("%Y%m%dT%H%M%S")
        )
    };
    let mut set = format!("{start_line}\nRRULE:{rule}")
        .parse::<RRuleSet>()
        .map_err(|_| {
            failure(
                SemanticFailureReason::UnsupportedRecurrence,
                "An RRULE could not be parsed inside the RFC recurrence contract.",
            )
        })?;
    let recurrence_timezone = RRuleTz::from(timezone);
    for rdate in &event.rdates {
        set = set.rdate(rdate.with_timezone(&recurrence_timezone));
    }
    for exdate in &event.exdates {
        set = set.exdate(exdate.with_timezone(&recurrence_timezone));
    }
    Ok(set)
}

fn push_candidate(
    event: &NormalizedEvent,
    occurrence_start: DateTime<Utc>,
    candidates: &mut Vec<Candidate>,
) {
    let duration = event.end.with_timezone(&Utc) - event.start.with_timezone(&Utc);
    let start = occurrence_start;
    candidates.push(Candidate {
        uid: event.uid.clone(),
        start,
        end: start + duration,
        all_day: event.all_day,
        subject: event
            .subject
            .clone()
            .unwrap_or_else(|| "Untitled event".to_owned()),
        private: event.private,
        meeting_link_present: event.meeting_link_present,
        meeting_url: event.meeting_url.clone(),
        source_order: event.source_order,
    });
}

fn parse_date_spec(
    spec: &DateSpec,
    default_timezone: Option<Tz>,
    viewer_timezone: Tz,
) -> Result<DateTime<Tz>, SemanticFailure> {
    if spec.value_is_date {
        let date = NaiveDate::parse_from_str(spec.value.trim(), "%Y%m%d").map_err(|_| {
            failure(
                SemanticFailureReason::MalformedEvent,
                "An event contained an invalid DATE value.",
            )
        })?;
        let timezone = spec
            .tzid
            .as_deref()
            .map(resolve_timezone)
            .transpose()?
            .or(default_timezone)
            .unwrap_or(viewer_timezone);
        return timezone
            .from_local_datetime(&date.and_hms_opt(0, 0, 0).unwrap())
            .single()
            .ok_or_else(|| {
                failure(
                    SemanticFailureReason::AmbiguousTime,
                    "An all-day event boundary fell in an ambiguous timezone transition.",
                )
            });
    }

    let value = spec.value.trim();
    if let Some(utc_value) = value.strip_suffix('Z') {
        let naive = NaiveDateTime::parse_from_str(utc_value, "%Y%m%dT%H%M%S").map_err(|_| {
            failure(
                SemanticFailureReason::MalformedEvent,
                "An event contained an invalid UTC DATE-TIME value.",
            )
        })?;
        return Ok(Utc.from_utc_datetime(&naive).with_timezone(&Tz::UTC));
    }

    let timezone = spec
        .tzid
        .as_deref()
        .map(resolve_timezone)
        .transpose()?
        .ok_or_else(|| {
            failure(
                SemanticFailureReason::AmbiguousTime,
                "A floating DATE-TIME was rejected because its source timezone is ambiguous.",
            )
        })?;
    let naive = NaiveDateTime::parse_from_str(value, "%Y%m%dT%H%M%S").map_err(|_| {
        failure(
            SemanticFailureReason::MalformedEvent,
            "An event contained an invalid local DATE-TIME value.",
        )
    })?;
    timezone
        .from_local_datetime(&naive)
        .single()
        .ok_or_else(|| {
            failure(
                SemanticFailureReason::AmbiguousTime,
                "A local DATE-TIME fell in an ambiguous or nonexistent timezone transition.",
            )
        })
}

fn resolve_timezone(value: &str) -> Result<Tz, SemanticFailure> {
    let cleaned = value.trim().trim_matches('"');
    if let Ok(timezone) = cleaned.parse::<Tz>() {
        return Ok(timezone);
    }
    if let Ok(windows_timezone) = cleaned.parse::<WindowsTimezone>() {
        return Ok(windows_timezone.into());
    }
    Err(failure(
        SemanticFailureReason::UnsupportedTimezone,
        "A calendar timezone could not be mapped deterministically to the IANA timezone database.",
    ))
}

fn parse_duration(value: &str) -> Result<TimeDelta, SemanticFailure> {
    let value = value.trim();
    if value.starts_with('-') || !value.starts_with('P') {
        return Err(failure(
            SemanticFailureReason::MalformedEvent,
            "Only positive RFC 5545 event durations are accepted.",
        ));
    }
    let mut total = 0i64;
    let mut number = String::new();
    let mut in_time = false;
    for character in value[1..].chars() {
        if character == 'T' {
            if in_time || !number.is_empty() {
                return Err(invalid_duration());
            }
            in_time = true;
            continue;
        }
        if character.is_ascii_digit() {
            number.push(character);
            continue;
        }
        let amount = number.parse::<i64>().map_err(|_| invalid_duration())?;
        number.clear();
        let seconds = match (character, in_time) {
            ('W', false) => amount.checked_mul(7 * 86_400),
            ('D', false) => amount.checked_mul(86_400),
            ('H', true) => amount.checked_mul(3_600),
            ('M', true) => amount.checked_mul(60),
            ('S', true) => Some(amount),
            _ => None,
        }
        .ok_or_else(invalid_duration)?;
        total = total.checked_add(seconds).ok_or_else(invalid_duration)?;
    }
    if !number.is_empty() || total <= 0 {
        return Err(invalid_duration());
    }
    TimeDelta::try_seconds(total).ok_or_else(invalid_duration)
}

fn invalid_duration() -> SemanticFailure {
    failure(
        SemanticFailureReason::MalformedEvent,
        "An event contained an unsupported or invalid RFC 5545 duration.",
    )
}

fn date_specs(value: &str, parameters: &[(String, String)]) -> Vec<DateSpec> {
    value
        .split(',')
        .map(|item| date_spec(item, parameters))
        .collect()
}

fn set_date_once(
    target: &mut Option<DateSpec>,
    value: &str,
    parameters: &[(String, String)],
    property: &'static str,
) -> Result<(), SemanticFailure> {
    if target.is_some() {
        return Err(failure(
            SemanticFailureReason::MalformedEvent,
            match property {
                "DTSTART" => "An event contained multiple DTSTART properties.",
                "DTEND" => "An event contained multiple DTEND properties.",
                _ => "An event contained multiple RECURRENCE-ID properties.",
            },
        ));
    }
    *target = Some(date_spec(value, parameters));
    Ok(())
}

fn date_spec(value: &str, parameters: &[(String, String)]) -> DateSpec {
    DateSpec {
        value: value.to_owned(),
        tzid: parameters
            .iter()
            .find_map(|(key, value)| key.eq_ignore_ascii_case("TZID").then(|| value.clone())),
        value_is_date: parameters.iter().any(|(key, value)| {
            key.eq_ignore_ascii_case("VALUE") && value.eq_ignore_ascii_case("DATE")
        }) || (!value.contains('T') && value.trim().len() == 8),
    }
}

fn set_once(
    target: &mut Option<String>,
    value: &str,
    property: &'static str,
) -> Result<(), SemanticFailure> {
    if target.is_some() {
        return Err(failure(
            SemanticFailureReason::MalformedEvent,
            match property {
                "UID" => "An event contained multiple UID properties.",
                "DURATION" => "An event contained multiple DURATION properties.",
                "RRULE" => "An event contained multiple RRULE properties.",
                "CLASS" => "An event contained multiple CLASS properties.",
                _ => "An event contained multiple STATUS properties.",
            },
        ));
    }
    *target = Some(value.trim().to_owned());
    Ok(())
}

fn sanitize_subject(value: &str) -> Result<String, SemanticFailure> {
    let unescaped = unescape_text(value);
    let normalized = unescaped.split_whitespace().collect::<Vec<_>>().join(" ");
    if normalized.chars().count() > MAX_SUBJECT_CHARS {
        return Err(failure(
            SemanticFailureReason::MalformedEvent,
            "An event subject exceeded the fixed semantic subject limit.",
        ));
    }
    Ok(if normalized.is_empty() {
        "Untitled event".to_owned()
    } else {
        normalized
    })
}

fn unescape_text(value: &str) -> String {
    let mut output = String::with_capacity(value.len());
    let mut chars = value.chars();
    while let Some(character) = chars.next() {
        if character != '\\' {
            output.push(character);
            continue;
        }
        match chars.next() {
            Some('n' | 'N') => output.push('\n'),
            Some('\\') => output.push('\\'),
            Some(',') => output.push(','),
            Some(';') => output.push(';'),
            Some(other) => {
                output.push('\\');
                output.push(other);
            }
            None => output.push('\\'),
        }
    }
    output
}

fn is_meeting_link_signal(name: &str, value: &str) -> bool {
    let upper_name = name.to_ascii_uppercase();
    if (upper_name.contains("ONLINE") || upper_name.contains("SKYPETEAMS"))
        && !value.trim().is_empty()
    {
        return true;
    }
    let lower_value = value.to_ascii_lowercase();
    [
        "https://teams.microsoft.com/",
        "https://teams.live.com/",
        "https://teams.cloud.microsoft/",
        "https://meet.google.com/",
        ".zoom.us/j/",
        "webex.com/meet/",
        "webex.com/join/",
    ]
    .iter()
    .any(|marker| lower_value.contains(marker))
}

fn extract_meeting_url(value: &str) -> Option<String> {
    let decoded = unescape_text(value);
    let lower = decoded.to_ascii_lowercase();
    for (start, _) in lower.match_indices("https://") {
        let candidate = decoded[start..]
            .split(|character: char| {
                character.is_whitespace()
                    || matches!(character, '"' | '\'' | '<' | '>' | ')' | ']' | '}')
            })
            .next()
            .unwrap_or_default()
            .trim_end_matches([',', '.', ';', ':']);
        let Ok(parsed) = reqwest::Url::parse(candidate) else {
            continue;
        };
        if meeting_url_allowed(&parsed) {
            return Some(normalize_meeting_url(parsed).to_string());
        }
    }
    None
}

fn normalize_meeting_url(mut url: reqwest::Url) -> reqwest::Url {
    if url
        .host_str()
        .is_some_and(|host| host.eq_ignore_ascii_case("meet.google.com"))
    {
        url.set_query(None);
        url.set_fragment(None);
    }
    url
}

fn meeting_url_allowed(url: &reqwest::Url) -> bool {
    if url.scheme() != "https"
        || !url.username().is_empty()
        || url.password().is_some()
        || url.port().is_some()
    {
        return false;
    }
    let Some(host) = url.host_str().map(|value| value.to_ascii_lowercase()) else {
        return false;
    };
    let path = url.path().to_ascii_lowercase();
    match host.as_str() {
        "teams.microsoft.com" | "teams.live.com" | "teams.cloud.microsoft" => {
            path.starts_with("/l/meetup-join/") || path.starts_with("/meet/")
        }
        "meet.google.com" => path.len() > 1,
        "zoom.us" => path.starts_with("/j/") || path.starts_with("/my/"),
        "webex.com" => path.starts_with("/meet/") || path.starts_with("/join/"),
        _ if host.ends_with(".zoom.us") => path.starts_with("/j/") || path.starts_with("/my/"),
        _ if host.ends_with(".webex.com") => {
            path.starts_with("/meet/") || path.starts_with("/join/")
        }
        _ => false,
    }
}

fn parse_parameters<'a>(parts: impl Iterator<Item = &'a str>) -> Vec<(String, String)> {
    parts
        .filter_map(|part| {
            let (key, value) = part.split_once('=')?;
            Some((
                key.trim().to_owned(),
                value.trim().trim_matches('"').to_owned(),
            ))
        })
        .collect()
}

fn find_property_colon(line: &str) -> Option<usize> {
    let mut quoted = false;
    for (index, character) in line.char_indices() {
        match character {
            '"' => quoted = !quoted,
            ':' if !quoted => return Some(index),
            _ => {}
        }
    }
    None
}

fn split_outside_quotes(value: &str, delimiter: char) -> impl Iterator<Item = &str> {
    let mut quoted = false;
    value.split(move |character| {
        if character == '"' {
            quoted = !quoted;
            false
        } else {
            character == delimiter && !quoted
        }
    })
}

fn failure(reason: SemanticFailureReason, diagnostic: &'static str) -> SemanticFailure {
    SemanticFailure { reason, diagnostic }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn now() -> DateTime<Utc> {
        DateTime::parse_from_rfc3339("2026-08-11T12:00:00Z")
            .unwrap()
            .with_timezone(&Utc)
    }

    fn extract(input: &str) -> Result<SemanticScan, SemanticFailure> {
        extract_current_or_next(input.as_bytes(), now(), Tz::UTC, Instant::now())
    }

    #[test]
    fn selects_active_before_upcoming_and_redacts_private_fields() {
        let result = extract("BEGIN:VCALENDAR\r\nX-WR-TIMEZONE:UTC\r\nBEGIN:VEVENT\r\nUID:next\r\nDTSTART:20260811T130000Z\r\nDTEND:20260811T140000Z\r\nSUMMARY:Next meeting\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nUID:active\r\nDTSTART:20260811T113000Z\r\nDTEND:20260811T123000Z\r\nSUMMARY:Secret title\r\nCLASS:PRIVATE\r\nX-MICROSOFT-ONLINEMEETINGEXTERNALLINK:https://teams.microsoft.com/l/meetup-join/secret\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n").unwrap();
        assert_eq!(result.selection.classification, EventClassification::Active);
        assert_eq!(result.selection.subject, "Private event");
        assert_eq!(result.selection.meeting_link_present, None);
        assert_eq!(
            result
                .next_selection
                .as_ref()
                .map(|event| event.subject.as_str()),
            Some("Next meeting")
        );
        assert!(result.private_title_redacted);
    }

    #[test]
    fn treats_active_all_day_context_as_fallback_to_a_timed_event() {
        let result = extract("BEGIN:VCALENDAR\r\nX-WR-TIMEZONE:UTC\r\nBEGIN:VEVENT\r\nUID:all-day-context\r\nDTSTART;VALUE=DATE:20260810\r\nDTEND;VALUE=DATE:20260815\r\nSUMMARY:All-day context\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nUID:next-timed\r\nDTSTART:20260811T130000Z\r\nDTEND:20260811T133000Z\r\nSUMMARY:Next timed event\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n").unwrap();

        assert_eq!(
            result.selection.classification,
            EventClassification::Upcoming
        );
        assert_eq!(result.selection.subject, "Next timed event");
        assert!(result.next_selection.is_none());
        assert_eq!(result.active_candidate_count, 1);
    }

    #[test]
    fn active_timed_event_still_precedes_upcoming_timed_and_all_day_events() {
        let result = extract("BEGIN:VCALENDAR\r\nX-WR-TIMEZONE:UTC\r\nBEGIN:VEVENT\r\nUID:all-day-context\r\nDTSTART;VALUE=DATE:20260810\r\nDTEND;VALUE=DATE:20260815\r\nSUMMARY:All-day context\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nUID:active-timed\r\nDTSTART:20260811T113000Z\r\nDTEND:20260811T123000Z\r\nSUMMARY:Active timed event\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nUID:next-timed\r\nDTSTART:20260811T130000Z\r\nDTEND:20260811T133000Z\r\nSUMMARY:Next timed event\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n").unwrap();

        assert_eq!(result.selection.classification, EventClassification::Active);
        assert_eq!(result.selection.subject, "Active timed event");
        assert_eq!(
            result
                .next_selection
                .as_ref()
                .map(|event| event.subject.as_str()),
            Some("Next timed event")
        );
        assert_eq!(result.active_candidate_count, 2);
    }

    #[test]
    fn redacts_a_private_upcoming_companion() {
        let result = extract("BEGIN:VCALENDAR\r\nX-WR-TIMEZONE:UTC\r\nBEGIN:VEVENT\r\nUID:active\r\nDTSTART:20260811T113000Z\r\nDTEND:20260811T123000Z\r\nSUMMARY:Active event\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nUID:private-next\r\nDTSTART:20260811T130000Z\r\nDTEND:20260811T133000Z\r\nSUMMARY:Sensitive next title\r\nCLASS:PRIVATE\r\nDESCRIPTION:https://teams.microsoft.com/l/meetup-join/secret\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n").unwrap();

        let next = result.next_selection.unwrap();
        assert_eq!(next.subject, "Private event");
        assert_eq!(next.meeting_link_present, None);
        assert!(result.private_title_redacted);
    }

    #[test]
    fn exposes_two_upcoming_events_with_the_same_start_time() {
        let result = extract("BEGIN:VCALENDAR\r\nX-WR-TIMEZONE:UTC\r\nBEGIN:VEVENT\r\nUID:first-upcoming\r\nDTSTART:20260811T130000Z\r\nDTEND:20260811T133000Z\r\nSUMMARY:First simultaneous meeting\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nUID:second-upcoming\r\nDTSTART:20260811T130000Z\r\nDTEND:20260811T140000Z\r\nSUMMARY:Second simultaneous meeting\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nUID:later\r\nDTSTART:20260811T150000Z\r\nDTEND:20260811T153000Z\r\nSUMMARY:Later meeting\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n").unwrap();

        assert_eq!(result.selection.subject, "First simultaneous meeting");
        assert_eq!(
            result.selection.classification,
            EventClassification::Upcoming
        );
        assert_eq!(result.overlapping_selections.len(), 1);
        assert_eq!(
            result.overlapping_selections[0].subject,
            "Second simultaneous meeting"
        );
        assert_eq!(
            result.overlapping_selections[0].classification,
            EventClassification::Upcoming
        );
        assert!(result.next_selection.is_none());
    }

    #[test]
    fn redacts_a_private_overlapping_active_event() {
        let result = extract("BEGIN:VCALENDAR\r\nX-WR-TIMEZONE:UTC\r\nBEGIN:VEVENT\r\nUID:private-overlap\r\nDTSTART:20260811T110000Z\r\nDTEND:20260811T130000Z\r\nSUMMARY:Sensitive overlap\r\nCLASS:PRIVATE\r\nX-MICROSOFT-ONLINEMEETINGEXTERNALLINK:https://teams.microsoft.com/l/meetup-join/private-overlap\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nUID:primary\r\nDTSTART:20260811T113000Z\r\nDTEND:20260811T123000Z\r\nSUMMARY:Primary meeting\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n").unwrap();

        assert_eq!(result.selection.subject, "Primary meeting");
        assert_eq!(result.overlapping_selections.len(), 1);
        let overlapping = &result.overlapping_selections[0];
        assert_eq!(overlapping.subject, "Private event");
        assert_eq!(overlapping.meeting_link_present, None);
        assert!(overlapping.meeting_url.is_none());
        assert!(result.private_title_redacted);
    }

    #[test]
    fn expands_recurring_events_and_applies_cancelled_override() {
        let result = extract("BEGIN:VCALENDAR\r\nX-WR-TIMEZONE:UTC\r\nBEGIN:VEVENT\r\nUID:series\r\nDTSTART:20260804T130000Z\r\nDTEND:20260804T140000Z\r\nRRULE:FREQ=WEEKLY\r\nSUMMARY:Weekly sync\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nUID:series\r\nRECURRENCE-ID:20260811T130000Z\r\nDTSTART:20260811T130000Z\r\nDTEND:20260811T140000Z\r\nSTATUS:CANCELLED\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n").unwrap();
        assert_eq!(result.selection.start, "2026-08-18T13:00:00+00:00");
        assert_eq!(result.selection.subject, "Weekly sync");
    }

    #[test]
    fn ignores_only_stale_orphan_overrides() {
        let result = extract("BEGIN:VCALENDAR\r\nX-WR-TIMEZONE:UTC\r\nBEGIN:VEVENT\r\nUID:orphan\r\nRECURRENCE-ID:20260801T130000Z\r\nDTSTART:20260801T130000Z\r\nDTEND:20260801T140000Z\r\nSUMMARY:Stale exception\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nUID:next\r\nDTSTART:20260811T130000Z\r\nDTEND:20260811T140000Z\r\nSUMMARY:Next meeting\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n").unwrap();
        assert_eq!(result.selection.subject, "Next meeting");

        let future_orphan = extract("BEGIN:VCALENDAR\r\nX-WR-TIMEZONE:UTC\r\nBEGIN:VEVENT\r\nUID:orphan\r\nRECURRENCE-ID:20260812T130000Z\r\nDTSTART:20260812T130000Z\r\nDTEND:20260812T140000Z\r\nSUMMARY:Future exception\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n").unwrap_err();
        assert_eq!(
            future_orphan.reason,
            SemanticFailureReason::UnsupportedRecurrence
        );
    }

    #[test]
    fn maps_windows_timezone_ids_and_uses_deterministic_overlap_order() {
        let result = extract("BEGIN:VCALENDAR\r\nX-WR-TIMEZONE:FLE Standard Time\r\nBEGIN:VEVENT\r\nUID:first\r\nDTSTART;TZID=FLE Standard Time:20260811T140000\r\nDTEND;TZID=FLE Standard Time:20260811T153000\r\nSUMMARY:Earlier active\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nUID:second\r\nDTSTART;TZID=FLE Standard Time:20260811T143000\r\nDTEND;TZID=FLE Standard Time:20260811T160000\r\nSUMMARY:Most recently started\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n").unwrap();
        assert_eq!(result.active_candidate_count, 2);
        assert_eq!(result.selection.subject, "Most recently started");
        assert_eq!(result.overlapping_selections.len(), 1);
        assert_eq!(result.overlapping_selections[0].subject, "Earlier active");
        assert_eq!(
            result.overlapping_selections[0].classification,
            EventClassification::Active
        );
    }

    #[test]
    fn handles_all_day_event_with_calendar_timezone() {
        let result = extract("BEGIN:VCALENDAR\r\nX-WR-TIMEZONE:Europe/Kyiv\r\nBEGIN:VEVENT\r\nUID:all-day\r\nDTSTART;VALUE=DATE:20260812\r\nDTEND;VALUE=DATE:20260813\r\nSUMMARY:All day\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n").unwrap();
        assert_eq!(result.selection.start, "2026-08-11T21:00:00+00:00");
        assert_eq!(result.selection.end, "2026-08-12T21:00:00+00:00");
        assert!(result.selection.all_day);
    }

    #[test]
    fn treats_timezone_free_all_day_dates_as_viewer_local_calendar_dates() {
        let result = extract_current_or_next(
            "BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:all-day\r\nDTSTART;VALUE=DATE:20260812\r\nDTEND;VALUE=DATE:20260813\r\nSUMMARY:All day\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n".as_bytes(),
            now(),
            chrono_tz::Europe::Kyiv,
            Instant::now(),
        )
        .unwrap();
        assert_eq!(result.selection.start, "2026-08-11T21:00:00+00:00");
        assert_eq!(result.selection.end, "2026-08-12T21:00:00+00:00");
        assert!(result.selection.all_day);
    }

    #[test]
    fn rejects_floating_times_and_this_and_future_overrides() {
        let floating = extract("BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:floating\r\nDTSTART:20260811T130000\r\nDTEND:20260811T140000\r\nSUMMARY:Floating\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n").unwrap_err();
        assert_eq!(floating.reason, SemanticFailureReason::AmbiguousTime);

        let ranged = extract("BEGIN:VCALENDAR\r\nX-WR-TIMEZONE:UTC\r\nBEGIN:VEVENT\r\nUID:series\r\nDTSTART:20260804T130000Z\r\nDTEND:20260804T140000Z\r\nRRULE:FREQ=WEEKLY\r\nSUMMARY:Series\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nUID:series\r\nRECURRENCE-ID;RANGE=THISANDFUTURE:20260811T130000Z\r\nDTSTART:20260811T140000Z\r\nDTEND:20260811T150000Z\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n").unwrap_err();
        assert_eq!(ranged.reason, SemanticFailureReason::UnsupportedRecurrence);
    }

    #[test]
    fn retains_allowlisted_meeting_url_only_outside_serialized_selection() {
        let result = extract("BEGIN:VCALENDAR\r\nX-WR-TIMEZONE:UTC\r\nBEGIN:VEVENT\r\nUID:meeting\r\nDTSTART:20260811T130000Z\r\nDTEND:20260811T140000Z\r\nSUMMARY:Meeting\r\nDESCRIPTION:Join at https://teams.microsoft.com/l/meetup-join/opaque\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n").unwrap();
        assert_eq!(result.selection.meeting_link_present, Some(true));
        assert_eq!(
            result.selection.meeting_url.as_deref(),
            Some("https://teams.microsoft.com/l/meetup-join/opaque")
        );
        let json = serde_json::to_string(&result.selection).unwrap();
        assert!(!json.contains("meetup-join"));
        assert!(!json.contains("opaque"));
    }

    #[test]
    fn rejects_non_allowlisted_and_credentialed_join_urls() {
        assert!(extract_meeting_url("https://example.com/j/123").is_none());
        assert!(extract_meeting_url(
            "https://person:secret@teams.microsoft.com/l/meetup-join/opaque"
        )
        .is_none());
        assert_eq!(
            extract_meeting_url("Join https://acme.zoom.us/j/123456789?pwd=opaque"),
            Some("https://acme.zoom.us/j/123456789?pwd=opaque".to_owned())
        );
        assert_eq!(
            extract_meeting_url(
                "Join https://meet.google.com/abc-defg-hij?authuser=2&hs=122#fragment"
            ),
            Some("https://meet.google.com/abc-defg-hij".to_owned())
        );
    }
}
