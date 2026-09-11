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
const cacheUrl = new URL("../src/work-calendar-display-cache.ts", import.meta.url);
const cacheSource = await readFile(cacheUrl, "utf8");
const compiledCache = ts.transpileModule(cacheSource, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  fileName: cacheUrl.pathname,
  reportDiagnostics: true,
});
assert.equal(compiledCache.diagnostics?.length ?? 0, 0);
const displayCache = await import(
  `data:text/javascript;base64,${Buffer.from(compiledCache.outputText).toString("base64")}`
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

assert.deepEqual(
  calendar.workCalendarSaveResultMessage({
    saveResult: { status: "carryOverApplied", carriedAssociationCount: 0 },
  }),
  {
    tone: "success",
    message:
      "0 calendar associations were carried over. The new source is saved, and previous associations were preserved.",
  },
  "zero carry-over must be stated explicitly rather than presented as generic success",
);
const appSource = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
const publishedIcsSource = await readFile(
  new URL("../src-tauri/src/published_ics/mod.rs", import.meta.url),
  "utf8",
);
assert.match(appSource, /const PUBLISHED_ICS_UI_DEADLINE_MS = 40_000;/);
assert.match(publishedIcsSource, /const CONNECT_TIMEOUT: Duration = Duration::from_secs\(5\);/);
assert.match(publishedIcsSource, /const REQUEST_TIMEOUT: Duration = Duration::from_secs\(30\);/);
assert.match(publishedIcsSource, /const COMMAND_DEADLINE: Duration = Duration::from_secs\(35\);/);
assert.match(publishedIcsSource, /tokio::time::timeout\(COMMAND_DEADLINE, &mut task\)/);
assert.match(appSource, /Paste an Outlook or Google published iCal\/ICS link/);
assert.match(appSource, /Google\s+iCal links already include the event titles/);
assert.match(appSource, /I understand this published calendar shares event titles/);
assert.match(
  appSource,
  /setPublishedIcsUrl\(event\.target\.value\);[\s\S]{0,300}setTitleCapabilityConfirmed\(false\);/,
  "editing a link must retire the exact-link title acknowledgement",
);
assert.doesNotMatch(appSource, /I set this exact Outlook calendar publication/);
assert.doesNotMatch(appSource, /Preview Project Hub/);
assert.match(
  calendar.workCalendarSaveResultMessage({
    saveResult: { status: "carryOverApplied", carriedAssociationCount: 1 },
  }).message,
  /^Carried 1 calendar association onto/,
);
assert.match(
  calendar.workCalendarSaveResultMessage({
    saveResult: { status: "carryOverApplied", carriedAssociationCount: 2 },
  }).message,
  /^Carried 2 calendar associations onto/,
);
assert.deepEqual(
  calendar.workCalendarSaveResultMessage({
    saveResult: { status: "carryOverFailed" },
  }),
  {
    tone: "error",
    message:
      "The new calendar source was saved, but its associations could not be carried over. Previous associations were preserved.",
  },
);
const credentialReadFailure = calendar.workCalendarSaveResultMessage({
  saveResult: { status: "credentialReadFailed" },
});
assert.equal(credentialReadFailure.tone, "error");
assert.match(credentialReadFailure.message, /could not read the existing calendar source/i);
assert.match(credentialReadFailure.message, /was not saved/i);
assert.match(credentialReadFailure.message, /existing source is unchanged/i);
assert.match(credentialReadFailure.message, /available to retry/i);
assert.equal(calendar.workCalendarSaveResultMessage({}), null);

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
  occurrenceId: "occ-active-one",
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
  occurrenceId: "occ-active-two",
  subject: "Overlapping active",
  start: "2026-08-21T09:30:00Z",
  joinToken: "join-2",
};
const upcoming = {
  ...activeOne,
  occurrenceId: "occ-upcoming",
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

const meetingJustStarted = {
  ...snapshot,
  selection: {
    ...upcoming,
    start: "2026-08-21T10:00:00Z",
    end: "2026-08-21T10:30:00Z",
    classification: "upcoming",
  },
  overlappingSelections: [],
  nextSelection: null,
};
assert.equal(
  calendar.selectWorkCalendarDisplay(
    meetingJustStarted,
    new Set(),
    null,
    new Set(),
    Date.parse("2026-08-21T10:00:01Z"),
  ).selection.classification,
  "active",
  "display state must cross the start boundary without waiting for a poll",
);

const localValues = new Map();
globalThis.localStorage = {
  getItem: (key) => localValues.get(key) ?? null,
  setItem: (key, value) => localValues.set(key, String(value)),
  removeItem: (key) => localValues.delete(key),
};
const cacheSnapshot = {
  ...snapshot,
  capturedAtUnixMs: Date.parse("2026-08-21T10:00:00Z"),
  viewerDay: "2026-08-21",
  daySelectionsComplete: true,
  selection: {
    ...activeOne,
    meetingProvider: "teams",
    eventToken: "private-event-token",
    eventWorkspace: {
      projectId: "private-project",
      projectName: "Private project",
      listId: null,
      listName: null,
      notesPresent: true,
      linkUrlPresent: true,
      linkUrl: "https://private.example/event",
    },
  },
  overlappingSelections: [],
  nextSelection: null,
  daySelections: [],
};
displayCache.writeWorkCalendarDisplayCache(cacheSnapshot);
const storedDisplay = [...localValues.values()][0];
assert.doesNotMatch(storedDisplay, /join-1|private-event-token|private-project|private\.example/);
const restoredDisplay = displayCache.readWorkCalendarDisplayCache(
  Date.parse("2026-08-21T10:05:00Z"),
);
assert.equal(restoredDisplay.selection.subject, "Primary active");
assert.equal(restoredDisplay.selection.joinToken, null);
assert.equal(restoredDisplay.selection.eventToken, null);
assert.equal(restoredDisplay.selection.eventWorkspace, null);
assert.equal(
  displayCache.readWorkCalendarDisplayCache(Date.parse("2026-08-22T10:00:01Z")),
  null,
  "display cache expires after one day",
);

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
  snapshot,
  "a future next event keeps the cached snapshot useful after the primary ends",
);
assert.equal(
  calendar.retainWorkCalendarSnapshot(
    snapshot,
    temporaryFailure,
    Date.parse("2026-08-21T13:00:01Z"),
  ),
  temporaryFailure,
  "a transient failure replaces the cache after every display candidate ends",
);
const activeOverlapAfterPrimary = {
  ...snapshot,
  selection: { ...activeOne, end: "2026-08-21T10:15:00Z" },
  overlappingSelections: [
    { ...activeTwo, end: "2026-08-21T11:30:00Z" },
  ],
  nextSelection: null,
};
assert.equal(
  calendar.retainWorkCalendarSnapshot(
    activeOverlapAfterPrimary,
    temporaryFailure,
    Date.parse("2026-08-21T10:30:00Z"),
  ),
  activeOverlapAfterPrimary,
  "an active overlap keeps the cached snapshot useful after the primary ends",
);
const removedCalendar = { ...temporaryFailure, status: "notConfigured" };
assert.equal(
  calendar.retainWorkCalendarSnapshot(snapshot, removedCalendar),
  removedCalendar,
);

