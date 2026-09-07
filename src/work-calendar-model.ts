export type WorkCalendarStatus =
  | "observed"
  | "notConfigured"
  | "unavailable"
  | "busy"
  | "error";

export interface WorkCalendarSelection {
  subject: string;
  start: string;
  end: string;
  allDay: boolean;
  classification: "active" | "upcoming";
  meetingLinkPresent: boolean | null;
  meetingProvider: "teams" | "zoom" | null;
  joinToken: string | null;
  eventToken: string | null;
  eventWorkspace: WorkCalendarEventWorkspaceSummary | null;
}

export interface WorkCalendarDaySelection {
  subject: string;
  start: string;
  end: string;
  allDay: boolean;
  cancelled: boolean;
  recurring: boolean;
  eventToken: string | null;
  eventWorkspace: WorkCalendarEventWorkspaceSummary | null;
}

export interface WorkCalendarEventWorkspaceSummary {
  projectId: string | null;
  projectName: string | null;
  notesPresent: boolean;
  linkUrlPresent: boolean;
  linkUrl: string | null;
}

/**
 * Present while a calendar source change is unresolved.
 *
 * Workspace keys derive from the saved publication URL, so a different URL
 * disconnects every existing calendar association. The records are preserved,
 * not deleted — only their association with displayed events breaks — and
 * carrying them over requires an explicit decision, because a different URL may
 * legitimately be a different calendar.
 */
export interface WorkCalendarSourceChange {
  previousAssociationCount: number;
}

export interface WorkCalendarSnapshot {
  status: WorkCalendarStatus;
  configured: boolean;
  storageAvailable: boolean;
  sourceIdentityState: "userSavedSinglePublishedCalendarTitleCapable";
  capturedAtUnixMs: number;
  selection: WorkCalendarSelection | null;
  overlappingSelections: WorkCalendarSelection[];
  nextSelection: WorkCalendarSelection | null;
  daySelections: WorkCalendarDaySelection[];
  stopReason: string | null;
  requestMs: number;
  parseMs: number;
  diagnostics: string[];
  /**
   * Viewer-local date the day list describes, `YYYY-MM-DD`, absent when the
   * feed was not read.
   *
   * An empty `daySelections` **with** a `viewerDay` is a verified empty day;
   * an empty list **without** one means the calendar could not be read. Age
   * cannot substitute: a snapshot taken at 23:59 is seconds old at 00:00 and
   * describes the wrong day.
   */
  viewerDay?: string;
  /**
   * False when the day list was truncated for payload bounds, so it cannot
   * support a lesson total, an empty day, or an end-of-day claim.
   */
  daySelectionsComplete: boolean;
  sourceChange?: WorkCalendarSourceChange;
  /**
   * Saved associations matching no series in the current feed.
   *
   * A Google "this and following" edit splits a series and gives the remainder
   * a new UID, silently detaching that subject's materials, notes and homework.
   * Absent when the feed has not been read, so it never asserts zero on an
   * unavailable calendar.
   */
  unmatchedAssociationCount?: number;
}

export interface WorkCalendarDisplay {
  selection: WorkCalendarSelection | null;
  selectionKey: string | null;
  companion: WorkCalendarSelection | null;
  companionKey: string | null;
  hasOverlap: boolean;
}

export type WorkCalendarRetryNotice = {
  state: "Calendar sync delayed";
  detail: string;
};

function workCalendarFailureLabel(stopReason: string | null) {
  switch (stopReason) {
    case "requestTimeout":
    case "commandDeadline":
      return "The calendar source took too long to respond";
    case "requestFailed":
    case "bodyRead":
      return "The calendar source could not be reached";
    case "httpStatus":
    case "htmlResponse":
    case "redirectBlocked":
      return "The calendar source returned an unavailable response";
    case "parseTime":
    case "malformedCalendar":
    case "malformedEvent":
    case "invalidUtf8":
    case "unsupportedTimezone":
    case "ambiguousTime":
    case "unsupportedRecurrence":
    case "recurrenceLimit":
      return "The calendar source could not be read safely";
    case "noEligibleEvent":
      return "The calendar source did not contain a current or next event";
    default:
      return "The calendar refresh did not complete";
  }
}

