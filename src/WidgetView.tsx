import {
  type CSSProperties,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
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
  type AttentionSignal,
  findSignal,
  type AttentionSourceObservation,
  type AttentionSignalSnapshot,
  type TaskbarMirrorStatus,
} from "./attention-model";
import {
  nextWorkCalendarRefreshDelay,
  type WorkCalendarSelection,
  type WorkCalendarSnapshot,
} from "./work-calendar-model";
import {
  convertZonedTimeToInstant,
  formatLocalConversion,
} from "./time-zone-converter";
import {
  WIDGET_CLOCK_WIDTH,
  widgetCalendarWidth,
  widgetLeftWidth,
  widgetWidth,
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
import { openLaterInboxWindow } from "./later-inbox-window";

const WORK_CALENDAR_UI_DEADLINE_MS = 20_000;
const WORK_CALENDAR_STARTING_SOON_MS = 5 * 60 * 1_000;
const MIAMI_TIME_ZONE = "America/New_York";
const VISUAL_SOURCES: LiveVisualAppKey[] = [
  "teams",
  "telegram",
  "slack",
  "viber",
  "whatsapp",
];
const SEMANTIC_VISUAL_SOURCES: LiveVisualAppKey[] = ["teams", "telegram"];

const TIME_ZONE_OPTIONS = [
  { value: MIAMI_TIME_ZONE, label: "ET · Miami" },
  { value: "America/Los_Angeles", label: "Los Angeles" },
  { value: "Europe/London", label: "London" },
  { value: "Europe/Kyiv", label: "Kyiv" },
  { value: "UTC", label: "UTC" },
  { value: "Asia/Tokyo", label: "Tokyo" },
];

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
  badgeLastKnown = false,
  statusText,
  health,
  status,
  disabled,
  onActivate,
}: {
  sourceKey: AttentionAppKey;
  label: string;
  badge: string | null;
  badgeLastKnown?: boolean;
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
          <strong
            className="widget-app-badge"
            data-last-known={badgeLastKnown || undefined}
          >
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
  const [lastObservedOutlookInbox, setLastObservedOutlookInbox] =
    useState<AttentionSignal | null>(null);
  const [mirrorStatuses, setMirrorStatuses] = useState<
    Partial<Record<LiveVisualAppKey, TaskbarMirrorStatus>>
  >({});
  const [workCalendar, setWorkCalendar] =
    useState<WorkCalendarSnapshot | null>(null);
  const [workCalendarRefreshing, setWorkCalendarRefreshing] = useState(true);
  const [workCalendarTransportFailed, setWorkCalendarTransportFailed] =
    useState(false);
  const [laterInbox, setLaterInbox] = useState<LaterInboxSnapshot | null>(null);
  const [acknowledgedActiveEvent, setAcknowledgedActiveEvent] = useState<
    string | null
  >(null);
  const [widgetError, setWidgetError] = useState<string | null>(null);
  const [convertingMiamiTime, setConvertingMiamiTime] = useState(false);
  const [miamiTime, setMiamiTime] = useState(() => formatTime(new Date(), MIAMI_TIME_ZONE));
  const attentionInFlight = useRef(false);
  const workCalendarInFlight = useRef(false);
  const laterButtonRef = useRef<HTMLButtonElement>(null);
  const widgetWindow = useMemo(getCurrentWindow, []);
  const pinned = preferences.pinned;
  const secondaryTimeZone = preferences.secondaryTimeZone;
  const visibleSources = useMemo(
    () =>
      preferences.appOrder.filter((sourceKey) =>
        preferences.monitoredSources.includes(sourceKey),
      ),
    [preferences.appOrder, preferences.monitoredSources],
  );
  const resizeCalendarSelection =
    workCalendar?.status === "observed" ? workCalendar.selection : null;
  const resizeActiveEventKey =
    resizeCalendarSelection?.classification === "active" &&
    !resizeCalendarSelection.allDay
      ? `${resizeCalendarSelection.start}|${resizeCalendarSelection.end}`
      : null;
  const showNextEvent =
    resizeActiveEventKey !== null &&
    acknowledgedActiveEvent === resizeActiveEventKey &&
    workCalendar?.status === "observed" &&
    workCalendar.nextSelection !== null;
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
      const outlook = snapshot.sources.find(
        ({ sourceKey }) => sourceKey === "outlook",
      );
      if (outlook?.state === "observed") {
        setLastObservedOutlookInbox(findSignal(outlook, "inboxUnread"));
      } else if (outlook?.state === "notRunning") {
        setLastObservedOutlookInbox(null);
      }
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
    if (!preferences.monitoredSources.includes("outlook")) {
      setLastObservedOutlookInbox(null);
    }
  }, [preferences.monitoredSources]);

  useEffect(() => {
    void (async () => {
      try {
        await invoke("set_fixed_taskbar_mirror_layout", {
          sourceSlots: visibleSources
            .map((sourceKey, slot) => ({ sourceKey, slot }))
            .filter(({ sourceKey }) => sourceKey !== "outlook"),
          visibleSourceCount: visibleSources.length,
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
            80,
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

  const openAdvanced = async () => {
    try {
      const existing = await WebviewWindow.getByLabel("advanced");
      if (existing) {
        await existing.show();
        await existing.setFocus();
        return;
      }

      const advanced = new WebviewWindow("advanced", {
        url: "/",
        title: "Attention Hub - Advanced",
        width: 900,
        height: 720,
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
  const outlookUsingLastKnown =
    outlook?.state === "notExposed" &&
    outlookInbox === null &&
    lastObservedOutlookInbox !== null;
  const displayedOutlookInbox = outlookUsingLastKnown
    ? lastObservedOutlookInbox
    : outlookInbox;
  const telegramBadge = formatAttentionBadge(
    telegramCounter?.count,
    telegramCounter?.needsAttention,
  );
  const teamsBadge = formatAttentionBadge(
    teamsActivity?.count,
    teamsActivity?.needsAttention,
  );
  const outlookBadge = formatAttentionBadge(
    displayedOutlookInbox?.count,
    displayedOutlookInbox?.needsAttention,
  );
  const attentionCapturedAt = attentionSnapshot
    ? Date.parse(attentionSnapshot.capturedAt)
    : Number.NaN;
  const attentionStale =
    attentionSnapshot !== null &&
    (!Number.isFinite(attentionCapturedAt) ||
      now.getTime() - attentionCapturedAt > ATTENTION_STALE_AFTER_MS);
  const telegramStatus = `${sourceAvailability(telegram, attentionStale, attentionRefreshFailed)}${typeof telegramCounter?.count === "number" && telegramCounter.count > 0 ? `; application counter ${telegramCounter.count}` : telegramCounter?.needsAttention === true ? "; new activity detected" : ""}`;
  const teamsStatus = `${sourceAvailability(teams, attentionStale, attentionRefreshFailed)}${teamsActivity?.needsAttention === true ? "; new activity detected" : ""}`;
  const outlookStatus = outlookUsingLastKnown
    ? `current attention state is not exposed; last observed aggregate Inbox unread ${lastObservedOutlookInbox.count}`
    : `${sourceAvailability(outlook, attentionStale, attentionRefreshFailed)}${typeof outlookInbox?.count === "number" && outlookInbox.count > 0 ? `; aggregate Inbox unread ${outlookInbox.count}` : outlookInbox?.needsAttention === true ? "; Inbox needs attention" : ""}`;
  const calendarSelection =
    workCalendar?.status === "observed" ? workCalendar.selection : null;
  const calendarNextSelection =
    workCalendar?.status === "observed" ? workCalendar.nextSelection : null;
  const activeEventKey =
    calendarSelection?.classification === "active" && !calendarSelection.allDay
      ? `${calendarSelection.start}|${calendarSelection.end}`
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
    : workCalendarRefreshing
      ? "Calendar checking"
      : "Calendar unavailable";
  const calendarTitle = calendarSelection
    ? calendarSelection.subject
    : workCalendar?.status === "notConfigured"
      ? "Work calendar is not configured"
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
  const calendarEndMs = calendarSelection
    ? Date.parse(calendarSelection.end)
    : Number.NaN;
  const calendarProgress =
    calendarSelection?.classification === "active" &&
    !calendarSelection.allDay &&
    Number.isFinite(calendarStartMs) &&
    Number.isFinite(calendarEndMs) &&
    calendarEndMs > calendarStartMs
      ? Math.min(
          100,
          Math.max(
            0,
            ((now.getTime() - calendarStartMs) /
              (calendarEndMs - calendarStartMs)) *
              100,
          ),
        )
      : null;
  const convertedMiamiTime = convertZonedTimeToInstant(
    miamiTime,
    now,
    MIAMI_TIME_ZONE,
  );
  const localMiamiConversion = convertedMiamiTime
    ? formatLocalConversion(convertedMiamiTime, now)
    : "Unavailable at the DST transition";
  const panelStyle = {
    ...widgetPanelStyle(preferences),
    "--widget-left-width": `${widgetLeftWidth(visibleSources.length)}px`,
    "--widget-clock-width": `${WIDGET_CLOCK_WIDTH}px`,
    "--widget-calendar-width": `${widgetCalendarWidth(
      preferences.widthMode,
      showNextEvent,
    )}px`,
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
          badgeLastKnown={outlookUsingLastKnown}
          statusText={outlookStatus}
          health={sourceHealth(
            outlook,
            attentionStale || outlookUsingLastKnown,
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
    <main className="widget-shell" data-tauri-drag-region style={panelStyle}>
      <section
        className="widget-zone widget-left"
        aria-label="Application attention"
        data-tauri-drag-region
      >
        <div className="widget-apps" data-tauri-drag-region>
          {visibleSources.map(renderAppSlot)}
          <button
            aria-label={`Open Later Inbox, ${laterOpenItems.length} open item${laterOpenItems.length === 1 ? "" : "s"}${laterDueCount ? `, ${laterDueCount} due` : ""}`}
            className="widget-later"
            data-due={laterDueCount > 0 || undefined}
            onClick={() => void openLaterInbox()}
            ref={laterButtonRef}
            title="Open Later Inbox"
            type="button"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24">
              <path d="M4 4.5h16v15H4z" />
              <path d="M4 14h4l1.6 2h4.8l1.6-2h4" />
            </svg>
            {laterOpenItems.length > 0 && (
              <span className="widget-later__badge">
                {laterDueCount > 0 ? "!" : ""}
                {laterOpenItems.length > 99 ? "99+" : laterOpenItems.length}
              </span>
            )}
          </button>
          <button
            aria-label="Open Advanced view"
            className="widget-more"
            onClick={() => void openAdvanced()}
            title="Open Advanced view"
            type="button"
          >
            <span aria-hidden="true">•••</span>
            <span className="sr-only">Open Advanced view</span>
          </button>
        </div>
      </section>

      <section
        className="widget-zone widget-clock"
        aria-label="Current time"
        data-tauri-drag-region
      >
        {convertingMiamiTime ? (
          <div className="widget-clock-converter">
            <label htmlFor="miami-time">Miami</label>
            <input
              id="miami-time"
              onChange={(event) => setMiamiTime(event.target.value)}
              step="60"
              type="time"
              value={miamiTime}
            />
            <output aria-live="polite">
              <span>Local</span>
              <strong>{localMiamiConversion}</strong>
            </output>
            <button
              aria-label="Return to live clocks"
              onClick={() => setConvertingMiamiTime(false)}
              title="Return to live clocks"
              type="button"
            >
              ×
            </button>
          </div>
        ) : (
          <>
            <div data-tauri-drag-region>
              <span className="widget-clock__label">Local</span>
              <time>{formatTime(now)}</time>
            </div>
            <div data-tauri-drag-region>
              <span className="widget-clock__label widget-clock__label--select">
                <select
                  aria-label="Secondary timezone"
                  value={secondaryTimeZone}
                  onChange={(event) =>
                    setPreferences(
                      writeWidgetPreferences({
                        secondaryTimeZone: event.target.value,
                      }),
                    )
                  }
                >
                  {TIME_ZONE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <svg aria-hidden="true" viewBox="0 0 12 8">
                  <path d="m1 1.5 5 5 5-5" />
                </svg>
              </span>
              {secondaryTimeZone === MIAMI_TIME_ZONE ? (
                <button
                  aria-label={`Miami time ${formatTime(now, secondaryTimeZone)}. Convert a Miami time to local time.`}
                  className="widget-clock__time-button"
                  onClick={() => {
                    setMiamiTime(formatTime(now, MIAMI_TIME_ZONE));
                    setConvertingMiamiTime(true);
                  }}
                  title="Click to convert a Miami time to local"
                  type="button"
                >
                  <time>{formatTime(now, secondaryTimeZone)}</time>
                </button>
              ) : (
                <time>{formatTime(now, secondaryTimeZone)}</time>
              )}
            </div>
          </>
        )}
      </section>

      <section
        className="widget-zone widget-calendar"
        data-calendar-attention={calendarAttentionState}
        aria-label="Work calendar"
        data-tauri-drag-region
      >
        <div
          className="widget-calendar__content"
          data-has-next={showNextEvent || undefined}
          data-tauri-drag-region
        >
          <div className="widget-calendar__event" data-tauri-drag-region>
            <div className="widget-calendar__event-header">
              <span
                className="widget-calendar__state"
                data-calendar-status={
                  calendarSelection ? "observed" : undefined
                }
              >
                {calendarState}
              </span>
              {calendarStartedNeedsAttention && activeEventKey && (
                <button
                  className="widget-calendar__ack"
                  onClick={() => setAcknowledgedActiveEvent(activeEventKey)}
                  type="button"
                >
                  I&apos;m in
                </button>
              )}
            </div>
            <strong>{calendarTitle}</strong>
            <small>{calendarDetail}</small>
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
              aria-label="Next work-calendar event"
              className="widget-calendar__next"
              data-tauri-drag-region
            >
              <span>Up next</span>
              <strong>{calendarNextSelection.subject}</strong>
              <small>
                {formatCalendarDetail(calendarNextSelection, now)}
              </small>
            </div>
          )}
        </div>
        <div className="widget-controls">
          <button
            aria-label={
              pinned ? "Unpin Attention Hub" : "Pin Attention Hub always on top"
            }
            aria-pressed={pinned}
            onClick={() => void togglePinned()}
            title={pinned ? "Unpin from always on top" : "Pin always on top"}
            type="button"
          >
            <span className="widget-control__surface">
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
            <span aria-hidden="true" className="widget-control__surface">
              ×
            </span>
          </button>
        </div>
      </section>

      {widgetError && (
        <p className="widget-error" role="status">
          {widgetError}
        </p>
      )}
    </main>
  );
}
