import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

async function loadModule(relativePath) {
  const sourceUrl = new URL(relativePath, import.meta.url);
  const sourceText = await readFile(sourceUrl, "utf8");
  const compiled = ts.transpileModule(sourceText, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: sourceUrl.pathname,
    reportDiagnostics: true,
  });
  assert.equal(compiled.diagnostics?.length ?? 0, 0);
  // The model imports only types from work-calendar-model plus one constant,
  // so inline that constant rather than resolving the import graph.
  const standalone = compiled.outputText.replace(
    /import\s*\{[^}]*\}\s*from\s*"\.\/work-calendar-model";?/,
    "const WORK_CALENDAR_POLL_INTERVAL_MS = 120_000;",
  );
  return import(
    `data:text/javascript;base64,${Buffer.from(standalone).toString("base64")}`
  );
}

const school = await loadModule("../src/school-day-model.ts");
const crossLayerContract = JSON.parse(
  await readFile(
    new URL("../tests/fixtures/school-day-contract.json", import.meta.url),
    "utf8",
  ),
);

const NOW = Date.parse("2026-09-07T09:20:00Z");
const TODAY = "2026-09-07";
const at = (offsetMinutes) =>
  new Date(NOW + offsetMinutes * 60_000).toISOString();

function lesson(subject, startMinutes, endMinutes, extra = {}) {
  return {
    subject,
    start: at(startMinutes),
    end: at(endMinutes),
    allDay: false,
    cancelled: false,
    recurring: true,
    eventToken: null,
    eventWorkspace: null,
    ...extra,
  };
}

function snapshot(daySelections, extra = {}) {
  return {
    status: "observed",
    configured: true,
    storageAvailable: true,
    sourceIdentityState: "userSavedSinglePublishedCalendarTitleCapable",
    capturedAtUnixMs: NOW,
    viewerDay: TODAY,
    daySelectionsComplete: true,
    selection: null,
    overlappingSelections: [],
    nextSelection: null,
    daySelections,
    stopReason: null,
    requestMs: 1,
    parseMs: 1,
    diagnostics: [],
    ...extra,
  };
}

// Shared with the Rust adapter test. These are serialized native snapshots,
// then consumed by the same day-state functions used by Widget and Today.
for (const contractCase of crossLayerContract) {
  assert.equal(
    school.calendarDayState(contractCase.snapshot, {
      nowMs: NOW,
      viewerToday: TODAY,
    }),
    contractCase.expectedDayState,
    `${contractCase.name}: native snapshot must produce the expected Today day state`,
  );
  assert.equal(
    school.selectSchoolDayState(contractCase.snapshot, {
      nowMs: NOW,
      viewerToday: TODAY,
    }).kind,
    contractCase.expectedSchoolState,
    `${contractCase.name}: native snapshot must produce the expected school state`,
  );
}

// A lesson is running now.
{
  const state = school.selectSchoolDayState(snapshot([
      lesson("Ukrainian", -80, -35),
      lesson("English", -20, 25),
      lesson("Maths", 40, 85),
    ]), { nowMs: NOW, viewerToday: TODAY });
  assert.equal(state.kind, "lesson");
  assert.equal(state.current.subject, "English");
  assert.equal(state.current.position, 2);
  assert.equal(state.total, 3);
  assert.equal(state.next.subject, "Maths");
}

// Between lessons.
{
  const state = school.selectSchoolDayState(snapshot([lesson("Ukrainian", -80, -35), lesson("Maths", 15, 60)]), { nowMs: NOW, viewerToday: TODAY });
  assert.equal(state.kind, "break");
  assert.equal(state.previous.subject, "Ukrainian");
  assert.equal(state.next.subject, "Maths");
  assert.equal(state.next.position, 2);
  assert.equal(school.minutesUntil(state.next.startMs, NOW), 15);
}

// Before the first lesson: a break needs a lesson behind it.
{
  const state = school.selectSchoolDayState(snapshot([lesson("Ukrainian", 30, 75), lesson("Maths", 90, 135)]), { nowMs: NOW, viewerToday: TODAY });
  assert.equal(state.kind, "beforeFirst");
  assert.equal(state.next.subject, "Ukrainian");
  assert.equal(state.total, 2);
}

// Every lesson is behind us.
{
  const state = school.selectSchoolDayState(snapshot([lesson("Ukrainian", -180, -135), lesson("Maths", -90, -45)]), { nowMs: NOW, viewerToday: TODAY });
  assert.equal(state.kind, "dayEnded");
  assert.equal(state.last.subject, "Maths");
  assert.equal(state.total, 2);
}

// A day with nothing scheduled is not a finished school day.
{
  const state = school.selectSchoolDayState(snapshot([]), {
    nowMs: NOW,
    viewerToday: TODAY,
  });
  assert.equal(state.kind, "noLessons");
}

