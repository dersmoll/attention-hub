import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

async function compile(name) {
  const source = await readFile(new URL(`../src/${name}.ts`, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    reportDiagnostics: true,
  });
  assert.equal(compiled.diagnostics?.length ?? 0, 0);
  return compiled.outputText;
}
const dataUrl = (source) => `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
const workspaceUrl = dataUrl(await compile("workspace-model"));
const medicineUrl = dataUrl(await compile("medicine-model"));
const model = await import(dataUrl((await compile("day-plan-model"))
  .replace('from "./workspace-model"', `from ${JSON.stringify(workspaceUrl)}`)
  .replace('from "./medicine-model"', `from ${JSON.stringify(medicineUrl)}`)));
const workspaceModel = await import(workspaceUrl);
const medicineModel = await import(medicineUrl);

// Run the same selectors in UTC, a positive offset and a DST-observing zone.
const originalTz = process.env.TZ;
try {
  for (const zone of ["UTC", "Europe/Kyiv", "America/New_York"]) {
    process.env.TZ = zone;
    const now = new Date(2026, 8, 14, 20);
    const timestamp = (day, hour = 12) => new Date(2026, 8, day, hour).toISOString();
    const base = { ownerKind: "list", ownerId: "inbox", title: "Task", notes: [], dueOn: null, remindAt: null, completedAt: null, createdAt: timestamp(10), updatedAt: timestamp(10) };
    const item = (id, overrides) => ({ ...base, id, ...overrides });
    const tasks = [
      item("today", { dueOn: "2026-09-14" }),
      item("overdue", { dueOn: "2026-09-12" }),
      item("tomorrow", { dueOn: "2026-09-15" }),
      item("reminder", { remindAt: timestamp(15, 0) }),
      item("both", { dueOn: "2026-09-14", remindAt: timestamp(15) }),
      item("completed", { dueOn: "2026-09-15", completedAt: timestamp(14) }),
      item("yesterday", { dueOn: "2026-09-13" }),
      item("completedYesterday", { completedAt: timestamp(13) }),
      item("createdLater", { dueOn: "2026-09-13", createdAt: timestamp(14, 0) }),
      item("archived", { ownerKind: "project", ownerId: "archived", dueOn: "2026-09-13" }),
      item("archivedFuture", { ownerKind: "project", ownerId: "archived", dueOn: "2026-09-15" }),
      item("unscheduled", {}),
    ];
    const workspace = { actionItems: tasks, projects: [{ id: "archived", archivedAt: timestamp(14) }] };
    const ids = (rows) => rows.map((row) => row.id).sort();
    assert.deepEqual(model.dayPlanTodos(workspace, "2026-09-14", now).scheduled,
      workspaceModel.sortActionItems(tasks.filter((task) => workspaceModel.isFromActiveOwner(task, workspace) && workspaceModel.isVisibleInToday(task, now))));
    const future = model.dayPlanTodos(workspace, "2026-09-15", now);
    assert.deepEqual(ids(future.scheduled), ["both", "reminder", "tomorrow"]);
    assert.deepEqual(ids(future.carryover), ["createdLater", "overdue", "today", "yesterday"]);
    assert.deepEqual(ids(model.dayPlanTodos(workspace, "2026-09-13", now).scheduled), ["archived", "completedYesterday", "yesterday"]);
    assert.deepEqual(model.dayPlanTodos(null, "2026-09-15", now), { scheduled: [], carryover: [] });

    const treatment = { id: "active", startOn: "2026-09-01", endOn: "2026-09-30", archivedAt: null, completedAt: null, sortIndex: 0 };
    const treatments = [treatment, { ...treatment, id: "finished", completedAt: timestamp(14) }, { ...treatment, id: "archived", archivedAt: timestamp(14) }, { ...treatment, id: "upcoming", startOn: "2026-09-15" }];
    const medicines = treatments.map((course) => ({ id: course.id, treatmentId: course.id, startOn: course.startOn, endOn: course.endOn, sortIndex: 0 }));
    const doses = treatments.flatMap((course) => [13, 14, 15].map((day) => ({ medicineId: course.id, slotDay: `2026-09-${day}`, slotTime: "09:00", takenAt: day === 13 ? timestamp(13, 9) : null, skippedAt: null })));
    const snapshot = { treatments, medicines, doses };
    assert.deepEqual(model.dayPlanMedicine(snapshot, "2026-09-14", now), medicineModel.medicineDailyRows(snapshot, now));
    const futureDoses = model.dayPlanMedicine(snapshot, "2026-09-15", now);
    assert.deepEqual(futureDoses.map((row) => row.medicine.id), ["active", "upcoming"]);
    assert.ok(futureDoses.every((row) => row.state === "upcoming"), "Preview uses actual clock, never tomorrow's clock");
    const pastDoses = model.dayPlanMedicine(snapshot, "2026-09-13", now);
    assert.equal(pastDoses.length, 4, "Retained historical records survive course lifecycle changes");
    assert.ok(pastDoses.every((row) => row.state === "taken"));
    assert.deepEqual(model.dayPlanMedicine({ ...snapshot, doses: [] }, "2026-09-13", now), [], "Never fabricate past records");
    assert.deepEqual(model.dayPlanMedicine(null, "2026-09-15", now), []);

    assert.equal(model.planDayLabel("2026-09-13", now), "Yesterday");
    assert.equal(model.planDayLabel("2026-09-14", now), "Today");
    assert.equal(model.planDayLabel("2026-09-15", now), "Tomorrow");
    assert.equal(model.planDayLabel("2026-09-15", new Date(2026, 8, 15, 0)), "Today", "Labels roll over at local midnight");
    assert.equal(model.shiftPlanDay("2026-12-31", 1), "2027-01-01");
    assert.equal(model.shiftPlanDay("2024-03-01", -1), "2024-02-29");
    assert.throws(() => model.shiftPlanDay("2026-02-30", 1), RangeError);
    for (const day of ["2026-03-08", "2026-11-01", "2026-03-29", "2026-10-25"]) {
      const bounds = model.planDayBounds(day);
      assert.equal(workspaceModel.localDateKey(bounds.start), day);
      assert.equal(workspaceModel.localDateKey(bounds.end), model.shiftPlanDay(day, 1));
      assert.equal(bounds.start.getHours(), 0);
      assert.equal(bounds.end.getHours(), 0);
    }
    if (zone === "America/New_York") {
      const spring = model.planDayBounds("2026-03-08");
      const autumn = model.planDayBounds("2026-11-01");
      assert.equal((spring.end - spring.start) / 3_600_000, 23);
      assert.equal((autumn.end - autumn.start) / 3_600_000, 25);
    }
  }
} finally {
  if (originalTz === undefined) delete process.env.TZ;
  else process.env.TZ = originalTz;
}
console.log("Day plan model tests passed (UTC, Kyiv, New York; DST, rollover, tasks and retained doses).");