function workCalendarRefreshAge(lastSuccessfulAtUnixMs: number | null, nowMs: number) {
  if (lastSuccessfulAtUnixMs === null || nowMs < lastSuccessfulAtUnixMs) {
    return "Last successful refresh time is unavailable";
  }
  const ageMinutes = Math.floor((nowMs - lastSuccessfulAtUnixMs) / 60_000);
  if (ageMinutes < 1) return "Last successful refresh was less than a minute ago";
  if (ageMinutes === 1) return "Last successful refresh was 1 minute ago";
  return `Last successful refresh was ${ageMinutes} minutes ago`;
}

/**
 * A single bounded miss is retried quietly. Repeated real failures get a
 * safe, actionable status without exposing the private published URL.
 */
export function workCalendarRetryNotice({
  consecutiveFailures,
  lastSuccessfulAtUnixMs,
  stopReason,
  nowMs = Date.now(),
}: {
  consecutiveFailures: number;
  lastSuccessfulAtUnixMs: number | null;
  stopReason: string | null;
  nowMs?: number;
}): WorkCalendarRetryNotice | null {
  if (consecutiveFailures < 2) return null;
  return {
    state: "Calendar sync delayed",
    detail: `${workCalendarFailureLabel(stopReason)}. ${workCalendarRefreshAge(lastSuccessfulAtUnixMs, nowMs)}. Retrying automatically.`,
  };
}

export function retainWorkCalendarSnapshot(
  current: WorkCalendarSnapshot | null,
  refreshed: WorkCalendarSnapshot | null,
  nowMs = Date.now(),
) {
  if (
    refreshed?.status === "observed" ||
    refreshed?.status === "notConfigured"
  ) {
    return refreshed;
  }
  if (current?.status !== "observed" || !current.selection) {
    return refreshed;
  }
  const currentEnd = Date.parse(current.selection.end);
  return Number.isFinite(currentEnd) && currentEnd > nowMs
    ? current
    : refreshed;
}

export function workCalendarSelectionKey(
  selection: WorkCalendarSelection,
  slot: string,
) {
  return `${slot}|${selection.start}|${selection.end}|${selection.subject}`;
}

export function workCalendarOccupiedMinutes(
  selections: readonly WorkCalendarDaySelection[],
  dayStart: Date,
  dayEnd: Date,
) {
  const startBoundary = dayStart.getTime();
  const endBoundary = dayEnd.getTime();
  const intervals = selections
    .filter((selection) => !selection.allDay && !selection.cancelled)
    .map((selection) => [
      Math.max(startBoundary, Date.parse(selection.start)),
      Math.min(endBoundary, Date.parse(selection.end)),
    ] as const)
    .filter(
      ([start, end]) =>
        Number.isFinite(start) && Number.isFinite(end) && end > start,
    )
    .sort(([firstStart], [secondStart]) => firstStart - secondStart);

  let occupiedMs = 0;
  let mergedStart = 0;
  let mergedEnd = 0;
  for (const [start, end] of intervals) {
    if (mergedEnd === 0) {
      mergedStart = start;
      mergedEnd = end;
    } else if (start <= mergedEnd) {
      mergedEnd = Math.max(mergedEnd, end);
    } else {
      occupiedMs += mergedEnd - mergedStart;
      mergedStart = start;
      mergedEnd = end;
    }
  }
  if (mergedEnd > mergedStart) {
    occupiedMs += mergedEnd - mergedStart;
  }
  return Math.round(occupiedMs / 60_000);
}

export function workCalendarJoinLabel(opened: boolean) {
  return opened ? "Rejoin" : "Join";
}

export const WORK_CALENDAR_MEETING_ALERT_LEAD_MS = 60_000;

export interface WorkCalendarMeetingAlert {
  key: string;
  startMs: number;
  delayMs: number;
}

export function nextWorkCalendarMeetingAlert(
  snapshot: WorkCalendarSnapshot | null,
  nowMs = Date.now(),
): WorkCalendarMeetingAlert | null {
  if (snapshot?.status !== "observed") {
    return null;
  }

  const upcoming = [
    snapshot.selection,
    ...snapshot.overlappingSelections,
    snapshot.nextSelection,
  ]
    .filter(
      (selection): selection is WorkCalendarSelection =>
        selection !== null &&
        selection.classification === "upcoming" &&
        !selection.allDay,
    )
    .map((selection) => Date.parse(selection.start))
    .filter((startMs) => Number.isFinite(startMs) && startMs >= nowMs)
    .sort((left, right) => left - right);

  const startMs = upcoming[0];
  if (startMs === undefined) {
    return null;
  }

  return {
    key: new Date(startMs).toISOString(),
    startMs,
    delayMs: Math.max(
      0,
      startMs - WORK_CALENDAR_MEETING_ALERT_LEAD_MS - nowMs,
    ),
  };
}

