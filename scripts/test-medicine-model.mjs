import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const sourceUrl = new URL("../src/medicine-model.ts", import.meta.url);
const sourceText = await readFile(sourceUrl, "utf8");
const compiled = ts.transpileModule(sourceText, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  fileName: sourceUrl.pathname,
  reportDiagnostics: true,
});
assert.equal(compiled.diagnostics?.length ?? 0, 0);
const medicine = await import(
  `data:text/javascript;base64,${Buffer.from(compiled.outputText).toString("base64")}`,
);

assert.equal(medicine.normalizeMedicineGraceMinutes(undefined), 60);
assert.equal(medicine.normalizeMedicineGraceMinutes(1), 15);
assert.equal(medicine.normalizeMedicineGraceMinutes(999), 240);
assert.equal(medicine.normalizeMedicineGraceMinutes(59.6), 60);
assert.equal(medicine.medicineFoodRuleLabel("beforeFood"), "Before food");
assert.equal(medicine.medicineFoodRuleLabel("withFood"), "With food");
assert.equal(medicine.medicineFoodRuleLabel("afterFood"), "After food");
assert.equal(medicine.medicineFoodRuleLabel("any"), "Any time");
assert.equal(medicine.medicineFoodRuleLabel(undefined), "Any time");

const previousTimeZone = process.env.TZ;
try {
  // Change only this test process; never the Windows clock or timezone.
  process.env.TZ = "Europe/Kyiv";
  assert.equal(medicine.medicineLocalDay(new Date("2026-09-04T22:30:00Z")), "2026-09-05");
  process.env.TZ = "America/Los_Angeles";
  assert.equal(medicine.medicineLocalDay(new Date("2026-09-05T02:30:00Z")), "2026-09-04");
  process.env.TZ = "Pacific/Kiritimati";
  assert.equal(medicine.medicineDayPlusDays("2026-12-30", 6), "2027-01-05");
  assert.equal(medicine.medicineDayPlusDays("2026-03-07", 2), "2026-03-09");
  assert.equal(medicine.medicineDayPlusDays("2028-02-28", 1), "2028-02-29");
} finally {
  if (previousTimeZone === undefined) delete process.env.TZ;
  else process.env.TZ = previousTimeZone;
}

for (const dayPattern of [
  { kind: "everyDay" },
  { kind: "everyNDays", interval: 3 },
  { kind: "weekdays", days: [1, 3, 5] },
]) {
  const stored = {
    id: "medicine-1", treatmentId: "treatment-1", name: "Original name",
    strength: "Example strength", form: "drops", doseAmount: "Example amount",
    foodRule: "withFood", times: ["08:00", "14:00", "20:00"], dayPattern,
    startOn: "2026-09-01", endOn: "2026-09-14",
    notes: [{ text: "Personal note", href: null }],
  };
  const edits = { ...stored, name: "Renamed medicine", notes: "Personal note" };
  const { id: _id, ...originalInput } = stored;
  assert.deepEqual(medicine.medicineEditInput(stored, edits), { ...originalInput, name: edits.name });
  const retimed = medicine.medicineEditInput(stored, { ...edits, times: ["20:00", "09:00", "14:00"] });
  assert.deepEqual(retimed.times, ["09:00", "14:00", "20:00"]);
  assert.deepEqual(retimed.dayPattern, dayPattern);
  assert.deepEqual(retimed.notes, stored.notes);
  assert.deepEqual(stored.times, ["08:00", "14:00", "20:00"]);
}

