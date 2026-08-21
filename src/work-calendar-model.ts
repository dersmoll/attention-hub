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
  joinToken: string | null;
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
  stopReason: string | null;
  requestMs: number;
  parseMs: number;
  diagnostics: string[];
}

export interface WorkCalendarDisplay {
  selection: WorkCalendarSelection | null;
  selectionKey: string | null;
  companion: WorkCalendarSelection | null;
  companionKey: string | null;
  hasOverlap: boolean;
}

export function workCalendarSelectionKey(
  selection: WorkCalendarSelection,
  slot: string,
) {
  return `${slot}|${selection.start}|${selection.end}|${selection.subject}`;
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
