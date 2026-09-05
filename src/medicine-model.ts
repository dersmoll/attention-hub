export type DayPattern =
  | { kind: "everyDay" }
  | { kind: "everyNDays"; interval: number }
  | { kind: "weekdays"; days: number[] };

export type MedicineFoodRule = "any" | "beforeFood" | "withFood" | "afterFood";
export type MedicineForm = "tablet" | "capsule" | "drops" | "spray" | "syrup" | "injection" | "other";

export interface MedicineScheduleDraft {
  name: string;
  strength: string;
  form: MedicineForm;
  doseAmount: string;
  foodRule: MedicineFoodRule;
  times: string[];
  dayPattern: DayPattern;
  startOn: string;
  endOn: string;
  notes: string;
}

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
  schemaVersion?: 1;
  revision: number;
  capturedAt?: string;
  storagePath?: string;
  recoveredFromBackup?: boolean;
  treatments: MedicineTreatment[];
  medicines: MedicineRecord[];
  doses: MedicineDose[];
}

export interface MedicineTreatment {
  id: string;
  name: string;
  startOn: string;
  endOn: string;
  completedAt: string | null;
  archivedAt: string | null;
  notes: Array<{ text: string; href: string | null }>;
  notesRevision: number;
  sortIndex: number;
  createdAt: string;
  updatedAt: string;
}

export interface MedicineRecord {
  id: string;
  treatmentId: string;
  name: string;
  strength: string;
  form: MedicineForm;
  doseAmount: string;
  foodRule: string;
  times: string[];
  dayPattern: DayPattern;
  startOn: string;
  endOn: string;
  notes: Array<{ text: string; href: string | null }>;
  sortIndex: number;
  scheduleRevision: number;
  createdAt: string;
  updatedAt: string;
}

export interface MedicineDeleteImpact {
  entity: "medicine-store" | "treatment" | "medicine";
  id: string | null;
  name: string | null;
  treatments: number;
  medicines: number;
  doses: number;
  medicineRevision: number;
}

export function medicineLocalDay(value = new Date()): string {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

export function medicineDayPlusDays(day: string, days: number): string {
  const [year, month, date] = day.split("-").map(Number);
  // Civil calendar arithmetic, independent of the host's offset and DST.
  const value = new Date(Date.UTC(year, month - 1, date + days));
  return value.toISOString().slice(0, 10);
}

export function medicineEditInput(
  medicine: MedicineRecord,
  draft: MedicineScheduleDraft,
) {
  return {
    treatmentId: medicine.treatmentId,
    ...medicineDraftInput(draft),
    notes: linkifyMedicineNotes(draft.notes),
  };
}

export function medicineCreateInput(treatmentId: string, draft: MedicineScheduleDraft) {
  return { treatmentId, ...medicineDraftInput(draft), notes: linkifyMedicineNotes(draft.notes) };
}

function linkifyMedicineNotes(text: string) {
  const segments: Array<{ text: string; href: string | null }> = [];
  const append = (value: string, href: string | null) => {
    if (!value) return;
    const previous = segments[segments.length - 1];
    if (previous?.href === href) previous.text += value;
    else segments.push({ text: value, href });
  };
  const pattern = /https?:\/\/[^\s<>]+/giu;
  let cursor = 0;
  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0;
    append(text.slice(cursor, index), null);
    let candidate = match[0];
    let trailing = "";
    while (/[),.;!?]$/u.test(candidate)) {
      trailing = candidate.slice(-1) + trailing;
      candidate = candidate.slice(0, -1);
    }
    let href: string | null = null;
    try {
      const url = new URL(candidate);
      if (["http:", "https:"].includes(url.protocol) && !url.username && !url.password) href = url.toString();
    } catch { /* Native validation remains authoritative. */ }
    append(candidate, href);
    append(trailing, null);
    cursor = index + match[0].length;
  }
  append(text.slice(cursor), null);
  return segments;
}

