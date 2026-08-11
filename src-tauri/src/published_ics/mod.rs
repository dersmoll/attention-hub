mod semantics;

use reqwest::{
    header::{AGE, CACHE_CONTROL, CONTENT_TYPE, ETAG, LAST_MODIFIED},
    redirect::Policy,
    Url,
};
use serde::Serialize;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

pub use semantics::EventSelection;

const MAX_URL_BYTES: usize = 4_096;
const CONNECT_TIMEOUT: Duration = Duration::from_secs(5);
const REQUEST_TIMEOUT: Duration = Duration::from_secs(10);
const MAX_RESPONSE_BYTES: usize = 8 * 1024 * 1024;
const MAX_PHYSICAL_LINES: u32 = 250_000;
const MAX_PROPERTIES: u32 = 200_000;
const MAX_EVENTS: u32 = 20_000;
const MAX_LINE_BYTES: usize = 256 * 1024;
const MAX_PARSE_TIME: Duration = Duration::from_millis(500);

#[derive(Clone, Copy, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum PublishedIcsProbeStatus {
    Observed,
    InvalidInput,
    Unavailable,
    TooLarge,
    Timeout,
    Error,
}

#[derive(Clone, Copy, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum PublishedIcsContentTypeState {
    Calendar,
    Missing,
    Other,
}

