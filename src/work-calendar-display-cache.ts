import type {
  WorkCalendarDaySelection,
  WorkCalendarSelection,
  WorkCalendarSnapshot,
} from "./work-calendar-model";

const STORAGE_KEY = "attention-hub.work-calendar-display-cache.v1";
export const WORK_CALENDAR_DISPLAY_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1_000;

type StoredCalendarDisplay = {
  schemaVersion: 1;
  capturedAtUnixMs: number;
  viewerDay?: string;
  daySelectionsComplete: boolean;
  selection: WorkCalendarSelection | null;
  overlappingSelections: WorkCalendarSelection[];
  nextSelection: WorkCalendarSelection | null;
  daySelections: WorkCalendarDaySelection[];
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sanitizeSelection(value: unknown): WorkCalendarSelection | null {
  if (!isObject(value)) return null;
  const classification = value.classification;
  const meetingLinkPresent = value.meetingLinkPresent;
  const meetingProvider = value.meetingProvider;
  if (
    typeof value.occurrenceId !== "string" ||
    typeof value.subject !== "string" ||
    typeof value.start !== "string" ||
    typeof value.end !== "string" ||
    !Number.isFinite(Date.parse(value.start)) ||
    !Number.isFinite(Date.parse(value.end)) ||
    typeof value.allDay !== "boolean" ||
    (classification !== "active" && classification !== "upcoming") ||
    (meetingLinkPresent !== null && typeof meetingLinkPresent !== "boolean") ||
    (meetingProvider !== null && meetingProvider !== "teams" && meetingProvider !== "zoom")
  ) {
    return null;
  }
  return {
    occurrenceId: value.occurrenceId,
    subject: value.subject.slice(0, 512),
    start: value.start,
    end: value.end,
    allDay: value.allDay,
    classification,
    meetingLinkPresent,
    meetingProvider,
    joinToken: null,
    eventToken: null,
    eventWorkspace: null,
  };
}

function sanitizeDaySelection(value: unknown): WorkCalendarDaySelection | null {
  if (!isObject(value)) return null;
  if (
    typeof value.occurrenceId !== "string" ||
    typeof value.subject !== "string" ||
    typeof value.start !== "string" ||
    typeof value.end !== "string" ||
    !Number.isFinite(Date.parse(value.start)) ||
    !Number.isFinite(Date.parse(value.end)) ||
    typeof value.allDay !== "boolean" ||
    typeof value.cancelled !== "boolean" ||
    typeof value.recurring !== "boolean"
  ) {
    return null;
  }
  return {
    occurrenceId: value.occurrenceId,
    subject: value.subject.slice(0, 512),
    start: value.start,
    end: value.end,
    allDay: value.allDay,
    cancelled: value.cancelled,
    recurring: value.recurring,
    eventToken: null,
    eventWorkspace: null,
  };
}

function storedDisplay(snapshot: WorkCalendarSnapshot): StoredCalendarDisplay {
  return {
    schemaVersion: 1,
    capturedAtUnixMs: snapshot.capturedAtUnixMs,
    viewerDay: snapshot.viewerDay,
    daySelectionsComplete: snapshot.daySelectionsComplete,
    selection: snapshot.selection ? sanitizeSelection(snapshot.selection) : null,
    overlappingSelections: snapshot.overlappingSelections
      .map(sanitizeSelection)
      .filter((item): item is WorkCalendarSelection => item !== null)
      .slice(0, 8),
    nextSelection: snapshot.nextSelection
      ? sanitizeSelection(snapshot.nextSelection)
      : null,
    daySelections: snapshot.daySelections
      .map(sanitizeDaySelection)
      .filter((item): item is WorkCalendarDaySelection => item !== null)
      .slice(0, 24),
  };
}

export function writeWorkCalendarDisplayCache(snapshot: WorkCalendarSnapshot) {
  if (snapshot.status !== "observed") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(storedDisplay(snapshot)));
  } catch {
    // The live snapshot remains authoritative when storage is unavailable.
  }
}

export function clearWorkCalendarDisplayCache() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Removing the source still clears live state when storage is unavailable.
  }
}

export function readWorkCalendarDisplayCache(
  nowMs = Date.now(),
): WorkCalendarSnapshot | null {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as unknown;
    if (!isObject(value) || value.schemaVersion !== 1) return null;
    const capturedAtUnixMs = value.capturedAtUnixMs;
    if (typeof capturedAtUnixMs !== "number") return null;
    const age = nowMs - capturedAtUnixMs;
    if (!Number.isFinite(age) || age < -5 * 60_000 || age > WORK_CALENDAR_DISPLAY_CACHE_MAX_AGE_MS) {
      clearWorkCalendarDisplayCache();
      return null;
    }
    const selection = value.selection === null ? null : sanitizeSelection(value.selection);
    const nextSelection = value.nextSelection === null ? null : sanitizeSelection(value.nextSelection);
    if ((value.selection !== null && !selection) || (value.nextSelection !== null && !nextSelection)) {
      clearWorkCalendarDisplayCache();
      return null;
    }
    if (!Array.isArray(value.overlappingSelections) || !Array.isArray(value.daySelections)) {
      clearWorkCalendarDisplayCache();
      return null;
    }
    const overlappingSelections = value.overlappingSelections.map(sanitizeSelection);
    const daySelections = value.daySelections.map(sanitizeDaySelection);
    if (overlappingSelections.some((item) => item === null) || daySelections.some((item) => item === null)) {
      clearWorkCalendarDisplayCache();
      return null;
    }
    return {
      status: "observed",
      configured: true,
      storageAvailable: true,
      sourceIdentityState: "userSavedSinglePublishedCalendarTitleCapable",
      capturedAtUnixMs,
      selection,
      overlappingSelections: overlappingSelections as WorkCalendarSelection[],
      nextSelection,
      daySelections: daySelections as WorkCalendarDaySelection[],
      stopReason: null,
      requestMs: 0,
      parseMs: 0,
      diagnostics: [],
      viewerDay: typeof value.viewerDay === "string" ? value.viewerDay : undefined,
      daySelectionsComplete: value.daySelectionsComplete === true,
    };
  } catch {
    clearWorkCalendarDisplayCache();
    return null;
  }
}