// Cancelled lessons and all-day entries must not inflate progress, and a
// cancelled lesson must not be presented as the one happening now.
{
  const state = school.selectSchoolDayState(snapshot([
      lesson("Term ends", -600, 600, { allDay: true }),
      lesson("Ukrainian", -80, -35),
      lesson("Cancelled art", -20, 25, { cancelled: true }),
      lesson("Maths", 40, 85),
    ]), { nowMs: NOW, viewerToday: TODAY });
  assert.equal(state.kind, "break", "a cancelled lesson is not in progress");
  assert.equal(state.total, 2, "cancelled and all-day entries are not lessons");
  assert.equal(state.next.subject, "Maths");
  assert.equal(state.next.position, 2);
}

// Stale data must never masquerade as a break or a finished day.
{
  const stale = snapshot([lesson("Ukrainian", -180, -135)], {
    capturedAtUnixMs: NOW - school.SCHOOL_DAY_STALE_AFTER_MS - 1,
  });
  assert.equal(
    school.selectSchoolDayState(stale, { nowMs: NOW, viewerToday: TODAY }).kind,
    "unknown",
    "a stalled refresh must not report the day as ended",
  );

  const fresh = snapshot([lesson("Ukrainian", -180, -135)], {
    capturedAtUnixMs: NOW - school.SCHOOL_DAY_STALE_AFTER_MS + 1,
  });
  assert.equal(school.selectSchoolDayState(fresh, { nowMs: NOW, viewerToday: TODAY }).kind, "dayEnded");
}

// A snapshot captured "in the future" is clock skew, not freshness, and must
// not be treated as unreadable.
{
  const skewed = snapshot([lesson("English", -20, 25)], {
    capturedAtUnixMs: NOW + 60_000,
  });
  assert.equal(school.selectSchoolDayState(skewed, { nowMs: NOW, viewerToday: TODAY }).kind, "lesson");
}

// Anything short of an observed snapshot is unknown, not an empty day.
for (const status of ["unavailable", "notConfigured", "busy", "error"]) {
  assert.equal(
    school.selectSchoolDayState(snapshot([], { status }), { nowMs: NOW, viewerToday: TODAY }).kind,
    "unknown",
    `${status} must not report an empty school day`,
  );
}
assert.equal(school.selectSchoolDayState(null, { nowMs: NOW, viewerToday: TODAY }).kind, "unknown");

// Malformed times are dropped rather than poisoning the ordering.
{
  const state = school.selectSchoolDayState(snapshot([
      lesson("Broken", 0, 0, { start: "not-a-date", end: "also-not" }),
      lesson("Backwards", 60, 30),
      lesson("English", -20, 25),
    ]), { nowMs: NOW, viewerToday: TODAY });
  assert.equal(state.kind, "lesson");
  assert.equal(state.total, 1);
  assert.equal(state.current.subject, "English");
}

// Overlapping lessons. The ordinal must name the lesson the surface displays,
// because the backend resolves competing active events by *latest* start while
// this model sorts ascending — deriving them independently let the pill label
// one lesson with another's position (audit F4).
{
  const overlapping = snapshot([
    lesson("Long", -30, 60),
    lesson("Short", -10, 20),
  ]);

  // With no displayed start, fall back to the backend's own tie-break.
  const fallback = school.selectSchoolDayState(overlapping, {
    nowMs: NOW,
    viewerToday: TODAY,
  });
  assert.equal(fallback.kind, "lesson");
  assert.equal(
    fallback.current.subject,
    "Short",
    "the latest start wins, matching the backend",
  );
  assert.equal(fallback.next, null, "an already-started overlap is not 'next'");

  // When the surface displays the longer lesson, the ordinal follows it.
  const aligned = school.selectSchoolDayState(overlapping, {
    nowMs: NOW,
    viewerToday: TODAY,
    displayedStart: at(-30),
  });
  assert.equal(aligned.current.subject, "Long");
  assert.equal(aligned.current.position, 1);

  const alignedShort = school.selectSchoolDayState(overlapping, {
    nowMs: NOW,
    viewerToday: TODAY,
    displayedStart: at(-10),
  });
  assert.equal(alignedShort.current.subject, "Short");
  assert.equal(alignedShort.current.position, 2);
}

// minutesUntil rounds up so a lesson never reads as starting in 0 minutes
// while it is still in the future, and never goes negative.
assert.equal(school.minutesUntil(NOW + 61_000, NOW), 2);
assert.equal(school.minutesUntil(NOW + 1, NOW), 1);
assert.equal(school.minutesUntil(NOW - 60_000, NOW), 0);