function medicineDraftInput(draft: MedicineScheduleDraft) {
  return {
    name: draft.name.trim(),
    strength: draft.strength.trim(),
    form: draft.form,
    doseAmount: draft.doseAmount.trim(),
    foodRule: draft.foodRule,
    times: [...draft.times].sort(),
    dayPattern: draft.dayPattern.kind === "weekdays"
      ? { ...draft.dayPattern, days: [...draft.dayPattern.days].sort((left, right) => left - right) }
      : { ...draft.dayPattern },
    startOn: draft.startOn,
    endOn: draft.endOn,
  };
}

function civilDate(day: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const [year, month, date] = day.split("-").map(Number);
  const value = new Date(Date.UTC(year, month - 1, date));
  return value.getUTCFullYear() === year && value.getUTCMonth() === month - 1 && value.getUTCDate() === date
    ? value
    : null;
}

export function medicineSchedulePreview(draft: MedicineScheduleDraft) {
  const start = civilDate(draft.startOn);
  const end = civilDate(draft.endOn);
  const times = [...new Set(draft.times)].filter((value) => /^([01]\d|2[0-3]):[0-5]\d$/.test(value));
  if (!draft.name.trim()) return { valid: false, occurrenceCount: 0, calendarDays: 0, message: "Enter a medicine name." };
  if (!start || !end || end < start) return { valid: false, occurrenceCount: 0, calendarDays: 0, message: "Choose a valid start and end date." };
  if (times.length !== draft.times.length || times.length === 0 || times.length > 12) return { valid: false, occurrenceCount: 0, calendarDays: 0, message: "Add 1 to 12 unique dose times." };
  if (Array.from(draft.name.trim()).length > 80 || Array.from(draft.strength.trim()).length > 32 || Array.from(draft.doseAmount.trim()).length > 32 || Array.from(draft.notes).length > 4_000) return { valid: false, occurrenceCount: 0, calendarDays: 0, message: "One or more medicine details are too long." };
  if (draft.dayPattern.kind === "everyNDays" && (!Number.isInteger(draft.dayPattern.interval) || draft.dayPattern.interval < 2 || draft.dayPattern.interval > 30)) return { valid: false, occurrenceCount: 0, calendarDays: 0, message: "Choose an interval from 2 to 30 days." };
  if (draft.dayPattern.kind === "weekdays" && (draft.dayPattern.days.length === 0 || new Set(draft.dayPattern.days).size !== draft.dayPattern.days.length || draft.dayPattern.days.some((day) => !Number.isInteger(day) || day < 1 || day > 7))) return { valid: false, occurrenceCount: 0, calendarDays: 0, message: "Choose at least one weekday." };
  const calendarDays = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
  if (calendarDays > 365) return { valid: false, occurrenceCount: 0, calendarDays, message: "A medicine schedule can span at most 365 days." };
  let scheduledDays = 0;
  for (let index = 0; index < calendarDays; index += 1) {
    const day = new Date(start.getTime() + index * 86_400_000);
    const matches = draft.dayPattern.kind === "everyDay"
      || (draft.dayPattern.kind === "everyNDays" && index % draft.dayPattern.interval === 0)
      || (draft.dayPattern.kind === "weekdays" && draft.dayPattern.days.includes(day.getUTCDay() || 7));
    if (matches) scheduledDays += 1;
  }
  const occurrenceCount = scheduledDays * times.length;
  if (occurrenceCount > 2_000) return { valid: false, occurrenceCount, calendarDays, message: "This schedule exceeds 2,000 planned doses." };
  return { valid: true, occurrenceCount, calendarDays, message: `${occurrenceCount} planned dose${occurrenceCount === 1 ? "" : "s"} over ${calendarDays} day${calendarDays === 1 ? "" : "s"}.` };
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

export type MedicineTreatmentGroup = "active" | "upcoming" | "finished" | "archived";

export function medicineTreatmentGroup(
  treatment: Pick<MedicineTreatment, "archivedAt" | "completedAt" | "startOn" | "endOn">,
  today: string,
): MedicineTreatmentGroup {
  if (treatment.archivedAt) return "archived";
  if (treatment.completedAt || treatment.endOn < today) return "finished";
  if (treatment.startOn > today) return "upcoming";
  return "active";
}

export function sortMedicineEntities<T extends { id: string; sortIndex: number }>(items: readonly T[]): T[] {
  return [...items].sort((left, right) => left.sortIndex - right.sortIndex || left.id.localeCompare(right.id));
}

export type MedicineDropEdge = "before" | "after";

export function reorderMedicineIds(
  ids: readonly string[],
  draggedId: string,
  targetId: string,
  edge: MedicineDropEdge,
): string[] {
  if (draggedId === targetId || !ids.includes(draggedId) || !ids.includes(targetId)) return [...ids];
  const reordered = ids.filter((id) => id !== draggedId);
  const targetIndex = reordered.indexOf(targetId);
  reordered.splice(targetIndex + (edge === "after" ? 1 : 0), 0, draggedId);
  return reordered;
}

export function medicineTreatmentProgress(
  treatment: Pick<MedicineTreatment, "startOn" | "endOn">,
  today: string,
) {
  const start = civilDate(treatment.startOn);
  const end = civilDate(treatment.endOn);
  const current = civilDate(today);
  if (!start || !end || !current || end < start) return { day: 0, total: 0, fraction: 0 };
  const total = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
  const elapsed = Math.round((current.getTime() - start.getTime()) / 86_400_000) + 1;
  const day = Math.min(total, Math.max(0, elapsed));
  return { day, total, fraction: day / total };
}

export function resolveMedicineSlot(slotDay: string, slotTime: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(slotDay) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(slotTime)) return null;
  const [year, month, day] = slotDay.split("-").map(Number);
  const [hour, minute] = slotTime.split(":").map(Number);
  for (let minutesAfterSlot = 0; minutesAfterSlot <= 180; minutesAfterSlot += 1) {
    const civil = new Date(Date.UTC(year, month - 1, day, hour, minute + minutesAfterSlot));
    const candidate = new Date(civil.getUTCFullYear(), civil.getUTCMonth(), civil.getUTCDate(), civil.getUTCHours(), civil.getUTCMinutes());
    if (candidate.getFullYear() === civil.getUTCFullYear()
      && candidate.getMonth() === civil.getUTCMonth()
      && candidate.getDate() === civil.getUTCDate()
      && candidate.getHours() === civil.getUTCHours()
      && candidate.getMinutes() === civil.getUTCMinutes()) return candidate.getTime();
  }
  return null;
}

