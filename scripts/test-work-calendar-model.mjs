import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const sourceUrl = new URL("../src/work-calendar-model.ts", import.meta.url);
const sourceText = await readFile(sourceUrl, "utf8");
const compiled = ts.transpileModule(sourceText, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  fileName: sourceUrl.pathname,
  reportDiagnostics: true,
});
assert.equal(compiled.diagnostics?.length ?? 0, 0);
const calendar = await import(
  `data:text/javascript;base64,${Buffer.from(compiled.outputText).toString("base64")}`
);

const activeOne = {
  subject: "Primary active",
  start: "2026-08-21T10:00:00Z",
  end: "2026-08-21T11:00:00Z",
  allDay: false,
  classification: "active",
  meetingLinkPresent: true,
  joinToken: "join-1",
};
const activeTwo = {
  ...activeOne,
  subject: "Overlapping active",
  start: "2026-08-21T09:30:00Z",
  joinToken: "join-2",
};
const upcoming = {
  ...activeOne,
  subject: "Upcoming",
  start: "2026-08-21T12:00:00Z",
  end: "2026-08-21T13:00:00Z",
  classification: "upcoming",
  joinToken: null,
};
const snapshot = {
  status: "observed",
  configured: true,
  storageAvailable: true,
  sourceIdentityState: "userSavedSinglePublishedCalendarTitleCapable",
  capturedAtUnixMs: 1,
  selection: activeOne,
  overlappingSelections: [activeTwo],
  nextSelection: upcoming,
  stopReason: null,
  requestMs: 1,
  parseMs: 1,
  diagnostics: [],
};

const primaryKey = calendar.workCalendarSelectionKey(activeOne, "primary");
const overlappingKey = calendar.workCalendarSelectionKey(
  activeTwo,
  "overlap-0",
);

const overlapping = calendar.selectWorkCalendarDisplay(
  snapshot,
  new Set(),
  primaryKey,
);
assert.equal(overlapping.selection.subject, "Primary active");
assert.equal(overlapping.selectionKey, primaryKey);
assert.equal(overlapping.companion.subject, "Overlapping active");
assert.equal(overlapping.companionKey, overlappingKey);
assert.equal(overlapping.hasOverlap, true);

const primaryFinished = calendar.selectWorkCalendarDisplay(
  snapshot,
  new Set([primaryKey]),
  primaryKey,
);
assert.equal(primaryFinished.selection.subject, "Overlapping active");
assert.equal(primaryFinished.selectionKey, overlappingKey);
assert.equal(primaryFinished.companion, null);

const overlapFinished = calendar.selectWorkCalendarDisplay(
  snapshot,
  new Set([overlappingKey]),
  primaryKey,
);
assert.equal(overlapFinished.selection.subject, "Primary active");
assert.equal(overlapFinished.companion.subject, "Upcoming");
assert.equal(overlapFinished.hasOverlap, false);

const allActiveFinished = calendar.selectWorkCalendarDisplay(
  snapshot,
  new Set([primaryKey, overlappingKey]),
  primaryKey,
);
assert.equal(allActiveFinished.selection.subject, "Upcoming");
assert.equal(allActiveFinished.companion, null);

const simultaneousUpcoming = {
  ...snapshot,
  selection: upcoming,
  overlappingSelections: [
    {
      ...upcoming,
      subject: "Parallel upcoming",
      end: "2026-08-21T13:30:00Z",
      joinToken: "join-3",
    },
  ],
  nextSelection: null,
};
const upcomingPair = calendar.selectWorkCalendarDisplay(
  simultaneousUpcoming,
  new Set(),
  null,
);
assert.equal(upcomingPair.selection.subject, "Upcoming");
assert.equal(upcomingPair.companion.subject, "Parallel upcoming");
assert.equal(upcomingPair.hasOverlap, true);

const chosenParallel = calendar.selectWorkCalendarDisplay(
  simultaneousUpcoming,
  new Set([upcomingPair.selectionKey]),
  upcomingPair.companionKey,
);
assert.equal(chosenParallel.selection.subject, "Parallel upcoming");
assert.equal(chosenParallel.companion, null);

console.log("work calendar display tests passed");
