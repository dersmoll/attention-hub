export const CALENDAR_SKIPS_CHANGED_EVENT = "calendar-skips-changed";
const STORAGE_KEY = "attention-hub.calendar-skips.v1";

interface CalendarSkipRecord {
  occurrenceId: string;
  expiresAt: number;
}

function readRecords(now = Date.now()): CalendarSkipRecord[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]") as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is CalendarSkipRecord => typeof item?.occurrenceId === "string"
      && typeof item?.expiresAt === "number" && Number.isFinite(item.expiresAt) && item.expiresAt > now);
  } catch {
    return [];
  }
}

function writeRecords(records: CalendarSkipRecord[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}

export function readSkippedCalendarOccurrences(now = Date.now()) {
  const records = readRecords(now);
  try { writeRecords(records); } catch { /* A read-only session still works. */ }
  return new Set(records.map((record) => record.occurrenceId));
}

export function setCalendarOccurrenceSkipped(
  occurrence: { occurrenceId: string; start: string; end: string },
  skipped: boolean,
) {
  const records = readRecords().filter((record) => record.occurrenceId !== occurrence.occurrenceId);
  if (skipped) {
    const start = new Date(occurrence.start);
    const end = Date.parse(occurrence.end);
    const endOfDay = new Date(start);
    endOfDay.setHours(23, 59, 59, 999);
    records.push({ occurrenceId: occurrence.occurrenceId, expiresAt: Math.max(end, endOfDay.getTime()) });
  }
  try { writeRecords(records); } catch { /* Keep the current window usable if storage is unavailable. */ }
  return new Set(records.map((record) => record.occurrenceId));
}