export function selectWorkCalendarDisplay(
  snapshot: WorkCalendarSnapshot | null,
  finishedEventKeys: ReadonlySet<string>,
  acknowledgedActiveEvent: string | null,
): WorkCalendarDisplay {
  if (snapshot?.status !== "observed" || !snapshot.selection) {
    return {
      selection: null,
      selectionKey: null,
      companion: null,
      companionKey: null,
      hasOverlap: false,
    };
  }

  const primaryEntry = {
    selection: snapshot.selection,
    key: workCalendarSelectionKey(snapshot.selection, "primary"),
  };
  const overlappingEntries = snapshot.overlappingSelections.map(
    (selection, index) => ({
      selection,
      key: workCalendarSelectionKey(selection, `overlap-${index}`),
    }),
  );
  const parallelEntries = [primaryEntry, ...overlappingEntries];
  const activeSelections = parallelEntries.filter(
    ({ selection, key }) =>
      selection.classification === "active" && !finishedEventKeys.has(key),
  );

  if (activeSelections.length > 0) {
    const primary = activeSelections[0];
    const overlapping = activeSelections[1] ?? null;
    const upcoming = snapshot.nextSelection
      ? {
          selection: snapshot.nextSelection,
          key: workCalendarSelectionKey(snapshot.nextSelection, "next"),
        }
      : null;
    const companionEntry =
      overlapping ??
      (acknowledgedActiveEvent === primary.key ? upcoming : null);
    return {
      selection: primary.selection,
      selectionKey: primary.key,
      companion: companionEntry?.selection ?? null,
      companionKey: companionEntry?.key ?? null,
      hasOverlap: overlapping !== null,
    };
  }

  if (snapshot.selection.classification === "active") {
    return {
      selection: snapshot.nextSelection,
      selectionKey: snapshot.nextSelection
        ? workCalendarSelectionKey(snapshot.nextSelection, "next")
        : null,
      companion: null,
      companionKey: null,
      hasOverlap: false,
    };
  }

  const upcomingSelections = parallelEntries.filter(
    ({ selection, key }) =>
      selection.classification === "upcoming" && !finishedEventKeys.has(key),
  );
  if (upcomingSelections.length > 0) {
    const primary = upcomingSelections[0];
    const companion = upcomingSelections[1] ?? null;
    return {
      selection: primary.selection,
      selectionKey: primary.key,
      companion: companion?.selection ?? null,
      companionKey: companion?.key ?? null,
      hasOverlap: companion !== null,
    };
  }

  return {
    selection: null,
    selectionKey: null,
    companion: null,
    companionKey: null,
    hasOverlap: false,
  };
}

export interface WorkCalendarConfiguration {
  configured: boolean;
  storageAvailable: boolean;
  sourceIdentityState: "userSavedSinglePublishedCalendarTitleCapable";
  diagnostics: string[];
}

export const WORK_CALENDAR_POLL_INTERVAL_MS = 120_000;
export const WORK_CALENDAR_RETRY_INTERVAL_MS = 30_000;

export function nextWorkCalendarRefreshDelay(
  snapshot: WorkCalendarSnapshot | null,
  nowMs = Date.now(),
) {
  if (snapshot?.status !== "observed" || !snapshot.selection) {
    return WORK_CALENDAR_RETRY_INTERVAL_MS;
  }

  const transitionAt = Date.parse(
    snapshot.selection.classification === "active"
      ? snapshot.selection.end
      : snapshot.selection.start,
  );
  if (!Number.isFinite(transitionAt)) {
    return WORK_CALENDAR_RETRY_INTERVAL_MS;
  }

  const untilTransition = Math.max(5_000, transitionAt - nowMs + 1_000);
  return Math.min(WORK_CALENDAR_POLL_INTERVAL_MS, untilTransition);
}
