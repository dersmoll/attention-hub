export type WorkCalendarStatus =
  | "observed"
  | "notConfigured"
  | "unavailable"
  | "busy"
  | "error";

export interface WorkCalendarSelection {
  occurrenceId: string;
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
  occurrenceId: string;
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
  listId: string | null;
  listName: string | null;
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
  /**
   * True when the pasted source verified but was **not saved**, because it
   * replaces a different one and needs an explicit decision first.
   */
  confirmationRequired: boolean;
}

export type WorkCalendarSaveResult =
  | {
      status: "carryOverApplied";
      carriedAssociationCount: number;
    }
  | {
      status:
        | "carryOverFailed"
        | "credentialReadFailed"
        | "credentialWriteFailed";
      carriedAssociationCount?: never;
    };

export interface WorkCalendarSaveResultMessage {
  tone: "success" | "error";
  message: string;
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
  saveResult?: WorkCalendarSaveResult;
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

/** Safe, actionable Calendar-page copy for structured native save outcomes. */
export function workCalendarSaveResultMessage(
  snapshot: WorkCalendarSnapshot,
): WorkCalendarSaveResultMessage | null {
  const result = snapshot.saveResult;
  if (!result) return null;

  switch (result.status) {
    case "carryOverApplied": {
      const count = result.carriedAssociationCount;
      if (count === 0) {
        return {
          tone: "success",
          message:
            "0 calendar associations were carried over. The new source is saved, and previous associations were preserved.",
        };
      }
      return {
        tone: "success",
        message: `Carried ${count} calendar ${count === 1 ? "association" : "associations"} onto the new source. Previous associations were preserved.`,
      };
    }
    case "carryOverFailed":
      return {
        tone: "error",
        message:
          "The new calendar source was saved, but its associations could not be carried over. Previous associations were preserved.",
      };
    case "credentialReadFailed":
      return {
        tone: "error",
        message:
          "Windows Credential Manager could not read the existing calendar source. The pasted link was not saved, the existing source is unchanged, and the pasted link is still available to retry.",
      };
    case "credentialWriteFailed":
      return {
        tone: "error",
        message:
          "The calendar verified, but Windows Credential Manager could not save it. The pasted link is still available to retry.",
      };
  }
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

export const WORK_CALENDAR_RETRY_NOTICE_FAILURES = 3;
export const WORK_CALENDAR_RETRY_NOTICE_STALE_MS = 10 * 60 * 1_000;

function workCalendarFailureLabel(stopReason: string | null) {
  switch (stopReason) {
    case "requestTimeout":
      return "The calendar source took too long to download";
    case "commandDeadline":
      return "The calendar refresh exceeded its safety deadline";
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
 * Transient misses are retried quietly. When a previous success exists, its
 * event remains useful and the warning waits until that result is genuinely
 * stale. A startup with no successful result may warn after the same bounded
 * failure count because there is no usable calendar state to protect.
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
  if (consecutiveFailures < WORK_CALENDAR_RETRY_NOTICE_FAILURES) return null;
  if (
    lastSuccessfulAtUnixMs !== null &&
    (nowMs < lastSuccessfulAtUnixMs ||
      nowMs - lastSuccessfulAtUnixMs < WORK_CALENDAR_RETRY_NOTICE_STALE_MS)
  ) {
    return null;
  }
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
  if (current?.status !== "observed") {
    return refreshed;
  }
  const hasUsableCachedSelection = [
    current.selection,
    ...current.overlappingSelections,
    current.nextSelection,
  ].some((selection) => {
    if (!selection) return false;
    const endMs = Date.parse(selection.end);
    return Number.isFinite(endMs) && endMs > nowMs;
  });
  return hasUsableCachedSelection ? current : refreshed;
}

export function workCalendarSelectionKey(
  selection: WorkCalendarSelection,
  slot: string,
) {
  return `${slot}|${selection.start}|${selection.end}|${selection.subject}`;
}

function selectionForCurrentTime(
  selection: WorkCalendarSelection,
  nowMs: number | undefined,
): WorkCalendarSelection | null {
  if (nowMs === undefined) return selection;
  const startMs = Date.parse(selection.start);
  const endMs = Date.parse(selection.end);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= nowMs) {
    return null;
  }
  const classification: WorkCalendarSelection["classification"] =
    startMs <= nowMs ? "active" : "upcoming";
  return classification === selection.classification
    ? selection
    : { ...selection, classification };
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
  skippedOccurrenceIds: ReadonlySet<string> = new Set(),
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
        !selection.allDay &&
        !skippedOccurrenceIds.has(selection.occurrenceId),
    )
    .map((selection) => ({ occurrenceId: selection.occurrenceId, startMs: Date.parse(selection.start) }))
    .filter((entry) => Number.isFinite(entry.startMs) && entry.startMs >= nowMs)
    .sort((left, right) => left.startMs - right.startMs);

  const upcomingEvent = upcoming[0];
  if (!upcomingEvent) {
    return null;
  }
  const { occurrenceId, startMs } = upcomingEvent;

  return {
    key: occurrenceId || new Date(startMs).toISOString(),
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
  skippedOccurrenceIds: ReadonlySet<string> = new Set(),
  nowMs?: number,
): WorkCalendarDisplay {
  if (snapshot?.status !== "observed") {
    return {
      selection: null,
      selectionKey: null,
      companion: null,
      companionKey: null,
      hasOverlap: false,
    };
  }

  const currentPrimary = snapshot.selection
    ? selectionForCurrentTime(snapshot.selection, nowMs)
    : null;
  const primaryEntry = currentPrimary
    ? {
        selection: currentPrimary,
        key: workCalendarSelectionKey(currentPrimary, "primary"),
      }
    : null;
  const overlappingEntries = snapshot.overlappingSelections
    .map((selection, index) => {
      const currentSelection = selectionForCurrentTime(selection, nowMs);
      return currentSelection
        ? {
            selection: currentSelection,
            key: workCalendarSelectionKey(currentSelection, `overlap-${index}`),
          }
        : null;
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);
  const currentNextSelection = snapshot.nextSelection
    ? selectionForCurrentTime(snapshot.nextSelection, nowMs)
    : null;
  const parallelEntries = [primaryEntry, ...overlappingEntries].filter(
    (entry): entry is NonNullable<typeof entry> => entry !== null,
  );
  const activeSelections = parallelEntries.filter(
    ({ selection, key }) =>
      selection.classification === "active" && !finishedEventKeys.has(key),
  ).filter(
    ({ selection }) => !skippedOccurrenceIds.has(selection.occurrenceId),
  );

  if (activeSelections.length > 0) {
    const primary = activeSelections[0];
    const overlapping = activeSelections[1] ?? null;
    const upcoming = currentNextSelection && !skippedOccurrenceIds.has(currentNextSelection.occurrenceId)
      ? {
          selection: currentNextSelection,
          key: workCalendarSelectionKey(currentNextSelection, "next"),
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

  if (primaryEntry?.selection.classification === "active") {
    const nextSelection = currentNextSelection
      && !skippedOccurrenceIds.has(currentNextSelection.occurrenceId)
      ? currentNextSelection
      : null;
    return {
      selection: nextSelection,
      selectionKey: nextSelection
        ? workCalendarSelectionKey(nextSelection, "next")
        : null,
      companion: null,
      companionKey: null,
      hasOverlap: false,
    };
  }

  const upcomingSelections = parallelEntries.filter(
    ({ selection, key }) =>
      selection.classification === "upcoming" && !finishedEventKeys.has(key) && !skippedOccurrenceIds.has(selection.occurrenceId),
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

  if (currentNextSelection && !skippedOccurrenceIds.has(currentNextSelection.occurrenceId)) {
    return {
      selection: currentNextSelection,
      selectionKey: workCalendarSelectionKey(currentNextSelection, "next"),
      companion: null,
      companionKey: null,
      hasOverlap: false,
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

export function firstSkippedWorkCalendarSelection(
  snapshot: WorkCalendarSnapshot | null,
  skippedOccurrenceIds: ReadonlySet<string>,
) : WorkCalendarSelection | null {
  if (snapshot?.status !== "observed") return null;
  return [snapshot.selection, ...snapshot.overlappingSelections, snapshot.nextSelection]
    .find((selection) => selection !== null && skippedOccurrenceIds.has(selection.occurrenceId)) ?? null;
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
