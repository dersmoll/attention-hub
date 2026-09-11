/**
 * The words the calendar surfaces use, in one place.
 *
 * Plan section 6: "Centralize that vocabulary rather than scattering mode
 * conditionals through every component." Every school/work wording difference
 * lives here, so a component reads `vocabulary.startedNeedsAttention` and never
 * asks which mode it is in.
 *
 * Only *vocabulary* belongs here. How the schedule is **read** — whether a gap
 * is a break, whether the day has finished — is a different question with
 * different rules, and lives in `school-day-model.ts`.
 */
export interface CalendarVocabulary {
  /** Accessible name for the widget's calendar zone. */
  zoneLabel: string;
  /** Tooltip for opening the day panel. */
  openDayPanel: string;
  /** Heading of the day panel. */
  dayPanelHeading: string;
  /** Prompt when no calendar source is saved yet. */
  connectPrompt: string;
  /** Title when a source is saved but produced no usable event. */
  noFreshEvent: string;
  /** An event is running and has not been acknowledged. */
  startedNeedsAttention: string;
  /** An event starts within the attention lead time. */
  startingSoon: string;
  /** An acknowledged event is running. */
  inProgress: string;
  /** An event is scheduled later. */
  upNext: string;
  /** Idle label when nothing is configured. */
  idle: string;
  /** A refresh is in flight. */
  checking: string;
  /** The source could not be read. */
  unavailable: string;
  /** Every otherwise-displayable event has been hidden by a local Skip. */
  skippedLocally: string;
  /** Tooltip for the joining-link button. */
  openLink: string;
  /** Failure notice when a joining link will not open. */
  linkOpenFailed: string;
  /** Day-panel state when a successful read found nothing. */
  emptyDay: string;
  /** Day-panel state when the day list could not be established. */
  unknownDay: string;
  /** Day-panel state while the first read is still in flight. */
  loadingDay: string;
  /** Day-panel state when the list was truncated and cannot be trusted. */
  incompleteDay: string;
  /** Accessible name for the day panel's close button. */
  closeDayPanel: string;
  /** Trailing phrase after the day's occupied time, e.g. "2h 30m in calls". */
  occupiedSuffix: string;
}

const WORK_VOCABULARY: CalendarVocabulary = {
  zoneLabel: "Work calendar",
  openDayPanel: "Open today's meeting summary",
  dayPanelHeading: "Today's meetings",
  connectPrompt: "Connect work calendar",
  noFreshEvent: "No fresh work-calendar event",
  startedNeedsAttention: "Meeting started",
  startingSoon: "Soon",
  inProgress: "In progress",
  upNext: "Up next",
  idle: "Calendar",
  checking: "Calendar checking",
  unavailable: "Calendar unavailable",
  skippedLocally: "Meeting skipped",
  openLink: "Open meeting link",
  linkOpenFailed: "The meeting link could not be opened.",
  emptyDay: "No calls today.",
  unknownDay: "Today's calls could not be read.",
  loadingDay: "Reading the calendar…",
  incompleteDay: "Today's list is too long to show every meeting.",
  closeDayPanel: "Close today's meeting summary",
  occupiedSuffix: "in calls",
};

const SCHOOL_VOCABULARY: CalendarVocabulary = {
  zoneLabel: "School timetable",
  openDayPanel: "Open today's lessons",
  dayPanelHeading: "Today's lessons",
  connectPrompt: "Connect school calendar",
  noFreshEvent: "No lesson to show",
  startedNeedsAttention: "Lesson started",
  startingSoon: "Soon",
  // "In progress" and "Up next" are replaced by the school-day status label in
  // School mode, so these are fallbacks for the paths that label declines to
  // describe — chiefly a stale feed, where claiming a lesson state would lie.
  inProgress: "Lesson now",
  upNext: "Next lesson",
  idle: "Timetable",
  checking: "Timetable checking",
  // Deliberately not "No lessons": an unreadable timetable is not an empty day,
  // and the two must never read alike.
  unavailable: "Timetable unavailable",
  skippedLocally: "Lesson skipped",
  openLink: "Open lesson link",
  linkOpenFailed: "The lesson link could not be opened.",
  emptyDay: "No lessons today.",
  unknownDay: "Today's lessons could not be read.",
  loadingDay: "Reading the timetable…",
  incompleteDay: "Today's list is too long to show every lesson.",
  closeDayPanel: "Close today's lessons",
  occupiedSuffix: "in lessons",
};

export function calendarVocabulary(schoolMode: boolean): CalendarVocabulary {
  return schoolMode ? SCHOOL_VOCABULARY : WORK_VOCABULARY;
}