export interface MedicineManagerDoseRow {
  dose: MedicineDose;
  medicine: MedicineRecord;
  state: MedicineDoseState;
  slotUnixMs: number;
}

export interface MedicineDailyDoseRow extends MedicineManagerDoseRow {
  treatment: MedicineTreatment;
}

export interface MedicineDailyTreatment {
  treatment: MedicineTreatment;
  rows: MedicineDailyDoseRow[];
  progress: ReturnType<typeof medicineTreatmentProgress>;
  takenToday: number;
  totalToday: number;
}

export const MEDICINE_PANEL_MAX_TREATMENTS = 3;
export const MEDICINE_PANEL_MAX_DOSES = 8;

export function medicineDoseStateLabel(state: MedicineDoseState) {
  return state[0].toUpperCase() + state.slice(1);
}

export function activeMedicineTreatments(snapshot: MedicineSnapshot, now = new Date()) {
  const today = medicineLocalDay(now);
  return sortMedicineEntities(snapshot.treatments.filter((treatment) => medicineTreatmentGroup(treatment, today) === "active"));
}

export function medicineDailyTreatments(
  snapshot: MedicineSnapshot,
  now = new Date(),
  graceMinutes = DEFAULT_MEDICINE_GRACE_MINUTES,
): MedicineDailyTreatment[] {
  const today = medicineLocalDay(now);
  const activeTreatments = activeMedicineTreatments(snapshot, now);
  const medicineById = new Map(sortMedicineEntities(snapshot.medicines).map((item) => [item.id, item]));
  const rowsByTreatment = new Map<string, MedicineDailyDoseRow[]>();
  for (const dose of snapshot.doses) {
    if (dose.slotDay !== today) continue;
    const medicine = medicineById.get(dose.medicineId);
    const treatment = activeTreatments.find((item) => item.id === medicine?.treatmentId);
    const slotUnixMs = resolveMedicineSlot(dose.slotDay, dose.slotTime);
    if (!medicine || !treatment || slotUnixMs === null) continue;
    const rows = rowsByTreatment.get(treatment.id) ?? [];
    rows.push({ dose, medicine, treatment, slotUnixMs, state: medicineDoseState(dose, slotUnixMs, now.getTime(), graceMinutes) });
    rowsByTreatment.set(treatment.id, rows);
  }
  return activeTreatments.map((treatment) => {
    const rows = (rowsByTreatment.get(treatment.id) ?? []).sort((left, right) => left.dose.slotTime.localeCompare(right.dose.slotTime)
      || left.medicine.sortIndex - right.medicine.sortIndex || left.medicine.id.localeCompare(right.medicine.id));
    return {
      treatment,
      rows,
      progress: medicineTreatmentProgress(treatment, today),
      takenToday: rows.filter((row) => row.state === "taken").length,
      totalToday: rows.length,
    };
  }).filter((group) => group.rows.length > 0);
}