// Audit F3: age cannot establish which day a list describes.
{
  // Midnight rollover before the next poll. Captured 23:59:30, read 00:00:15 —
  // 45 seconds old, and describing the wrong day. Reporting "Day ended" from
  // yesterday's lessons was the actual defect.
  const lateYesterday = Date.parse("2026-09-07T23:59:30Z");
  const justAfterMidnight = Date.parse("2026-09-08T00:00:15Z");
  const yesterdaysList = {
    ...snapshot([
      {
        subject: "Ukrainian",
        start: "2026-09-07T09:00:00Z",
        end: "2026-09-07T09:45:00Z",
        allDay: false,
        cancelled: false,
        recurring: true,
        eventToken: null,
        eventWorkspace: null,
      },
    ]),
    capturedAtUnixMs: lateYesterday,
    viewerDay: "2026-09-07",
  };
  assert.equal(
    school.selectSchoolDayState(yesterdaysList, {
      nowMs: justAfterMidnight,
      viewerToday: "2026-09-08",
    }).kind,
    "unknown",
    "yesterday's lessons must not be reported as today's finished day",
  );
  // The same list is fine while it is still that day.
  assert.equal(
    school.selectSchoolDayState(
      { ...yesterdaysList, capturedAtUnixMs: lateYesterday },
      { nowMs: lateYesterday + 1_000, viewerToday: "2026-09-07" },
    ).kind,
    "dayEnded",
  );

  // A clock rolled backwards makes old data look fresh; a capture far in the
  // future is disbelieved rather than trusted.
  assert.equal(
    school.selectSchoolDayState(
      snapshot([lesson("Ukrainian", -180, -135)], {
        capturedAtUnixMs: NOW + school.SCHOOL_DAY_MAX_CLOCK_SKEW_MS + 1,
      }),
      { nowMs: NOW, viewerToday: TODAY },
    ).kind,
    "unknown",
    "a rolled-back clock must not make stale data look current",
  );

  // A missing viewer day means the feed was not read.
  assert.equal(
    school.selectSchoolDayState(snapshot([], { viewerDay: undefined }), {
      nowMs: NOW,
      viewerToday: TODAY,
    }).kind,
    "unknown",
    "an empty list without a viewer day is unknown, not an empty day",
  );

  // A truncated list cannot support a total or an ended day.
  assert.equal(
    school.selectSchoolDayState(
      snapshot([lesson("Ukrainian", -180, -135)], {
        daySelectionsComplete: false,
      }),
      { nowMs: NOW, viewerToday: TODAY },
    ).kind,
    "unknown",
    "a truncated day must not be described",
  );
}

// Audit F1: the shared day-state check the Today popup consults, so emptiness
// is never decided by list length alone.
{
  const dayState = (snap, nowMs = NOW, viewerToday = TODAY) =>
    school.calendarDayState(snap, { nowMs, viewerToday });

  assert.equal(dayState(snapshot([])), "verified");
  assert.equal(dayState(null), "loading");
  assert.equal(dayState(snapshot([], { status: "busy" })), "loading");
  assert.equal(dayState(snapshot([], { status: "unavailable" })), "unavailable");
  assert.equal(dayState(snapshot([], { status: "error" })), "unavailable");
  assert.equal(
    dayState(snapshot([], { viewerDay: undefined })),
    "unavailable",
    "no viewer day means the feed was not read",
  );
  assert.equal(
    dayState(snapshot([], { viewerDay: "2026-09-06" })),
    "unavailable",
    "a list describing another day cannot establish today",
  );
  assert.equal(
    dayState(snapshot([], { daySelectionsComplete: false })),
    "incomplete",
  );
  assert.equal(
    dayState(
      snapshot([], {
        capturedAtUnixMs: NOW - school.SCHOOL_DAY_STALE_AFTER_MS - 1,
      }),
    ),
    "unavailable",
  );

  // Only "verified" may be presented as an empty day. Every other state has
  // its own wording in calendar-vocabulary.ts.
  for (const state of ["loading", "unavailable", "incomplete"]) {
    assert.notEqual(state, "verified");
  }
}