assert.equal(
  calendar.workCalendarRetryNotice({
    consecutiveFailures: 2,
    lastSuccessfulAtUnixMs: Date.parse("2026-08-21T10:00:00Z"),
    stopReason: "requestTimeout",
    nowMs: Date.parse("2026-08-21T10:02:00Z"),
  }),
  null,
);
assert.equal(
  calendar.workCalendarRetryNotice({
    consecutiveFailures: 3,
    lastSuccessfulAtUnixMs: Date.parse("2026-08-21T10:00:00Z"),
    stopReason: "requestTimeout",
    nowMs: Date.parse("2026-08-21T10:09:59Z"),
  }),
  null,
);
const retryNotice = calendar.workCalendarRetryNotice({
  consecutiveFailures: 3,
  lastSuccessfulAtUnixMs: Date.parse("2026-08-21T10:00:00Z"),
  stopReason: "requestTimeout",
  nowMs: Date.parse("2026-08-21T10:10:00Z"),
});
assert.equal(retryNotice.state, "Calendar sync delayed");
assert.match(retryNotice.detail, /took too long to download/i);
assert.match(retryNotice.detail, /10 minutes ago/i);
assert.doesNotMatch(retryNotice.detail, /https?:|:\/\//i);
const commandDeadlineNotice = calendar.workCalendarRetryNotice({
  consecutiveFailures: 3,
  lastSuccessfulAtUnixMs: Date.parse("2026-08-21T10:00:00Z"),
  stopReason: "commandDeadline",
  nowMs: Date.parse("2026-08-21T10:10:00Z"),
});
assert.match(commandDeadlineNotice.detail, /safety deadline/i);
assert.doesNotMatch(commandDeadlineNotice.detail, /download/i);
assert.equal(
  calendar.workCalendarRetryNotice({
    consecutiveFailures: 3,
    lastSuccessfulAtUnixMs: null,
    stopReason: "requestFailed",
    nowMs: Date.parse("2026-08-21T10:02:00Z"),
  })?.state,
  "Calendar sync delayed",
);

const nextWithoutPrimary = calendar.selectWorkCalendarDisplay(
  {
    ...snapshot,
    selection: null,
    overlappingSelections: [],
    nextSelection: upcoming,
  },
  new Set(),
  null,
  new Set(),
  Date.parse("2026-08-21T11:30:00Z"),
);
assert.equal(
  nextWithoutPrimary.selection?.occurrenceId,
  upcoming.occurrenceId,
  "a sanitized cache may promote a valid next event without a primary",
);

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
      occurrenceId: "occ-parallel-upcoming",
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
    key: "occ-upcoming",
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
  "occ-upcoming",
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

const primarySkipped = calendar.selectWorkCalendarDisplay(
  snapshot,
  new Set(),
  primaryKey,
  new Set([activeOne.occurrenceId]),
);
assert.equal(primarySkipped.selection.subject, "Overlapping active");
assert.equal(primarySkipped.companion, null);

const upcomingSkipped = calendar.selectWorkCalendarDisplay(
  simultaneousUpcoming,
  new Set(),
  null,
  new Set([upcoming.occurrenceId]),
);
assert.equal(upcomingSkipped.selection.subject, "Parallel upcoming");
assert.equal(upcomingSkipped.companion, null);
assert.equal(
  calendar.nextWorkCalendarMeetingAlert(
    simultaneousUpcoming,
    alertNow,
    new Set([upcoming.occurrenceId, "occ-parallel-upcoming"]),
  ),
  null,
  "skipped occurrences must not trigger the meeting-start sound",
);
const allSkippedIds = new Set([activeOne.occurrenceId, activeTwo.occurrenceId, upcoming.occurrenceId]);
const allSkipped = calendar.selectWorkCalendarDisplay(snapshot, new Set(), null, allSkippedIds);
assert.equal(allSkipped.selection, null);
assert.equal(calendar.firstSkippedWorkCalendarSelection(snapshot, allSkippedIds).subject, "Primary active");
assert.equal(calendar.firstSkippedWorkCalendarSelection({ ...snapshot, status: "unavailable" }, allSkippedIds), null);
const widgetSource = await readFile(new URL("../src/WidgetView.tsx", import.meta.url), "utf8");
assert.match(widgetSource, /calendarSuppressedBySkip[\s\S]+vocabulary\.skippedLocally/);
assert.match(widgetSource, /calendarSkippedSelection\.subject/);
assert.match(widgetSource, /Skipped locally · open Today to undo\./);

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
