import {
  type CSSProperties,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { invoke } from "@tauri-apps/api/core";
import { emitTo, listen } from "@tauri-apps/api/event";
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
  type AttentionSourceObservation,
  type AttentionSignalSnapshot,
  type TaskbarMirrorStatus,
} from "./attention-model";
import {
  nextWorkCalendarRefreshDelay,
  selectWorkCalendarDisplay,
  type WorkCalendarSelection,
  type WorkCalendarSnapshot,
} from "./work-calendar-model";
import {
  convertZonedTimeToInstant,
  formatZonedConversion,
} from "./time-zone-converter";
import {
  canonicalTimeZone,
  getCommonTimeZones,
  shortTimeZoneLabel,
  timeZoneOptionLabel,
  timeZoneOffsetLabel,
} from "./time-zone-options";
import {
  WIDGET_UTILITY_WIDTH,
  widgetCalendarWidth,
  widgetClockWidth,
  widgetHeight,
  widgetLeftWidth,
  widgetWidth,
  widgetZoneGap,
} from "./widget-layout";
import {
  type AttentionAppKey,
  type LiveVisualAppKey,
  WIDGET_PREFERENCES_CHANGED_EVENT,
  normalizeWidgetPreferences,
  readWidgetPreferences,
  widgetPanelStyle,
  writeWidgetPreferences,
} from "./widget-preferences";
import {
  LATER_INBOX_CHANGED_EVENT,
  LATER_INBOX_FOCUS_EVENT,
  isLaterInboxItemDue,
  type LaterInboxSnapshot,
} from "./later-inbox-model";
import {
  LATER_INBOX_PREFERENCES_CHANGED_EVENT,
  readLaterInboxPreferences,
  type LaterInboxPreferences,
} from "./later-inbox-preferences";
import { openLaterInboxWindow } from "./later-inbox-window";
import {
  ADVANCED_FOCUS_EVENT,
  advancedWindowUrl,
  type AdvancedFocusRequest,
  type AdvancedFocusTarget,
} from "./advanced-focus";

const WORK_CALENDAR_UI_DEADLINE_MS = 20_000;
const WORK_CALENDAR_STARTING_SOON_MS = 5 * 60 * 1_000;
const LATER_INBOX_NOTIFICATION_POLL_INTERVAL_MS = 30_000;
const MIAMI_TIME_ZONE = "America/New_York";
type ClockConversionSource = "local" | "secondary";
const VISUAL_SOURCES: LiveVisualAppKey[] = [
  "teams",
  "telegram",
  "slack",
  "viber",
  "whatsapp",
];
const SEMANTIC_VISUAL_SOURCES: LiveVisualAppKey[] = ["teams", "telegram"];

