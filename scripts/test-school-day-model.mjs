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

const NOW = Date.parse("2026-09-07T09:20:00Z");
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

// A lesson is running now.
{
  const state = school.selectSchoolDayState(
    snapshot([
      lesson("Ukrainian", -80, -35),
      lesson("English", -20, 25),
      lesson("Maths", 40, 85),
    ]),
    NOW,
  );
  assert.equal(state.kind, "lesson");
  assert.equal(state.current.subject, "English");
  assert.equal(state.current.position, 2);
  assert.equal(state.total, 3);
  assert.equal(state.next.subject, "Maths");
}

// Between lessons.
{
  const state = school.selectSchoolDayState(
    snapshot([lesson("Ukrainian", -80, -35), lesson("Maths", 15, 60)]),
    NOW,
  );
  assert.equal(state.kind, "break");
  assert.equal(state.previous.subject, "Ukrainian");
  assert.equal(state.next.subject, "Maths");
  assert.equal(state.next.position, 2);
  assert.equal(school.minutesUntil(state.next.startMs, NOW), 15);
}

// Before the first lesson: a break needs a lesson behind it.
{
  const state = school.selectSchoolDayState(
    snapshot([lesson("Ukrainian", 30, 75), lesson("Maths", 90, 135)]),
    NOW,
  );
  assert.equal(state.kind, "beforeFirst");
  assert.equal(state.next.subject, "Ukrainian");
  assert.equal(state.total, 2);
}

// Every lesson is behind us.
{
  const state = school.selectSchoolDayState(
    snapshot([lesson("Ukrainian", -180, -135), lesson("Maths", -90, -45)]),
    NOW,
  );
  assert.equal(state.kind, "dayEnded");
  assert.equal(state.last.subject, "Maths");
  assert.equal(state.total, 2);
}

// A day with nothing scheduled is not a finished school day.
{
  const state = school.selectSchoolDayState(snapshot([]), NOW);
  assert.equal(state.kind, "noLessons");
}

// Cancelled lessons and all-day entries must not inflate progress, and a
// cancelled lesson must not be presented as the one happening now.
{
  const state = school.selectSchoolDayState(
    snapshot([
      lesson("Term ends", -600, 600, { allDay: true }),
      lesson("Ukrainian", -80, -35),
      lesson("Cancelled art", -20, 25, { cancelled: true }),
      lesson("Maths", 40, 85),
    ]),
    NOW,
  );
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
    school.selectSchoolDayState(stale, NOW).kind,
    "unknown",
    "a stalled refresh must not report the day as ended",
  );

  const fresh = snapshot([lesson("Ukrainian", -180, -135)], {
    capturedAtUnixMs: NOW - school.SCHOOL_DAY_STALE_AFTER_MS + 1,
  });
  assert.equal(school.selectSchoolDayState(fresh, NOW).kind, "dayEnded");
}

// A snapshot captured "in the future" is clock skew, not freshness, and must
// not be treated as unreadable.
{
  const skewed = snapshot([lesson("English", -20, 25)], {
    capturedAtUnixMs: NOW + 60_000,
  });
  assert.equal(school.selectSchoolDayState(skewed, NOW).kind, "lesson");
}

// Anything short of an observed snapshot is unknown, not an empty day.
for (const status of ["unavailable", "notConfigured", "busy", "error"]) {
  assert.equal(
    school.selectSchoolDayState(snapshot([], { status }), NOW).kind,
    "unknown",
    `${status} must not report an empty school day`,
  );
}
assert.equal(school.selectSchoolDayState(null, NOW).kind, "unknown");

// Malformed times are dropped rather than poisoning the ordering.
{
  const state = school.selectSchoolDayState(
    snapshot([
      lesson("Broken", 0, 0, { start: "not-a-date", end: "also-not" }),
      lesson("Backwards", 60, 30),
      lesson("English", -20, 25),
    ]),
    NOW,
  );
  assert.equal(state.kind, "lesson");
  assert.equal(state.total, 1);
  assert.equal(state.current.subject, "English");
}

// Overlapping lessons: what comes next never points backwards.
{
  const state = school.selectSchoolDayState(
    snapshot([lesson("Long", -30, 60), lesson("Short", -10, 20)]),
    NOW,
  );
  assert.equal(state.kind, "lesson");
  assert.equal(state.current.subject, "Long", "the earlier start wins");
  assert.equal(state.next, null, "an already-started overlap is not 'next'");
}

// minutesUntil rounds up so a lesson never reads as starting in 0 minutes
// while it is still in the future, and never goes negative.
assert.equal(school.minutesUntil(NOW + 61_000, NOW), 2);
assert.equal(school.minutesUntil(NOW + 1, NOW), 1);
assert.equal(school.minutesUntil(NOW - 60_000, NOW), 0);

// The wording must never claim more than the state supports.
{
  const summarize = (daySelections, extra) =>
    school.summarizeSchoolDay(
      school.selectSchoolDayState(snapshot(daySelections, extra), NOW),
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

console.log("school day model tests passed");
