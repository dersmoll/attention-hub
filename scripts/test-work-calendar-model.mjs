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
const pollControllerUrl = new URL("../src/calendar-poll-controller.ts", import.meta.url);
const pollControllerSource = await readFile(pollControllerUrl, "utf8");
const compiledPollController = ts.transpileModule(pollControllerSource, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  fileName: pollControllerUrl.pathname,
  reportDiagnostics: true,
});
assert.equal(compiledPollController.diagnostics?.length ?? 0, 0);
const pollController = await import(
  `data:text/javascript;base64,${Buffer.from(compiledPollController.outputText).toString("base64")}`
);

assert.equal(calendar.workCalendarJoinLabel(false), "Join");
assert.equal(calendar.workCalendarJoinLabel(true), "Rejoin");

assert.equal(
  calendar.workCalendarOccupiedMinutes(
    [
      { start: "2026-08-24T09:00:00Z", end: "2026-08-24T10:00:00Z", allDay: false },
      { start: "2026-08-24T09:30:00Z", end: "2026-08-24T11:00:00Z", allDay: false },
      { start: "2026-08-24T12:00:00Z", end: "2026-08-24T12:30:00Z", allDay: false },
      { start: "2026-08-24T13:00:00Z", end: "2026-08-24T14:00:00Z", allDay: false, cancelled: true },
      { start: "2026-08-24T00:00:00Z", end: "2026-08-25T00:00:00Z", allDay: true },
    ],
    new Date("2026-08-24T00:00:00Z"),
    new Date("2026-08-25T00:00:00Z"),
  ),
  150,
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

const temporaryFailure = {
  ...snapshot,
  status: "unavailable",
  selection: null,
  overlappingSelections: [],
  nextSelection: null,
};
assert.equal(
  calendar.retainWorkCalendarSnapshot(
    snapshot,
    temporaryFailure,
    Date.parse("2026-08-21T10:30:00Z"),
  ),
  snapshot,
);
assert.equal(
  calendar.retainWorkCalendarSnapshot(
    snapshot,
    temporaryFailure,
    Date.parse("2026-08-21T11:00:01Z"),
  ),
  temporaryFailure,
);
const removedCalendar = { ...temporaryFailure, status: "notConfigured" };
assert.equal(
  calendar.retainWorkCalendarSnapshot(snapshot, removedCalendar),
  removedCalendar,
);

assert.equal(
  calendar.workCalendarRetryNotice({
    consecutiveFailures: 1,
    lastSuccessfulAtUnixMs: Date.parse("2026-08-21T10:00:00Z"),
    stopReason: "requestTimeout",
    nowMs: Date.parse("2026-08-21T10:02:00Z"),
  }),
  null,
);
const retryNotice = calendar.workCalendarRetryNotice({
  consecutiveFailures: 2,
  lastSuccessfulAtUnixMs: Date.parse("2026-08-21T10:00:00Z"),
  stopReason: "requestTimeout",
  nowMs: Date.parse("2026-08-21T10:02:00Z"),
});
assert.equal(retryNotice.state, "Calendar sync delayed");
assert.match(retryNotice.detail, /took too long/i);
assert.match(retryNotice.detail, /2 minutes ago/i);
assert.doesNotMatch(retryNotice.detail, /https?:|:\/\//i);

const pendingPolls = [];
const scheduledPolls = [];
const controller = pollController.createCalendarPollController({
  refresh: () => new Promise((resolve) => pendingPolls.push(resolve)),
  nextDelay: () => 30_000,
  setTimer: (callback, delay) => {
    const timer = { callback, delay, cleared: false };
    scheduledPolls.push(timer);
    return timer;
  },
  clearTimer: (timer) => {
    timer.cleared = true;
  },
});
controller.start();
controller.requestRefresh();
controller.requestRefresh();
assert.equal(pendingPolls.length, 1, "in-flight refreshes are coalesced");
pendingPolls.shift()({ status: "observed" });
await new Promise((resolve) => setImmediate(resolve));
assert.equal(pendingPolls.length, 1, "coalesced refresh runs once after completion");
pendingPolls.shift()({ status: "observed" });
await new Promise((resolve) => setImmediate(resolve));
assert.equal(scheduledPolls.length, 1, "one timer remains after the follow-up refresh");
controller.dispose();
assert.equal(scheduledPolls[0].cleared, true, "disposing clears the sole scheduled poll");

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

const alertNow = Date.parse("2026-08-21T11:58:30Z");
assert.deepEqual(
  calendar.nextWorkCalendarMeetingAlert(simultaneousUpcoming, alertNow),
  {
    key: "2026-08-21T12:00:00.000Z",
    startMs: Date.parse("2026-08-21T12:00:00Z"),
    delayMs: 30_000,
  },
);
assert.equal(
  calendar.nextWorkCalendarMeetingAlert(
    simultaneousUpcoming,
    Date.parse("2026-08-21T11:59:30Z"),
  )?.delayMs,
  0,
);
assert.equal(
  calendar.nextWorkCalendarMeetingAlert(snapshot, alertNow)?.key,
  "2026-08-21T12:00:00.000Z",
);
assert.equal(
  calendar.nextWorkCalendarMeetingAlert(
    {
      ...simultaneousUpcoming,
      selection: { ...upcoming, allDay: true },
      overlappingSelections: [],
    },
    alertNow,
  ),
  null,
);
assert.equal(
  calendar.nextWorkCalendarMeetingAlert(
    { ...simultaneousUpcoming, status: "unavailable" },
    alertNow,
  ),
  null,
);
assert.equal(
  calendar.nextWorkCalendarMeetingAlert(
    { ...snapshot, selection: activeOne, overlappingSelections: [], nextSelection: null },
    alertNow,
  ),
  null,
);
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

/* A join token's lifetime is derived from how often this surface polls the
 * calendar, but the two constants live on opposite sides of the IPC boundary.
 * Rust mirrors this value and derives the TTL from it; if the interval here
 * grows past the mirror, a displayed Join button can expire while on screen. */
const tokenCacheSource = await readFile(
  new URL("../src-tauri/src/work_calendar/mod.rs", import.meta.url),
  "utf8",
);
const mirroredInterval = tokenCacheSource.match(
  /const WIDGET_CALENDAR_POLL_INTERVAL_MS: u64 = ([\d_]+);/,
);
assert.ok(mirroredInterval, "the Rust token cache must mirror the poll interval");
assert.equal(
  Number(mirroredInterval[1].replaceAll("_", "")),
  calendar.WORK_CALENDAR_POLL_INTERVAL_MS,
  "src-tauri/src/work_calendar/mod.rs must mirror WORK_CALENDAR_POLL_INTERVAL_MS",
);

console.log("work calendar display tests passed");