const previewDraft = {
  name: "Example", strength: "500 mg", form: "tablet", doseAmount: "1",
  foodRule: "afterFood", times: ["08:00", "20:00"],
  dayPattern: { kind: "everyDay" }, startOn: "2026-09-01", endOn: "2026-09-07",
  notes: "",
};
assert.deepEqual(medicine.medicineSchedulePreview(previewDraft), { valid: true, occurrenceCount: 14, calendarDays: 7, message: "14 planned doses over 7 days." });
assert.equal(medicine.medicineSchedulePreview({ ...previewDraft, dayPattern: { kind: "everyNDays", interval: 2 } }).occurrenceCount, 8);
assert.equal(medicine.medicineSchedulePreview({ ...previewDraft, dayPattern: { kind: "weekdays", days: [1, 3, 5] } }).occurrenceCount, 6);
assert.equal(medicine.medicineSchedulePreview({ ...previewDraft, startOn: "2026-09-02", dayPattern: { kind: "everyNDays", interval: 2 } }).occurrenceCount, 6);
assert.equal(medicine.medicineSchedulePreview({ ...previewDraft, times: [] }).valid, false);
assert.equal(medicine.medicineSchedulePreview({ ...previewDraft, times: ["08:00", "08:00"] }).valid, false);
assert.equal(medicine.medicineSchedulePreview({ ...previewDraft, times: ["24:00"] }).valid, false);
assert.equal(medicine.medicineSchedulePreview({ ...previewDraft, times: Array.from({ length: 12 }, (_, index) => `${String(index).padStart(2, "0")}:00`) }).valid, true);
assert.equal(medicine.medicineSchedulePreview({ ...previewDraft, times: Array.from({ length: 13 }, (_, index) => `${String(index).padStart(2, "0")}:00`) }).valid, false);
assert.equal(medicine.medicineSchedulePreview({ ...previewDraft, dayPattern: { kind: "everyNDays", interval: 1 } }).valid, false);
assert.equal(medicine.medicineSchedulePreview({ ...previewDraft, dayPattern: { kind: "everyNDays", interval: 2 } }).valid, true);
assert.equal(medicine.medicineSchedulePreview({ ...previewDraft, dayPattern: { kind: "everyNDays", interval: 30 } }).valid, true);
assert.equal(medicine.medicineSchedulePreview({ ...previewDraft, dayPattern: { kind: "everyNDays", interval: 31 } }).valid, false);
assert.equal(medicine.medicineSchedulePreview({ ...previewDraft, dayPattern: { kind: "weekdays", days: [] } }).valid, false);
assert.equal(medicine.medicineSchedulePreview({ ...previewDraft, dayPattern: { kind: "weekdays", days: [1, 1] } }).valid, false);
assert.equal(medicine.medicineSchedulePreview({ ...previewDraft, startOn: "2028-02-28", endOn: "2028-03-01", times: ["08:00"] }).occurrenceCount, 3);
assert.equal(medicine.medicineSchedulePreview({ ...previewDraft, startOn: "2026-01-01", endOn: "2026-12-31", times: Array.from({ length: 6 }, (_, index) => `${String(index).padStart(2, "0")}:00`) }).occurrenceCount, 2_190);
assert.equal(medicine.medicineSchedulePreview({ ...previewDraft, startOn: "2026-01-01", endOn: "2027-01-01" }).valid, false);

const slot = Date.parse("2026-09-04T09:00:00Z");
assert.equal(medicine.medicineDoseState({ takenAt: "2026-09-04T09:01:00Z", skippedAt: null }, slot, slot, 60), "taken");
assert.equal(medicine.medicineDoseState({ takenAt: null, skippedAt: "2026-09-04T09:01:00Z" }, slot, slot, 60), "skipped");
assert.equal(medicine.medicineDoseState({ takenAt: null, skippedAt: null }, slot, slot - 1, 60), "upcoming");
assert.equal(medicine.medicineDoseState({ takenAt: null, skippedAt: null }, slot, slot + 60 * 60_000, 60), "due");
assert.equal(medicine.medicineDoseState({ takenAt: null, skippedAt: null }, slot, slot + 60 * 60_000 + 1, 60), "missed");

assert.deepEqual(
  medicine.medicineProgress([
    { takenAt: "2026-09-04T09:01:00Z", skippedAt: null },
    { takenAt: null, skippedAt: "2026-09-04T12:01:00Z" },
    { takenAt: null, skippedAt: null },
  ]),
  { completed: 2, total: 3, fraction: 2 / 3 },
);

const doses = [
  { slotDay: "2026-09-03", slotUnixMs: slot - 24 * 60 * 60_000, takenAt: null, skippedAt: null },
  { slotDay: "2026-09-04", slotUnixMs: slot, takenAt: null, skippedAt: null },
];
assert.equal(medicine.medicineWidgetAttentionCount(doses, "2026-09-04", slot + 61 * 60_000, 60), 1);
assert.equal(medicine.medicineWidgetAttentionCount(doses, "2026-09-05", slot + 61 * 60_000, 60), 0);

