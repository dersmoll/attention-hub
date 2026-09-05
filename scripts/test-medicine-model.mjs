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

console.log("medicine model checks passed");
