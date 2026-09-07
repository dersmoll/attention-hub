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

/**
 * How far in the future a capture timestamp may sit before it is disbelieved.
 *
 * A little skew is ordinary and should not blank a child's display. A capture
 * far ahead of now means the clock moved backwards, and the data behind it may
 * be arbitrarily old — so it is treated as unusable rather than as fresh.
 */
export const SCHOOL_DAY_MAX_CLOCK_SKEW_MS = WORK_CALENDAR_POLL_INTERVAL_MS;

/**
 * The viewer's local calendar date as `YYYY-MM-DD`, for comparison against a
 * snapshot's `viewerDay`.
 *
 * `timeZone` must be the **host system** zone, the same one Rust derives from
 * `iana_time_zone::get_timezone()`. It is deliberately *not* the
 * `primaryTimeZone` display preference: that only changes which clock the
 * widget shows, and using it here would make the two sides disagree about which
 * day it is and report the timetable as unknown all day.
 */
export function viewerLocalDate(now: Date, timeZone: string): string {
  const format = (zone?: string) =>
    new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(now);

  let parts;
  try {
    parts = format(timeZone);
  } catch {
    // An unrecognised zone must not break the display; fall back to the host's.
    parts = format(undefined);
  }
  const value = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

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
/**
 * Whether a snapshot's day list can be trusted to describe today.
 *
 * - `loading` — nothing has been read yet.
 * - `unavailable` — the read failed, or the list describes a different day.
 * - `incomplete` — read, but truncated, so totals and emptiness are unsafe.
 * - `verified` — a successful, complete read of today.
 *
 * Every surface that reports an empty or finished day must consult this rather
 * than testing emptiness itself. The bug this replaces existed because the
 * widget and the Today popup each decided independently, and the popup's
 * version was simply `selections.length === 0`.
 */
export type CalendarDayState =
  | "verified"
  | "unavailable"
  | "loading"
  | "incomplete";

export function calendarDayState(
  snapshot: WorkCalendarSnapshot | null,
  { nowMs, viewerToday }: { nowMs: number; viewerToday: string },
): CalendarDayState {
  if (!snapshot) return "loading";
  if (snapshot.status === "busy") return "loading";
  if (snapshot.status !== "observed") return "unavailable";
  // No viewer day means the feed was not read, so emptiness proves nothing.
  if (!snapshot.viewerDay) return "unavailable";
  // The check age cannot make: a snapshot taken at 23:59 is seconds old at
  // 00:00 the next day and describes the wrong day.
  if (snapshot.viewerDay !== viewerToday) return "unavailable";

  const age = nowMs - snapshot.capturedAtUnixMs;
  if (
    !Number.isFinite(age) ||
    age > SCHOOL_DAY_STALE_AFTER_MS ||
    age < -SCHOOL_DAY_MAX_CLOCK_SKEW_MS
  ) {
    return "unavailable";
  }

  return snapshot.daySelectionsComplete === false ? "incomplete" : "verified";
}

export interface SchoolDayInputs {
  nowMs: number;
  /** The viewer's current local date, `YYYY-MM-DD`. */
  viewerToday: string;
  /**
   * ISO start of the lesson the surface is displaying, when it has one.
   *
   * The ordinal must name the **same** lesson as the title. The two cannot be
   * derived independently: the backend resolves competing active events by
   * latest start, this model sorts ascending, and the widget may display an
   * acknowledged companion instead of either. Passing the displayed occurrence
   * in is the only way to guarantee "Maths" is never labelled with English's
   * position.
   */
  displayedStart?: string | null;
}

export function selectSchoolDayState(
  snapshot: WorkCalendarSnapshot | null,
  { nowMs, viewerToday, displayedStart = null }: SchoolDayInputs,
): SchoolDayState {
  // Anything short of a complete, current-day read cannot support a claim
  // about the day. `incomplete` is included deliberately: a truncated list
  // could still show a lesson running now, but its total and its emptiness
  // would both be guesses, and describing part of a day as if it were the whole
  // one is the failure this contract exists to prevent.
  if (calendarDayState(snapshot, { nowMs, viewerToday }) !== "verified") {
    return { kind: "unknown" };
  }

  const lessons = schoolLessons(snapshot!.daySelections);
  if (lessons.length === 0) {
    return { kind: "noLessons" };
  }
  const total = lessons.length;

  const active = lessons.filter(
    (lesson) => lesson.startMs <= nowMs && nowMs < lesson.endMs,
  );
  // Prefer the occurrence the surface is actually showing. Falling back to the
  // latest start matches the backend's own tie-break for competing active
  // events (`semantics.rs`, which sorts active candidates by descending start),
  // so the two agree even when no displayed start is supplied.
  const current =
    active.find((lesson) => lesson.start === displayedStart) ??
    active[active.length - 1];
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