const treatmentBase = { startOn: "2026-09-01", endOn: "2026-09-10", completedAt: null, archivedAt: null };
assert.equal(medicine.medicineTreatmentGroup(treatmentBase, "2026-09-05"), "active");
assert.equal(medicine.medicineTreatmentGroup({ ...treatmentBase, startOn: "2026-09-06" }, "2026-09-05"), "upcoming");
assert.equal(medicine.medicineTreatmentGroup({ ...treatmentBase, endOn: "2026-09-04" }, "2026-09-05"), "finished");
assert.equal(medicine.medicineTreatmentGroup({ ...treatmentBase, completedAt: "2026-09-03T12:00:00Z" }, "2026-09-05"), "finished");
assert.equal(medicine.medicineTreatmentGroup({ ...treatmentBase, completedAt: "2026-09-03T12:00:00Z", archivedAt: "2026-09-04T12:00:00Z" }, "2026-09-05"), "archived");
assert.deepEqual(medicine.medicineTreatmentProgress(treatmentBase, "2026-09-05"), { day: 5, total: 10, fraction: 0.5 });
assert.deepEqual(medicine.medicineTreatmentProgress(treatmentBase, "2026-08-31"), { day: 0, total: 10, fraction: 0 });
assert.deepEqual(medicine.medicineTreatmentProgress(treatmentBase, "2026-09-20"), { day: 10, total: 10, fraction: 1 });
assert.deepEqual(medicine.sortMedicineEntities([{ id: "b", sortIndex: 1 }, { id: "c", sortIndex: 0 }, { id: "a", sortIndex: 1 }]).map((item) => item.id), ["c", "a", "b"]);
assert.deepEqual(medicine.reorderMedicineIds(["a", "b", "c", "d"], "a", "c", "after"), ["b", "c", "a", "d"]);
assert.deepEqual(medicine.reorderMedicineIds(["a", "b", "c", "d"], "d", "b", "before"), ["a", "d", "b", "c"]);
assert.deepEqual(medicine.reorderMedicineIds(["a", "b"], "a", "a", "after"), ["a", "b"]);
assert.deepEqual(medicine.reorderMedicineIds(["a", "b"], "missing", "b", "before"), ["a", "b"]);

try {
  process.env.TZ = "America/New_York";
  const springGap = new Date(medicine.resolveMedicineSlot("2026-03-08", "02:30"));
  assert.equal(`${springGap.getHours()}:${String(springGap.getMinutes()).padStart(2, "0")}`, "3:00");
  assert.equal(medicine.resolveMedicineSlot("2026-03-08", "02:05"), medicine.resolveMedicineSlot("2026-03-08", "02:59"));
  assert.equal(new Date(medicine.resolveMedicineSlot("2026-11-01", "01:30")).toISOString(), "2026-11-01T05:30:00.000Z");
} finally {
  if (previousTimeZone === undefined) delete process.env.TZ;
  else process.env.TZ = previousTimeZone;
}

const record = {
  id: "medicine-1", treatmentId: "treatment-1", name: "Example", strength: "",
  form: "tablet", doseAmount: "1", foodRule: "any", times: ["09:00"],
  dayPattern: { kind: "everyDay" }, startOn: "2026-08-01", endOn: "2026-09-05",
  notes: [], sortIndex: 0, scheduleRevision: 1, createdAt: "", updatedAt: "",
};
const rowDoses = Array.from({ length: 22 }, (_, index) => ({
  medicineId: "medicine-1", slotDay: medicine.medicineDayPlusDays("2026-08-14", index),
  slotTime: "09:00", scheduleRevision: 1, takenAt: index % 2 ? "2026-08-15T09:00:00Z" : null,
  skippedAt: null, notifiedAt: null, updatedAt: "",
}));
rowDoses.push({ medicineId: "medicine-1", slotDay: "2026-09-05", slotTime: "08:00", scheduleRevision: 1, takenAt: null, skippedAt: null, notifiedAt: null, updatedAt: "" });
const managerRows = medicine.medicineManagerDoseRows({ revision: 1, treatments: [], medicines: [record], doses: rowDoses }, "treatment-1", new Date("2026-09-05T10:30:00"), 60);
assert.deepEqual(managerRows.todayRows.map((row) => row.dose.slotTime), ["08:00"]);
assert.equal(managerRows.todayRows[0].state, "missed");
assert.equal(managerRows.recentRows.length, 20);
assert.equal(managerRows.recentRows[0].dose.slotDay, "2026-09-05");
assert.ok(managerRows.recentRows.some((row) => row.dose.slotDay < "2026-09-05" && row.state === "missed"));

