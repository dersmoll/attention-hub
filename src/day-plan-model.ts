import {
  isActionable, isFromActiveOwner, isVisibleInToday, localDateKey, sortActionItems,
  type ActionItem, type WorkspaceSnapshot,
} from "./workspace-model";
import {
  DEFAULT_MEDICINE_GRACE_MINUTES, medicineDailyRows, medicineDoseState,
  medicineTreatmentGroup, resolveMedicineSlot,
  type MedicineDailyDoseRow, type MedicineSnapshot,
} from "./medicine-model";

function civilDay(day: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new RangeError("Invalid plan day");
  const date = new Date(`${day}T12:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== day) {
    throw new RangeError("Invalid plan day");
  }
  return date;
}

/** Civil date arithmetic never adds a fixed number of hours across DST. */
export function shiftPlanDay(day: string, offset: number): string {
  if (!Number.isInteger(offset)) throw new RangeError("Invalid day offset");
  const date = civilDay(day);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

/** Local start inclusive, next local midnight exclusive; a day may be 23/25h. */
export function planDayBounds(day: string): { start: Date; end: Date } {
  civilDay(day);
  return { start: new Date(`${day}T00:00:00`), end: new Date(`${shiftPlanDay(day, 1)}T00:00:00`) };
}

export function planDayLabel(day: string, now: Date): string {
  const today = localDateKey(now);
  if (day === today) return "Today";
  if (day === shiftPlanDay(today, -1)) return "Yesterday";
  if (day === shiftPlanDay(today, 1)) return "Tomorrow";
  return planDayBounds(day).start.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function timestampDay(value: string | null): string | null {
  if (value === null) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? localDateKey(date) : null;
}

function scheduledOn(item: ActionItem, day: string): boolean {
  return item.dueOn === day || timestampDay(item.remindAt) === day;
}

export function dayPlanTodos(
  workspace: WorkspaceSnapshot | null, selectedDay: string, now: Date,
): { scheduled: ActionItem[]; carryover: ActionItem[] } {
  if (!workspace) return { scheduled: [], carryover: [] };
  const today = localDateKey(now);
  if (selectedDay === today) {
    return {
      scheduled: sortActionItems(workspace.actionItems.filter((item) => isFromActiveOwner(item, workspace) && isVisibleInToday(item, now))),
      carryover: [],
    };
  }
  if (selectedDay < today) {
    const { end } = planDayBounds(selectedDay);
    // Current dates and retained completion records are evidence, not a snapshot
    // of earlier edits. Never imply an item existed before its creation.
    return {
      scheduled: sortActionItems(workspace.actionItems.filter((item) => Date.parse(item.createdAt) < end.getTime()
        && (scheduledOn(item, selectedDay) || timestampDay(item.completedAt) === selectedDay))),
      carryover: [],
    };
  }
  const open = workspace.actionItems.filter((item) => item.completedAt === null && isFromActiveOwner(item, workspace));
  return {
    scheduled: sortActionItems(open.filter((item) => scheduledOn(item, selectedDay))),
    carryover: sortActionItems(open.filter((item) => !scheduledOn(item, selectedDay) && isActionable(item, now))),
  };
}

export function dayPlanMedicine(
  medicine: MedicineSnapshot | null, selectedDay: string, now: Date,
  graceMinutes = DEFAULT_MEDICINE_GRACE_MINUTES,
): MedicineDailyDoseRow[] {
  if (!medicine) return [];
  const today = localDateKey(now);
  if (selectedDay === today) return medicineDailyRows(medicine, now, graceMinutes);
  const medicines = new Map(medicine.medicines.map((item) => [item.id, item]));
  const treatments = new Map(medicine.treatments.map((item) => [item.id, item]));
  // Doses are already materialized by native storage. Reconstructing them here
  // could invent historical slots after a schedule edit.
  return medicine.doses.flatMap((dose): MedicineDailyDoseRow[] => {
    if (dose.slotDay !== selectedDay) return [];
    const record = medicines.get(dose.medicineId);
    const treatment = record && treatments.get(record.treatmentId);
    const slotUnixMs = resolveMedicineSlot(dose.slotDay, dose.slotTime);
    if (!record || !treatment || slotUnixMs === null) return [];
    if (selectedDay > today && (medicineTreatmentGroup(treatment, selectedDay) !== "active"
      || selectedDay < record.startOn || selectedDay > record.endOn)) return [];
    return [{ dose, medicine: record, treatment, slotUnixMs, state: medicineDoseState(dose, slotUnixMs, now.getTime(), graceMinutes) }];
  }).sort((left, right) => left.slotUnixMs - right.slotUnixMs
    || left.medicine.sortIndex - right.medicine.sortIndex || left.medicine.id.localeCompare(right.medicine.id));
}