function formatTime(now: Date, timeZone?: string) {
  return new Intl.DateTimeFormat([], {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
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
  const dayLabel = startDay === now.toDateString() ? "Today" : day.format(start);
  return startDay === endDay
    ? `${dayLabel} · ${time.format(start)}–${time.format(end)}`
    : `${dayLabel} ${time.format(start)}–${day.format(end)} ${time.format(end)}`;
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

function formatCalendarDetail(selection: WorkCalendarSelection, now: Date) {
  return [
    formatCalendarCountdown(selection, now),
    formatCalendarRange(selection, now),
    selection.meetingLinkPresent === true ? "Online meeting" : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

function CalendarEventDetail({
  selection,
  now,
}: {
  selection: WorkCalendarSelection;
  now: Date;
}) {
  const countdown = formatCalendarCountdown(selection, now);
  const metadata = [
    formatCalendarRange(selection, now),
    selection.meetingLinkPresent === true ? "Online meeting" : null,
  ]
    .filter(Boolean)
    .join(" · ");

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

async function invokeWorkCalendarSnapshot() {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      invoke<WorkCalendarSnapshot>("get_work_calendar_snapshot"),
      new Promise<WorkCalendarSnapshot>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error("work calendar deadline")),
          WORK_CALENDAR_UI_DEADLINE_MS,
        );
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

function mirrorLabel(status: TaskbarMirrorStatus | null) {
  if (status?.visible) {
    return status.taskbarCount > 1
      ? "Live taskbar visual from the selected display"
      : "Live taskbar visual";
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
  statusText,
  health,
  status,
  disabled,
  onActivate,
}: {
  sourceKey: AttentionAppKey;
  label: string;
  badge: string | null;
  statusText: string;
  health: "observed" | "retrying" | "stale" | "unavailable";
  status?: TaskbarMirrorStatus | null;
  disabled: boolean;
  onActivate: () => void;
}) {
  const visualText = status ? mirrorLabel(status) : "Local application icon";
  const accessibleLabel = `Open ${label}. ${statusText}. ${visualText}.`;
  return (
    <button
      aria-label={accessibleLabel}
      className="widget-app-slot"
      data-health={health}
      data-source={sourceKey}
      disabled={disabled}
      onClick={onActivate}
      title={accessibleLabel}
      type="button"
    >
      <span className="widget-app-surface" aria-hidden="true">
        <AppGlyph sourceKey={sourceKey} />
        {badge && !status?.visible && (
          <strong className="widget-app-badge">
            {badge}
          </strong>
        )}
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
  const [now, setNow] = useState(() => new Date());
  const [preferences, setPreferences] = useState(initialPreferences);
  const [attentionSnapshot, setAttentionSnapshot] =
    useState<AttentionSignalSnapshot | null>(null);
  const [attentionRefreshFailed, setAttentionRefreshFailed] = useState(false);
  const [mirrorStatuses, setMirrorStatuses] = useState<
    Partial<Record<LiveVisualAppKey, TaskbarMirrorStatus>>
  >({});
  const [workCalendar, setWorkCalendar] =
    useState<WorkCalendarSnapshot | null>(null);
  const [workCalendarRefreshing, setWorkCalendarRefreshing] = useState(true);
  const [workCalendarTransportFailed, setWorkCalendarTransportFailed] =
    useState(false);
  const [laterInbox, setLaterInbox] = useState<LaterInboxSnapshot | null>(null);
  const [laterInboxPreferences, setLaterInboxPreferences] =
    useState<LaterInboxPreferences>(readLaterInboxPreferences);
  const [acknowledgedActiveEvent, setAcknowledgedActiveEvent] = useState<
    string | null
  >(null);
  const [finishedActiveEvents, setFinishedActiveEvents] = useState<
    ReadonlySet<string>
  >(() => new Set());
  const [widgetError, setWidgetError] = useState<string | null>(null);
  const [clockConversionSource, setClockConversionSource] =
    useState<ClockConversionSource | null>(null);
  const [conversionTime, setConversionTime] = useState(() =>
    formatTime(new Date(), MIAMI_TIME_ZONE),
  );
  const attentionInFlight = useRef(false);
  const workCalendarInFlight = useRef(false);
  const laterButtonRef = useRef<HTMLButtonElement>(null);
  const widgetWindow = useMemo(getCurrentWindow, []);
  const pinned = preferences.pinned;
  const systemTimeZone = canonicalTimeZone(
    Intl.DateTimeFormat().resolvedOptions().timeZone,
  );
  const primaryTimeZone = preferences.primaryTimeZone ?? systemTimeZone;
  const secondaryTimeZone = preferences.secondaryTimeZone;
  const timeZoneOptions = useMemo(
    () =>
      getCommonTimeZones(
        [preferences.primaryTimeZone, secondaryTimeZone].filter(
          (value): value is string => value !== null,
        ),
      ),
    [preferences.primaryTimeZone, secondaryTimeZone],
  );
  const visibleSources = useMemo(
    () =>
      preferences.appOrder.filter((sourceKey) =>
        preferences.monitoredSources.includes(sourceKey),
      ),
    [preferences.appOrder, preferences.monitoredSources],
  );
  const calendarDisplay = useMemo(
    () =>
      selectWorkCalendarDisplay(
        workCalendar,
        finishedActiveEvents,
        acknowledgedActiveEvent,
      ),
    [acknowledgedActiveEvent, finishedActiveEvents, workCalendar],
  );
  const showNextEvent = calendarDisplay.companion !== null;
  const laterOpenItems = laterInbox?.items.filter(
    (item) => item.completedAt === null,
  ) ?? [];
  const laterDueCount = laterOpenItems.filter((item) =>
    isLaterInboxItemDue(item, now),
  ).length;

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
    } catch (error) {
      setAttentionRefreshFailed(true);
      setWidgetError(`Attention refresh failed: ${String(error)}`);
    } finally {
      attentionInFlight.current = false;
    }
  }, [preferences.monitoredSources]);

  const refreshMirrors = useCallback(async () => {
    const results = await Promise.allSettled(
      VISUAL_SOURCES.map((sourceKey) =>
        invoke<TaskbarMirrorStatus>("get_taskbar_mirror_status", { sourceKey }),
      ),
    );
    setMirrorStatuses((current) => {
      const next = { ...current };
      results.forEach((result, index) => {
        if (result.status === "fulfilled") {
          next[VISUAL_SOURCES[index]] = result.value;
        }
      });
      return next;
    });
  }, []);

  const refreshWorkCalendar = useCallback(async () => {
    if (workCalendarInFlight.current) {
      return null;
    }
    workCalendarInFlight.current = true;
    setWorkCalendarRefreshing(true);
    setWorkCalendarTransportFailed(false);
    try {
      const snapshot = await invokeWorkCalendarSnapshot();
      setWorkCalendar(snapshot);
      return snapshot;
    } catch {
      setWorkCalendar(null);
      setWorkCalendarTransportFailed(true);
      return null;
    } finally {
      workCalendarInFlight.current = false;
      setWorkCalendarRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

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
    let stopListening: (() => void) | undefined;

    const poll = async () => {
      const snapshot = await refreshWorkCalendar();
      if (!disposed) {
        timer = setTimeout(
          () => void poll(),
          nextWorkCalendarRefreshDelay(snapshot),
        );
      }
    };

    void listen("work-calendar-changed", () => {
      if (timer) {
        clearTimeout(timer);
      }
      void poll();
    }).then((unlisten) => {
      if (disposed) {
        unlisten();
      } else {
        stopListening = unlisten;
      }
    });
    void poll();

    return () => {
      disposed = true;
      if (timer) {
        clearTimeout(timer);
      }
      stopListening?.();
    };
  }, [refreshWorkCalendar]);

  useEffect(() => {
    let disposed = false;
    let stopListening: (() => void) | undefined;
    const refresh = async () => {
      try {
        const snapshot = await invoke<LaterInboxSnapshot>(
          "get_later_inbox_snapshot",
        );
        if (!disposed) {
          setLaterInbox(snapshot);
        }
      } catch (error) {
        if (!disposed) {
          setWidgetError(`Later Inbox refresh failed: ${String(error)}`);
        }
      }
    };
    void listen(LATER_INBOX_CHANGED_EVENT, () => void refresh()).then(
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
  }, []);

  useEffect(() => {
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopListening: (() => void) | undefined;

    const checkDueNotifications = async () => {
      if (laterInboxPreferences.dueNotificationsEnabled) {
        try {
          const snapshot = await invoke<LaterInboxSnapshot>(
            "notify_due_later_inbox_items",
          );
          if (!disposed) {
            setLaterInbox(snapshot);
          }
        } catch (error) {
          if (!disposed) {
            setWidgetError(`Later Inbox notification failed: ${String(error)}`);
          }
        }
      }
      if (!disposed) {
        timer = setTimeout(
          () => void checkDueNotifications(),
          LATER_INBOX_NOTIFICATION_POLL_INTERVAL_MS,
        );
      }
    };

    void listen<LaterInboxPreferences>(
      LATER_INBOX_PREFERENCES_CHANGED_EVENT,
      ({ payload }) => {
        if (!disposed) {
          setLaterInboxPreferences(payload);
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
  }, [laterInboxPreferences.dueNotificationsEnabled]);

  useEffect(() => {
    let disposed = false;
    let stopListening: (() => void) | undefined;
    void listen(LATER_INBOX_FOCUS_EVENT, () => {
      if (!disposed) {
        requestAnimationFrame(() => laterButtonRef.current?.focus());
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

  useEffect(() => {
    void (async () => {
      try {
        await invoke("set_fixed_taskbar_mirror_layout", {
          sourceSlots: visibleSources
            .map((sourceKey, slot) => ({ sourceKey, slot }))
            .filter(({ sourceKey }) => sourceKey !== "outlook"),
          visibleSourceCount: visibleSources.length,
          compactMode: preferences.widthMode === "recommended",
        });
      } catch (error) {
        setWidgetError(`App layout update failed: ${String(error)}`);
      }
      await Promise.allSettled(
        VISUAL_SOURCES.map((sourceKey) => {
          const observation = attentionSnapshot?.sources.find(
            (source) => source.sourceKey === sourceKey,
          );
          const semanticAttention = observation?.signals.some(
            (signal) => signal.needsAttention === true,
          );
          const presenceAvailable =
            observation?.state === "notExposed" ||
            observation?.state === "observed";
          const shouldStart =
            preferences.monitoredSources.includes(sourceKey) &&
            preferences.liveVisualSources.includes(sourceKey) &&
            (SEMANTIC_VISUAL_SOURCES.includes(sourceKey)
              ? semanticAttention
              : presenceAvailable);
          return invoke<TaskbarMirrorStatus>(
            shouldStart ? "start_taskbar_mirror" : "stop_taskbar_mirror",
            { sourceKey },
          );
        }),
      );
      await refreshMirrors();
    })();
  }, [attentionSnapshot, preferences, refreshMirrors, visibleSources]);

  useEffect(() => {
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const poll = async () => {
      await refreshMirrors();
      if (!disposed) {
        timer = setTimeout(() => void poll(), 1_000);
      }
    };
    timer = setTimeout(() => void poll(), 1_000);
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
      try {
        await widgetWindow.setSize(
          new LogicalSize(
            widgetWidth(
              visibleSources.length,
              preferences.widthMode,
              showNextEvent,
            ),
            widgetHeight(preferences.widthMode),
          ),
        );
        const [position, size, monitors] = await Promise.all([
          widgetWindow.outerPosition(),
          widgetWindow.outerSize(),
          availableMonitors(),
        ]);
        const clamped = clampSavedPosition(
          position.x,
          position.y,
          size.width,
          size.height,
          monitors,
        );
        if (clamped.x !== position.x || clamped.y !== position.y) {
          await widgetWindow.setPosition(
            new PhysicalPosition(clamped.x, clamped.y),
          );
        }
      } catch (error) {
        if (!disposed) {
          setWidgetError(`Widget resize failed: ${String(error)}`);
        }
      }
    })();
    return () => {
      disposed = true;
    };
  }, [
    preferences.widthMode,
    showNextEvent,
    visibleSources.length,
    widgetWindow,
  ]);

  useEffect(() => {
    let disposed = false;
    let unlistenMoved: (() => void) | undefined;
    void (async () => {
      try {
        await widgetWindow.setAlwaysOnTop(initialPreferences.pinned);
        if (initialPreferences.x !== null && initialPreferences.y !== null) {
          const [size, monitors] = await Promise.all([
            widgetWindow.outerSize(),
            availableMonitors(),
          ]);
          const position = clampSavedPosition(
            initialPreferences.x,
            initialPreferences.y,
            size.width,
            size.height,
            monitors,
          );
          await widgetWindow.setPosition(
            new PhysicalPosition(position.x, position.y),
          );
        }
        unlistenMoved = await widgetWindow.onMoved(({ payload }) => {
          writeWidgetPreferences({ x: payload.x, y: payload.y });
        });
      } catch (error) {
        if (!disposed) {
          setWidgetError(`Widget restoration failed: ${String(error)}`);
        }
      }
    })();
    return () => {
      disposed = true;
      unlistenMoved?.();
    };
  }, [initialPreferences, widgetWindow]);

  const togglePinned = async () => {
    const next = !pinned;
    try {
      await widgetWindow.setAlwaysOnTop(next);
      setPreferences(writeWidgetPreferences({ pinned: next }));
    } catch (error) {
      setWidgetError(`Pin update failed: ${String(error)}`);
    }
  };

  const openAdvanced = async (focusTarget?: AdvancedFocusTarget) => {
    try {
      const existing = await WebviewWindow.getByLabel("advanced");
      if (existing) {
        await existing.show();
        await existing.setFocus();
        if (focusTarget) {
          await emitTo<AdvancedFocusRequest>(
            "advanced",
            ADVANCED_FOCUS_EVENT,
            { target: focusTarget },
          );
        }
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
      advanced.once("tauri://error", ({ payload }) => {
        setWidgetError(`Advanced view failed: ${String(payload)}`);
      });
    } catch (error) {
      setWidgetError(`Advanced view failed: ${String(error)}`);
    }
  };

  const openLaterInbox = async () => {
    try {
      await openLaterInboxWindow((message) => setWidgetError(message));
    } catch (error) {
      setWidgetError(`Later Inbox window failed: ${String(error)}`);
    }
  };

  const activateSource = async (
    sourceKey: AttentionAppKey,
  ) => {
    try {
      await invoke("activate_attention_source", { sourceKey });
    } catch (error) {
      setWidgetError(`Could not open the source application: ${String(error)}`);
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
    } catch (error) {
      setWidgetError(`Could not open the meeting link: ${String(error)}`);
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
  const activeEventKey =
    calendarSelection?.classification === "active" && !calendarSelection.allDay
      ? calendarDisplay.selectionKey
      : null;
  const activeEventAcknowledged =
    activeEventKey !== null && acknowledgedActiveEvent === activeEventKey;
  const calendarStartMs = calendarSelection
    ? Date.parse(calendarSelection.start)
    : Number.NaN;
  const calendarStartingSoon =
    calendarSelection?.classification === "upcoming" &&
    !calendarSelection.allDay &&
    Number.isFinite(calendarStartMs) &&
    calendarStartMs > now.getTime() &&
    calendarStartMs - now.getTime() <= WORK_CALENDAR_STARTING_SOON_MS;
  const calendarStartedNeedsAttention =
    calendarSelection?.classification === "active" &&
    !calendarSelection.allDay &&
    !activeEventAcknowledged;
  const calendarNotConfigured = workCalendar?.status === "notConfigured";
  const calendarAttentionState = calendarStartedNeedsAttention
    ? "started"
    : calendarStartingSoon
      ? "soon"
      : undefined;
  const calendarState = calendarSelection
    ? calendarStartedNeedsAttention
      ? "Meeting started"
      : calendarStartingSoon
        ? "Starting soon"
        : calendarSelection.classification === "active"
          ? "In progress"
          : "Up next"
    : calendarNotConfigured
      ? "Calendar"
      : workCalendarRefreshing
        ? "Calendar checking"
        : "Calendar unavailable";
  const calendarTitle = calendarSelection
    ? calendarSelection.subject
    : calendarNotConfigured
      ? "Connect work calendar"
      : workCalendar?.status === "busy"
        ? "Another calendar check is finishing"
        : "No fresh work-calendar event";
  const calendarDetail = calendarSelection
    ? formatCalendarDetail(calendarSelection, now)
    : workCalendarRefreshing
      ? "Reading the saved source without controlling Outlook."
      : workCalendarTransportFailed || workCalendar?.status === "error"
        ? "The secure source or local provider could not be read."
        : workCalendar?.status === "notConfigured"
          ? "Open Advanced to save one published calendar securely."
          : "The last refresh was unavailable; no cached event is shown.";
  const calendarProgress = calendarEventProgress(calendarSelection, now);
  const calendarNextAcknowledged =
    calendarNextSelection?.classification === "active" &&
    calendarDisplay.companionKey !== null &&
    acknowledgedActiveEvent === calendarDisplay.companionKey;
  const calendarNextStartedNeedsAttention =
    calendarNextSelection?.classification === "active" &&
    !calendarNextSelection.allDay &&
    !calendarNextAcknowledged;
  const calendarNextState =
    calendarNextSelection?.classification === "active"
      ? calendarNextAcknowledged
        ? "In progress"
        : "Meeting started"
      : "Up next";
  const calendarNextDetail = calendarNextSelection
    ? formatCalendarDetail(calendarNextSelection, now)
    : "";
  const calendarNextProgress = calendarEventProgress(
    calendarNextSelection,
    now,
  );
  const conversionSourceTimeZone =
    clockConversionSource === "local" ? primaryTimeZone : secondaryTimeZone;
  const conversionTargetTimeZone =
    clockConversionSource === "local" ? secondaryTimeZone : primaryTimeZone;
  const convertedClockTime = convertZonedTimeToInstant(
    conversionTime,
    now,
    conversionSourceTimeZone,
  );
  const clockConversion = convertedClockTime
    ? formatZonedConversion(convertedClockTime, now, conversionTargetTimeZone)
    : "Unavailable at the DST transition";
  const primaryTimeZoneLabel = preferences.primaryTimeZone
    ? preferences.primaryTimeZone
    : `System (${systemTimeZone})`;
  const secondaryTimeZoneLabel = secondaryTimeZone;
  const panelStyle = {
    ...widgetPanelStyle(preferences),
    "--widget-left-width": `${widgetLeftWidth(visibleSources.length, preferences.widthMode)}px`,
    "--widget-clock-width": `${widgetClockWidth(preferences.widthMode)}px`,
    "--widget-calendar-width": `${widgetCalendarWidth(
      preferences.widthMode,
      showNextEvent,
    )}px`,
    "--widget-zone-gap": `${widgetZoneGap(preferences.widthMode)}px`,
    "--widget-utility-width": `${WIDGET_UTILITY_WIDTH}px`,
  } as CSSProperties;

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
          disabled={teams?.state === "notRunning"}
          onActivate={() => void activateSource(sourceKey)}
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
          statusText={telegramStatus}
          health={sourceHealth(telegram, attentionStale, attentionRefreshFailed)}
          status={mirrorStatuses.telegram}
          disabled={telegram?.state === "notRunning"}
          onActivate={() => void activateSource(sourceKey)}
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
          disabled={outlook?.state === "notRunning"}
          onActivate={() => void activateSource(sourceKey)}
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
        disabled={observation?.state === "notRunning"}
        onActivate={() => void activateSource(sourceKey)}
      />
    );
  };

  return (
    <main
      className="widget-shell"
      data-tauri-drag-region
      data-width-mode={preferences.widthMode}
      style={panelStyle}
    >
      <section
        className="widget-zone widget-left"
        aria-label="Application attention"
        data-tauri-drag-region
      >
        <div className="widget-apps" data-tauri-drag-region>
          {visibleSources.map(renderAppSlot)}
        </div>
      </section>

      <section
        className="widget-zone widget-clock"
        aria-label="Current time"
        data-tauri-drag-region
      >
        {clockConversionSource ? (
          <div className="widget-clock-converter">
            <label htmlFor="clock-conversion-time">
              {clockConversionSource === "local"
                ? primaryTimeZoneLabel
                : secondaryTimeZoneLabel}
            </label>
            <input
              id="clock-conversion-time"
              onChange={(event) => setConversionTime(event.target.value)}
              step="60"
              type="time"
              value={conversionTime}
            />
            <output aria-live="polite">
              <span>
                {clockConversionSource === "local"
                  ? secondaryTimeZoneLabel
                  : primaryTimeZoneLabel}
              </span>
              <strong>{clockConversion}</strong>
            </output>
            <button
              aria-label="Return to live clocks"
              onClick={() => setClockConversionSource(null)}
              title="Return to live clocks"
              type="button"
            >
              ×
            </button>
          </div>
        ) : (
          <>
            <div data-tauri-drag-region>
              <span className="widget-clock__label widget-clock__label--select">
                <select
                  aria-label="Primary timezone"
                  className="widget-clock__native-select"
                  title={`${primaryTimeZoneLabel} · ${timeZoneOffsetLabel(primaryTimeZone, now)}`}
                  value=""
                  onChange={(event) => {
                    if (!event.target.value) {
                      return;
                    }
                    setPreferences(
                      writeWidgetPreferences({
                        primaryTimeZone:
                          event.target.value === "__system"
                            ? null
                            : event.target.value,
                      }),
                    );
                  }}
                >
                  <option value="">
                    {shortTimeZoneLabel(primaryTimeZone)}
                  </option>
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
                  {shortTimeZoneLabel(primaryTimeZone)}
                </span>
                <svg aria-hidden="true" viewBox="0 0 12 8">
                  <path d="m1 1.5 5 5 5-5" />
                </svg>
              </span>
              <button
                aria-label={`${primaryTimeZoneLabel} time ${formatTime(now, primaryTimeZone)}. Convert a ${primaryTimeZoneLabel} time to ${secondaryTimeZoneLabel}.`}
                className="widget-clock__time-button"
                onClick={() => {
                  setConversionTime(formatTime(now, primaryTimeZone));
                  setClockConversionSource("local");
                }}
                title={`Click to convert a ${primaryTimeZoneLabel} time to ${secondaryTimeZoneLabel}`}
                type="button"
              >
                <time>{formatTime(now, primaryTimeZone)}</time>
              </button>
            </div>
            <div data-tauri-drag-region>
              <span className="widget-clock__label widget-clock__label--select">
                <select
                  aria-label="Secondary timezone"
                  className="widget-clock__native-select"
                  title={`${secondaryTimeZone} · ${timeZoneOffsetLabel(secondaryTimeZone, now)}`}
                  value=""
                  onChange={(event) => {
                    if (!event.target.value) {
                      return;
                    }
                    setPreferences(
                      writeWidgetPreferences({
                        secondaryTimeZone: event.target.value,
                      }),
                    );
                  }}
                >
                  <option value="">
                    {shortTimeZoneLabel(secondaryTimeZone)}
                  </option>
                  {timeZoneOptions.map((timeZone) => (
                    <option key={timeZone} value={timeZone}>
                      {timeZoneOptionLabel(timeZone, now)}
                    </option>
                  ))}
                </select>
                <span aria-hidden="true" className="widget-clock__short-label">
                  {shortTimeZoneLabel(secondaryTimeZone)}
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
            </div>
          </>
        )}
      </section>

      <section
        className="widget-zone widget-calendar"
        data-calendar-attention={calendarAttentionState}
        data-calendar-setup={calendarNotConfigured || undefined}
        aria-label="Work calendar"
        data-tauri-drag-region
      >
        <div
          className="widget-calendar__content"
          data-has-next={showNextEvent || undefined}
          data-tauri-drag-region
        >
          <div
            className="widget-calendar__event"
            data-tauri-drag-region
            title={`${calendarTitle}\n${calendarDetail}`}
          >
            <div className="widget-calendar__event-header">
              <span
                className="widget-calendar__state"
                data-calendar-status={
                  calendarSelection ? "observed" : undefined
                }
                data-calendar-progress={activeEventAcknowledged || undefined}
              >
                {calendarState}
              </span>
              <strong className="widget-calendar__title widget-calendar__title--compact">
                {calendarTitle}
              </strong>
            </div>
            {calendarSelection &&
              (calendarSelection.joinToken ||
                calendarStartedNeedsAttention ||
                activeEventAcknowledged) && (
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
                      aria-label={`Join ${calendarSelection.subject}`}
                      className="widget-calendar__join"
                      onClick={() =>
                        void openCalendarJoin(
                          calendarSelection,
                          calendarDisplay.selectionKey,
                        )
                      }
                      title="Open meeting link"
                      type="button"
                    >
                      Join
                    </button>
                  )}
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
            <strong className="widget-calendar__title widget-calendar__title--standard">
              {calendarTitle}
            </strong>
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
            ) : calendarSelection ? (
              <CalendarEventDetail selection={calendarSelection} now={now} />
            ) : (
              <small>{calendarDetail}</small>
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
              data-tauri-drag-region
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
                  {calendarNextSelection.subject}
                </strong>
              </div>
              {(calendarNextSelection.joinToken ||
                calendarNextStartedNeedsAttention ||
                calendarNextAcknowledged) && (
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
                      aria-label={`Join ${calendarNextSelection.subject}`}
                      className="widget-calendar__join"
                      onClick={() =>
                        void openCalendarJoin(
                          calendarNextSelection,
                          calendarDisplay.companionKey,
                        )
                      }
                      title="Open meeting link"
                      type="button"
                    >
                      Join
                    </button>
                  )}
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
            </div>
          )}
        </div>
      </section>

      <aside
        aria-label="Widget controls"
        className="widget-utility"
        data-tauri-drag-region
      >
        <button
          aria-label={
            pinned ? "Unpin Attention Hub" : "Pin Attention Hub always on top"
          }
          aria-pressed={pinned}
          onClick={() => void togglePinned()}
          title={pinned ? "Unpin from always on top" : "Pin always on top"}
          type="button"
        >
          <span className="widget-utility__surface">
            <svg aria-hidden="true" viewBox="0 0 24 24">
              <path d="M8.2 3.8h7.6l-1.5 5 3.2 3.2v1.6h-4.7V20l-.8 1.2-.8-1.2v-6.4H6.5V12l3.2-3.2-1.5-5Z" />
            </svg>
          </span>
        </button>
        <button
          aria-label="Close Attention Hub"
          onClick={() => void invoke("quit_application")}
          title="Close Attention Hub"
          type="button"
        >
          <span aria-hidden="true" className="widget-utility__surface">
            ×
          </span>
        </button>
        <button
          aria-label={`Open Later Inbox, ${laterOpenItems.length} open reminder${laterOpenItems.length === 1 ? "" : "s"}${laterDueCount ? `, ${laterDueCount} due` : ""}`}
          className="widget-reminder-control"
          data-due={laterDueCount > 0 || undefined}
          onClick={() => void openLaterInbox()}
          ref={laterButtonRef}
          title="Open reminders"
          type="button"
        >
          <span className="widget-utility__surface">
            <svg aria-hidden="true" viewBox="0 0 24 24">
              <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM9.7 20h4.6" />
            </svg>
          </span>
          {laterOpenItems.length > 0 && (
            <span className="widget-reminder__badge">
              {laterDueCount > 0 ? "!" : ""}
              {laterOpenItems.length > 99 ? "99+" : laterOpenItems.length}
            </span>
          )}
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
    </main>
  );
}