const dailyTreatment = (id, sortIndex, extra = {}) => ({ id, name: id, startOn: "2026-09-01", endOn: "2026-09-10", completedAt: null, archivedAt: null, notes: [], notesRevision: 0, sortIndex, ...extra });
const dailyMedicine = (id, treatmentId, sortIndex) => ({ ...record, id, treatmentId, name: id, sortIndex });
const dailySnapshot = {
  revision: 1,
  treatments: [dailyTreatment("later-treatment", 2), dailyTreatment("first-treatment", 1), dailyTreatment("archived", 0, { archivedAt: "2026-09-03T00:00:00Z" })],
  medicines: [dailyMedicine("second-med", "first-treatment", 2), dailyMedicine("first-med", "first-treatment", 1), dailyMedicine("later-med", "later-treatment", 0), dailyMedicine("hidden-med", "archived", 0)],
  doses: [
    { medicineId: "second-med", slotDay: "2026-09-04", slotTime: "09:00", scheduleRevision: 1, takenAt: null, skippedAt: null, notifiedAt: null, updatedAt: "" },
    { medicineId: "first-med", slotDay: "2026-09-04", slotTime: "09:00", scheduleRevision: 1, takenAt: "2026-09-04T09:01:00Z", skippedAt: null, notifiedAt: null, updatedAt: "" },
    { medicineId: "later-med", slotDay: "2026-09-04", slotTime: "10:00", scheduleRevision: 1, takenAt: null, skippedAt: null, notifiedAt: null, updatedAt: "" },
    { medicineId: "hidden-med", slotDay: "2026-09-04", slotTime: "08:00", scheduleRevision: 1, takenAt: null, skippedAt: null, notifiedAt: null, updatedAt: "" },
  ],
};
const dailyGroups = medicine.medicineDailyTreatments(dailySnapshot, new Date("2026-09-04T09:30:00"));
assert.deepEqual(dailyGroups.map((group) => group.treatment.id), ["first-treatment", "later-treatment"]);
assert.deepEqual(dailyGroups[0].rows.map((row) => row.medicine.id), ["first-med", "second-med"]);
assert.deepEqual(dailyGroups[0].rows.map((row) => row.state), ["taken", "due"]);
assert.equal(dailyGroups[0].takenToday, 1);
assert.deepEqual(medicine.medicineDailyRows(dailySnapshot, new Date("2026-09-04T09:30:00")).map((row) => row.medicine.id), ["first-med", "second-med", "later-med"]);
assert.equal(medicine.medicineDoseStateLabel("missed"), "Missed");
const oversizedGroups = Array.from({ length: 4 }, (_, groupIndex) => ({ ...dailyGroups[0], treatment: { ...dailyGroups[0].treatment, id: `treatment-${groupIndex}` }, rows: Array.from({ length: 3 }, (_, rowIndex) => ({ ...dailyGroups[0].rows[0], dose: { ...dailyGroups[0].rows[0].dose, slotTime: `0${rowIndex}:00` } })) }));
const bounded = medicine.boundedMedicinePanelGroups(oversizedGroups);
assert.equal(bounded.groups.length, 3);
assert.equal(bounded.visibleRows, 8);
assert.equal(bounded.hiddenRows, 4);

// Budgeting favours rows you can still act on. Taking the first N
// chronologically let recorded morning doses hide an evening dose that was
// actually due, which is the opposite of what the surface is for.
const row = (id, state) => ({ id, state });
const overBudget = [
  row("a", "taken"), row("b", "taken"), row("c", "skipped"),
  row("d", "due"), row("e", "taken"), row("f", "missed"),
];
// Both unresolved rows claim the budget; one recorded row fills the remainder.
// The result is still in arrival order, so only which rows show has changed.
const picked = medicine.boundedDoseRows(overBudget, 3);
assert.deepEqual(picked.visible.map((item) => item.id), ["a", "d", "f"]);
assert.equal(picked.hidden, 3);
// Under budget nothing is reordered or dropped.
assert.deepEqual(medicine.boundedDoseRows(overBudget, 99).visible.map((item) => item.id), ["a", "b", "c", "d", "e", "f"]);
assert.equal(medicine.boundedDoseRows(overBudget, 99).hidden, 0);
assert.equal(medicine.boundedDoseRows(overBudget, 0).visible.length, 0);
assert.equal(medicine.boundedDoseRows(overBudget, 0).hidden, 6);
assert.equal(medicine.isUnresolvedDose("due"), true);
assert.equal(medicine.isUnresolvedDose("missed"), true);
assert.equal(medicine.isUnresolvedDose("upcoming"), true);
assert.equal(medicine.isUnresolvedDose("taken"), false);
assert.equal(medicine.isUnresolvedDose("skipped"), false);

// The panel spends its budget across treatments, so a first treatment full of
// recorded doses cannot crowd out a second treatment's due dose.
const recordedGroup = { ...dailyGroups[0], treatment: { ...dailyGroups[0].treatment, id: "recorded" }, rows: Array.from({ length: 8 }, (_, index) => ({ ...dailyGroups[0].rows[0], state: "taken", dose: { ...dailyGroups[0].rows[0].dose, slotTime: `0${index}:00` } })) };
const dueGroup = { ...dailyGroups[0], treatment: { ...dailyGroups[0].treatment, id: "still-due" }, rows: [{ ...dailyGroups[0].rows[0], state: "due", dose: { ...dailyGroups[0].rows[0].dose, slotTime: "21:00" } }] };
const shared = medicine.boundedMedicinePanelGroups([recordedGroup, dueGroup]);
assert.ok(shared.groups.some((group) => group.treatment.id === "still-due"), "a due dose must survive a busier treatment");
assert.equal(shared.visibleRows, 8);
assert.equal(shared.hiddenRows, 1);

console.log("medicine model checks passed");
