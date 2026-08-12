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
}

export interface WorkCalendarSnapshot {
  status: WorkCalendarStatus;
  configured: boolean;
  storageAvailable: boolean;
  sourceIdentityState: "userSavedSinglePublishedCalendarTitleCapable";
  capturedAtUnixMs: number;
  selection: WorkCalendarSelection | null;
  nextSelection: WorkCalendarSelection | null;
  stopReason: string | null;
  requestMs: number;
  parseMs: number;
  diagnostics: string[];
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
