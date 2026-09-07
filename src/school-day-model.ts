import {
  WORK_CALENDAR_POLL_INTERVAL_MS,
  type WorkCalendarDaySelection,
  type WorkCalendarSnapshot,
} from "./work-calendar-model";

/**
 * How old a snapshot may be before the school day can no longer be described.
 *
 * A break and the end of the school day are both *absences* of a scheduled
 * lesson, and an absence is exactly what stale data looks like. Asserting
 * either from a snapshot we have stopped refreshing would tell a child their
 * day had finished when the truth is that we lost the calendar — the failure
 * the plan singles out as unacceptable.
 *
 * Three poll intervals, so a single missed refresh is not enough to blank the
 * display, but a genuinely stalled one is.
 */
export const SCHOOL_DAY_STALE_AFTER_MS = 3 * WORK_CALENDAR_POLL_INTERVAL_MS;

/** A lesson in today's schedule, with its position in the day. */
export interface SchoolLesson {
  subject: string;
  start: string;
  end: string;
  startMs: number;
  endMs: number;
  /** 1-based position among today's countable lessons. */
  position: number;
}

/**
 * What the school day looks like right now.
 *
 * `unknown` is a first-class answer, not a failure mode: it is what we return
 * whenever the data cannot support a claim about the day.
 */
export type SchoolDayState =
  | { kind: "unknown" }
  | { kind: "noLessons" }
  | { kind: "beforeFirst"; next: SchoolLesson; total: number }
  | {
      kind: "lesson";
      current: SchoolLesson;
      next: SchoolLesson | null;
      total: number;
    }
  | { kind: "break"; previous: SchoolLesson; next: SchoolLesson; total: number }
  | { kind: "dayEnded"; last: SchoolLesson; total: number };

/**
 * Today's countable lessons, in order.
 *
 * Cancelled lessons and all-day entries are excluded. Progress must describe
 * the *schedule*, so a cancelled lesson is not one the child sits through, and
 * an all-day entry ("Term ends", a holiday marker) is not a lesson at all.
 * Including either would inflate "Lesson 3 of 8" into a number that means
 * nothing.
 */
export function schoolLessons(
  daySelections: readonly WorkCalendarDaySelection[],
): SchoolLesson[] {
  return daySelections
    .filter((selection) => !selection.allDay && !selection.cancelled)
    .map((selection) => ({
      subject: selection.subject,
      start: selection.start,
      end: selection.end,
      startMs: Date.parse(selection.start),
      endMs: Date.parse(selection.end),
    }))
    .filter(
      (lesson) =>
        Number.isFinite(lesson.startMs) &&
        Number.isFinite(lesson.endMs) &&
        lesson.endMs > lesson.startMs,
    )
    .sort((left, right) => left.startMs - right.startMs || left.endMs - right.endMs)
    .map((lesson, index) => ({ ...lesson, position: index + 1 }));
}

/**
 * Describe the school day from a calendar snapshot.
 *
 * Nothing here infers attendance. A lesson being scheduled now is not a claim
 * that the child is in it, and the end of the schedule is not a claim that
 * anything was learned.
 */
export function selectSchoolDayState(
  snapshot: WorkCalendarSnapshot | null,
  nowMs = Date.now(),
): SchoolDayState {
  if (snapshot?.status !== "observed") {
    return { kind: "unknown" };
  }

  // A snapshot captured in the future means the clock moved, not that the data
  // is fresh; treat only genuine age as age.
  const age = Math.max(0, nowMs - snapshot.capturedAtUnixMs);
  if (!Number.isFinite(age) || age > SCHOOL_DAY_STALE_AFTER_MS) {
    return { kind: "unknown" };
  }

  const lessons = schoolLessons(snapshot.daySelections);
  if (lessons.length === 0) {
    return { kind: "noLessons" };
  }
  const total = lessons.length;

  const current = lessons.find(
    (lesson) => lesson.startMs <= nowMs && nowMs < lesson.endMs,
  );
  if (current) {
    // "Next" is the next lesson that has not already started, so an overlapping
    // entry that began earlier is not offered as what comes next.
    const next = lessons.find((lesson) => lesson.startMs > nowMs) ?? null;
    return { kind: "lesson", current, next, total };
  }

  const next = lessons.find((lesson) => lesson.startMs > nowMs);
  const finished = lessons.filter((lesson) => lesson.endMs <= nowMs);

  const mostRecentlyFinished = finished.length
    ? finished[finished.length - 1]
    : undefined;

  if (next) {
    return mostRecentlyFinished
      ? { kind: "break", previous: mostRecentlyFinished, next, total }
      : { kind: "beforeFirst", next, total };
  }

  const last = mostRecentlyFinished;
  // Every lesson is behind us. Without a last lesson the day is not describable
  // rather than finished — reaching here with none would mean the schedule
  // contained lessons that are neither current, upcoming, nor past.
  return last ? { kind: "dayEnded", last, total } : { kind: "unknown" };
}

