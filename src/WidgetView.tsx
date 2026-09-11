import {
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { invoke } from "@tauri-apps/api/core";
import { emit, emitTo, listen } from "@tauri-apps/api/event";
import { Menu, type MenuOptions } from "@tauri-apps/api/menu";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import {
  LogicalSize,
  PhysicalPosition,
  availableMonitors,
  getCurrentWindow,
} from "@tauri-apps/api/window";
import {
  ATTENTION_POLL_INTERVAL_MS,
  ATTENTION_STALE_AFTER_MS,
  findSignal,
  sourceActivationFailureMessage,
  type AttentionSourceObservation,
  type AttentionSignalSnapshot,
  type TaskbarMirrorStatus,
} from "./attention-model";
import {
  nextWorkCalendarMeetingAlert,
  firstSkippedWorkCalendarSelection,
  nextWorkCalendarRefreshDelay,
  retainWorkCalendarSnapshot,
  selectWorkCalendarDisplay,
  workCalendarRetryNotice,
  workCalendarJoinLabel,
  workCalendarOccupiedMinutes,
  WORK_CALENDAR_POLL_INTERVAL_MS,
  type WorkCalendarSelection,
  type WorkCalendarSnapshot,
} from "./work-calendar-model";
import {
  calendarDayState,
  schoolDayStatusLabel,
  selectSchoolDayState,
  viewerLocalDate,
} from "./school-day-model";
import { calendarVocabulary } from "./calendar-vocabulary";
import { createCalendarPollController } from "./calendar-poll-controller";
import {
  clearWorkCalendarDisplayCache,
  readWorkCalendarDisplayCache,
  writeWorkCalendarDisplayCache,
} from "./work-calendar-display-cache";
import {
  convertZonedTimeToInstant,
  formatZonedConversion,
} from "./time-zone-converter";
import {
  canonicalTimeZone,
  compactTimeZoneLabel,
  getCommonTimeZones,
  shortTimeZoneLabel,
  timeZoneOptionLabel,
  timeZoneOffsetLabel,
} from "./time-zone-options";
import {
  WIDGET_DRAG_HANDLE_WIDTH,
  calendarDayPanelDirection,
  todayPopupHeight,
  todayPopupWidth,
  widgetCalendarMinimumWidth,
  widgetCalendarWidth,
  widgetClockPanelWidth,
  widgetDestinationsWidth,
  widgetFixedWidth,
  widgetHeight,
  widgetLeftWidth,
  widgetUtilityWidth,
  widgetWidth,
  widgetZoneGap,
} from "./widget-layout";
import {
  type AttentionAppKey,
  type LiveVisualAppKey,
  type WidgetPreferences,
  LIVE_VISUAL_APP_KEYS,
  WIDGET_PREFERENCES_CHANGED_EVENT,
  normalizeWidgetPreferences,
  readWidgetPreferences,
  widgetPanelStyle,
  writeWidgetPreferences,
} from "./widget-preferences";
import { MEDICINE_MANAGER_WINDOW_LABEL } from "./medicine-manager-window";
import {
  MEDICINE_QUIT_SAVE_REQUEST_EVENT,
  MEDICINE_QUIT_SAVE_RESULT_EVENT,
  type MedicineQuitSaveResult,
} from "./medicine-close-guard";
import {
  INITIAL_ZOOM_MEETING_PRESENCE,
  nextZoomMeetingPresence,
  ZOOM_MEETING_POLL_INTERVAL_MS,
  type ZoomMeetingSnapshot,
} from "./zoom-meeting-model";
import {
  TODO_PREFERENCES_CHANGED_EVENT,
  readTodoPreferences,
  type TodoPreferences,
} from "./todo-preferences";
import { openManagerWindow } from "./manager-window";
import { openMedicineManagerWindow } from "./medicine-manager-window";
import { isActionable, isFromActiveOwner, isVisibleInToday, needsAttention, type WorkspaceSnapshot, WORKSPACE_CHANGED_EVENT } from "./workspace-model";
import { activeMedicineTreatments, boundedMedicinePanelGroups, medicineDailyTreatments, type MedicineSnapshot } from "./medicine-model";
import { MEDICINE_PREFERENCES_CHANGED_EVENT, readMedicinePreferences, type MedicinePreferences } from "./medicine-preferences";
import { MEDICINE_PANEL_CLOSED_EVENT, MEDICINE_PANEL_OPEN_EVENT, MEDICINE_PANEL_READY_EVENT, MEDICINE_PANEL_WIDTH, MEDICINE_PANEL_WINDOW_LABEL, medicinePanelHeight, type MedicinePanelPayload } from "./medicine-panel-model";
import { createMedicinePanelWindow } from "./medicine-panel-window";
import type { PopupAnchor } from "./event-workspace-model";
import {
  openEventSettingsWindow,
  openProjectPanelWindow,
} from "./event-workspace-window";
import {
  TODAY_POPUP_CLOSED_EVENT,
  TODAY_POPUP_OPEN_EVENT,
  TODAY_POPUP_READY_EVENT,
  TODAY_POPUP_WINDOW_LABEL,
  type TodayPopupPayload,
} from "./today-popup-model";
import { createTodayPopupWindow } from "./today-popup-window";
import { HubCloseIcon } from "./HubCloseIcon";
import { EventWorkspaceActions } from "./EventWorkspaceActions";
import {
  ADVANCED_FOCUS_EVENT,
  advancedWindowUrl,
  type AdvancedFocusRequest,
  type AdvancedFocusTarget,
} from "./advanced-focus";
import {
  APP_UPDATE_CHECK_INTERVAL_MS,
  APP_UPDATE_INITIAL_DELAY_MS,
} from "./app-update-model";
import { checkAndOpenAppUpdate } from "./app-update-window";
import { CALENDAR_SKIPS_CHANGED_EVENT, readSkippedCalendarOccurrences, setCalendarOccurrenceSkipped } from "./calendar-skip-store";

const WORK_CALENDAR_UI_DEADLINE_MS = 20_000;
const WORK_CALENDAR_STARTING_SOON_MS = 5 * 60 * 1_000;
const WORK_CALENDAR_IMMINENT_MS = 60 * 1_000;
const SOURCE_ACTIVATION_NOTICE_MS = 4_000;
const WIDGET_NOTICE_MS = 4_500;
const TODO_NOTIFICATION_POLL_INTERVAL_MS = 30_000;
const MEDICINE_NOTIFICATION_POLL_INTERVAL_MS = 30_000;
const WIDGET_RESIZE_EDGE_SIZE = 6;
const WIDGET_HEIGHT_SNAP_THRESHOLD = 46.5;
const WIDGET_RESIZE_SETTLE_MS = 500;
const WIDGET_MONITOR_MARGIN = 24;
const MIAMI_TIME_ZONE = "America/New_York";
const FORCED_DEV_VISUAL_SOURCE = import.meta.env.DEV
  ? LIVE_VISUAL_APP_KEYS.find(
      (sourceKey) =>
        sourceKey === import.meta.env.VITE_ATTENTION_HUB_TEST_VISUAL_SOURCE,
    ) ?? null
  : null;
type ClockConversionSource = "local" | "secondary";
type WidgetResizeDirection = "East" | "North" | "South" | "West";
type TaskbarMirrorLayoutRect = {
  sourceKey: LiveVisualAppKey;
  left: number;
  top: number;
  width: number;
  height: number;
};
type WidgetNoticeScope =
  | "attention"
  | "inspect"
  | "later"
  | "layout"
  | "position"
  | "preference"
  | "advanced"
  | "menu"
  | "calendar"
  | "medicine"
  | "sound";
const VISUAL_SOURCES: LiveVisualAppKey[] = [
  "teams",
  "telegram",
  "slack",
  "viber",
  "whatsapp",
];
const SEMANTIC_VISUAL_SOURCES: LiveVisualAppKey[] = ["teams", "telegram"];
const ATTENTION_APP_LABELS: Record<AttentionAppKey, string> = {
  teams: "Microsoft Teams",
  telegram: "Telegram",
  outlook: "Microsoft Outlook",
  slack: "Slack",
  viber: "Viber",
  whatsapp: "WhatsApp",
};

function formatTime(now: Date, timeZone?: string) {
  return new Intl.DateTimeFormat([], {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone,
  }).format(now);
}

function formatClockSeconds(now: Date, timeZone?: string) {
  return (
    new Intl.DateTimeFormat([], {
      second: "2-digit",
      timeZone,
    })
      .formatToParts(now)
      .find(({ type }) => type === "second")?.value.padStart(2, "0") ?? "00"
  );
}

function formatClockDay(now: Date, timeZone?: string) {
  return new Intl.DateTimeFormat([], {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone,
  }).format(now);
}

function formatCalendarRange(selection: WorkCalendarSelection, now: Date) {
  const start = new Date(selection.start);
  const end = new Date(selection.end);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return "Fresh event time unavailable";
  }

  const time = new Intl.DateTimeFormat([], {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const day = new Intl.DateTimeFormat([], {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  if (selection.allDay) {
    const inclusiveEnd = new Date(end.getTime() - 1);
    return start.toDateString() === inclusiveEnd.toDateString()
      ? `All day · ${day.format(start)}`
      : `All day · ${day.format(start)}–${day.format(inclusiveEnd)}`;
  }
  const startDay = start.toDateString();
  const endDay = end.toDateString();
  const startsToday = startDay === now.toDateString();
  const startLabel = startsToday ? "" : `${day.format(start)} · `;
  return startDay === endDay
    ? `${startLabel}${time.format(start)}–${time.format(end)}`
    : `${startsToday ? "" : `${day.format(start)} `}${time.format(start)}–${day.format(end)} ${time.format(end)}`;
}

function formatCalendarCountdown(selection: WorkCalendarSelection, now: Date) {
  if (selection.allDay) {
    return null;
  }
  const boundary = new Date(
    selection.classification === "active" ? selection.end : selection.start,
  );
  const remainingMinutes = Math.max(
    0,
    Math.ceil((boundary.getTime() - now.getTime()) / 60_000),
  );
  if (!Number.isFinite(remainingMinutes)) {
    return null;
  }

  const days = Math.floor(remainingMinutes / (24 * 60));
  const hours = Math.floor((remainingMinutes % (24 * 60)) / 60);
  const minutes = remainingMinutes % 60;
  const parts = [
    days > 0 ? `${days}d` : null,
    hours > 0 ? `${hours}h` : null,
    days === 0 && minutes > 0 ? `${minutes}m` : null,
  ].filter(Boolean);
  const duration = parts.length > 0 ? parts.join(" ") : "less than 1m";
  return selection.classification === "active"
    ? `Ends in ${duration}`
    : `In ${duration}`;
}

function formatCalendarDetail(
  selection: WorkCalendarSelection,
  now: Date,
) {
  return [
    formatCalendarCountdown(selection, now),
    formatCalendarRange(selection, now),
  ]
    .filter(Boolean)
    .join(" · ");
}

function MeetingProviderGlyph({
  provider,
}: {
  provider: WorkCalendarSelection["meetingProvider"];
}) {
  if (!provider) return null;
  const label = provider === "teams" ? "Microsoft Teams meeting" : "Zoom meeting";
  return (
    <span
      aria-label={label}
      className="widget-calendar__meeting-provider"
      data-meeting-provider={provider}
      role="img"
      title={label}
    >
      {provider === "teams" ? (
        <svg aria-hidden="true" viewBox="0 0 16 16">
          <rect x="5" y="4.5" width="10" height="9" rx="2" fill="#6264a7" />
          <circle cx="12" cy="3" r="2" fill="#8b8cc7" />
          <rect x="1" y="4.5" width="9" height="9" rx="1.5" fill="#4f52b2" />
          <path d="M3 7h5v1.4H6.2V12H4.8V8.4H3Z" fill="#fff" />
        </svg>
      ) : (
        <svg aria-hidden="true" viewBox="0 0 16 16">
          <rect width="16" height="16" rx="3" fill="#2d8cff" />
          <rect x="2.5" y="5" width="7.5" height="6" rx="1.5" fill="#fff" />
          <path d="m10.5 6.5 3-1.5v6l-3-1.5Z" fill="#fff" />
        </svg>
      )}
    </span>
  );
}

function CalendarEventDetail({
  selection,
  now,
}: {
  selection: WorkCalendarSelection;
  now: Date;
}) {
  const countdown = formatCalendarCountdown(selection, now);
  const metadata = formatCalendarRange(selection, now);

  return (
    <small className="widget-calendar__detail">
      {countdown && (
        <strong className="widget-calendar__countdown">{countdown}</strong>
      )}
      {countdown && metadata && (
        <span aria-hidden="true" className="widget-calendar__separator">
          ·
        </span>
      )}
      <span className="widget-calendar__metadata">{metadata}</span>
    </small>
  );
}

function calendarEventProgress(
  selection: WorkCalendarSelection | null,
  now: Date,
) {
  if (
    selection?.classification !== "active" ||
    selection.allDay
  ) {
    return null;
  }
  const startMs = Date.parse(selection.start);
  const endMs = Date.parse(selection.end);
  if (
    !Number.isFinite(startMs) ||
    !Number.isFinite(endMs) ||
    endMs <= startMs
  ) {
    return null;
  }
  return Math.min(
    100,
    Math.max(0, ((now.getTime() - startMs) / (endMs - startMs)) * 100),
  );
}

function mirrorLabel(status: TaskbarMirrorStatus | null) {
  if (status?.visible) {
    return status.taskbarCount > 1
      ? "Live taskbar visual from the selected display"
      : "Live taskbar visual";
  }
  if (status?.diagnostic) {
    return `Live visual unavailable: ${status.diagnostic}`;
  }
  if (status?.lifecycle === "starting") {
    return "Starting live visual";
  }
  if (status?.lifecycle === "hidden") {
    return "Live visual unavailable; semantic fallback shown";
  }
  return "Semantic fallback shown";
}

function AppGlyph({ sourceKey }: { sourceKey: AttentionAppKey }) {
  if (sourceKey === "telegram") {
    return (
      <svg aria-hidden="true" viewBox="0 0 32 32">
        <circle cx="16" cy="16" r="15" fill="#229ed9" />
        <path d="m7.5 15.5 16-6.2-4 14.1-5.1-4-3.2 2.5.4-4.6 8.7-5.2-10.7 4.1Z" fill="#fff" />
      </svg>
    );
  }
  if (sourceKey === "outlook") {
    return (
      <svg aria-hidden="true" viewBox="0 0 32 32">
        <rect x="8" y="5" width="21" height="22" rx="3" fill="#0a64c9" />
        <path d="m11 10 7.5 6L26 10v13H11Z" fill="#5db7ff" />
        <rect x="3" y="8" width="14" height="17" rx="2" fill="#106ebe" />
        <text x="10" y="20" fill="#fff" fontSize="11" fontWeight="800" textAnchor="middle">O</text>
      </svg>
    );
  }
  if (sourceKey === "slack") {
    return (
      <svg aria-hidden="true" viewBox="0 0 32 32">
        <rect x="13" y="2" width="6" height="13" rx="3" fill="#36c5f0" />
        <rect x="17" y="13" width="13" height="6" rx="3" fill="#2eb67d" />
        <rect x="13" y="17" width="6" height="13" rx="3" fill="#ecb22e" />
        <rect x="2" y="13" width="13" height="6" rx="3" fill="#e01e5a" />
        <circle cx="10" cy="10" r="3" fill="#e01e5a" />
        <circle cx="22" cy="10" r="3" fill="#36c5f0" />
        <circle cx="22" cy="22" r="3" fill="#2eb67d" />
        <circle cx="10" cy="22" r="3" fill="#ecb22e" />
      </svg>
    );
  }
  if (sourceKey === "viber") {
    return (
      <svg aria-hidden="true" viewBox="0 0 32 32">
        <circle cx="16" cy="16" r="15" fill="#7360f2" />
        <path d="M9 8.7c6.5-2.7 13.8.2 14.9 6.4.6 3.7-1 7.2-4.2 9.1l-.4 3.5-3.3-2.1c-5.9.6-10.6-2.8-10.9-8.1-.2-3.7 1.2-6.8 3.9-8.8Z" fill="#fff" />
        <path d="M11.1 11.8c.5-.5 1.4-.3 1.8.3l1.2 2c.3.5.2 1.1-.2 1.5l-.8.7c.7 1.6 1.9 2.8 3.5 3.6l.8-.9c.4-.4 1-.5 1.5-.2l2 1.2c.7.4.8 1.3.3 1.8-.8.9-2.1 1.3-3.3.9-4.3-1.4-7.7-4.8-9.1-9.1-.4-1.2.1-2.5 1-3.3Z" fill="#7360f2" />
      </svg>
    );
  }
  if (sourceKey === "whatsapp") {
    return (
      <svg aria-hidden="true" viewBox="0 0 32 32">
        <circle cx="16" cy="16" r="15" fill="#25d366" />
        <path d="M8.2 25.4 9.5 21A10.2 10.2 0 1 1 13 24.2l-4.8 1.2Z" fill="#fff" />
        <path d="M12.1 10.8c.4-.5 1.2-.4 1.5.2l1 2c.2.5.1 1-.3 1.4l-.7.6c.8 1.7 2.1 3 3.8 3.8l.7-.8c.4-.4.9-.5 1.4-.2l2 1.1c.6.3.7 1.1.2 1.6-.9.9-2.2 1.2-3.4.8-3.8-1.3-6.9-4.3-8.2-8.2-.4-1.1 0-2.4 1-3.3Z" fill="#25d366" />
      </svg>
    );
  }
  return (
    <svg aria-hidden="true" viewBox="0 0 32 32">
      <rect x="8" y="9" width="21" height="18" rx="4" fill="#6264a7" />
      <circle cx="23" cy="6" r="4" fill="#8b8cc7" />
      <circle cx="7" cy="11" r="4" fill="#8b8cc7" />
      <rect x="3" y="9" width="17" height="17" rx="3" fill="#4f52b2" />
      <path d="M7 13h9v2.5h-3v7h-3v-7H7Z" fill="#fff" />
    </svg>
  );
}

function sourceAvailability(
  source: AttentionSourceObservation | undefined,
  stale: boolean,
  refreshFailed: boolean,
) {
  if (!source) {
    return refreshFailed ? "attention state unavailable" : "checking attention state";
  }
  if (stale) {
    return "last known attention state is stale";
  }
  if (refreshFailed) {
    return "last known attention state; refresh is retrying";
  }
  const labels = {
    observed: "attention state observed",
    notRunning: "application is not running",
    notExposed: "attention state is not exposed",
    error: "attention read failed",
  } as const;
  return labels[source.state];
}

function formatAttentionBadge(
  count: number | null | undefined,
  needsAttention: boolean | null | undefined,
) {
  if (typeof count === "number" && count > 0) {
    return count > 99 ? "99+" : String(count);
  }
  return needsAttention === true ? "•" : null;
}

function sourceHealth(
  source: AttentionSourceObservation | undefined,
  stale: boolean,
  refreshFailed: boolean,
) {
  if (stale) {
    return "stale";
  }
  if (refreshFailed) {
    return "retrying";
  }
  return source?.state === "observed" ? "observed" : "unavailable";
}

function AppSlot({
  sourceKey,
  label,
  badge,
  badgeTone = "attention",
  statusText,
  health,
  status,
  notRunning,
  onActivate,
  feedback,
}: {
  sourceKey: AttentionAppKey;
  label: string;
  badge: string | null;
  badgeTone?: "neutral" | "attention";
  statusText: string;
  health: "observed" | "retrying" | "stale" | "unavailable";
  status?: TaskbarMirrorStatus | null;
  notRunning: boolean;
  onActivate: () => void;
  feedback: string | null;
}) {
  const visualText = status ? mirrorLabel(status) : "Local application icon";
  const action = notRunning ? "Launch" : "Open";
  const accessibleLabel = `${action} ${label}. ${statusText}. ${visualText}.`;
  return (
    <button
      aria-label={accessibleLabel}
      className="widget-app-slot"
      data-health={health}
      data-source={sourceKey}
      data-feedback={feedback || undefined}
      data-not-running={notRunning || undefined}
      onClick={onActivate}
      title={accessibleLabel}
      type="button"
    >
      <span className="widget-app-surface" aria-hidden="true">
        <AppGlyph sourceKey={sourceKey} />
        {badge && !status?.visible && (
          <strong className="widget-app-badge" data-tone={badgeTone}>
            {badge}
          </strong>
        )}
      </span>
    </button>
  );
}

function ZoomGlyph() {
  return (
    <svg aria-hidden="true" viewBox="0 0 32 32">
      <rect width="32" height="32" rx="8" fill="#2d8cff" />
      <path
        d="M7.5 10.5h10.2a2.8 2.8 0 0 1 2.8 2.8v5.4a2.8 2.8 0 0 1-2.8 2.8H7.5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2Zm14 3.8 4.2-2.7c.4-.3.8 0 .8.5v7.8c0 .5-.4.8-.8.5l-4.2-2.7v-3.4Z"
        fill="#fff"
      />
    </svg>
  );
}

function ZoomMeetingSlot({
  minimized,
  feedback,
  onActivate,
}: {
  minimized: boolean;
  feedback: string | null;
  onActivate: () => void;
}) {
  const accessibleLabel = `Focus live Zoom meeting. Meeting is live${minimized ? " and minimized" : ""}.`;
  return (
    <button
      aria-label={accessibleLabel}
      className="widget-app-slot"
      data-feedback={feedback || undefined}
      data-live="true"
      data-source="zoom"
      onClick={onActivate}
      title={accessibleLabel}
      type="button"
    >
      <span className="widget-app-surface" aria-hidden="true">
        <ZoomGlyph />
        <span className="widget-app-live" />
      </span>
    </button>
  );
}

function clampSavedPosition(
  x: number,
  y: number,
  width: number,
  height: number,
  monitors: Awaited<ReturnType<typeof availableMonitors>>,
) {
  const containing = monitors.find(({ workArea }) => {
    const left = workArea.position.x;
    const top = workArea.position.y;
    return (
      x >= left &&
      y >= top &&
      x < left + workArea.size.width &&
      y < top + workArea.size.height
    );
  });
  const target = containing ?? monitors[0];
  if (!target) {
    return { x, y };
  }

  const left = target.workArea.position.x;
  const top = target.workArea.position.y;
  const right = left + target.workArea.size.width;
  const bottom = top + target.workArea.size.height;
  return {
    x: Math.min(Math.max(x, left), Math.max(left, right - width)),
    y: Math.min(Math.max(y, top), Math.max(top, bottom - height)),
  };
}

function presenceHealth(
  source: AttentionSourceObservation | undefined,
  stale: boolean,
  refreshFailed: boolean,
) {
  if (stale) {
    return "stale" as const;
  }
  if (refreshFailed) {
    return "retrying" as const;
  }
  return source && source.state !== "notRunning" && source.state !== "error"
    ? ("observed" as const)
    : ("unavailable" as const);
}

export function WidgetView() {
  const initialPreferences = useMemo(readWidgetPreferences, []);
  const initialWorkCalendar = useMemo(readWorkCalendarDisplayCache, []);
  const [now, setNow] = useState(() => new Date());
  const [preferences, setPreferences] = useState(initialPreferences);
  const [attentionSnapshot, setAttentionSnapshot] =
    useState<AttentionSignalSnapshot | null>(null);
  const [attentionRefreshFailed, setAttentionRefreshFailed] = useState(false);
  const [mirrorStatuses, setMirrorStatuses] = useState<
    Partial<Record<LiveVisualAppKey, TaskbarMirrorStatus>>
  >({});
  const [workCalendar, setWorkCalendar] =
    useState<WorkCalendarSnapshot | null>(initialWorkCalendar);
  const [workCalendarRefreshing, setWorkCalendarRefreshing] = useState(true);
  const [workCalendarTransportFailed, setWorkCalendarTransportFailed] =
    useState(false);
  const [workCalendarCheckSlow, setWorkCalendarCheckSlow] = useState(false);
  const [workCalendarRefreshHealth, setWorkCalendarRefreshHealth] = useState({
    consecutiveFailures: 0,
    lastSuccessfulAtUnixMs: initialWorkCalendar?.capturedAtUnixMs ?? null,
    stopReason: null as string | null,
  });
  const workCalendarRef = useRef<WorkCalendarSnapshot | null>(initialWorkCalendar);
  const [calendarDayPanelOpen, setCalendarDayPanelOpen] = useState(false);
  const [calendarDayPanelPlacement, setCalendarDayPanelPlacement] = useState<
    "above" | "below"
  >("below");
  const [workspace, setWorkspace] = useState<WorkspaceSnapshot | null>(null);
  const [medicine, setMedicine] = useState<MedicineSnapshot | null>(null);
  const [medicineLoadState, setMedicineLoadState] = useState<"loading" | "ready" | "unavailable">("loading");
  const [todoPreferences, setTodoPreferences] =
    useState<TodoPreferences>(readTodoPreferences);
  const [medicinePreferences, setMedicinePreferences] =
    useState<MedicinePreferences>(readMedicinePreferences);
  const [acknowledgedActiveEvent, setAcknowledgedActiveEvent] = useState<
    string | null
  >(null);
  const [finishedActiveEvents, setFinishedActiveEvents] = useState<
    ReadonlySet<string>
  >(() => new Set());
  const [skippedCalendarOccurrences, setSkippedCalendarOccurrences] = useState<ReadonlySet<string>>(() => readSkippedCalendarOccurrences());
  const [widgetError, setWidgetError] = useState<string | null>(null);
  const [sourceActivationNotice, setSourceActivationNotice] = useState<{
    sourceKey: AttentionAppKey;
    message: string;
  } | null>(null);
  const [zoomMeetingPresence, setZoomMeetingPresence] = useState(
    INITIAL_ZOOM_MEETING_PRESENCE,
  );
  const [zoomActivationFeedback, setZoomActivationFeedback] = useState<
    string | null
  >(null);
  const [clockConversionSource, setClockConversionSource] =
    useState<ClockConversionSource | null>(null);
  const [conversionTime, setConversionTime] = useState(() =>
    formatTime(new Date(), MIAMI_TIME_ZONE),
  );
  const attentionInFlight = useRef(false);
  const workCalendarInFlight = useRef(false);
  const calendarDayPanelRef = useRef<HTMLElement>(null);
  const todayPopupPayloadRef = useRef<TodayPopupPayload | null>(null);
  const todayPopupReadyRef = useRef(false);
  const todayPopupPositionedRef = useRef(false);
  const medicinePanelPayloadRef = useRef<MedicinePanelPayload | null>(null);
  const medicinePanelReadyRef = useRef(false);
  const medicinePanelPositionedRef = useRef(false);
  const [medicinePanelOpen, setMedicinePanelOpen] = useState(false);
  const widgetInitialLayoutRef = useRef(true);
  const suppressPositionPersistenceRef = useRef(false);
  const resizeDirectionRef = useRef<WidgetResizeDirection | null>(null);
  const resizeScaleFactorRef = useRef(1);
  const lastResizeLogicalSizeRef = useRef<{ width: number; height: number } | null>(
    null,
  );
  const resizeFinalizeTimerRef = useRef<number | null>(null);
  const mirrorRepositionTimerRef = useRef<number | null>(null);
  const widgetContextMenuRef = useRef<Menu | null>(null);
  const widgetNoticeTimerRef = useRef<number | null>(null);
  const widgetNoticeScopeRef = useRef<WidgetNoticeScope | null>(null);
  const applicationQuitInFlightRef = useRef(false);
  const sourceActivationNoticeTimerRef = useRef<number | null>(null);
  const zoomActivationFeedbackTimerRef = useRef<number | null>(null);
  const announcedMeetingStartAlertsRef = useRef<ReadonlySet<string>>(new Set());
  const widgetWindow = useMemo(getCurrentWindow, []);
  useEffect(
    () => () => {
      if (widgetContextMenuRef.current) {
        void widgetContextMenuRef.current.close();
        widgetContextMenuRef.current = null;
      }
      if (widgetNoticeTimerRef.current !== null) {
        window.clearTimeout(widgetNoticeTimerRef.current);
        widgetNoticeTimerRef.current = null;
      }
      if (resizeFinalizeTimerRef.current !== null) {
        window.clearTimeout(resizeFinalizeTimerRef.current);
        resizeFinalizeTimerRef.current = null;
      }
      if (zoomActivationFeedbackTimerRef.current !== null) {
        window.clearTimeout(zoomActivationFeedbackTimerRef.current);
        zoomActivationFeedbackTimerRef.current = null;
      }
    },
    [],
  );
  const pinned = preferences.pinned;
  useEffect(() => {
    let disposed = false;
    let interval: number | undefined;
    const checkForUpdate = async () => {
      if (disposed) {
        return;
      }
      await checkAndOpenAppUpdate().catch(() => undefined);
    };
    const initialTimer = window.setTimeout(() => {
      void checkForUpdate();
      interval = window.setInterval(
        () => void checkForUpdate(),
        APP_UPDATE_CHECK_INTERVAL_MS,
      );
    }, APP_UPDATE_INITIAL_DELAY_MS);
    return () => {
      disposed = true;
      window.clearTimeout(initialTimer);
      if (interval !== undefined) {
        window.clearInterval(interval);
      }
    };
  }, []);
  const showWidgetNotice = useCallback(
    (scope: WidgetNoticeScope, message: string) => {
      if (widgetNoticeTimerRef.current !== null) {
        window.clearTimeout(widgetNoticeTimerRef.current);
      }
      widgetNoticeScopeRef.current = scope;
      setWidgetError(message);
      widgetNoticeTimerRef.current = window.setTimeout(() => {
        widgetNoticeTimerRef.current = null;
        widgetNoticeScopeRef.current = null;
        setWidgetError(null);
      }, WIDGET_NOTICE_MS);
    },
    [],
  );
  const clearWidgetNotice = useCallback((scope: WidgetNoticeScope) => {
    if (widgetNoticeScopeRef.current !== scope) {
      return;
    }
    if (widgetNoticeTimerRef.current !== null) {
      window.clearTimeout(widgetNoticeTimerRef.current);
      widgetNoticeTimerRef.current = null;
    }
    widgetNoticeScopeRef.current = null;
    setWidgetError(null);
  }, []);
  const requestApplicationQuit = useCallback(async () => {
    if (applicationQuitInFlightRef.current) return;
    applicationQuitInFlightRef.current = true;
    try {
      const manager = await WebviewWindow.getByLabel(MEDICINE_MANAGER_WINDOW_LABEL);
      if (manager) {
        const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const allowed = await new Promise<boolean>(async (resolve, reject) => {
          let stop: (() => void) | undefined;
          const timer = window.setTimeout(() => {
            stop?.();
            reject(new Error("Medicine did not finish its save-before-quit check."));
          }, 5_000);
          try {
            stop = await listen<MedicineQuitSaveResult>(MEDICINE_QUIT_SAVE_RESULT_EVENT, ({ payload }) => {
              if (payload.requestId !== requestId) return;
              window.clearTimeout(timer);
              stop?.();
              resolve(payload.allowed);
            });
            await emitTo(MEDICINE_MANAGER_WINDOW_LABEL, MEDICINE_QUIT_SAVE_REQUEST_EVENT, { requestId });
          } catch (reason) {
            window.clearTimeout(timer);
            stop?.();
            reject(reason);
          }
        });
        if (!allowed) {
          await manager.show().catch(() => undefined);
          await manager.setFocus().catch(() => undefined);
          showWidgetNotice("medicine", "Attention Hub stayed open because Medicine notes are not saved yet. Review Medicine and try again.");
          return;
        }
      }
      await invoke("quit_application");
    } catch {
      showWidgetNotice("medicine", "Attention Hub stayed open because Medicine could not confirm that notes were saved. Review Medicine and try again.");
    } finally {
      applicationQuitInFlightRef.current = false;
    }
  }, [showWidgetNotice]);
  const publishTodayPopup = useCallback(() => {
    const payload = todayPopupPayloadRef.current;
    if (
      !payload ||
      !todayPopupReadyRef.current ||
      !todayPopupPositionedRef.current
    ) {
      return;
    }
    void emitTo(TODAY_POPUP_WINDOW_LABEL, TODAY_POPUP_OPEN_EVENT, payload);
  }, []);

  useEffect(() => {
    let disposed = false;
    let stopReady: (() => void) | undefined;
    let stopClosed: (() => void) | undefined;
    void Promise.all([
      listen(TODAY_POPUP_READY_EVENT, () => {
        if (disposed) return;
        todayPopupReadyRef.current = true;
        publishTodayPopup();
      }),
      listen(TODAY_POPUP_CLOSED_EVENT, () => {
        if (disposed) return;
        setCalendarDayPanelOpen(false);
        todayPopupPayloadRef.current = null;
        todayPopupReadyRef.current = false;
        todayPopupPositionedRef.current = false;
      }),
    ]).then(([unlistenReady, unlistenClosed]) => {
      if (disposed) {
        unlistenReady();
        unlistenClosed();
      } else {
        stopReady = unlistenReady;
        stopClosed = unlistenClosed;
      }
    });
    return () => {
      disposed = true;
      stopReady?.();
      stopClosed?.();
    };
  }, [publishTodayPopup]);

  const publishMedicinePanel = useCallback(() => {
    const payload = medicinePanelPayloadRef.current;
    if (!payload || !medicinePanelReadyRef.current || !medicinePanelPositionedRef.current) return;
    void emitTo(MEDICINE_PANEL_WINDOW_LABEL, MEDICINE_PANEL_OPEN_EVENT, payload);
  }, []);

  useEffect(() => {
    let disposed = false;
    let stopReady: (() => void) | undefined;
    let stopClosed: (() => void) | undefined;
    void Promise.all([
      listen(MEDICINE_PANEL_READY_EVENT, () => { if (!disposed) { medicinePanelReadyRef.current = true; publishMedicinePanel(); } }),
      listen(MEDICINE_PANEL_CLOSED_EVENT, () => {
        if (disposed) return;
        setMedicinePanelOpen(false);
        medicinePanelPayloadRef.current = null;
        medicinePanelReadyRef.current = false;
        medicinePanelPositionedRef.current = false;
      }),
    ]).then(([ready, closed]) => { if (disposed) { ready(); closed(); } else { stopReady = ready; stopClosed = closed; } });
    return () => { disposed = true; stopReady?.(); stopClosed?.(); };
  }, [publishMedicinePanel]);
  const systemTimeZone = canonicalTimeZone(
    Intl.DateTimeFormat().resolvedOptions().timeZone,
  );
  const primaryTimeZone = preferences.primaryTimeZone ?? systemTimeZone;
  const secondaryTimeZone = preferences.secondaryTimeZone;
  const timeZoneOptions = useMemo(
    () =>
      getCommonTimeZones(
        [
          preferences.primaryTimeZone,
          secondaryTimeZone,
          ...preferences.extraTimeZones,
        ].filter(
          (value): value is string => value !== null,
        ),
      ),
    [
      preferences.extraTimeZones,
      preferences.primaryTimeZone,
      secondaryTimeZone,
    ],
  );
  const visibleSources = useMemo(
    () =>
      preferences.appOrder.filter((sourceKey) =>
        preferences.monitoredSources.includes(sourceKey),
      ),
    [preferences.appOrder, preferences.monitoredSources],
  );
  const appSlotCount = visibleSources.length + Number(zoomMeetingPresence.visible);
  const appsPanelVisible =
    preferences.showAppsPanel && appSlotCount > 0;
  const timeFocusMode = preferences.clockLayout === "timeFocus";
  const clocksPanelVisible = timeFocusMode || preferences.showClocksPanel;
  const calendarPanelVisible = !timeFocusMode;
  const todayPanelVisible = !timeFocusMode && preferences.showTodayPanel;
  const projectsPanelVisible = !timeFocusMode && preferences.showProjectsPanel;
  const medicinePanelVisible = !timeFocusMode && preferences.showMedicinePanel;
  const destinationPanelCount = Number(todayPanelVisible) + Number(projectsPanelVisible) + Number(medicinePanelVisible);
  const visibleClockCount = timeFocusMode
    ? 1
    : 1 + Number(preferences.showSecondaryClock) + preferences.extraTimeZones.length;
  const enabledVisualSources = useMemo(
    () =>
      appsPanelVisible
        ? VISUAL_SOURCES.filter(
            (sourceKey) =>
              preferences.monitoredSources.includes(sourceKey) &&
              (preferences.liveVisualSources.includes(sourceKey) ||
                sourceKey === FORCED_DEV_VISUAL_SOURCE),
          )
        : [],
    [
      appsPanelVisible,
      preferences.liveVisualSources,
      preferences.monitoredSources,
    ],
  );
  const desiredVisualSources = useMemo(
    () =>
      enabledVisualSources.filter((sourceKey) => {
        const observation = attentionSnapshot?.sources.find(
          (source) => source.sourceKey === sourceKey,
        );
        const semanticAttention = observation?.signals.some(
          (signal) => signal.needsAttention === true,
        );
        const presenceAvailable =
          observation?.state === "notExposed" ||
          observation?.state === "observed";
        return SEMANTIC_VISUAL_SOURCES.includes(sourceKey)
          ? semanticAttention
          : presenceAvailable;
      }),
    [attentionSnapshot, enabledVisualSources],
  );
  const desiredVisualSourcesKey = desiredVisualSources.join("|");
  useEffect(() => {
    if (!clocksPanelVisible || timeFocusMode) {
      setClockConversionSource(null);
    }
  }, [clocksPanelVisible, timeFocusMode]);

  useEffect(() => {
    if (timeFocusMode) {
      setCalendarDayPanelOpen(false);
      todayPopupPayloadRef.current = null;
      void WebviewWindow.getByLabel(TODAY_POPUP_WINDOW_LABEL)
        .then((existing) => existing?.close())
        .catch(() => undefined);
    }
  }, [timeFocusMode]);
  const calendarDisplay = useMemo(
    () =>
      selectWorkCalendarDisplay(
        workCalendar,
        finishedActiveEvents,
        acknowledgedActiveEvent,
        skippedCalendarOccurrences,
        now.getTime(),
      ),
    [acknowledgedActiveEvent, finishedActiveEvents, now, skippedCalendarOccurrences, workCalendar],
  );
  const showNextEvent = calendarDisplay.companion !== null;
  const calendarDaySelectionCount = workCalendar?.daySelections.length ?? 0;
  const actionableTodos = workspace?.actionItems.filter((item) => isActionable(item, now) && isFromActiveOwner(item, workspace)) ?? [];
  const visibleTodayTodos = workspace?.actionItems.filter((item) => isVisibleInToday(item, now) && isFromActiveOwner(item, workspace)) ?? [];
  const attentionTodoCount = actionableTodos.filter((item) => needsAttention(item, now)).length;
  const activeTodoCount = workspace?.actionItems.filter((item) => item.completedAt === null && isFromActiveOwner(item, workspace)).length ?? 0;
  const calendarDayPanelLogicalHeight = todayPopupHeight(calendarDaySelectionCount, 0, visibleTodayTodos.length);
  const calendarLayoutContentLength =
    (calendarDisplay.selection?.subject.length ?? 0) +
    (calendarDisplay.selection ? 28 : 0) +
    (calendarDisplay.companion?.subject.length ?? 0) +
    (calendarDisplay.companion ? 28 : 0);
  const preferredCalendarWidth =
    preferences.widthMode === "recommended"
      ? preferences.recommendedCalendarWidth
      : preferences.slimCalendarWidth;
  const refreshAttention = useCallback(async () => {
    if (attentionInFlight.current) {
      return;
    }
    attentionInFlight.current = true;
    try {
      const snapshot = await invoke<AttentionSignalSnapshot>(
        "get_attention_signal_snapshot",
        { sourceKeys: preferences.monitoredSources },
      );
      setAttentionSnapshot(snapshot);
      setAttentionRefreshFailed(false);
      clearWidgetNotice("attention");
    } catch {
      setAttentionRefreshFailed(true);
      showWidgetNotice(
        "attention",
        "App attention could not refresh. Retrying automatically.",
      );
    } finally {
      attentionInFlight.current = false;
    }
  }, [clearWidgetNotice, preferences.monitoredSources, showWidgetNotice]);

  const refreshMirrors = useCallback(async () => {
    if (enabledVisualSources.length === 0) {
      setMirrorStatuses({});
      return;
    }
    const results = await Promise.allSettled(
      enabledVisualSources.map((sourceKey) =>
        invoke<TaskbarMirrorStatus>("get_taskbar_mirror_status", { sourceKey }),
      ),
    );
    setMirrorStatuses(() => {
      const next: Partial<Record<LiveVisualAppKey, TaskbarMirrorStatus>> = {};
      results.forEach((result, index) => {
        if (result.status === "fulfilled") {
          next[enabledVisualSources[index]] = result.value;
        }
      });
      return next;
    });
  }, [enabledVisualSources]);

  const refreshWorkCalendar = useCallback(async () => {
    if (workCalendarInFlight.current) {
      return null;
    }
    workCalendarInFlight.current = true;
    setWorkCalendarRefreshing(true);
    const slowTimer = window.setTimeout(
      () => setWorkCalendarCheckSlow(true),
      WORK_CALENDAR_UI_DEADLINE_MS,
    );
    try {
      const snapshot = await invoke<WorkCalendarSnapshot>(
        "get_work_calendar_snapshot",
      );
      const displaySnapshot = retainWorkCalendarSnapshot(
        workCalendarRef.current,
        snapshot,
      );
      workCalendarRef.current = displaySnapshot;
      setWorkCalendar(displaySnapshot);
      setWorkCalendarTransportFailed(false);
      if (snapshot.status === "observed") {
        writeWorkCalendarDisplayCache(snapshot);
      } else if (snapshot.status === "notConfigured") {
        clearWorkCalendarDisplayCache();
      }
      setWorkCalendarRefreshHealth((current) => {
        if (snapshot.status === "observed") {
          return {
            consecutiveFailures: 0,
            lastSuccessfulAtUnixMs: snapshot.capturedAtUnixMs,
            stopReason: null,
          };
        }
        if (snapshot.status === "notConfigured") {
          return {
            consecutiveFailures: 0,
            lastSuccessfulAtUnixMs: null,
            stopReason: null,
          };
        }
        if (snapshot.status === "busy") {
          return current;
        }
        return {
          ...current,
          consecutiveFailures: current.consecutiveFailures + 1,
          stopReason: snapshot.stopReason,
        };
      });
      return snapshot;
    } catch {
      const displaySnapshot = retainWorkCalendarSnapshot(
        workCalendarRef.current,
        null,
      );
      workCalendarRef.current = displaySnapshot;
      setWorkCalendar(displaySnapshot);
      setWorkCalendarTransportFailed(true);
      setWorkCalendarRefreshHealth((current) => ({
        ...current,
        consecutiveFailures: current.consecutiveFailures + 1,
        stopReason: null,
      }));
      return null;
    } finally {
      clearTimeout(slowTimer);
      workCalendarInFlight.current = false;
      setWorkCalendarRefreshing(false);
      setWorkCalendarCheckSlow(false);
    }
  }, []);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void listen(CALENDAR_SKIPS_CHANGED_EVENT, () => {
      if (!disposed) setSkippedCalendarOccurrences(readSkippedCalendarOccurrences());
    }).then((next) => { if (disposed) next(); else unlisten = next; });
    return () => { disposed = true; unlisten?.(); };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!clockConversionSource) {
      return;
    }

    const returnToLiveClocks = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }
      event.preventDefault();
      setClockConversionSource(null);
    };

    window.addEventListener("keydown", returnToLiveClocks);
    return () => window.removeEventListener("keydown", returnToLiveClocks);
  }, [clockConversionSource]);

  useEffect(() => {
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      await refreshAttention();
      if (!disposed) {
        timer = setTimeout(() => void poll(), ATTENTION_POLL_INTERVAL_MS);
      }
    };
    void poll();
    return () => {
      disposed = true;
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [refreshAttention]);

  useEffect(() => {
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      try {
        const snapshot = await invoke<ZoomMeetingSnapshot>(
          "get_zoom_meeting_snapshot",
        );
        if (!disposed) {
          setZoomMeetingPresence((current) =>
            nextZoomMeetingPresence(current, snapshot),
          );
        }
      } catch {
        if (!disposed) {
          setZoomMeetingPresence((current) =>
            nextZoomMeetingPresence(current, {
              state: "uncertain",
              minimized: false,
              candidateCount: 0,
            }),
          );
        }
      }
      if (!disposed) {
        timer = setTimeout(() => void poll(), ZOOM_MEETING_POLL_INTERVAL_MS);
      }
    };
    void poll();
    return () => {
      disposed = true;
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, []);

  useEffect(() => {
    const controller = createCalendarPollController({
      refresh: refreshWorkCalendar,
      nextDelay: nextWorkCalendarRefreshDelay,
    });
    let disposed = false;
    let stopListening: (() => void) | undefined;

    void listen("work-calendar-changed", controller.requestRefresh).then(
      (unlisten) => {
        if (disposed) {
          unlisten();
        } else {
          stopListening = unlisten;
        }
      },
    );
    controller.start();

    return () => {
      disposed = true;
      controller.dispose();
      stopListening?.();
    };
  }, [refreshWorkCalendar]);

  useEffect(() => {
    let disposed = false;
    let stopListening: (() => void) | undefined;
    const refresh = async () => {
      try {
        const snapshot = await invoke<WorkspaceSnapshot>("get_workspace_snapshot");
        if (!disposed) {
          setWorkspace(snapshot);
          clearWidgetNotice("later");
        }
      } catch {
        if (!disposed) {
          showWidgetNotice(
            "later",
            "To-dos could not refresh. Try again shortly.",
          );
        }
      }
    };
    void listen(WORKSPACE_CHANGED_EVENT, () => void refresh()).then(
      (unlisten) => {
        if (disposed) {
          unlisten();
        } else {
          stopListening = unlisten;
        }
      },
    );
    void refresh();
    return () => {
      disposed = true;
      stopListening?.();
    };
  }, [clearWidgetNotice, showWidgetNotice]);

  useEffect(() => {
    let disposed = false;
    let stopListening: (() => void) | undefined;
    const refresh = async () => {
      try {
        const snapshot = await invoke<MedicineSnapshot>("get_medicine_snapshot");
        if (!disposed) { setMedicine(snapshot); setMedicineLoadState("ready"); }
      } catch {
        if (!disposed) { setMedicine(null); setMedicineLoadState("unavailable"); }
      }
    };
    void listen("medicine-changed", () => void refresh()).then((unlisten) => {
      if (disposed) unlisten(); else stopListening = unlisten;
    });
    void refresh();
    return () => { disposed = true; stopListening?.(); };
  }, []);

  useEffect(() => {
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopListening: (() => void) | undefined;

    const checkDueNotifications = async () => {
      if (todoPreferences.dueNotificationsEnabled) {
        try {
          const snapshot = await invoke<WorkspaceSnapshot>("notify_due_action_items");
          if (!disposed) {
            setWorkspace(snapshot);
          }
        } catch {
          if (!disposed) {
            showWidgetNotice(
              "later",
              "A reminder notification could not be shown.",
            );
          }
        }
      }
      if (!disposed) {
        timer = setTimeout(
          () => void checkDueNotifications(),
          TODO_NOTIFICATION_POLL_INTERVAL_MS,
        );
      }
    };

    void listen<TodoPreferences>(
      TODO_PREFERENCES_CHANGED_EVENT,
      ({ payload }) => {
        if (!disposed) {
          setTodoPreferences(payload);
        }
      },
    ).then((unlisten) => {
      if (disposed) {
        unlisten();
      } else {
        stopListening = unlisten;
      }
    });
    void checkDueNotifications();

    return () => {
      disposed = true;
      if (timer) {
        clearTimeout(timer);
      }
      stopListening?.();
    };
  }, [todoPreferences.dueNotificationsEnabled, showWidgetNotice]);

  // Dose reminders mirror the to-do path: the widget polls, and the Rust
  // command raises the toast only when it actually marked something notified.
  useEffect(() => {
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopListening: (() => void) | undefined;

    const checkDueDoses = async () => {
      if (medicinePreferences.doseNotificationsEnabled) {
        try {
          const snapshot = await invoke<MedicineSnapshot>("notify_due_doses", {
            graceMinutes: medicinePreferences.graceMinutes,
          });
          if (!disposed) {
            setMedicine(snapshot);
            setMedicineLoadState("ready");
          }
        } catch {
          if (!disposed) {
            showWidgetNotice(
              "medicine",
              "A dose reminder notification could not be shown.",
            );
          }
        }
      }
      if (!disposed) {
        timer = setTimeout(
          () => void checkDueDoses(),
          MEDICINE_NOTIFICATION_POLL_INTERVAL_MS,
        );
      }
    };

    void listen<MedicinePreferences>(
      MEDICINE_PREFERENCES_CHANGED_EVENT,
      ({ payload }) => {
        if (!disposed) {
          setMedicinePreferences(payload);
        }
      },
    ).then((unlisten) => {
      if (disposed) {
        unlisten();
      } else {
        stopListening = unlisten;
      }
    });
    void checkDueDoses();

    return () => {
      disposed = true;
      if (timer) {
        clearTimeout(timer);
      }
      stopListening?.();
    };
  }, [
    medicinePreferences.doseNotificationsEnabled,
    medicinePreferences.graceMinutes,
    showWidgetNotice,
  ]);

  useEffect(() => {
    let disposed = false;
    let stopListening: (() => void) | undefined;
    void listen(WIDGET_PREFERENCES_CHANGED_EVENT, ({ payload }) => {
      if (!disposed) {
        setPreferences(
          normalizeWidgetPreferences(payload as Partial<typeof preferences>),
        );
      }
    }).then((unlisten) => {
      if (disposed) {
        unlisten();
      } else {
        stopListening = unlisten;
      }
    });
    return () => {
      disposed = true;
      stopListening?.();
    };
  }, []);

  useLayoutEffect(() => {
    const shell = document.querySelector<HTMLElement>(".widget-shell");
    if (!shell || !appsPanelVisible) {
      void invoke("set_taskbar_mirror_layout", { sourceRects: [] });
      return;
    }

    let disposed = false;
    let frame = 0;
    const updateLayout = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        if (disposed) return;
        const shellRect = shell.getBoundingClientRect();
        const sourceRects: TaskbarMirrorLayoutRect[] = visibleSources.flatMap(
          (sourceKey) => {
            if (sourceKey === "outlook") return [];
            const surface = shell.querySelector<HTMLElement>(
              `.widget-app-slot[data-source="${sourceKey}"] .widget-app-surface`,
            );
            if (!surface) return [];
            const rect = surface.getBoundingClientRect();
            if (rect.width <= 0 || rect.height <= 0) return [];
            return [{
              sourceKey,
              left: Math.round(rect.left - shellRect.left),
              top: Math.round(rect.top - shellRect.top),
              width: Math.round(rect.width),
              height: Math.round(rect.height),
            }];
          },
        );
        void invoke("set_taskbar_mirror_layout", { sourceRects })
          .then(() => clearWidgetNotice("layout"))
          .catch(() =>
            showWidgetNotice(
              "layout",
              "The app shortcut visuals could not update.",
            ),
          );
      });
    };

    const observer = new ResizeObserver(updateLayout);
    observer.observe(shell);
    // CSS hot reload can change a shortcut offset without changing its size.
    // Reconcile only while a live surface is enabled so native DWM placement
    // follows those development and runtime layout changes as well.
    const reconcileTimer = enabledVisualSources.length
      ? window.setInterval(updateLayout, 1_000)
      : undefined;
    updateLayout();
    return () => {
      disposed = true;
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      if (reconcileTimer) window.clearInterval(reconcileTimer);
    };
  }, [
    appsPanelVisible,
    clearWidgetNotice,
    enabledVisualSources.length,
    showWidgetNotice,
    visibleSources,
  ]);

  useEffect(() => {
    const desired = new Set<LiveVisualAppKey>(
      desiredVisualSourcesKey
        ? (desiredVisualSourcesKey.split("|") as LiveVisualAppKey[])
        : [],
    );
    void Promise.allSettled(
      VISUAL_SOURCES.map((sourceKey) =>
        invoke<TaskbarMirrorStatus>(
          desired.has(sourceKey)
            ? "start_taskbar_mirror"
            : "stop_taskbar_mirror",
          { sourceKey },
        ),
      ),
    );
  }, [desiredVisualSourcesKey]);

  useEffect(() => {
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const poll = async () => {
      await refreshMirrors();
      if (!disposed) {
        timer = setTimeout(() => void poll(), 2_000);
      }
    };
    timer = setTimeout(() => void poll(), 2_000);
    return () => {
      disposed = true;
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [refreshMirrors]);

  useEffect(() => {
    let disposed = false;
    void (async () => {
      const initialLayout = widgetInitialLayoutRef.current;
      try {
        suppressPositionPersistenceRef.current = initialLayout;
        const minimumWidth =
          widgetFixedWidth(
            appSlotCount,
            preferences.widthMode,
            visibleClockCount,
            preferences.clockLayout,
            appsPanelVisible,
            clocksPanelVisible,
            todayPanelVisible,
            projectsPanelVisible,
            medicinePanelVisible,
          ) +
          (calendarPanelVisible
            ? widgetCalendarMinimumWidth(preferences.widthMode, showNextEvent)
            : 0);
        await widgetWindow.setSizeConstraints({
          minWidth: minimumWidth,
          minHeight: widgetHeight("slim"),
          maxHeight: widgetHeight("recommended"),
        });
        await widgetWindow.setSize(
          new LogicalSize(
            widgetWidth(
              appSlotCount,
              preferences.widthMode,
              showNextEvent,
              visibleClockCount,
              preferences.clockLayout,
              appsPanelVisible,
              clocksPanelVisible,
              calendarLayoutContentLength,
              preferredCalendarWidth,
              todayPanelVisible,
              projectsPanelVisible,
              calendarPanelVisible,
              medicinePanelVisible,
            ),
            widgetHeight(preferences.widthMode),
          ),
        );
        const [position, size, monitors] = await Promise.all([
          widgetWindow.outerPosition(),
          widgetWindow.outerSize(),
          availableMonitors(),
        ]);
        let targetPosition = { x: position.x, y: position.y };
        if (
          initialLayout &&
          initialPreferences.x !== null &&
          initialPreferences.y !== null
        ) {
          targetPosition = clampSavedPosition(
            initialPreferences.x,
            initialPreferences.y,
            size.width,
            size.height,
            monitors,
          );
        } else {
          targetPosition = clampSavedPosition(
            position.x,
            position.y,
            size.width,
            size.height,
            monitors,
          );
        }
        if (
          targetPosition.x !== position.x ||
          targetPosition.y !== position.y
        ) {
          await widgetWindow.setPosition(
            new PhysicalPosition(targetPosition.x, targetPosition.y),
          );
        }
        window.setTimeout(() => {
          suppressPositionPersistenceRef.current = false;
        }, 150);
        clearWidgetNotice("layout");
      } catch {
        if (!disposed) {
          showWidgetNotice(
            "layout",
            "The widget layout could not be updated.",
          );
        }
      } finally {
        if (initialLayout) {
          widgetInitialLayoutRef.current = false;
          await widgetWindow.show().catch(() => undefined);
        }
      }
    })();
    return () => {
      disposed = true;
    };
  }, [
    preferences.widthMode,
    preferences.clockLayout,
    preferences.extraTimeZones.length,
    preferences.recommendedCalendarWidth,
    preferences.slimCalendarWidth,
    appsPanelVisible,
    calendarPanelVisible,
    clocksPanelVisible,
    todayPanelVisible,
    projectsPanelVisible,
    showNextEvent,
    calendarLayoutContentLength,
    preferredCalendarWidth,
    clearWidgetNotice,
    initialPreferences,
    showWidgetNotice,
    visibleClockCount,
    appSlotCount,
    widgetWindow,
  ]);

  useEffect(() => {
    let disposed = false;
    let unlistenMoved: (() => void) | undefined;
    void (async () => {
      try {
        unlistenMoved = await widgetWindow.onMoved(({ payload }) => {
          const repositionMirrors = () => {
            void invoke("reposition_taskbar_mirrors")
              .then(() => clearWidgetNotice("position"))
              .catch(() =>
                showWidgetNotice(
                  "position",
                  "App shortcut visuals could not follow the widget move.",
                ),
              );
          };
          if (mirrorRepositionTimerRef.current === null) {
            repositionMirrors();
            mirrorRepositionTimerRef.current = window.setTimeout(() => {
              mirrorRepositionTimerRef.current = null;
              repositionMirrors();
            }, 32);
          }
          if (suppressPositionPersistenceRef.current) {
            return;
          }
          writeWidgetPreferences({ x: payload.x, y: payload.y });
        });
        clearWidgetNotice("position");
      } catch {
        if (!disposed) {
          showWidgetNotice(
            "position",
            "The saved widget position could not be restored.",
          );
        }
      }
    })();
    return () => {
      disposed = true;
      unlistenMoved?.();
      if (mirrorRepositionTimerRef.current !== null) {
        window.clearTimeout(mirrorRepositionTimerRef.current);
        mirrorRepositionTimerRef.current = null;
      }
    };
  }, [clearWidgetNotice, initialPreferences, showWidgetNotice, widgetWindow]);

  useEffect(() => {
    void widgetWindow
      .setAlwaysOnTop(pinned)
      .then(() => clearWidgetNotice("preference"))
      .catch(() =>
        showWidgetNotice("preference", "Always-on-top could not be changed."),
      );
  }, [clearWidgetNotice, pinned, showWidgetNotice, widgetWindow]);

  const updateWidgetPreferences = useCallback(
    (update: Partial<WidgetPreferences>) => {
      const next = writeWidgetPreferences(update);
      setPreferences(next);
      void emit(WIDGET_PREFERENCES_CHANGED_EVENT, next).catch(() =>
        showWidgetNotice(
          "preference",
          "The setting was saved, but another open window may need to be reopened.",
        ),
      );
    },
    [showWidgetNotice],
  );

  const beginWidgetResize = useCallback(
    (event: ReactPointerEvent<HTMLElement>, direction: WidgetResizeDirection) => {
      if (event.button !== 0) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      void (async () => {
        try {
          const scaleFactor = await widgetWindow.scaleFactor();
          const [position, monitors] = await Promise.all([
            widgetWindow.outerPosition(),
            availableMonitors(),
          ]);
          const monitor =
            monitors.find(({ workArea }) => {
              const left = workArea.position.x;
              const top = workArea.position.y;
              return (
                position.x >= left &&
                position.y >= top &&
                position.x < left + workArea.size.width &&
                position.y < top + workArea.size.height
              );
            }) ?? monitors[0];
          const minimumWidth =
            widgetFixedWidth(
              appSlotCount,
              preferences.widthMode,
              visibleClockCount,
              preferences.clockLayout,
              appsPanelVisible,
              clocksPanelVisible,
              todayPanelVisible,
              projectsPanelVisible,
              medicinePanelVisible,
            ) +
            (calendarPanelVisible
              ? widgetCalendarMinimumWidth(preferences.widthMode, showNextEvent)
              : 0);
          const maximumWidth = monitor
            ? Math.max(
                minimumWidth,
                Math.floor(monitor.workArea.size.width / scaleFactor) -
                  WIDGET_MONITOR_MARGIN,
              )
            : undefined;
          resizeScaleFactorRef.current = scaleFactor;
          resizeDirectionRef.current = direction;
          lastResizeLogicalSizeRef.current = null;
          await widgetWindow.setSizeConstraints({
            minWidth: minimumWidth,
            minHeight: widgetHeight("slim"),
            maxWidth: maximumWidth,
            maxHeight: widgetHeight("recommended"),
          });
          await widgetWindow.startResizeDragging(direction);
          clearWidgetNotice("layout");
        } catch {
          resizeDirectionRef.current = null;
          showWidgetNotice("layout", "The widget resize could not be started.");
        }
      })();
    },
    [
      appsPanelVisible,
      calendarPanelVisible,
      clearWidgetNotice,
      clocksPanelVisible,
      todayPanelVisible,
      projectsPanelVisible,
      medicinePanelVisible,
      preferences.clockLayout,
      preferences.extraTimeZones.length,
      preferences.widthMode,
      showNextEvent,
      showWidgetNotice,
      visibleClockCount,
      appSlotCount,
      widgetWindow,
    ],
  );

  useEffect(() => {
    let disposed = false;
    let unlistenResized: (() => void) | undefined;
    void widgetWindow.onResized(({ payload }) => {
      if (disposed || resizeDirectionRef.current === null) {
        return;
      }
      const logicalSize = payload.toLogical(resizeScaleFactorRef.current);
      lastResizeLogicalSizeRef.current = {
        width: logicalSize.width,
        height: logicalSize.height,
      };
      if (resizeFinalizeTimerRef.current !== null) {
        window.clearTimeout(resizeFinalizeTimerRef.current);
      }
      resizeFinalizeTimerRef.current = window.setTimeout(() => {
        resizeFinalizeTimerRef.current = null;
        const direction = resizeDirectionRef.current;
        const size = lastResizeLogicalSizeRef.current;
        resizeDirectionRef.current = null;
        if (!direction || !size) {
          return;
        }

        const horizontal = direction === "East" || direction === "West";
        if (horizontal) {
          if (timeFocusMode) {
            return;
          }
          const fixedWidth = widgetFixedWidth(
            appSlotCount,
            preferences.widthMode,
            2 + preferences.extraTimeZones.length,
            preferences.clockLayout,
            appsPanelVisible,
            clocksPanelVisible,
            todayPanelVisible,
            projectsPanelVisible,
            medicinePanelVisible,
          );
          const calendarWidth = Math.max(
            widgetCalendarMinimumWidth(preferences.widthMode, showNextEvent),
            Math.round(size.width - fixedWidth),
          );
          updateWidgetPreferences(
            preferences.widthMode === "recommended"
              ? { recommendedCalendarWidth: calendarWidth }
              : { slimCalendarWidth: calendarWidth },
          );
          return;
        }

        const nextMode =
          size.height <= WIDGET_HEIGHT_SNAP_THRESHOLD ? "slim" : "recommended";
        if (nextMode === preferences.widthMode) {
          void widgetWindow
            .setSize(new LogicalSize(size.width, widgetHeight(nextMode)))
            .catch(() =>
              showWidgetNotice(
                "layout",
                "The widget height could not be snapped.",
              ),
            );
          return;
        }
        if (timeFocusMode) {
          updateWidgetPreferences({ widthMode: nextMode });
          return;
        }
        const targetFixedWidth = widgetFixedWidth(
          appSlotCount,
          nextMode,
          2 + preferences.extraTimeZones.length,
          preferences.clockLayout,
          appsPanelVisible,
          clocksPanelVisible,
          todayPanelVisible,
          projectsPanelVisible,
          medicinePanelVisible,
        );
        const targetCalendarWidth = Math.max(
          widgetCalendarMinimumWidth(nextMode, showNextEvent),
          Math.round(size.width - targetFixedWidth),
        );
        updateWidgetPreferences(
          nextMode === "recommended"
            ? {
                widthMode: nextMode,
                recommendedCalendarWidth: targetCalendarWidth,
              }
            : { widthMode: nextMode, slimCalendarWidth: targetCalendarWidth },
        );
      }, WIDGET_RESIZE_SETTLE_MS);
    }).then((unlisten) => {
      if (disposed) {
        unlisten();
      } else {
        unlistenResized = unlisten;
      }
    });
    return () => {
      disposed = true;
      unlistenResized?.();
      if (resizeFinalizeTimerRef.current !== null) {
        window.clearTimeout(resizeFinalizeTimerRef.current);
        resizeFinalizeTimerRef.current = null;
      }
    };
  }, [
    appsPanelVisible,
    clocksPanelVisible,
    todayPanelVisible,
    projectsPanelVisible,
    preferences.clockLayout,
    preferences.extraTimeZones.length,
    preferences.widthMode,
    showNextEvent,
    showWidgetNotice,
    timeFocusMode,
    updateWidgetPreferences,
    appSlotCount,
    widgetWindow,
  ]);

  const openAdvanced = async (focusTarget?: AdvancedFocusTarget) => {
    try {
      const existing = await WebviewWindow.getByLabel("advanced");
      if (existing) {
        await existing.unminimize();
        await existing.show();
        await existing.setFocus();
        if (focusTarget) {
          await emitTo<AdvancedFocusRequest>(
            "advanced",
            ADVANCED_FOCUS_EVENT,
            { target: focusTarget },
          );
        }
        clearWidgetNotice("advanced");
        return;
      }

      const advanced = new WebviewWindow("advanced", {
        url: advancedWindowUrl(focusTarget),
        title: "Attention Hub - Advanced",
        width: 900,
        height: 680,
        minWidth: 720,
        minHeight: 560,
        center: true,
      });
      advanced.once("tauri://error", () => {
        showWidgetNotice("advanced", "Advanced settings could not be opened.");
      });
    } catch {
      showWidgetNotice("advanced", "Advanced settings could not be opened.");
    }
  };

  const openWidgetContextMenu = async () => {
    const sizePresetItems: NonNullable<MenuOptions["items"]> = [
      {
        checked: preferences.widthMode === "recommended",
        text: "Recommended",
        action: () => updateWidgetPreferences({ widthMode: "recommended" }),
      },
      {
        checked: preferences.widthMode === "slim",
        text: "Compact single-line",
        action: () => updateWidgetPreferences({ widthMode: "slim" }),
      },
      {
        enabled: preferredCalendarWidth !== null,
        text: "Reset width to automatic",
        action: () =>
          updateWidgetPreferences(
            preferences.widthMode === "recommended"
              ? { recommendedCalendarWidth: null }
              : { slimCalendarWidth: null },
          ),
      },
    ];
    const visiblePanelItems: NonNullable<MenuOptions["items"]> = [
      {
        checked: preferences.showAppsPanel,
        text: "Show app shortcuts",
        action: () =>
          updateWidgetPreferences({
            showAppsPanel: !preferences.showAppsPanel,
          }),
      },
      {
        checked: preferences.showClocksPanel,
        text: "Show clocks",
        action: () =>
          updateWidgetPreferences({
            showClocksPanel: !preferences.showClocksPanel,
          }),
      },
      {
        checked: preferences.showTodayPanel,
        text: "Show Today",
        action: () =>
          updateWidgetPreferences({
            showTodayPanel: !preferences.showTodayPanel,
          }),
      },
      {
        checked: preferences.showProjectsPanel,
        text: "Show To-dos",
        action: () =>
          updateWidgetPreferences({
            showProjectsPanel: !preferences.showProjectsPanel,
          }),
      },
    ];
    const panelSurfaceItems: NonNullable<MenuOptions["items"]> = [
      {
        checked: preferences.panelSurface === "light",
        text: "Light",
        action: () => updateWidgetPreferences({ panelSurface: "light" }),
      },
      {
        checked: preferences.panelSurface === "dark",
        text: "Dark",
        action: () => updateWidgetPreferences({ panelSurface: "dark" }),
      },
      {
        checked: preferences.panelSurface === "custom",
        text: "Custom colors…",
        action: () => {
          updateWidgetPreferences({ panelSurface: "custom" });
          void openAdvanced();
        },
      },
      {
        checked: pinned,
        text: "Keep above other windows",
        action: () => updateWidgetPreferences({ pinned: !pinned }),
      },
    ];
    const items: NonNullable<MenuOptions["items"]> = [
      {
        text: "Open Project Hub",
        action: () => void openManagerWindow("projects"),
      },
      { text: "Size preset", items: sizePresetItems },
      { text: "Visible panels", items: visiblePanelItems },
      { text: "Appearance", items: panelSurfaceItems },
    ];

    if (preferences.showAppsPanel) {
      items.push({
        text: "App shortcuts",
        items: preferences.appOrder.map((sourceKey) => {
          const enabled = preferences.monitoredSources.includes(sourceKey);
          return {
            checked: enabled,
            text: ATTENTION_APP_LABELS[sourceKey],
            action: () =>
              updateWidgetPreferences({
                monitoredSources: enabled
                  ? preferences.monitoredSources.filter(
                      (candidate) => candidate !== sourceKey,
                    )
                  : [...preferences.monitoredSources, sourceKey],
              }),
          };
        }),
      });
    }

    if (clocksPanelVisible) {
      items.push({
        text: "Clock layout",
        items: [
          {
            checked: preferences.clockLayout === "horizontal",
            text: "Horizontal",
            action: () =>
              updateWidgetPreferences({ clockLayout: "horizontal" }),
          },
          {
            checked: preferences.clockLayout === "vertical",
            text: "Vertical",
            action: () =>
              updateWidgetPreferences({ clockLayout: "vertical" }),
          },
          {
            checked: preferences.clockLayout === "timeFocus",
            text: "Time Focus",
            action: () =>
              updateWidgetPreferences({ clockLayout: "timeFocus" }),
          },
        ],
      });
    }

    items.push({
      text: "Open Advanced settings…",
      action: () => void openAdvanced(),
    });

    if (import.meta.env.DEV) {
      items.push({
        text: "Inspect",
        action: () =>
          void invoke("open_main_panel_devtools").catch(() =>
            showWidgetNotice("inspect", "Developer tools could not be opened."),
          ),
      });
    }

    if (widgetContextMenuRef.current) {
      await widgetContextMenuRef.current.close();
    }
    const menu = await Menu.new({ items });
    widgetContextMenuRef.current = menu;
    await menu.popup(undefined, widgetWindow);
    clearWidgetNotice("menu");
  };

  const handleWidgetContextMenu = (event: ReactMouseEvent<HTMLElement>) => {
    event.preventDefault();
    void openWidgetContextMenu().catch(() =>
      showWidgetNotice("menu", "The settings menu could not be opened."),
    );
  };

  const toggleCalendarDayPanel = async () => {
    const existing = await WebviewWindow.getByLabel(TODAY_POPUP_WINDOW_LABEL);
    if (existing) {
      await existing.close();
      setCalendarDayPanelOpen(false);
      todayPopupPayloadRef.current = null;
      return;
    }

    try {
      const [position, size, anchor] = await Promise.all([
        widgetWindow.outerPosition(),
        widgetWindow.outerSize(),
        calendarPopupAnchor(),
      ]);
      if (!anchor) throw new Error("Work-calendar position unavailable");
      const placement = calendarDayPanelDirection(
        position.y,
        size.height,
        anchor.monitorTop,
        anchor.monitorBottom - anchor.monitorTop,
      );
      const dayStart = new Date(now);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(dayStart);
      dayEnd.setDate(dayEnd.getDate() + 1);
      const payload: TodayPopupPayload = {
        anchor,
        placement,
        width: todayPopupWidth(
          (anchor.right - anchor.left) / anchor.scaleFactor,
        ),
        height: Math.min(calendarDayPanelLogicalHeight, Math.max(160, Math.floor((anchor.monitorBottom - anchor.monitorTop) / anchor.scaleFactor - 12))),
        maxHeight: Math.max(160, Math.floor((anchor.monitorBottom - anchor.monitorTop) / anchor.scaleFactor - 12)),
        occupiedMinutes: workCalendarOccupiedMinutes(
          workCalendar?.daySelections ?? [],
          dayStart,
          dayEnd,
        ),
        systemTimeZone,
        schoolMode: preferences.schoolModeEnabled,
        dayState: calendarDay,
        selections: workCalendar?.daySelections ?? [],
      };
      todayPopupPayloadRef.current = payload;
      todayPopupReadyRef.current = false;
      todayPopupPositionedRef.current = false;
      setCalendarDayPanelPlacement(placement);
      setCalendarDayPanelOpen(true);
      await createTodayPopupWindow(
        payload,
        () => {
          todayPopupPositionedRef.current = true;
          publishTodayPopup();
        },
        () => {
          setCalendarDayPanelOpen(false);
          todayPopupPayloadRef.current = null;
          todayPopupReadyRef.current = false;
          todayPopupPositionedRef.current = false;
        },
        () => showWidgetNotice("calendar", "Today popup could not be opened."),
      );
    } catch {
      setCalendarDayPanelOpen(false);
      showWidgetNotice("calendar", "Today popup could not be opened.");
    }
  };

  const activateSource = async (
    sourceKey: AttentionAppKey,
  ) => {
    try {
      await invoke("activate_attention_source", { sourceKey });
      if (sourceActivationNotice?.sourceKey === sourceKey) {
        setSourceActivationNotice(null);
        if (sourceActivationNoticeTimerRef.current !== null) {
          window.clearTimeout(sourceActivationNoticeTimerRef.current);
          sourceActivationNoticeTimerRef.current = null;
        }
      }
    } catch (error) {
      const message = sourceActivationFailureMessage(
        ATTENTION_APP_LABELS[sourceKey],
      );
      if (sourceActivationNoticeTimerRef.current !== null) {
        window.clearTimeout(sourceActivationNoticeTimerRef.current);
      }
      setSourceActivationNotice({ sourceKey, message });
      sourceActivationNoticeTimerRef.current = window.setTimeout(() => {
        setSourceActivationNotice((current) =>
          current?.sourceKey === sourceKey ? null : current,
        );
        sourceActivationNoticeTimerRef.current = null;
      }, SOURCE_ACTIVATION_NOTICE_MS);
    }
  };

  const activateZoomMeeting = async () => {
    try {
      await invoke("activate_zoom_meeting");
      setZoomActivationFeedback(null);
      if (zoomActivationFeedbackTimerRef.current !== null) {
        window.clearTimeout(zoomActivationFeedbackTimerRef.current);
        zoomActivationFeedbackTimerRef.current = null;
      }
    } catch {
      setZoomActivationFeedback("Zoom meeting could not be focused.");
      if (zoomActivationFeedbackTimerRef.current !== null) {
        window.clearTimeout(zoomActivationFeedbackTimerRef.current);
      }
      zoomActivationFeedbackTimerRef.current = window.setTimeout(() => {
        setZoomActivationFeedback(null);
        zoomActivationFeedbackTimerRef.current = null;
      }, SOURCE_ACTIVATION_NOTICE_MS);
    }
  };

  const suppressCalendarEvent = (eventKey: string | null) => {
    if (!eventKey) {
      return;
    }
    setFinishedActiveEvents((current) => {
      const next = new Set(current);
      next.add(eventKey);
      return next;
    });
  };

  const skipCalendarEvent = (selection: WorkCalendarSelection) => {
    setSkippedCalendarOccurrences(setCalendarOccurrenceSkipped(selection, true));
    if (acknowledgedActiveEvent && selection.classification === "active") setAcknowledgedActiveEvent(null);
    void emit(CALENDAR_SKIPS_CHANGED_EVENT);
  };

  const chooseCalendarEvent = (eventKey: string | null) => {
    if (!eventKey) {
      return;
    }
    setAcknowledgedActiveEvent(eventKey);
    if (calendarDisplay.hasOverlap) {
      suppressCalendarEvent(
        eventKey === calendarDisplay.selectionKey
          ? calendarDisplay.companionKey
          : calendarDisplay.selectionKey,
      );
    }
  };

  const openCalendarJoin = async (
    selection: WorkCalendarSelection,
    eventKey: string | null,
  ) => {
    if (!selection.joinToken) {
      return;
    }
    try {
      await invoke("open_work_calendar_join_url", {
        joinToken: selection.joinToken,
      });
      chooseCalendarEvent(eventKey);
      clearWidgetNotice("calendar");
    } catch {
      showWidgetNotice("calendar", vocabulary.linkOpenFailed);
    }
  };

  const calendarPopupAnchor = async (): Promise<PopupAnchor | null> => {
    const panel = calendarDayPanelRef.current;
    if (!panel) return null;
    const [position, scaleFactor, monitors] = await Promise.all([
      widgetWindow.outerPosition(),
      widgetWindow.scaleFactor(),
      availableMonitors(),
    ]);
    const rect = panel.getBoundingClientRect();
    const left = Math.round(position.x + rect.left * scaleFactor);
    const top = Math.round(position.y + rect.top * scaleFactor);
    const right = Math.round(position.x + rect.right * scaleFactor);
    const bottom = Math.round(position.y + rect.bottom * scaleFactor);
    const monitor = monitors.find(
      (candidate) =>
        left >= candidate.position.x &&
        left < candidate.position.x + candidate.size.width &&
        top >= candidate.position.y &&
        top < candidate.position.y + candidate.size.height,
    );
    if (!monitor) return null;
    return {
      left,
      top,
      right,
      bottom,
      scaleFactor,
      monitorLeft: monitor.workArea.position.x,
      monitorTop: monitor.workArea.position.y,
      monitorRight: monitor.workArea.position.x + monitor.workArea.size.width,
      monitorBottom: monitor.workArea.position.y + monitor.workArea.size.height,
    };
  };

  const openMedicinePanel = async (event: ReactMouseEvent<HTMLButtonElement>) => {
    if (!hasActiveMedicineTreatment) {
      await openMedicineManagerWindow();
      return;
    }
    const button = event.currentTarget;
    try {
      const existing = await WebviewWindow.getByLabel(MEDICINE_PANEL_WINDOW_LABEL);
      if (existing) {
        await existing.close();
        setMedicinePanelOpen(false);
        medicinePanelPayloadRef.current = null;
        medicinePanelReadyRef.current = false;
        medicinePanelPositionedRef.current = false;
        return;
      }
      const [position, scaleFactor, monitors] = await Promise.all([
        widgetWindow.outerPosition(), widgetWindow.scaleFactor(), availableMonitors(),
      ]);
      const rect = button.getBoundingClientRect();
      const centerX = position.x + (rect.left + rect.width / 2) * scaleFactor;
      const centerY = position.y + (rect.top + rect.height / 2) * scaleFactor;
      const monitor = monitors.find((item) => centerX >= item.position.x && centerX <= item.position.x + item.size.width && centerY >= item.position.y && centerY <= item.position.y + item.size.height) ?? monitors[0];
      if (!monitor) throw new Error("Monitor unavailable");
      const bounded = boundedMedicinePanelGroups(dailyMedicineGroups);
      const naturalHeight = medicinePanelHeight(bounded.groups.length, bounded.visibleRows, bounded.hiddenRows > 0);
      const anchor: PopupAnchor = {
        left: Math.round(position.x + rect.left * scaleFactor),
        top: Math.round(position.y + rect.top * scaleFactor),
        right: Math.round(position.x + rect.right * scaleFactor),
        bottom: Math.round(position.y + rect.bottom * scaleFactor),
        scaleFactor,
        monitorLeft: monitor.workArea.position.x,
        monitorTop: monitor.workArea.position.y,
        monitorRight: monitor.workArea.position.x + monitor.workArea.size.width,
        monitorBottom: monitor.workArea.position.y + monitor.workArea.size.height,
      };
      const height = Math.min(naturalHeight, Math.max(120, Math.floor((anchor.monitorBottom - anchor.monitorTop) / scaleFactor - 12)));
      const placement = anchor.top - anchor.monitorTop >= anchor.monitorBottom - anchor.bottom ? "above" : "below";
      const payload: MedicinePanelPayload = { anchor, placement, width: MEDICINE_PANEL_WIDTH, height };
      medicinePanelPayloadRef.current = payload;
      medicinePanelReadyRef.current = false;
      medicinePanelPositionedRef.current = false;
      setMedicinePanelOpen(true);
      await createMedicinePanelWindow(payload, () => { medicinePanelPositionedRef.current = true; publishMedicinePanel(); }, () => {
        setMedicinePanelOpen(false); medicinePanelPayloadRef.current = null; medicinePanelReadyRef.current = false; medicinePanelPositionedRef.current = false;
      }, () => showWidgetNotice("medicine", "Medicine panel could not be opened."));
    } catch {
      setMedicinePanelOpen(false);
      showWidgetNotice("medicine", "Medicine panel could not be opened.");
    }
  };

  const openCalendarEventSettings = async (
    selection: WorkCalendarSelection,
  ) => {
    if (!selection.eventToken) return;
    const anchor = await calendarPopupAnchor();
    if (!anchor) {
      showWidgetNotice("calendar", "Event settings could not be positioned.");
      return;
    }
    await openEventSettingsWindow(
      { eventToken: selection.eventToken, anchor },
      (message) => showWidgetNotice("calendar", message),
    );
  };

  const openCalendarProjectPanel = async (
    selection: WorkCalendarSelection,
  ) => {
    const projectId = selection.eventWorkspace?.projectId;
    const listId = selection.eventWorkspace?.listId;
    if (listId) {
      await openManagerWindow("projects", undefined, listId);
      return;
    }
    if (!projectId) {
      await openCalendarEventSettings(selection);
      return;
    }
    const anchor = await calendarPopupAnchor();
    if (!anchor) {
      showWidgetNotice("calendar", "Project panel could not be positioned.");
      return;
    }
    await openProjectPanelWindow(
      { projectId, anchor },
      (message) => showWidgetNotice("calendar", message),
    );
  };

  const openCalendarEventLink = async (
    selection: WorkCalendarSelection,
  ) => {
    if (!selection.eventToken) return;
    try {
      await invoke("open_event_workspace_link_from_workspace", {
        eventToken: selection.eventToken,
      });
      clearWidgetNotice("calendar");
    } catch {
      showWidgetNotice("calendar", "The saved event link could not be opened.");
    }
  };

  const finishCalendarEvent = (
    selection: WorkCalendarSelection,
    eventKey: string | null,
  ) => {
    if (
      !eventKey ||
      selection.classification !== "active" ||
      selection.allDay
    ) {
      return;
    }
    suppressCalendarEvent(eventKey);
    if (acknowledgedActiveEvent === eventKey) {
      setAcknowledgedActiveEvent(null);
    }
  };

  const telegram = attentionSnapshot?.sources.find(
    ({ sourceKey }) => sourceKey === "telegram",
  );
  const teams = attentionSnapshot?.sources.find(
    ({ sourceKey }) => sourceKey === "teams",
  );
  const outlook = attentionSnapshot?.sources.find(
    ({ sourceKey }) => sourceKey === "outlook",
  );
  const slack = attentionSnapshot?.sources.find(
    ({ sourceKey }) => sourceKey === "slack",
  );
  const viber = attentionSnapshot?.sources.find(
    ({ sourceKey }) => sourceKey === "viber",
  );
  const whatsapp = attentionSnapshot?.sources.find(
    ({ sourceKey }) => sourceKey === "whatsapp",
  );
  const telegramCounter = telegram
    ? findSignal(telegram, "applicationCounter")
    : null;
  const teamsActivity = teams ? findSignal(teams, "activityStatus") : null;
  const outlookInbox = outlook ? findSignal(outlook, "inboxUnread") : null;
  const telegramBadge = formatAttentionBadge(
    telegramCounter?.count,
    telegramCounter?.needsAttention,
  );
  const teamsBadge = formatAttentionBadge(
    teamsActivity?.count,
    teamsActivity?.needsAttention,
  );
  const outlookBadge =
    outlook?.state === "observed"
      ? formatAttentionBadge(
          outlookInbox?.count,
          outlookInbox?.needsAttention,
        )
      : null;
  const attentionCapturedAt = attentionSnapshot
    ? Date.parse(attentionSnapshot.capturedAt)
    : Number.NaN;
  const attentionStale =
    attentionSnapshot !== null &&
    (!Number.isFinite(attentionCapturedAt) ||
      now.getTime() - attentionCapturedAt > ATTENTION_STALE_AFTER_MS);
  const telegramStatus = `${sourceAvailability(telegram, attentionStale, attentionRefreshFailed)}${typeof telegramCounter?.count === "number" && telegramCounter.count > 0 ? `; application counter ${telegramCounter.count}` : telegramCounter?.needsAttention === true ? "; new activity detected" : ""}`;
  const teamsStatus = `${sourceAvailability(teams, attentionStale, attentionRefreshFailed)}${teamsActivity?.needsAttention === true ? "; new activity detected" : ""}`;
  const outlookStatus = outlook?.state === "notExposed"
    ? "unread count is unavailable while Outlook is minimized; open Outlook to refresh"
    : `${sourceAvailability(outlook, attentionStale, attentionRefreshFailed)}${typeof outlookInbox?.count === "number" && outlookInbox.count > 0 ? `; aggregate Inbox unread ${outlookInbox.count}` : outlookInbox?.needsAttention === true ? "; Inbox needs attention" : ""}`;
  const calendarSelection = calendarDisplay.selection;
  const calendarNextSelection = calendarDisplay.companion;
  // One lookup for every school/work wording difference. See
  // calendar-vocabulary.ts; components never test the mode themselves.
  const vocabulary = calendarVocabulary(preferences.schoolModeEnabled);
  // The host system zone, matching what Rust used to stamp `viewerDay`. Not
  // `primaryTimeZone`, which only changes which clock is displayed.
  const viewerToday = viewerLocalDate(now, systemTimeZone);
  const calendarDay = calendarDayState(workCalendar, {
    nowMs: now.getTime(),
    viewerToday,
  });
  // Only in School mode: a work diary has no breaks, no end of day, and no
  // meaningful progress through one. See widget-preferences.schoolModeEnabled.
  //
  // This substitutes the status pill's text and nothing else. The band has a
  // fixed height, so adding any element to it pushes the widget layout apart.
  // Suppressed with no saved calendar, where the existing setup prompt already
  // says everything true.
  const schoolDayLabel =
    preferences.schoolModeEnabled && workCalendar?.status !== "notConfigured"
      ? schoolDayStatusLabel(
          selectSchoolDayState(workCalendar, {
            nowMs: now.getTime(),
            viewerToday,
            // The ordinal must name the same lesson the title names; see
            // SchoolDayInputs.displayedStart.
            displayedStart: calendarSelection?.start ?? null,
          }),
        )
      : null;
  const activeEventKey =
    calendarSelection?.classification === "active" && !calendarSelection.allDay
      ? calendarDisplay.selectionKey
      : null;
  const activeEventAcknowledged =
    activeEventKey !== null &&
    (preferences.schoolModeEnabled || acknowledgedActiveEvent === activeEventKey);
  const calendarStartMs = calendarSelection
    ? Date.parse(calendarSelection.start)
    : Number.NaN;
  const calendarStartingSoon =
    calendarSelection?.classification === "upcoming" &&
    !calendarSelection.allDay &&
    Number.isFinite(calendarStartMs) &&
    calendarStartMs > now.getTime() &&
    calendarStartMs - now.getTime() <= WORK_CALENDAR_STARTING_SOON_MS;
  const calendarImminent =
    calendarStartingSoon &&
    calendarStartMs - now.getTime() <= WORK_CALENDAR_IMMINENT_MS;
  const calendarStartedNeedsAttention =
    calendarSelection?.classification === "active" &&
    !calendarSelection.allDay &&
    !preferences.schoolModeEnabled &&
    !activeEventAcknowledged;
  const calendarNotConfigured = workCalendar?.status === "notConfigured";
  const calendarSkippedSelection = calendarSelection === null
    ? firstSkippedWorkCalendarSelection(workCalendar, skippedCalendarOccurrences)
    : null;
  const calendarSuppressedBySkip = calendarSkippedSelection !== null;
  const calendarAttentionState = calendarStartedNeedsAttention
    ? "started"
    : calendarImminent
      ? "imminent"
      : calendarStartingSoon
        ? "soon"
        : undefined;
  useEffect(() => {
    if (!preferences.meetingStartSoundEnabled) {
      return;
    }
    const alert = nextWorkCalendarMeetingAlert(workCalendar, Date.now(), skippedCalendarOccurrences);
    if (
      !alert ||
      announcedMeetingStartAlertsRef.current.has(alert.key) ||
      alert.delayMs > WORK_CALENDAR_POLL_INTERVAL_MS
    ) {
      return;
    }

    const playAlert = () => {
      if (announcedMeetingStartAlertsRef.current.has(alert.key)) {
        return;
      }
      announcedMeetingStartAlertsRef.current = new Set([
        ...announcedMeetingStartAlertsRef.current,
        alert.key,
      ]);
      void invoke("play_meeting_start_sound", {
        sound: preferences.meetingStartSound,
      })
        .then(() => clearWidgetNotice("sound"))
        .catch(() =>
          showWidgetNotice(
            "sound",
            "The meeting reminder sound could not be played.",
          ),
        );
    };

    if (alert.delayMs === 0) {
      playAlert();
      return;
    }
    const timer = window.setTimeout(playAlert, alert.delayMs);
    return () => window.clearTimeout(timer);
  }, [
    preferences.meetingStartSound,
    preferences.meetingStartSoundEnabled,
    skippedCalendarOccurrences,
    workCalendar,
  ]);

  useEffect(
    () => () => {
      if (sourceActivationNoticeTimerRef.current !== null) {
        window.clearTimeout(sourceActivationNoticeTimerRef.current);
      }
    },
    [],
  );
  const calendarRetryNotice = workCalendarRetryNotice({
    ...workCalendarRefreshHealth,
    nowMs: now.getTime(),
  });
  const calendarRecoveringWithoutSelection = Boolean(
    !calendarSelection &&
      !calendarNotConfigured &&
      (workCalendarRefreshing ||
        workCalendarCheckSlow ||
        workCalendarTransportFailed ||
        workCalendar?.status === "busy" ||
        workCalendar?.status === "error" ||
        workCalendar?.status === "unavailable"),
  );
  const calendarAwaitingFirstSync = Boolean(
    calendarRecoveringWithoutSelection && !calendarRetryNotice,
  );
  const calendarHealthNotice = calendarRetryNotice
    ? {
        detail: calendarRetryNotice.detail,
        label: calendarRetryNotice.state,
        tone: "warning" as const,
      }
    : workCalendarCheckSlow && !calendarSelection
      ? {
          detail: "Refresh is taking longer than expected. Retrying automatically.",
          label: vocabulary.checking,
          tone: "warning" as const,
        }
      : workCalendarRefreshing && !calendarSelection
        ? {
            detail: "Reading the saved source without controlling Outlook.",
            label: vocabulary.checking,
            tone: "neutral" as const,
          }
        : workCalendar?.status === "busy" && !calendarSelection
          ? {
              detail: "Another calendar check is already finishing.",
              label: vocabulary.checking,
              tone: "neutral" as const,
            }
          : null;
  const calendarState = calendarSelection
    ? calendarStartedNeedsAttention
      ? vocabulary.startedNeedsAttention
      : calendarStartingSoon
        ? vocabulary.startingSoon
        : (schoolDayLabel ??
          (calendarSelection.classification === "active"
            ? vocabulary.inProgress
            : vocabulary.upNext))
    : calendarSuppressedBySkip
      ? vocabulary.skippedLocally
    : calendarNotConfigured
      ? vocabulary.idle
      : calendarAwaitingFirstSync
        ? "Retrying"
      : (schoolDayLabel ?? vocabulary.unavailable);
  const calendarTitle = calendarSelection
    ? calendarSelection.subject
    : calendarSuppressedBySkip
      ? calendarSkippedSelection.subject
    : calendarNotConfigured
      ? vocabulary.connectPrompt
      : calendarAwaitingFirstSync
        ? "Waiting for saved calendar"
      : workCalendar?.status === "busy"
        ? "Another calendar check is finishing"
        : vocabulary.noFreshEvent;
  const calendarDetail = calendarSelection
    ? formatCalendarDetail(calendarSelection, now)
    : calendarSuppressedBySkip
      ? "Skipped locally · open Today to undo."
    : calendarAwaitingFirstSync
      ? "The saved calendar is temporarily unavailable. Retrying automatically."
    : workCalendarRefreshing
      ? "Reading the saved source without controlling Outlook."
      : workCalendarTransportFailed || workCalendar?.status === "error"
        ? "The secure source or local provider could not be read."
        : workCalendar?.status === "notConfigured"
          ? "Open Advanced to save one published calendar securely."
          : "The last refresh was unavailable; no cached event is shown.";
  const calendarHealthOnly = Boolean(
    calendarHealthNotice &&
      !calendarAwaitingFirstSync &&
      !calendarSelection &&
      !calendarSuppressedBySkip &&
      !calendarNotConfigured,
  );
  const calendarProgress = calendarEventProgress(calendarSelection, now);
  const calendarJoinOpened =
    calendarDisplay.selectionKey !== null &&
    acknowledgedActiveEvent === calendarDisplay.selectionKey;
  const calendarNextAcknowledged =
    calendarNextSelection?.classification === "active" &&
    calendarDisplay.companionKey !== null &&
    (preferences.schoolModeEnabled || acknowledgedActiveEvent === calendarDisplay.companionKey);
  const calendarNextJoinOpened =
    calendarDisplay.companionKey !== null &&
    acknowledgedActiveEvent === calendarDisplay.companionKey;
  const calendarNextStartedNeedsAttention =
    calendarNextSelection?.classification === "active" &&
    !calendarNextSelection.allDay &&
    !preferences.schoolModeEnabled &&
    !calendarNextAcknowledged;
  const calendarNextState =
    calendarNextSelection?.classification === "active"
      ? calendarNextAcknowledged
        ? vocabulary.inProgress
        : vocabulary.startedNeedsAttention
      : vocabulary.upNext;
  const calendarWorkspaceActionsPresent = Boolean(
    calendarSelection?.eventWorkspace?.linkUrlPresent ||
      calendarSelection?.eventWorkspace?.projectId ||
      calendarSelection?.eventWorkspace?.listId,
  );
  const calendarNextWorkspaceActionsPresent = Boolean(
    calendarNextSelection?.eventWorkspace?.linkUrlPresent ||
      calendarNextSelection?.eventWorkspace?.projectId ||
      calendarNextSelection?.eventWorkspace?.listId,
  );
  const calendarNextDetail = calendarNextSelection
    ? formatCalendarDetail(calendarNextSelection, now)
    : "";
  const calendarNextProgress = calendarEventProgress(
    calendarNextSelection,
    now,
  );
  const primaryTimeZoneLabel = preferences.primaryTimeZone
    ? preferences.primaryTimeZone
    : `System (${systemTimeZone})`;
  const secondaryTimeZoneLabel = secondaryTimeZone;
  const liveClockLabel = (timeZone: string) =>
    preferences.widthMode === "slim"
      ? compactTimeZoneLabel(timeZone)
      : shortTimeZoneLabel(timeZone);
  const conversionSourceTimeZone =
    clockConversionSource === "local" ? primaryTimeZone : secondaryTimeZone;
  const conversionTargetTimeZone =
    clockConversionSource === "local" ? secondaryTimeZone : primaryTimeZone;
  const conversionSourceTimeZoneLabel =
    clockConversionSource === "local"
      ? primaryTimeZoneLabel
      : secondaryTimeZoneLabel;
  const conversionTargetTimeZoneLabel =
    clockConversionSource === "local"
      ? secondaryTimeZoneLabel
      : primaryTimeZoneLabel;
  const convertedClockTime = convertZonedTimeToInstant(
    conversionTime,
    now,
    conversionSourceTimeZone,
  );
  const clockConversion = convertedClockTime
    ? formatZonedConversion(convertedClockTime, now, conversionTargetTimeZone)
    : "Unavailable at the DST transition";
  const [clockConversionTime, ...clockConversionDayParts] = convertedClockTime
    ? clockConversion.split(" ")
    : ["Unavailable", "DST transition"];
  const clockConversionDay = clockConversionDayParts.join(" ");
  const gridSegments = [
    appsPanelVisible ? "var(--widget-left-width)" : null,
    clocksPanelVisible
      ? timeFocusMode
        ? "minmax(var(--widget-clock-width), 1fr)"
        : "var(--widget-clock-width)"
      : null,
    calendarPanelVisible
      ? "minmax(var(--widget-calendar-min-width), 1fr)"
      : null,
    destinationPanelCount > 0 ? "var(--widget-destinations-width)" : null,
    "var(--widget-drag-handle-width)",
    "var(--widget-utility-width)",
  ].filter((segment): segment is string => segment !== null);
  const panelStyle = {
    ...widgetPanelStyle(preferences),
    "--widget-left-width": `${widgetLeftWidth(appSlotCount, preferences.widthMode)}px`,
    "--widget-clock-width": `${widgetClockPanelWidth(
      preferences.widthMode,
      visibleClockCount,
      preferences.clockLayout,
    )}px`,
    "--widget-clock-count": visibleClockCount,
    "--widget-calendar-width": `${widgetCalendarWidth(
      preferences.widthMode,
      showNextEvent,
      calendarLayoutContentLength,
      preferredCalendarWidth,
    )}px`,
    "--widget-calendar-min-width": `${widgetCalendarMinimumWidth(
      preferences.widthMode,
      showNextEvent,
    )}px`,
    "--widget-height": `${widgetHeight(preferences.widthMode)}px`,
    "--widget-calendar-day-panel-height": `${calendarDayPanelLogicalHeight}px`,
    "--widget-destinations-width": `${widgetDestinationsWidth(preferences.widthMode, todayPanelVisible, projectsPanelVisible, medicinePanelVisible)}px`,
    "--widget-zone-gap": `${widgetZoneGap(preferences.widthMode)}px`,
    "--widget-utility-width": `${widgetUtilityWidth(preferences.widthMode)}px`,
    "--widget-drag-handle-width": `${WIDGET_DRAG_HANDLE_WIDTH}px`,
    "--widget-resize-edge-size": `${WIDGET_RESIZE_EDGE_SIZE}px`,
    "--widget-grid-template": gridSegments.join(" "),
  } as CSSProperties;
  const calendarDaySelections = workCalendar?.daySelections ?? [];
  const dailyMedicineGroups = medicine
    ? medicineDailyTreatments(medicine, now, medicinePreferences.graceMinutes)
    : [];
  const todayMedicineRows = dailyMedicineGroups.flatMap((group) => group.rows);
  const medicineLeftCount = todayMedicineRows.filter((row) => row.state !== "taken" && row.state !== "skipped").length;
  const medicineAttentionCount = todayMedicineRows.filter((row) => row.state === "due" || row.state === "missed").length;
  const hasActiveMedicineTreatment = medicine ? activeMedicineTreatments(medicine, now).length > 0 : false;
  const medicineHasScheduledDoses = todayMedicineRows.length > 0;
  const medicineBadge = medicineLoadState === "loading" ? "…" : medicineLoadState === "unavailable" ? "!" : !medicineHasScheduledDoses ? "–" : medicineLeftCount ? medicineLeftCount > 99 ? "99+" : medicineLeftCount : "✓";
  const medicineBadgeLabel = medicineLoadState === "loading" ? "Medicine data is loading" : medicineLoadState === "unavailable" ? "Medicine data is unavailable" : !medicineHasScheduledDoses ? "No doses scheduled today" : medicineLeftCount ? `${medicineLeftCount} doses left today` : "All doses recorded today";
  const remainingCalendarEventCount = calendarDaySelections.filter((selection) => {
    if (selection.cancelled) return false;
    const end = Date.parse(selection.end);
    return Number.isFinite(end) && end > now.getTime();
  }).length;
  const calendarDayStart = new Date(now);
  calendarDayStart.setHours(0, 0, 0, 0);
  const calendarDayEnd = new Date(calendarDayStart);
  calendarDayEnd.setDate(calendarDayEnd.getDate() + 1);
  const calendarOccupiedMinutes = workCalendarOccupiedMinutes(
    calendarDaySelections,
    calendarDayStart,
    calendarDayEnd,
  );

  useEffect(() => {
    const current = todayPopupPayloadRef.current;
    if (!calendarDayPanelOpen || !current) return;
    todayPopupPayloadRef.current = {
      ...current,
      height: calendarDayPanelLogicalHeight,
      occupiedMinutes: calendarOccupiedMinutes,
      selections: calendarDaySelections,
      systemTimeZone,
      schoolMode: preferences.schoolModeEnabled,
      dayState: calendarDay,
    };
    publishTodayPopup();
    // `calendarDay` and the mode both feed the payload, so an open popup must
    // re-publish when either changes rather than waiting for an unrelated
    // dependency to move.
  }, [
    calendarDay,
    calendarDayPanelLogicalHeight,
    calendarDayPanelOpen,
    calendarDaySelections,
    calendarOccupiedMinutes,
    preferences.schoolModeEnabled,
    publishTodayPopup,
    systemTimeZone,
  ]);

  const renderAppSlot = (sourceKey: AttentionAppKey) => {
    if (sourceKey === "teams") {
      return (
        <AppSlot
          key={sourceKey}
          sourceKey={sourceKey}
          label="Microsoft Teams"
          badge={teamsBadge}
          statusText={teamsStatus}
          health={sourceHealth(teams, attentionStale, attentionRefreshFailed)}
          status={mirrorStatuses.teams}
          notRunning={teams?.state === "notRunning"}
          onActivate={() => void activateSource(sourceKey)}
          feedback={
            sourceActivationNotice?.sourceKey === sourceKey
              ? sourceActivationNotice.message
              : null
          }
        />
      );
    }
    if (sourceKey === "telegram") {
      return (
        <AppSlot
          key={sourceKey}
          sourceKey={sourceKey}
          label="Telegram"
          badge={telegramBadge}
          badgeTone="neutral"
          statusText={telegramStatus}
          health={sourceHealth(telegram, attentionStale, attentionRefreshFailed)}
          status={mirrorStatuses.telegram}
          notRunning={telegram?.state === "notRunning"}
          onActivate={() => void activateSource(sourceKey)}
          feedback={
            sourceActivationNotice?.sourceKey === sourceKey
              ? sourceActivationNotice.message
              : null
          }
        />
      );
    }
    if (sourceKey === "outlook") {
      return (
        <AppSlot
          key={sourceKey}
          sourceKey={sourceKey}
          label="Microsoft Outlook"
          badge={outlookBadge}
          statusText={outlookStatus}
          health={sourceHealth(
            outlook,
            attentionStale,
            attentionRefreshFailed,
          )}
          notRunning={outlook?.state === "notRunning"}
          onActivate={() => void activateSource(sourceKey)}
          feedback={
            sourceActivationNotice?.sourceKey === sourceKey
              ? sourceActivationNotice.message
              : null
          }
        />
      );
    }
    const visualSources = { slack, viber, whatsapp };
    const labels = { slack: "Slack", viber: "Viber", whatsapp: "WhatsApp" };
    const observation = visualSources[sourceKey];
    return (
      <AppSlot
        key={sourceKey}
        sourceKey={sourceKey}
        label={labels[sourceKey]}
        badge={null}
        statusText={`${sourceAvailability(observation, attentionStale, attentionRefreshFailed)}; unread count is not semantically exposed`}
        health={presenceHealth(
          observation,
          attentionStale,
          attentionRefreshFailed,
        )}
        status={mirrorStatuses[sourceKey]}
        notRunning={observation?.state === "notRunning"}
        onActivate={() => void activateSource(sourceKey)}
        feedback={
          sourceActivationNotice?.sourceKey === sourceKey
            ? sourceActivationNotice.message
            : null
        }
      />
    );
  };

  return (
    <main
      className="widget-shell"
      data-day-panel={calendarDayPanelOpen || undefined}
      data-day-panel-placement={calendarDayPanelPlacement}
      data-width-mode={preferences.widthMode}
      data-apps-panel={appsPanelVisible || undefined}
      data-clocks-panel={clocksPanelVisible || undefined}
      data-first-zone={
        appsPanelVisible
          ? "apps"
          : clocksPanelVisible
            ? "clocks"
            : calendarPanelVisible
              ? "calendar"
              : destinationPanelCount > 0
                ? "destinations"
                : "utility"
      }
      onContextMenu={handleWidgetContextMenu}
      style={panelStyle}
    >
      {(["West", "East", "North", "South"] as const).map((direction) => (
        <div
          aria-hidden="true"
          className="widget-resize-edge"
          data-resize-direction={direction.toLowerCase()}
          key={direction}
          onPointerDown={(event) => beginWidgetResize(event, direction)}
        />
      ))}
      {appsPanelVisible && (
        <section
          className="widget-zone widget-left"
          aria-label="Application attention"
          data-tauri-drag-region
        >
          <div className="widget-apps" data-tauri-drag-region>
            {visibleSources.map(renderAppSlot)}
            {zoomMeetingPresence.visible && (
              <ZoomMeetingSlot
                feedback={zoomActivationFeedback}
                minimized={zoomMeetingPresence.minimized}
                onActivate={() => void activateZoomMeeting()}
              />
            )}
          </div>
        </section>
      )}

      {clocksPanelVisible && (
        <section
          className="widget-zone widget-clock"
          aria-label="Current time"
          data-clock-count={visibleClockCount}
          data-clock-layout={preferences.clockLayout}
          data-clock-mode={clockConversionSource ? "converter" : "live"}
          data-clock-conversion-source={clockConversionSource ?? undefined}
          data-tauri-drag-region
        >
        {timeFocusMode ? (
          <div className="widget-clock__focus" data-tauri-drag-region>
            <time
              aria-label={`Local time ${formatTime(now)}:${formatClockSeconds(now)}`}
              dateTime={now.toISOString()}
            >
              <span>{formatTime(now)}</span>
              <span aria-hidden="true" className="widget-clock__seconds">
                :{formatClockSeconds(now)}
              </span>
            </time>
          </div>
        ) : clockConversionSource ? (
          <>
          <div className="widget-clock-converter">
            <label htmlFor="clock-conversion-time">
              {shortTimeZoneLabel(conversionSourceTimeZone)}
            </label>
            <input
              aria-label={`Time in ${conversionSourceTimeZoneLabel}`}
              id="clock-conversion-time"
              onChange={(event) => setConversionTime(event.target.value)}
              step="60"
              type="time"
              value={conversionTime}
            />
            <span className="widget-clock-converter__source-day">
              {formatClockDay(now, conversionSourceTimeZone)}
            </span>
            <output
              aria-label={`${conversionTargetTimeZoneLabel} converted time ${clockConversion}`}
              aria-live="polite"
            >
              <span title={conversionTargetTimeZoneLabel}>
                {shortTimeZoneLabel(conversionTargetTimeZone)}
              </span>
              <strong className="widget-clock-converter__result">
                <span className="widget-clock-converter__time">
                  {clockConversionTime}
                </span>
                <span className="widget-clock-converter__day">
                  {clockConversionDay}
                </span>
              </strong>
            </output>
          </div>
          <button
            aria-label="Return to live clocks"
            className="widget-clock-converter__close"
            onClick={() => setClockConversionSource(null)}
            title="Return to live clocks"
            type="button"
          >
            ×
          </button>
          </>
        ) : (
          <>
            <div data-tauri-drag-region>
              <span className="widget-clock__label widget-clock__label--select">
                <select
                  aria-label="Primary timezone"
                  className="widget-clock__native-select"
                  title={`${primaryTimeZoneLabel} · ${timeZoneOffsetLabel(primaryTimeZone, now)}`}
                  value={preferences.primaryTimeZone ?? "__system"}
                  onChange={(event) => {
                    if (!event.target.value) {
                      return;
                    }
                    updateWidgetPreferences({
                      primaryTimeZone:
                        event.target.value === "__system"
                          ? null
                          : event.target.value,
                    });
                  }}
                >
                  <option value="__system">
                    System — {timeZoneOptionLabel(systemTimeZone, now)}
                  </option>
                  {timeZoneOptions.map((timeZone) => (
                    <option key={timeZone} value={timeZone}>
                      {timeZoneOptionLabel(timeZone, now)}
                    </option>
                  ))}
                </select>
                <span aria-hidden="true" className="widget-clock__short-label">
                  {liveClockLabel(primaryTimeZone)}
                </span>
                <svg aria-hidden="true" viewBox="0 0 12 8">
                  <path d="m1 1.5 5 5 5-5" />
                </svg>
              </span>
              <button
                aria-label={`${primaryTimeZoneLabel} time ${formatTime(now, primaryTimeZone)}:${formatClockSeconds(now, primaryTimeZone)}. Convert a ${primaryTimeZoneLabel} time to ${secondaryTimeZoneLabel}.`}
                className="widget-clock__time-button"
                onClick={() => {
                  setConversionTime(formatTime(now, primaryTimeZone));
                  setClockConversionSource("local");
                }}
                title={`Click to convert a ${primaryTimeZoneLabel} time to ${secondaryTimeZoneLabel}`}
                type="button"
              >
                <time>
                  <span>{formatTime(now, primaryTimeZone)}</span>
                  <span aria-hidden="true" className="widget-clock__seconds">
                    :{formatClockSeconds(now, primaryTimeZone)}
                  </span>
                </time>
              </button>
              <span className="widget-clock__day">
                {formatClockDay(now, primaryTimeZone)}
              </span>
            </div>
            {preferences.showSecondaryClock && <div data-tauri-drag-region>
              <span className="widget-clock__label widget-clock__label--select">
                <select
                  aria-label="Secondary timezone"
                  className="widget-clock__native-select"
                  title={`${secondaryTimeZone} · ${timeZoneOffsetLabel(secondaryTimeZone, now)}`}
                  value={secondaryTimeZone}
                  onChange={(event) => {
                    if (!event.target.value) {
                      return;
                    }
                    updateWidgetPreferences({
                      secondaryTimeZone: event.target.value,
                    });
                  }}
                >
                  {timeZoneOptions.map((timeZone) => (
                    <option key={timeZone} value={timeZone}>
                      {timeZoneOptionLabel(timeZone, now)}
                    </option>
                  ))}
                </select>
                <span aria-hidden="true" className="widget-clock__short-label">
                  {liveClockLabel(secondaryTimeZone)}
                </span>
                <svg aria-hidden="true" viewBox="0 0 12 8">
                  <path d="m1 1.5 5 5 5-5" />
                </svg>
              </span>
              <button
                aria-label={`${secondaryTimeZoneLabel} time ${formatTime(now, secondaryTimeZone)}. Convert a ${secondaryTimeZoneLabel} time to ${primaryTimeZoneLabel}.`}
                className="widget-clock__time-button"
                onClick={() => {
                  setConversionTime(formatTime(now, secondaryTimeZone));
                  setClockConversionSource("secondary");
                }}
                title={`Click to convert a ${secondaryTimeZoneLabel} time to ${primaryTimeZoneLabel}`}
                type="button"
              >
                <time>{formatTime(now, secondaryTimeZone)}</time>
              </button>
              <span className="widget-clock__day">
                {formatClockDay(now, secondaryTimeZone)}
              </span>
            </div>}
            {preferences.extraTimeZones.map((timeZone) => (
              <div data-tauri-drag-region key={timeZone}>
                <span
                  className="widget-clock__label"
                  title={`${timeZone} · ${timeZoneOffsetLabel(timeZone, now)}`}
                >
                  {liveClockLabel(timeZone)}
                </span>
                <span
                  aria-label={`${timeZone} time ${formatTime(now, timeZone)}`}
                  className="widget-clock__time-display"
                >
                  <time>{formatTime(now, timeZone)}</time>
                </span>
                <span className="widget-clock__day">
                  {formatClockDay(now, timeZone)}
                </span>
              </div>
            ))}
          </>
        )}
        </section>
      )}

      {calendarPanelVisible && <section
        aria-expanded={
          workCalendar?.configured
            ? calendarDayPanelOpen
            : undefined
        }
        className="widget-zone widget-calendar"
        data-calendar-attention={calendarAttentionState}
        data-calendar-health={calendarHealthNotice?.tone}
        data-calendar-health-cached={
          calendarHealthNotice && calendarSelection ? true : undefined
        }
        data-calendar-setup={calendarNotConfigured || undefined}
        data-day-summary={workCalendar?.configured || undefined}
        aria-label={vocabulary.zoneLabel}
        ref={calendarDayPanelRef}
        onPointerDownCapture={(event) => {
          if (
            !(event.target as HTMLElement).closest(
              "button, a, input, select, textarea, [role='button']",
            )
          ) {
            event.stopPropagation();
          }
        }}
        onClick={(event) => {
          if (
            !workCalendar?.configured ||
            (event.target as HTMLElement).closest(
              "button, a, input, select, textarea, [role='button']",
            )
          ) {
            return;
          }
          void toggleCalendarDayPanel();
        }}
        onKeyDown={(event) => {
          if (
            !workCalendar?.configured ||
            event.target !== event.currentTarget ||
            (event.key !== "Enter" && event.key !== " ")
          ) {
            return;
          }
          event.preventDefault();
          void toggleCalendarDayPanel();
        }}
        tabIndex={workCalendar?.configured ? 0 : undefined}
        title={
          workCalendar?.configured
            ? vocabulary.openDayPanel
            : undefined
        }
      >
        <div
          className="widget-calendar__content"
          data-has-next={showNextEvent || undefined}
        >
          <div
            className="widget-calendar__event"
            data-calendar-skipped={calendarSuppressedBySkip || undefined}
            data-calendar-health-only={calendarHealthOnly || undefined}
            data-calendar-retrying={calendarAwaitingFirstSync || undefined}
            data-calendar-selection={calendarSelection ? true : undefined}
            data-workspace-actions={calendarWorkspaceActionsPresent || undefined}
            title={`${calendarTitle}\n${calendarDetail}${
              calendarHealthNotice
                ? `\n${calendarHealthNotice.label}: ${calendarHealthNotice.detail}`
                : ""
            }`}
          >
            {!calendarHealthOnly && <div className="widget-calendar__event-header">
              <span
                className="widget-calendar__state"
                data-calendar-status={calendarSelection ? "observed" : undefined}
                data-calendar-progress={activeEventAcknowledged || undefined}
              >
                {calendarState}
              </span>
              <strong className="widget-calendar__title widget-calendar__title--compact">
                <MeetingProviderGlyph provider={calendarSelection?.meetingProvider ?? null} />
                {calendarTitle}
              </strong>
            </div>}
            {calendarSelection &&
              (calendarSelection.joinToken ||
                calendarStartedNeedsAttention ||
                activeEventAcknowledged ||
                !calendarSelection.allDay) && (
                <div className="widget-calendar__hover-actions">
                  {calendarStartedNeedsAttention && (
                    <button
                      className="widget-calendar__ack"
                      onClick={() => chooseCalendarEvent(activeEventKey)}
                      type="button"
                    >
                      I&apos;m in
                    </button>
                  )}
                  {calendarSelection.joinToken && (
                    <button
                      aria-label={`${workCalendarJoinLabel(calendarJoinOpened)} ${calendarSelection.subject}`}
                      className="widget-calendar__join"
                      onClick={() =>
                        void openCalendarJoin(
                          calendarSelection,
                          calendarDisplay.selectionKey,
                        )
                      }
                      title={vocabulary.openLink}
                      type="button"
                    >
                      {workCalendarJoinLabel(calendarJoinOpened)}
                    </button>
                  )}
                  {!calendarSelection.allDay && <button
                    aria-label={`Skip ${calendarSelection.subject}`}
                    className="widget-calendar__skip"
                    onClick={(event) => { event.stopPropagation(); skipCalendarEvent(calendarSelection); }}
                    title="Skip this occurrence locally"
                    type="button"
                  >Skip</button>}
                  {activeEventAcknowledged && (
                    <button
                      aria-label={`Finish ${calendarSelection.subject} locally`}
                      className="widget-calendar__finish"
                      onClick={() =>
                        finishCalendarEvent(calendarSelection, activeEventKey)
                      }
                      title="Hide locally until its scheduled end"
                      type="button"
                    >
                      Finish
                    </button>
                  )}
                </div>
              )}
            {!calendarHealthOnly && <strong className="widget-calendar__title widget-calendar__title--standard">
              <MeetingProviderGlyph provider={calendarSelection?.meetingProvider ?? null} />
              {calendarTitle}
            </strong>}
            {calendarNotConfigured ? (
              <div className="widget-calendar__detail widget-calendar__setup">
                <small className="widget-calendar__metadata">
                  Published ICS link required
                </small>
                <button
                  aria-label="Set up work calendar in Advanced"
                  className="widget-calendar__setup-button"
                  onClick={() => void openAdvanced("work-calendar")}
                  title="Open calendar setup in Advanced"
                  type="button"
                >
                  Set up
                </button>
              </div>
            ) : calendarHealthOnly ? null : calendarSelection ? (
              <CalendarEventDetail selection={calendarSelection} now={now} />
            ) : (
              <small>{calendarDetail}</small>
            )}
            {calendarHealthOnly && calendarHealthNotice && (
              <span
                aria-label={`${calendarHealthNotice.label}. ${calendarHealthNotice.detail}`}
                className="widget-calendar__health"
                role="status"
              >
                {calendarHealthNotice.label}
              </span>
            )}
            {calendarHealthNotice && calendarSelection && (
              <span className="sr-only" role="status">
                Calendar refresh delayed. Showing the latest cached event.
              </span>
            )}
            {calendarProgress !== null && (
              <div
                aria-label={`Event progress ${Math.round(calendarProgress)} percent`}
                aria-valuemax={100}
                aria-valuemin={0}
                aria-valuenow={Math.round(calendarProgress)}
                className="widget-calendar__progress"
                role="progressbar"
              >
                <span style={{ width: `${calendarProgress}%` }} />
              </div>
            )}
            {calendarSelection?.eventToken && calendarWorkspaceActionsPresent && (
              <EventWorkspaceActions
                className="widget-calendar__workspace-actions"
                onOpenLink={() => void openCalendarEventLink(calendarSelection)}
                onOpenProject={() => void openCalendarProjectPanel(calendarSelection)}
                subject={calendarSelection.subject}
                workspace={calendarSelection.eventWorkspace}
              />
            )}
          </div>

          {showNextEvent && calendarNextSelection && (
            <div
              aria-label={
                calendarNextSelection.classification === "active"
                  ? "Overlapping active work-calendar event"
                  : calendarDisplay.hasOverlap
                    ? "Simultaneous upcoming work-calendar event"
                    : "Next work-calendar event"
              }
              className="widget-calendar__next"
              data-calendar-selection
              data-workspace-actions={calendarNextWorkspaceActionsPresent || undefined}
              title={`${calendarNextSelection.subject}\n${calendarNextDetail}`}
            >
              <div className="widget-calendar__next-header">
                <span
                  className="widget-calendar__state"
                  data-calendar-progress={
                    calendarNextAcknowledged || undefined
                  }
                  data-calendar-started={
                    (calendarNextSelection.classification === "active" &&
                      !calendarNextAcknowledged) ||
                    undefined
                  }
                >
                  {calendarNextState}
                </span>
                <strong className="widget-calendar__title widget-calendar__title--compact">
                  <MeetingProviderGlyph provider={calendarNextSelection.meetingProvider} />
                  {calendarNextSelection.subject}
                </strong>
              </div>
              {(calendarNextSelection.joinToken ||
                calendarNextStartedNeedsAttention ||
                calendarNextAcknowledged ||
                !calendarNextSelection.allDay) && (
                <div className="widget-calendar__hover-actions">
                  {calendarNextStartedNeedsAttention && (
                    <button
                      className="widget-calendar__ack"
                      onClick={() =>
                        chooseCalendarEvent(calendarDisplay.companionKey)
                      }
                      type="button"
                    >
                      I&apos;m in
                    </button>
                  )}
                  {calendarNextSelection.joinToken && (
                    <button
                      aria-label={`${workCalendarJoinLabel(calendarNextJoinOpened)} ${calendarNextSelection.subject}`}
                      className="widget-calendar__join"
                      onClick={() =>
                        void openCalendarJoin(
                          calendarNextSelection,
                          calendarDisplay.companionKey,
                        )
                      }
                      title={vocabulary.openLink}
                      type="button"
                    >
                      {workCalendarJoinLabel(calendarNextJoinOpened)}
                    </button>
                  )}
                  {!calendarNextSelection.allDay && <button
                    aria-label={`Skip ${calendarNextSelection.subject}`}
                    className="widget-calendar__skip"
                    onClick={(event) => { event.stopPropagation(); skipCalendarEvent(calendarNextSelection); }}
                    title="Skip this occurrence locally"
                    type="button"
                  >Skip</button>}
                  {calendarNextAcknowledged && (
                    <button
                      aria-label={`Finish ${calendarNextSelection.subject} locally`}
                      className="widget-calendar__finish"
                      onClick={() =>
                        finishCalendarEvent(
                          calendarNextSelection,
                          calendarDisplay.companionKey,
                        )
                      }
                      title="Hide locally until its scheduled end"
                      type="button"
                    >
                      Finish
                    </button>
                  )}
                </div>
              )}
              <strong className="widget-calendar__title widget-calendar__title--standard">
                <MeetingProviderGlyph provider={calendarNextSelection.meetingProvider} />
                {calendarNextSelection.subject}
              </strong>
              <CalendarEventDetail
                selection={calendarNextSelection}
                now={now}
              />
              {calendarNextProgress !== null && (
                <div
                  aria-label={`Event progress ${Math.round(calendarNextProgress)} percent`}
                  aria-valuemax={100}
                  aria-valuemin={0}
                  aria-valuenow={Math.round(calendarNextProgress)}
                  className="widget-calendar__progress"
                  role="progressbar"
                >
                  <span style={{ width: `${calendarNextProgress}%` }} />
                </div>
              )}
              {calendarNextSelection.eventToken && calendarNextWorkspaceActionsPresent && (
                <EventWorkspaceActions
                  className="widget-calendar__workspace-actions"
                  onOpenLink={() => void openCalendarEventLink(calendarNextSelection)}
                  onOpenProject={() => void openCalendarProjectPanel(calendarNextSelection)}
                  subject={calendarNextSelection.subject}
                  workspace={calendarNextSelection.eventWorkspace}
                />
              )}
            </div>
          )}
        </div>
      </section>}

      {destinationPanelCount > 0 && <aside aria-label="Hub destinations" className="widget-destinations widget-zone" data-segments={destinationPanelCount}>
        {todayPanelVisible && <button
          className="widget-destinations__today"
          aria-label="Open Today"
          aria-pressed={calendarDayPanelOpen}
          onClick={() => void toggleCalendarDayPanel()}
        title="Open Today"
        type="button"
      >
          <span aria-hidden="true" className="widget-destinations__emoji">📅</span>
          <span aria-label={`${remainingCalendarEventCount} events left`} className="widget-destinations__badge">{remainingCalendarEventCount > 99 ? "99+" : remainingCalendarEventCount}</span>
        </button>}
        {projectsPanelVisible && <button
          aria-label={`Open all to-dos, ${activeTodoCount} active${attentionTodoCount ? `, ${attentionTodoCount} need attention` : ""}`}
          className="widget-destinations__todos"
          data-due={attentionTodoCount > 0 || undefined}
          onClick={() => void openManagerWindow("todos")}
        title="Open all to-dos"
        type="button"
      >
          <span aria-hidden="true" className="widget-destinations__emoji">✅</span>
          <span className="widget-destinations__badge">{activeTodoCount > 99 ? "99+" : activeTodoCount}</span>
        </button>}
        {medicinePanelVisible && <button
          aria-label={`Open Medicine, ${medicineBadgeLabel}${medicineAttentionCount ? `, ${medicineAttentionCount} due or missed` : ""}`}
          aria-pressed={medicinePanelOpen}
          className="widget-destinations__medicine"
          data-due={medicineLoadState === "ready" && medicineAttentionCount > 0 || undefined}
          data-unavailable={medicineLoadState === "unavailable" || undefined}
          onClick={(event) => void openMedicinePanel(event)}
          title="Open Medicine"
          type="button"
        >
          <span aria-hidden="true" className="widget-destinations__emoji">💊</span>
          <span aria-label={medicineBadgeLabel} className="widget-destinations__badge">{medicineBadge}</span>
        </button>}
      </aside>}

      <div
        aria-hidden="true"
        className="widget-drag-handle"
        data-tauri-drag-region
        title="Drag Attention Hub"
      />

      <aside
        aria-label="Widget controls"
        className="widget-utility"
        data-tauri-drag-region
      >
        <button
          aria-label="Close Attention Hub"
          className="widget-close-control"
          onClick={() => void requestApplicationQuit()}
          title="Close Attention Hub"
          type="button"
        >
          <span aria-hidden="true" className="widget-utility__surface">
            <HubCloseIcon />
          </span>
        </button>
        <button
          aria-label={pinned ? "Unpin Attention Hub from always on top" : "Pin Attention Hub always on top"}
          aria-pressed={pinned}
          className="widget-pin-control"
          onClick={() => updateWidgetPreferences({ pinned: !pinned })}
          title={pinned ? "Unpin Attention Hub" : "Pin Attention Hub always on top"}
          type="button"
        >
          <span aria-hidden="true" className="widget-utility__surface">
            <svg aria-hidden="true" viewBox="0 0 24 24">
              <path d="M8 3h8l-1 6 3 3v2H6v-2l3-3-1-6Z" />
              <path d="M12 14v7" />
            </svg>
          </span>
        </button>
        <button
          aria-label="Open Advanced view"
          className="widget-advanced-control"
          onClick={() => void openAdvanced()}
          title="Open Advanced view"
          type="button"
        >
          <span aria-hidden="true" className="widget-utility__surface">
            <svg viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.86 2.86-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21H9.55v-.1A1.7 1.7 0 0 0 8.4 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.86-2.86.06-.06A1.7 1.7 0 0 0 4 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H2V9.55h.3A1.7 1.7 0 0 0 4 8.4a1.7 1.7 0 0 0-.34-1.88l-.06-.06L6.46 3.6l.06.06A1.7 1.7 0 0 0 8.4 4a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V2h4.05v.3A1.7 1.7 0 0 0 15 4a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.86 2.86-.06.06A1.7 1.7 0 0 0 19.4 8.4a1.7 1.7 0 0 0 .6 1 1.7 1.7 0 0 0 1.1.4h.3v4.05h-.3A1.7 1.7 0 0 0 19.4 15Z" />
            </svg>
          </span>
          <span className="sr-only">Open Advanced view</span>
        </button>
      </aside>

      {widgetError && (
        <p className="widget-error" role="status">
          {widgetError}
        </p>
      )}
      {sourceActivationNotice && (
        <span className="sr-only" role="status">
          {sourceActivationNotice.message}
        </span>
      )}
    </main>
  );
}