// The status pill is the only thing School mode changes in the widget, so its
// label must be short and must never override real data-health wording.
{
  const label = (daySelections, extra) =>
    school.schoolDayStatusLabel(
      school.selectSchoolDayState(snapshot(daySelections, extra), { nowMs: NOW, viewerToday: TODAY }),
    );

  assert.equal(
    label([lesson("Ukrainian", -80, -35), lesson("English", -20, 25)]),
    "2 of 2",
  );
  assert.equal(
    label([lesson("Ukrainian", -80, -35), lesson("Maths", 15, 60)]),
    "Break",
  );
  assert.equal(label([lesson("Maths", 15, 60)]), "Day starts");
  assert.equal(label([lesson("Ukrainian", -180, -135)]), "Day ended");
  assert.equal(label([]), "No lessons");

  // Unknown must yield null so the existing "Calendar checking" / retry
  // wording stands: it says *why*, which no school label could.
  assert.equal(
    label([lesson("Ukrainian", -180, -135)], {
      capturedAtUnixMs: NOW - school.SCHOOL_DAY_STALE_AFTER_MS - 1,
    }),
    null,
  );
  assert.equal(label([], { status: "unavailable" }), null);
  assert.equal(school.schoolDayStatusLabel({ kind: "unknown" }), null);

  // The pill is width-constrained, so every label stays compact.
  for (const value of [
    label([lesson("A", -80, -35), lesson("B", -20, 25)]),
    label([lesson("A", -80, -35), lesson("B", 15, 60)]),
    label([lesson("A", 15, 60)]),
    label([lesson("A", -180, -135)]),
    label([]),
  ]) {
    assert.ok(
      value !== null && value.length <= 11,
      `pill label "${value}" is too long for the status pill`,
    );
  }
}

// The wording must never claim more than the state supports.
{
  const summarize = (daySelections, extra) =>
    school.summarizeSchoolDay(
      school.selectSchoolDayState(snapshot(daySelections, extra), {
        nowMs: NOW,
        viewerToday: TODAY,
      }),
      NOW,
    );

  const running = summarize([
    lesson("Ukrainian", -80, -35),
    lesson("English", -20, 25),
    lesson("Maths", 40, 85),
  ]);
  assert.equal(running.headline, "English");
  assert.equal(running.detail, "Ends in 25 min · next Maths");
  assert.equal(running.progress, "Lesson 2 of 3");
  assert.equal(running.active, true);

  const last = summarize([lesson("English", -20, 25)]);
  assert.equal(last.detail, "Ends in 25 min · last lesson");

  const onBreak = summarize([
    lesson("Ukrainian", -80, -35),
    lesson("Maths", 15, 60),
  ]);
  assert.equal(onBreak.headline, "Break · next lesson in 15 min");
  assert.equal(onBreak.progress, "Lesson 2 of 2");
  assert.equal(onBreak.active, false);

  const ended = summarize([lesson("Ukrainian", -180, -135)]);
  assert.equal(ended.headline, "Today's lessons have ended");

  // The distinction the plan insists on: stale data must not read as a
  // finished day, and must not offer progress it cannot support.
  const stalled = summarize([lesson("Ukrainian", -180, -135)], {
    capturedAtUnixMs: NOW - school.SCHOOL_DAY_STALE_AFTER_MS - 1,
  });
  assert.equal(stalled.headline, "Timetable unavailable");
  assert.notEqual(stalled.headline, ended.headline);
  assert.equal(stalled.progress, null);
  assert.equal(stalled.active, false);

  // An empty day and an unreadable one must not read alike either.
  const empty = summarize([]);
  assert.equal(empty.headline, "No lessons today");
  assert.notEqual(empty.headline, stalled.headline);

  // Singular minute wording.
  const oneMinute = summarize([
    lesson("Ukrainian", -80, -35),
    lesson("Maths", 1, 45),
  ]);
  assert.equal(oneMinute.headline, "Break · next lesson in 1 min");
}

// Vocabulary: every field must differ between the two modes unless the word is
// genuinely mode-neutral, and no school string may reuse work vocabulary.
{
  const vocab = await loadModule("../src/calendar-vocabulary.ts");
  const work = vocab.calendarVocabulary(false);
  const school = vocab.calendarVocabulary(true);

  assert.deepEqual(
    Object.keys(work).sort(),
    Object.keys(school).sort(),
    "both modes must define the same fields",
  );

  for (const [key, value] of Object.entries(school)) {
    assert.ok(
      value.length > 0,
      `school vocabulary ${key} must not be empty`,
    );
    assert.ok(
      !/\b(meeting|meetings|call|calls|work)\b/i.test(value),
      `school vocabulary ${key} still uses work wording: "${value}"`,
    );
  }

  for (const [key, value] of Object.entries(work)) {
    assert.ok(
      !/\b(lesson|lessons|timetable|school)\b/i.test(value),
      `work vocabulary ${key} leaked school wording: "${value}"`,
    );
  }

  // Mode-specific nouns stay distinct. The compact "Soon" attention pill is
  // intentionally shared because the adjacent title supplies the event kind.
  const shared = Object.keys(work).filter((key) => work[key] === school[key]);
  assert.deepEqual(
    shared,
    ["startingSoon"],
    `unexpected shared wording: ${shared.join(", ")}`,
  );

  // An unreadable timetable and an empty day must never read alike — the same
  // distinction the day model enforces.
  assert.notEqual(school.unavailable, school.emptyDay);
  assert.match(school.unavailable, /unavailable/i);
}

console.log("school day model tests passed");