#[derive(Clone, Copy, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum PublishedIcsStopReason {
    InvalidUrl,
    DisallowedSource,
    ClientSetup,
    RequestTimeout,
    RequestFailed,
    RedirectBlocked,
    HttpStatus,
    DeclaredBodyLimit,
    BodyLimit,
    BodyRead,
    HtmlResponse,
    InvalidUtf8,
    LineLimit,
    PropertyLimit,
    EventLimit,
    ParseTime,
    MalformedCalendar,
    MultipleCalendars,
    TitleCapabilityNotConfirmed,
    MalformedEvent,
    UnsupportedTimezone,
    AmbiguousTime,
    UnsupportedRecurrence,
    RecurrenceLimit,
    NoEligibleEvent,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PublishedIcsProbeLimits {
    pub url_bytes: usize,
    pub connect_ms: u64,
    pub request_ms: u64,
    pub response_bytes: usize,
    pub physical_lines: u32,
    pub properties: u32,
    pub events: u32,
    pub line_bytes: usize,
    pub parse_ms: u64,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PublishedIcsStructureProbe {
    pub status: PublishedIcsProbeStatus,
    pub captured_at_unix_ms: u64,
    pub url_accepted: bool,
    pub webcal_normalized_to_https: bool,
    pub source_identity_state: &'static str,
    pub semantic_extraction_allowed: bool,
    pub http_status: Option<u16>,
    pub content_type_state: PublishedIcsContentTypeState,
    pub etag_present: bool,
    pub last_modified_present: bool,
    pub cache_control_present: bool,
    pub age_header_present: bool,
    pub response_bytes: usize,
    pub physical_line_count: u32,
    pub folded_line_count: u32,
    pub property_count: u32,
    pub calendar_count: u32,
    pub event_count: u32,
    pub events_with_start_count: u32,
    pub events_with_end_or_duration_count: u32,
    pub recurrence_rule_count: u32,
    pub recurrence_date_count: u32,
    pub recurrence_exception_date_count: u32,
    pub recurrence_override_count: u32,
    pub timezone_definition_count: u32,
    pub timezone_reference_count: u32,
    pub request_ms: u64,
    pub parse_ms: u64,
    pub stop_reason: Option<PublishedIcsStopReason>,
    pub limits: PublishedIcsProbeLimits,
    pub diagnostics: Vec<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PublishedIcsSemanticProbe {
    pub status: PublishedIcsProbeStatus,
    pub captured_at_unix_ms: u64,
    pub url_accepted: bool,
    pub webcal_normalized_to_https: bool,
    pub source_identity_state: &'static str,
    pub semantic_extraction_allowed: bool,
    pub title_capability_confirmed: bool,
    pub http_status: Option<u16>,
    pub content_type_state: PublishedIcsContentTypeState,
    pub response_bytes: usize,
    pub request_ms: u64,
    pub parse_ms: u64,
    pub eligible_candidate_count: u32,
    pub active_candidate_count: u32,
    pub expanded_occurrence_count: u32,
    pub private_title_redacted: bool,
    pub selection: Option<EventSelection>,
    pub stop_reason: Option<PublishedIcsStopReason>,
    pub diagnostics: Vec<String>,
}

impl PublishedIcsSemanticProbe {
    fn new(title_capability_confirmed: bool) -> Self {
        Self {
            status: PublishedIcsProbeStatus::Unavailable,
            captured_at_unix_ms: now_unix_ms(),
            url_accepted: false,
            webcal_normalized_to_https: false,
            source_identity_state: "userSelectedSinglePublishedCalendarTitleCapable",
            semantic_extraction_allowed: false,
            title_capability_confirmed,
            http_status: None,
            content_type_state: PublishedIcsContentTypeState::Missing,
            response_bytes: 0,
            request_ms: 0,
            parse_ms: 0,
            eligible_candidate_count: 0,
            active_candidate_count: 0,
            expanded_occurrence_count: 0,
            private_title_redacted: false,
            selection: None,
            stop_reason: None,
            diagnostics: Vec::new(),
        }
    }

    fn fail(
        &mut self,
        status: PublishedIcsProbeStatus,
        reason: PublishedIcsStopReason,
        diagnostic: &'static str,
    ) {
        self.status = status;
        self.stop_reason = Some(reason);
        self.diagnostics.push(diagnostic.to_owned());
    }
}

impl PublishedIcsStructureProbe {
    fn new() -> Self {
        Self {
            status: PublishedIcsProbeStatus::Unavailable,
            captured_at_unix_ms: now_unix_ms(),
            url_accepted: false,
            webcal_normalized_to_https: false,
            source_identity_state: "userSelectedPublishedUrlStructureOnly",
            semantic_extraction_allowed: false,
            http_status: None,
            content_type_state: PublishedIcsContentTypeState::Missing,
            etag_present: false,
            last_modified_present: false,
            cache_control_present: false,
            age_header_present: false,
            response_bytes: 0,
            physical_line_count: 0,
            folded_line_count: 0,
            property_count: 0,
            calendar_count: 0,
            event_count: 0,
            events_with_start_count: 0,
            events_with_end_or_duration_count: 0,
            recurrence_rule_count: 0,
            recurrence_date_count: 0,
            recurrence_exception_date_count: 0,
            recurrence_override_count: 0,
            timezone_definition_count: 0,
            timezone_reference_count: 0,
            request_ms: 0,
            parse_ms: 0,
            stop_reason: None,
            limits: PublishedIcsProbeLimits {
                url_bytes: MAX_URL_BYTES,
                connect_ms: CONNECT_TIMEOUT.as_millis() as u64,
                request_ms: REQUEST_TIMEOUT.as_millis() as u64,
                response_bytes: MAX_RESPONSE_BYTES,
                physical_lines: MAX_PHYSICAL_LINES,
                properties: MAX_PROPERTIES,
                events: MAX_EVENTS,
                line_bytes: MAX_LINE_BYTES,
                parse_ms: MAX_PARSE_TIME.as_millis() as u64,
            },
            diagnostics: Vec::new(),
        }
    }

    fn fail(
        &mut self,
        status: PublishedIcsProbeStatus,
        reason: PublishedIcsStopReason,
        diagnostic: &'static str,
    ) {
        self.status = status;
        self.stop_reason = Some(reason);
        self.diagnostics.push(diagnostic.to_owned());
    }
}

struct ValidatedPublishedUrl {
    url: Url,
    webcal_normalized_to_https: bool,
}

#[derive(Debug, Default)]
struct IcsStructure {
    physical_line_count: u32,
    folded_line_count: u32,
    property_count: u32,
    calendar_count: u32,
    calendar_end_count: u32,
    event_count: u32,
    event_end_count: u32,
    events_with_start_count: u32,
    events_with_end_or_duration_count: u32,
    recurrence_rule_count: u32,
    recurrence_date_count: u32,
    recurrence_exception_date_count: u32,
    recurrence_override_count: u32,
    timezone_definition_count: u32,
    timezone_reference_count: u32,
}

#[derive(Debug)]
struct ScanFailure {
    status: PublishedIcsProbeStatus,
    reason: PublishedIcsStopReason,
    diagnostic: &'static str,
}

pub async fn get_structure_probe(published_url: String) -> PublishedIcsStructureProbe {
    let mut probe = PublishedIcsStructureProbe::new();
    let validated = match validate_published_url(&published_url) {
        Ok(validated) => validated,
        Err((reason, diagnostic)) => {
            probe.fail(PublishedIcsProbeStatus::InvalidInput, reason, diagnostic);
            return probe;
        }
    };

    probe.url_accepted = true;
    probe.webcal_normalized_to_https = validated.webcal_normalized_to_https;

    let client = match reqwest::Client::builder()
        .connect_timeout(CONNECT_TIMEOUT)
        .timeout(REQUEST_TIMEOUT)
        .redirect(Policy::none())
        .referer(false)
        .pool_max_idle_per_host(0)
        .user_agent("Attention-Hub/0.1 Published-ICS-Structure-Probe")
        .build()
    {
        Ok(client) => client,
        Err(_) => {
            probe.fail(
                PublishedIcsProbeStatus::Error,
                PublishedIcsStopReason::ClientSetup,
                "The bounded HTTPS client could not be initialized.",
            );
            return probe;
        }
    };

    let request_started = Instant::now();
    let mut response = match client.get(validated.url).send().await {
        Ok(response) => response,
        Err(error) => {
            probe.request_ms = elapsed_ms(request_started);
            if error.is_timeout() {
                probe.fail(
                    PublishedIcsProbeStatus::Timeout,
                    PublishedIcsStopReason::RequestTimeout,
                    "The published calendar request exceeded the fixed total timeout.",
                );
            } else {
                probe.fail(
                    PublishedIcsProbeStatus::Unavailable,
                    PublishedIcsStopReason::RequestFailed,
                    "The published calendar could not be fetched. No request error text is returned because it may contain the secret URL.",
                );
            }
            return probe;
        }
    };

    probe.http_status = Some(response.status().as_u16());
    probe.content_type_state = classify_content_type(response.headers().get(CONTENT_TYPE));
    probe.etag_present = response.headers().contains_key(ETAG);
    probe.last_modified_present = response.headers().contains_key(LAST_MODIFIED);
    probe.cache_control_present = response.headers().contains_key(CACHE_CONTROL);
    probe.age_header_present = response.headers().contains_key(AGE);

    if response.status().is_redirection() {
        probe.request_ms = elapsed_ms(request_started);
        probe.fail(
            PublishedIcsProbeStatus::Unavailable,
            PublishedIcsStopReason::RedirectBlocked,
            "The endpoint requested a redirect. Redirects are blocked so the secret path cannot be forwarded to another host.",
        );
        return probe;
    }

    if !response.status().is_success() {
        probe.request_ms = elapsed_ms(request_started);
        probe.fail(
            PublishedIcsProbeStatus::Unavailable,
            PublishedIcsStopReason::HttpStatus,
            "The endpoint returned a non-success HTTP status. The response body was not read.",
        );
        return probe;
    }

    if response
        .content_length()
        .is_some_and(|length| length > MAX_RESPONSE_BYTES as u64)
    {
        probe.request_ms = elapsed_ms(request_started);
        probe.fail(
            PublishedIcsProbeStatus::TooLarge,
            PublishedIcsStopReason::DeclaredBodyLimit,
            "The declared response size exceeds the fixed body limit.",
        );
        return probe;
    }

    let initial_capacity = response
        .content_length()
        .unwrap_or(0)
        .min(MAX_RESPONSE_BYTES as u64) as usize;
    let mut body = Vec::with_capacity(initial_capacity);

    loop {
        match response.chunk().await {
            Ok(Some(chunk)) => {
                if body.len().saturating_add(chunk.len()) > MAX_RESPONSE_BYTES {
                    body.fill(0);
                    probe.request_ms = elapsed_ms(request_started);
                    probe.fail(
                        PublishedIcsProbeStatus::TooLarge,
                        PublishedIcsStopReason::BodyLimit,
                        "The streamed response exceeded the fixed body limit and was discarded.",
                    );
                    return probe;
                }
                body.extend_from_slice(&chunk);
            }
            Ok(None) => break,
            Err(error) => {
                body.fill(0);
                probe.request_ms = elapsed_ms(request_started);
                if error.is_timeout() {
                    probe.fail(
                        PublishedIcsProbeStatus::Timeout,
                        PublishedIcsStopReason::RequestTimeout,
                        "The published calendar body exceeded the fixed total timeout.",
                    );
                } else {
                    probe.fail(
                        PublishedIcsProbeStatus::Unavailable,
                        PublishedIcsStopReason::BodyRead,
                        "The published calendar body could not be read. No request error text is returned.",
                    );
                }
                return probe;
            }
        }
    }

    probe.request_ms = elapsed_ms(request_started);
    probe.response_bytes = body.len();

    if looks_like_html(&body) {
        body.fill(0);
        probe.fail(
            PublishedIcsProbeStatus::Unavailable,
            PublishedIcsStopReason::HtmlResponse,
            "The response looked like HTML rather than an iCalendar document and was discarded.",
        );
        return probe;
    }

    let parse_started = Instant::now();
    let scan_result = scan_ics_structure(&body, parse_started);
    probe.parse_ms = elapsed_ms(parse_started);
    body.fill(0);

    let structure = match scan_result {
        Ok(structure) => structure,
        Err(failure) => {
            probe.fail(failure.status, failure.reason, failure.diagnostic);
            return probe;
        }
    };

    copy_structure(&mut probe, structure);

    if probe.calendar_count != 1 {
        probe.fail(
            PublishedIcsProbeStatus::Unavailable,
            PublishedIcsStopReason::MultipleCalendars,
            "The response did not contain exactly one balanced VCALENDAR source.",
        );
        return probe;
    }

    probe.status = PublishedIcsProbeStatus::Observed;
    probe.diagnostics.push(
        "One bounded published-calendar structure was observed. Event values and the source URL were not returned.".to_owned(),
    );
    probe.diagnostics.push(
        "Semantic extraction remains disabled until freshness, privacy level, recurrence, timezone, and source-selection behavior are validated.".to_owned(),
    );
    probe
}

pub async fn get_semantic_probe(
    published_url: String,
    title_capability_confirmed: bool,
) -> PublishedIcsSemanticProbe {
    let mut probe = PublishedIcsSemanticProbe::new(title_capability_confirmed);
    if !title_capability_confirmed {
        probe.fail(
            PublishedIcsProbeStatus::InvalidInput,
            PublishedIcsStopReason::TitleCapabilityNotConfirmed,
            "Confirm the exact Outlook publication level before any event title is extracted.",
        );
        return probe;
    }

    let validated = match validate_published_url(&published_url) {
        Ok(validated) => validated,
        Err((reason, diagnostic)) => {
            probe.fail(PublishedIcsProbeStatus::InvalidInput, reason, diagnostic);
            return probe;
        }
    };
    probe.url_accepted = true;
    probe.webcal_normalized_to_https = validated.webcal_normalized_to_https;

    let client = match reqwest::Client::builder()
        .connect_timeout(CONNECT_TIMEOUT)
        .timeout(REQUEST_TIMEOUT)
        .redirect(Policy::none())
        .referer(false)
        .pool_max_idle_per_host(0)
        .user_agent("Attention-Hub/0.1 Published-ICS-Semantic-Probe")
        .build()
    {
        Ok(client) => client,
        Err(_) => {
            probe.fail(
                PublishedIcsProbeStatus::Error,
                PublishedIcsStopReason::ClientSetup,
                "The bounded HTTPS client could not be initialized.",
            );
            return probe;
        }
    };

    let request_started = Instant::now();
    let mut response = match client.get(validated.url).send().await {
        Ok(response) => response,
        Err(error) => {
            probe.request_ms = elapsed_ms(request_started);
            if error.is_timeout() {
                probe.fail(
                    PublishedIcsProbeStatus::Timeout,
                    PublishedIcsStopReason::RequestTimeout,
                    "The published calendar request exceeded the fixed total timeout.",
                );
            } else {
                probe.fail(
                    PublishedIcsProbeStatus::Unavailable,
                    PublishedIcsStopReason::RequestFailed,
                    "The published calendar could not be fetched. Request details are suppressed because they may contain the secret URL.",
                );
            }
            return probe;
        }
    };

    probe.http_status = Some(response.status().as_u16());
    probe.content_type_state = classify_content_type(response.headers().get(CONTENT_TYPE));
    if response.status().is_redirection() {
        probe.request_ms = elapsed_ms(request_started);
        probe.fail(
            PublishedIcsProbeStatus::Unavailable,
            PublishedIcsStopReason::RedirectBlocked,
            "The endpoint requested a redirect. Redirects remain blocked for the secret publication path.",
        );
        return probe;
    }
    if !response.status().is_success() {
        probe.request_ms = elapsed_ms(request_started);
        probe.fail(
            PublishedIcsProbeStatus::Unavailable,
            PublishedIcsStopReason::HttpStatus,
            "The endpoint returned a non-success HTTP status. The response body was not read.",
        );
        return probe;
    }
    if response
        .content_length()
        .is_some_and(|length| length > MAX_RESPONSE_BYTES as u64)
    {
        probe.request_ms = elapsed_ms(request_started);
        probe.fail(
            PublishedIcsProbeStatus::TooLarge,
            PublishedIcsStopReason::DeclaredBodyLimit,
            "The declared response size exceeds the fixed body limit.",
        );
        return probe;
    }

    let initial_capacity = response
        .content_length()
        .unwrap_or(0)
        .min(MAX_RESPONSE_BYTES as u64) as usize;
    let mut body = Vec::with_capacity(initial_capacity);
    loop {
        match response.chunk().await {
            Ok(Some(chunk)) => {
                if body.len().saturating_add(chunk.len()) > MAX_RESPONSE_BYTES {
                    body.fill(0);
                    probe.request_ms = elapsed_ms(request_started);
                    probe.fail(
                        PublishedIcsProbeStatus::TooLarge,
                        PublishedIcsStopReason::BodyLimit,
                        "The streamed response exceeded the fixed body limit and was discarded.",
                    );
                    return probe;
                }
                body.extend_from_slice(&chunk);
            }
            Ok(None) => break,
            Err(error) => {
                body.fill(0);
                probe.request_ms = elapsed_ms(request_started);
                if error.is_timeout() {
                    probe.fail(
                        PublishedIcsProbeStatus::Timeout,
                        PublishedIcsStopReason::RequestTimeout,
                        "The published calendar body exceeded the fixed total timeout.",
                    );
                } else {
                    probe.fail(
                        PublishedIcsProbeStatus::Unavailable,
                        PublishedIcsStopReason::BodyRead,
                        "The published calendar body could not be read. Request details are suppressed.",
                    );
                }
                return probe;
            }
        }
    }
    probe.request_ms = elapsed_ms(request_started);
    probe.response_bytes = body.len();

    if looks_like_html(&body) {
        body.fill(0);
        probe.fail(
            PublishedIcsProbeStatus::Unavailable,
            PublishedIcsStopReason::HtmlResponse,
            "The response looked like HTML rather than an iCalendar document and was discarded.",
        );
        return probe;
    }

    let parse_started = Instant::now();
    let structure = match scan_ics_structure(&body, parse_started) {
        Ok(structure) => structure,
        Err(failure) => {
            probe.parse_ms = elapsed_ms(parse_started);
            body.fill(0);
            probe.fail(failure.status, failure.reason, failure.diagnostic);
            return probe;
        }
    };
    if structure.calendar_count != 1 {
        probe.parse_ms = elapsed_ms(parse_started);
        body.fill(0);
        probe.fail(
            PublishedIcsProbeStatus::Unavailable,
            PublishedIcsStopReason::MultipleCalendars,
            "The response did not contain exactly one balanced VCALENDAR source.",
        );
        return probe;
    }

    let viewer_timezone = match iana_time_zone::get_timezone()
        .ok()
        .and_then(|timezone| timezone.parse::<chrono_tz::Tz>().ok())
    {
        Some(timezone) => timezone,
        None => {
            probe.parse_ms = elapsed_ms(parse_started);
            body.fill(0);
            probe.fail(
                PublishedIcsProbeStatus::Unavailable,
                PublishedIcsStopReason::UnsupportedTimezone,
                "The current Windows timezone could not be mapped for date-only all-day events.",
            );
            return probe;
        }
    };
    let semantic = semantics::extract_current_or_next(
        &body,
        chrono::Utc::now(),
        viewer_timezone,
        parse_started,
    );
    probe.parse_ms = elapsed_ms(parse_started);
    body.fill(0);
    let semantic = match semantic {
        Ok(semantic) => semantic,
        Err(failure) => {
            use semantics::SemanticFailureReason;
            let (status, reason) = match failure.reason {
                SemanticFailureReason::MalformedEvent => (
                    PublishedIcsProbeStatus::Unavailable,
                    PublishedIcsStopReason::MalformedEvent,
                ),
                SemanticFailureReason::UnsupportedTimezone => (
                    PublishedIcsProbeStatus::Unavailable,
                    PublishedIcsStopReason::UnsupportedTimezone,
                ),
                SemanticFailureReason::AmbiguousTime => (
                    PublishedIcsProbeStatus::Unavailable,
                    PublishedIcsStopReason::AmbiguousTime,
                ),
                SemanticFailureReason::UnsupportedRecurrence => (
                    PublishedIcsProbeStatus::Unavailable,
                    PublishedIcsStopReason::UnsupportedRecurrence,
                ),
                SemanticFailureReason::RecurrenceLimit => (
                    PublishedIcsProbeStatus::TooLarge,
                    PublishedIcsStopReason::RecurrenceLimit,
                ),
                SemanticFailureReason::ParseTime => (
                    PublishedIcsProbeStatus::Timeout,
                    PublishedIcsStopReason::ParseTime,
                ),
                SemanticFailureReason::NoEligibleEvent => (
                    PublishedIcsProbeStatus::Unavailable,
                    PublishedIcsStopReason::NoEligibleEvent,
                ),
            };
            probe.fail(status, reason, failure.diagnostic);
            return probe;
        }
    };

    probe.status = PublishedIcsProbeStatus::Observed;
    probe.semantic_extraction_allowed = true;
    probe.eligible_candidate_count = semantic.eligible_candidate_count;
    probe.active_candidate_count = semantic.active_candidate_count;
    probe.expanded_occurrence_count = semantic.expanded_occurrence_count;
    probe.private_title_redacted = semantic.private_title_redacted;
    probe.selection = Some(semantic.selection);
    probe.diagnostics.push(
        "One fresh active-or-next selection was produced from one user-confirmed title-capable published calendar.".to_owned(),
    );
    probe.diagnostics.push(
        "Location, account, attendees, organizer, body, UID, raw calendar data, and meeting URLs were discarded and did not cross IPC.".to_owned(),
    );
    probe
}

fn validate_published_url(
    input: &str,
) -> Result<ValidatedPublishedUrl, (PublishedIcsStopReason, &'static str)> {
    let trimmed = input.trim();
    if trimmed.is_empty() || trimmed.len() > MAX_URL_BYTES {
        return Err((
            PublishedIcsStopReason::InvalidUrl,
            "Enter one bounded Microsoft published-calendar URL.",
        ));
    }

    let webcal_normalized_to_https = trimmed
        .get(..9)
        .is_some_and(|prefix| prefix.eq_ignore_ascii_case("webcal://"));
    let normalized;
    let parse_input = if webcal_normalized_to_https {
        normalized = format!("https://{}", &trimmed[9..]);
        normalized.as_str()
    } else {
        trimmed
    };

    let url = Url::parse(parse_input).map_err(|_| {
        (
            PublishedIcsStopReason::InvalidUrl,
            "The value is not a valid URL. The rejected value is not returned.",
        )
    })?;

    if url.scheme() != "https"
        || !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
        || url.port().is_some_and(|port| port != 443)
    {
        return Err((
            PublishedIcsStopReason::DisallowedSource,
            "Only a credential-free HTTPS Microsoft publication URL without query or fragment data is accepted.",
        ));
    }

    let allowed_host = matches!(
        url.host_str(),
        Some("outlook.office365.com") | Some("outlook.office.com")
    );
    let path = url.path();
    let mut path_parts = path.split('/').filter(|part| !part.is_empty());
    let path_part_count = path_parts.clone().count();
    let last_path_part = path_parts.next_back();
    let allowed_path = path
        .get(..14)
        .is_some_and(|prefix| prefix.eq_ignore_ascii_case("/owa/calendar/"))
        && path_part_count >= 5
        && last_path_part.is_some_and(|part| part.eq_ignore_ascii_case("calendar.ics"));

    if !allowed_host || !allowed_path {
        return Err((
            PublishedIcsStopReason::DisallowedSource,
            "Only the bounded Microsoft 365 Outlook published-calendar host and path shape are accepted.",
        ));
    }

    Ok(ValidatedPublishedUrl {
        url,
        webcal_normalized_to_https,
    })
}

fn classify_content_type(
    value: Option<&reqwest::header::HeaderValue>,
) -> PublishedIcsContentTypeState {
    match value.and_then(|value| value.to_str().ok()) {
        Some(value) if value.to_ascii_lowercase().starts_with("text/calendar") => {
            PublishedIcsContentTypeState::Calendar
        }
        Some(_) => PublishedIcsContentTypeState::Other,
        None => PublishedIcsContentTypeState::Missing,
    }
}

fn looks_like_html(body: &[u8]) -> bool {
    let trimmed = body
        .iter()
        .copied()
        .skip_while(|byte| byte.is_ascii_whitespace())
        .take(15)
        .collect::<Vec<_>>();
    let prefix = String::from_utf8_lossy(&trimmed).to_ascii_lowercase();
    prefix.starts_with("<!doctype html") || prefix.starts_with("<html")
}

fn scan_ics_structure(body: &[u8], started: Instant) -> Result<IcsStructure, ScanFailure> {
    let text = std::str::from_utf8(body).map_err(|_| ScanFailure {
        status: PublishedIcsProbeStatus::Unavailable,
        reason: PublishedIcsStopReason::InvalidUtf8,
        diagnostic: "The response was not valid UTF-8 iCalendar data and was discarded.",
    })?;

    let mut structure = IcsStructure::default();
    let mut in_event = false;
    let mut current_event_has_start = false;
    let mut current_event_has_end_or_duration = false;

    for raw_line in text.split('\n') {
        structure.physical_line_count = structure.physical_line_count.saturating_add(1);
        if structure.physical_line_count > MAX_PHYSICAL_LINES {
            return Err(ScanFailure {
                status: PublishedIcsProbeStatus::TooLarge,
                reason: PublishedIcsStopReason::LineLimit,
                diagnostic: "The iCalendar document exceeded the fixed physical-line limit.",
            });
        }
        if structure.physical_line_count % 1_024 == 0 && started.elapsed() > MAX_PARSE_TIME {
            return Err(ScanFailure {
                status: PublishedIcsProbeStatus::Timeout,
                reason: PublishedIcsStopReason::ParseTime,
                diagnostic:
                    "The sanitized iCalendar structure scan exceeded its fixed parse-time limit.",
            });
        }

        let line = raw_line.strip_suffix('\r').unwrap_or(raw_line);
        if line.len() > MAX_LINE_BYTES {
            return Err(ScanFailure {
                status: PublishedIcsProbeStatus::TooLarge,
                reason: PublishedIcsStopReason::LineLimit,
                diagnostic: "One iCalendar content line exceeded the fixed line-size limit.",
            });
        }
        if line.starts_with([' ', '\t']) {
            structure.folded_line_count = structure.folded_line_count.saturating_add(1);
            continue;
        }

        let Some(colon_index) = line.find(':') else {
            continue;
        };
        let property_head = &line[..colon_index];
        let property_value = &line[colon_index + 1..];
        let property_name = property_head.split(';').next().unwrap_or(property_head);

        structure.property_count = structure.property_count.saturating_add(1);
        if structure.property_count > MAX_PROPERTIES {
            return Err(ScanFailure {
                status: PublishedIcsProbeStatus::TooLarge,
                reason: PublishedIcsStopReason::PropertyLimit,
                diagnostic: "The iCalendar document exceeded the fixed property-count limit.",
            });
        }

        if property_name.eq_ignore_ascii_case("BEGIN") {
            if property_value.eq_ignore_ascii_case("VCALENDAR") {
                structure.calendar_count = structure.calendar_count.saturating_add(1);
            } else if property_value.eq_ignore_ascii_case("VEVENT") {
                if in_event {
                    return malformed_calendar();
                }
                in_event = true;
                current_event_has_start = false;
                current_event_has_end_or_duration = false;
                structure.event_count = structure.event_count.saturating_add(1);
                if structure.event_count > MAX_EVENTS {
                    return Err(ScanFailure {
                        status: PublishedIcsProbeStatus::TooLarge,
                        reason: PublishedIcsStopReason::EventLimit,
                        diagnostic: "The iCalendar document exceeded the fixed event-count limit.",
                    });
                }
            } else if property_value.eq_ignore_ascii_case("VTIMEZONE") {
                structure.timezone_definition_count =
                    structure.timezone_definition_count.saturating_add(1);
            }
            continue;
        }

        if property_name.eq_ignore_ascii_case("END") {
            if property_value.eq_ignore_ascii_case("VCALENDAR") {
                structure.calendar_end_count = structure.calendar_end_count.saturating_add(1);
            } else if property_value.eq_ignore_ascii_case("VEVENT") {
                if !in_event {
                    return malformed_calendar();
                }
                structure.event_end_count = structure.event_end_count.saturating_add(1);
                if current_event_has_start {
                    structure.events_with_start_count =
                        structure.events_with_start_count.saturating_add(1);
                }
                if current_event_has_end_or_duration {
                    structure.events_with_end_or_duration_count = structure
                        .events_with_end_or_duration_count
                        .saturating_add(1);
                }
                in_event = false;
            }
            continue;
        }

        if !in_event {
            continue;
        }

        if property_name.eq_ignore_ascii_case("DTSTART") {
            current_event_has_start = true;
        } else if property_name.eq_ignore_ascii_case("DTEND")
            || property_name.eq_ignore_ascii_case("DURATION")
        {
            current_event_has_end_or_duration = true;
        } else if property_name.eq_ignore_ascii_case("RRULE") {
            structure.recurrence_rule_count = structure.recurrence_rule_count.saturating_add(1);
        } else if property_name.eq_ignore_ascii_case("RDATE") {
            structure.recurrence_date_count = structure.recurrence_date_count.saturating_add(1);
        } else if property_name.eq_ignore_ascii_case("EXDATE") {
            structure.recurrence_exception_date_count =
                structure.recurrence_exception_date_count.saturating_add(1);
        } else if property_name.eq_ignore_ascii_case("RECURRENCE-ID") {
            structure.recurrence_override_count =
                structure.recurrence_override_count.saturating_add(1);
        }

        if property_head
            .split(';')
            .skip(1)
            .filter_map(|parameter| parameter.split_once('='))
            .any(|(name, _)| name.eq_ignore_ascii_case("TZID"))
        {
            structure.timezone_reference_count =
                structure.timezone_reference_count.saturating_add(1);
        }
    }

    if in_event
        || structure.calendar_count == 0
        || structure.calendar_count != structure.calendar_end_count
        || structure.event_count != structure.event_end_count
    {
        return malformed_calendar();
    }

    Ok(structure)
}

fn malformed_calendar<T>() -> Result<T, ScanFailure> {
    Err(ScanFailure {
        status: PublishedIcsProbeStatus::Unavailable,
        reason: PublishedIcsStopReason::MalformedCalendar,
        diagnostic: "The response did not contain a balanced iCalendar component structure.",
    })
}

fn copy_structure(probe: &mut PublishedIcsStructureProbe, structure: IcsStructure) {
    probe.physical_line_count = structure.physical_line_count;
    probe.folded_line_count = structure.folded_line_count;
    probe.property_count = structure.property_count;
    probe.calendar_count = structure.calendar_count;
    probe.event_count = structure.event_count;
    probe.events_with_start_count = structure.events_with_start_count;
    probe.events_with_end_or_duration_count = structure.events_with_end_or_duration_count;
    probe.recurrence_rule_count = structure.recurrence_rule_count;
    probe.recurrence_date_count = structure.recurrence_date_count;
    probe.recurrence_exception_date_count = structure.recurrence_exception_date_count;
    probe.recurrence_override_count = structure.recurrence_override_count;
    probe.timezone_definition_count = structure.timezone_definition_count;
    probe.timezone_reference_count = structure.timezone_reference_count;
}

fn elapsed_ms(started: Instant) -> u64 {
    started.elapsed().as_millis().min(u128::from(u64::MAX)) as u64
}

fn now_unix_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
        .min(u128::from(u64::MAX)) as u64
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_bounded_work_calendar_publication_urls() {
        let https = validate_published_url(
            "https://outlook.office365.com/owa/calendar/source/opaque/calendar.ics",
        )
        .expect("https publication URL should be accepted");
        assert!(!https.webcal_normalized_to_https);

        let webcal = validate_published_url(
            "webcal://outlook.office365.com/owa/calendar/source/opaque/calendar.ics",
        )
        .expect("webcal publication URL should be normalized");
        assert!(webcal.webcal_normalized_to_https);
        assert_eq!(webcal.url.scheme(), "https");
    }

    #[test]
    fn rejects_unbounded_or_untrusted_urls() {
        for value in [
            "http://outlook.office365.com/owa/calendar/source/opaque/calendar.ics",
            "https://example.invalid/owa/calendar/source/opaque/calendar.ics",
            "https://outlook.office365.com/mail/inbox",
            "https://outlook.office365.com/owa/calendar/source/opaque/calendar.ics?secret=1",
            "https://user:pass@outlook.office365.com/owa/calendar/source/opaque/calendar.ics",
        ] {
            assert!(validate_published_url(value).is_err(), "accepted {value}");
        }
    }

    #[test]
    fn scans_structure_without_returning_property_values() {
        let body = b"BEGIN:VCALENDAR\r\nBEGIN:VTIMEZONE\r\nEND:VTIMEZONE\r\nBEGIN:VEVENT\r\nDTSTART;TZID=Zone:20260811T090000\r\nDTEND;TZID=Zone:20260811T100000\r\nRRULE:FREQ=WEEKLY\r\nEXDATE:20260818T090000\r\nRECURRENCE-ID:20260825T090000\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n";
        let structure = scan_ics_structure(body, Instant::now()).expect("valid structure");

        assert_eq!(structure.calendar_count, 1);
        assert_eq!(structure.event_count, 1);
        assert_eq!(structure.events_with_start_count, 1);
        assert_eq!(structure.events_with_end_or_duration_count, 1);
        assert_eq!(structure.recurrence_rule_count, 1);
        assert_eq!(structure.recurrence_exception_date_count, 1);
        assert_eq!(structure.recurrence_override_count, 1);
        assert_eq!(structure.timezone_definition_count, 1);
        assert_eq!(structure.timezone_reference_count, 2);
    }

    #[test]
    fn rejects_unbalanced_calendar_structure() {
        let body =
            b"BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nDTSTART:20260811T090000Z\r\nEND:VCALENDAR\r\n";
        let failure = scan_ics_structure(body, Instant::now()).expect_err("must reject");
        assert!(matches!(
            failure.reason,
            PublishedIcsStopReason::MalformedCalendar
        ));
    }
}