/** Daily rows for the shared Today surface.  Unlike the dedicated Medicine
 * panel, this deliberately crosses treatment boundaries in wall-clock order. */
export function medicineDailyRows(snapshot: MedicineSnapshot, now = new Date(), graceMinutes = DEFAULT_MEDICINE_GRACE_MINUTES) {
  return medicineDailyTreatments(snapshot, now, graceMinutes)
    .flatMap((group) => group.rows)
    .sort((left, right) => left.slotUnixMs - right.slotUnixMs
      || left.medicine.sortIndex - right.medicine.sortIndex
      || left.medicine.id.localeCompare(right.medicine.id));
}

export function boundedMedicinePanelGroups(groups: readonly MedicineDailyTreatment[]) {
  const visible: MedicineDailyTreatment[] = [];
  let remainingBudget = MEDICINE_PANEL_MAX_DOSES;
  let visibleRows = 0;
  for (const group of groups.slice(0, MEDICINE_PANEL_MAX_TREATMENTS)) {
    if (remainingBudget <= 0) break;
    const rows = group.rows.slice(0, remainingBudget);
    if (rows.length) visible.push({ ...group, rows });
    remainingBudget -= rows.length;
    visibleRows += rows.length;
  }
  const totalRows = groups.reduce((sum, group) => sum + group.rows.length, 0);
  return { groups: visible, visibleRows, hiddenRows: Math.max(0, totalRows - visibleRows) };
}

export function medicineManagerDoseRows(
  snapshot: MedicineSnapshot,
  treatmentId: string,
  now = new Date(),
  graceMinutes = DEFAULT_MEDICINE_GRACE_MINUTES,
) {
  const today = medicineLocalDay(now);
  const medicines = sortMedicineEntities(snapshot.medicines.filter((item) => item.treatmentId === treatmentId));
  const medicineById = new Map(medicines.map((item) => [item.id, item]));
  const rows = snapshot.doses.flatMap((dose): MedicineManagerDoseRow[] => {
    const medicine = medicineById.get(dose.medicineId);
    const slotUnixMs = resolveMedicineSlot(dose.slotDay, dose.slotTime);
    if (!medicine || slotUnixMs === null) return [];
    return [{ dose, medicine, slotUnixMs, state: medicineDoseState(dose, slotUnixMs, now.getTime(), graceMinutes) }];
  });
  const byCivilAscending = (left: MedicineManagerDoseRow, right: MedicineManagerDoseRow) => left.dose.slotDay.localeCompare(right.dose.slotDay)
    || left.dose.slotTime.localeCompare(right.dose.slotTime)
    || left.medicine.sortIndex - right.medicine.sortIndex
    || left.medicine.id.localeCompare(right.medicine.id);
  const todayRows = rows.filter((row) => row.dose.slotDay === today).sort(byCivilAscending);
  const recentRows = rows
    .filter((row) => row.state === "taken" || row.state === "skipped" || row.state === "missed")
    .sort((left, right) => -byCivilAscending(left, right))
    .slice(0, 20);
  return { today, todayRows, recentRows };
}
