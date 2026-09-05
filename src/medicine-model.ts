export type DayPattern =
  | { kind: "everyDay" }
  | { kind: "everyNDays"; interval: number }
  | { kind: "weekdays"; days: number[] };

export type MedicineFoodRule = "any" | "beforeFood" | "withFood" | "afterFood";

export function medicineFoodRuleLabel(value: string | null | undefined): string {
  switch (value) {
    case "beforeFood": return "Before food";
    case "withFood": return "With food";
    case "afterFood": return "After food";
    default: return "Any time";
  }
}

export interface MedicineDose {
  medicineId: string;
  slotDay: string;
  slotTime: string;
  scheduleRevision: number;
  takenAt: string | null;
  skippedAt: string | null;
  notifiedAt: string | null;
  updatedAt: string;
}
export interface MedicineSnapshot {
  revision: number;
  treatments: Array<{ id: string; name: string; startOn: string; endOn: string; completedAt: string | null; archivedAt: string | null }>;
  medicines: Array<{ id: string; treatmentId: string; name: string; strength: string; doseAmount: string; foodRule: string }>;
  doses: MedicineDose[];
}

export type MedicineDoseState =
  | "taken"
  | "skipped"
  | "upcoming"
  | "due"
  | "missed";

export const DEFAULT_MEDICINE_GRACE_MINUTES = 60;
export const MIN_MEDICINE_GRACE_MINUTES = 15;
export const MAX_MEDICINE_GRACE_MINUTES = 240;

export function normalizeMedicineGraceMinutes(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_MEDICINE_GRACE_MINUTES;
  }
  return Math.min(
    MAX_MEDICINE_GRACE_MINUTES,
    Math.max(MIN_MEDICINE_GRACE_MINUTES, Math.round(value)),
  );
}

export function medicineDoseState(
  dose: Pick<MedicineDose, "takenAt" | "skippedAt">,
  slotUnixMs: number,
  nowUnixMs: number,
  graceMinutes: number,
): MedicineDoseState {
  if (dose.takenAt) return "taken";
  if (dose.skippedAt) return "skipped";
  if (nowUnixMs < slotUnixMs) return "upcoming";
  const graceEndsAt = slotUnixMs + normalizeMedicineGraceMinutes(graceMinutes) * 60_000;
  return nowUnixMs <= graceEndsAt ? "due" : "missed";
}

export function medicineDoseCounts(
  doses: Array<Pick<MedicineDose, "takenAt" | "skippedAt"> & { slotUnixMs: number }>,
  nowUnixMs: number,
  graceMinutes: number,
) {
  return doses.reduce(
    (counts, dose) => {
      counts[medicineDoseState(dose, dose.slotUnixMs, nowUnixMs, graceMinutes)] += 1;
      return counts;
    },
    { taken: 0, skipped: 0, upcoming: 0, due: 0, missed: 0 } as Record<MedicineDoseState, number>,
  );
}

export function medicineProgress(
  doses: Array<Pick<MedicineDose, "takenAt" | "skippedAt">>,
) {
  const completed = doses.filter((dose) => dose.takenAt || dose.skippedAt).length;
  return { completed, total: doses.length, fraction: doses.length ? completed / doses.length : 0 };
}

export function isMedicineDoseForDay(
  dose: Pick<MedicineDose, "slotDay">,
  day: string,
) {
  return dose.slotDay === day;
}

export function medicineWidgetAttentionCount(
  doses: Array<Pick<MedicineDose, "slotDay" | "takenAt" | "skippedAt"> & { slotUnixMs: number }>,
  today: string,
  nowUnixMs: number,
  graceMinutes: number,
) {
  return doses.filter((dose) => {
    if (!isMedicineDoseForDay(dose, today)) return false;
    const state = medicineDoseState(dose, dose.slotUnixMs, nowUnixMs, graceMinutes);
    return state === "due" || state === "missed";
  }).length;
}