/** Whole minutes until `targetMs`, never negative. */
export function minutesUntil(targetMs: number, nowMs: number) {
  return Math.max(0, Math.ceil((targetMs - nowMs) / 60_000));
}

function minutePhrase(minutes: number) {
  return minutes === 1 ? "1 min" : `${minutes} min`;
}

/**
 * Short label for the calendar band's status pill, or `null` to leave the
 * existing work-calendar wording alone.
 *
 * School mode currently changes **only** this label. The title, detail,
 * countdown and every other element keep rendering exactly as they do for a
 * work calendar, so no geometry changes: the widget band has a fixed height and
 * adding a row to it pushes the layout apart.
 *
 * `unknown` returns `null` deliberately. The existing wording already
 * distinguishes retrying, checking and unavailable, and is more accurate about
 * *why* than anything school-specific would be — overriding it would trade
 * real diagnostics for vocabulary.
 */
export function schoolDayStatusLabel(state: SchoolDayState): string | null {
  switch (state.kind) {
    case "unknown":
      return null;
    case "noLessons":
      return "No lessons";
    case "beforeFirst":
      return "Day starts";
    case "lesson":
      // Kept numeric so the pill stays about as wide as "In progress" was.
      return `${state.current.position} of ${state.total}`;
    case "break":
      return "Break";
    case "dayEnded":
      return "Day ended";
  }
}

export interface SchoolDaySummary {
  /** The headline: what is happening, or why we cannot say. */
  headline: string;
  /** Supporting line. Empty when there is nothing honest to add. */
  detail: string;
  /** "Lesson 3 of 8", or null when progress would not mean anything. */
  progress: string | null;
  /**
   * Whether this describes a lesson happening right now. Surfaces use it to
   * decide emphasis; it is never a claim that the child is attending.
   */
  active: boolean;
}

/**
 * Turn the state into the copy a child reads.
 *
 * Kept separate from `selectSchoolDayState` so wording can change without
 * touching the rules, and so the rules can be tested without asserting on
 * prose.
 */
export function summarizeSchoolDay(
  state: SchoolDayState,
  nowMs = Date.now(),
): SchoolDaySummary {
  switch (state.kind) {
    case "unknown":
      // Says only what is true: we cannot see the timetable. It deliberately
      // does not say the day has finished or that a break is running.
      return {
        headline: "Timetable unavailable",
        detail: "The lesson list could not be read just now.",
        progress: null,
        active: false,
      };
    case "noLessons":
      return {
        headline: "No lessons today",
        detail: "",
        progress: null,
        active: false,
      };
    case "beforeFirst":
      return {
        headline: `First lesson in ${minutePhrase(minutesUntil(state.next.startMs, nowMs))}`,
        detail: state.next.subject,
        progress: `Lesson 1 of ${state.total}`,
        active: false,
      };
    case "lesson":
      return {
        headline: state.current.subject,
        detail: state.next
          ? `Ends in ${minutePhrase(minutesUntil(state.current.endMs, nowMs))} · next ${state.next.subject}`
          : `Ends in ${minutePhrase(minutesUntil(state.current.endMs, nowMs))} · last lesson`,
        progress: `Lesson ${state.current.position} of ${state.total}`,
        active: true,
      };
    case "break":
      return {
        headline: `Break · next lesson in ${minutePhrase(minutesUntil(state.next.startMs, nowMs))}`,
        detail: state.next.subject,
        progress: `Lesson ${state.next.position} of ${state.total}`,
        active: false,
      };
    case "dayEnded":
      return {
        headline: "Today's lessons have ended",
        detail: "",
        progress: `${state.total} of ${state.total} lessons`,
        active: false,
      };
  }
}
