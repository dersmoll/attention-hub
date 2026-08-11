import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import {
  PhysicalPosition,
  availableMonitors,
  getCurrentWindow,
} from "@tauri-apps/api/window";
import {
  ATTENTION_POLL_INTERVAL_MS,
  findSignal,
  type AttentionSignalSnapshot,
  type TaskbarMirrorStatus,
} from "./attention-model";
import {
  nextWorkCalendarRefreshDelay,
  type WorkCalendarSelection,
  type WorkCalendarSnapshot,
} from "./work-calendar-model";

const WIDGET_PREFERENCES_KEY = "attention-hub.widget.v1";
const DEFAULT_TIME_ZONE = "America/New_York";
const WORK_CALENDAR_UI_DEADLINE_MS = 20_000;

const TIME_ZONE_OPTIONS = [
  { value: "America/New_York", label: "New York" },
  { value: "America/Los_Angeles", label: "Los Angeles" },
  { value: "Europe/London", label: "London" },
  { value: "Europe/Kyiv", label: "Kyiv" },
  { value: "UTC", label: "UTC" },
  { value: "Asia/Tokyo", label: "Tokyo" },
];

interface WidgetPreferences {
  pinned: boolean;
  secondaryTimeZone: string;
  x: number | null;
  y: number | null;
}

const DEFAULT_PREFERENCES: WidgetPreferences = {
  pinned: true,
  secondaryTimeZone: DEFAULT_TIME_ZONE,
  x: null,
  y: null,
};

function readPreferences(): WidgetPreferences {
  try {
    const value = JSON.parse(
      localStorage.getItem(WIDGET_PREFERENCES_KEY) ?? "null",
    ) as Partial<WidgetPreferences> | null;
    return {
      pinned: value?.pinned ?? DEFAULT_PREFERENCES.pinned,
      secondaryTimeZone:
        typeof value?.secondaryTimeZone === "string"
          ? value.secondaryTimeZone
          : DEFAULT_PREFERENCES.secondaryTimeZone,
      x: typeof value?.x === "number" ? value.x : null,
      y: typeof value?.y === "number" ? value.y : null,
    };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

function writePreferences(update: Partial<WidgetPreferences>) {
  const next = { ...readPreferences(), ...update };
  localStorage.setItem(WIDGET_PREFERENCES_KEY, JSON.stringify(next));
  return next;
}

function formatTime(now: Date, timeZone?: string) {
  return new Intl.DateTimeFormat([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
    timeZone,
  }).format(now);
}

function timeZoneAbbreviation(now: Date, timeZone: string) {
  const part = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "short",
  })
    .formatToParts(now)
    .find(({ type }) => type === "timeZoneName");
  return part?.value ?? timeZone;
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
  });
  const day = new Intl.DateTimeFormat([], {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  const startDay = start.toDateString();
  const endDay = end.toDateString();
  const dayLabel = startDay === now.toDateString() ? "Today" : day.format(start);
  return startDay === endDay
    ? `${dayLabel} · ${time.format(start)}–${time.format(end)}`
    : `${dayLabel} ${time.format(start)}–${day.format(end)} ${time.format(end)}`;
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
    return "Live taskbar visual";
  }
  if (status?.lifecycle === "starting") {
    return "Starting live visual";
  }
  if (status?.lifecycle === "hidden") {
    return "Live visual unavailable; semantic fallback shown";
  }
  return "Semantic fallback shown";
}

function AppSlot({
  label,
  shortLabel,
  badge,
  status,
  future = false,
}: {
  label: string;
  shortLabel: string;
  badge: string | null;
  status?: TaskbarMirrorStatus | null;
  future?: boolean;
}) {
  return (
    <div
      className="widget-app-slot"
      data-future={future || undefined}
      title={future ? `${label} is not connected yet` : mirrorLabel(status ?? null)}
    >
      <span aria-hidden="true">{shortLabel}</span>
      <span className="sr-only">{label}</span>
      {badge && !status?.visible && (
        <strong className="widget-app-badge">{badge}</strong>
      )}
    </div>
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

export function WidgetView() {
  const initialPreferences = useMemo(readPreferences, []);
  const [now, setNow] = useState(() => new Date());
  const [pinned, setPinned] = useState(initialPreferences.pinned);
  const [secondaryTimeZone, setSecondaryTimeZone] = useState(
    initialPreferences.secondaryTimeZone,
  );
  const [attentionSnapshot, setAttentionSnapshot] =
    useState<AttentionSignalSnapshot | null>(null);
  const [teamsMirror, setTeamsMirror] =
    useState<TaskbarMirrorStatus | null>(null);
  const [telegramMirror, setTelegramMirror] =
    useState<TaskbarMirrorStatus | null>(null);
  const [workCalendar, setWorkCalendar] =
    useState<WorkCalendarSnapshot | null>(null);
  const [workCalendarRefreshing, setWorkCalendarRefreshing] = useState(true);
  const [workCalendarTransportFailed, setWorkCalendarTransportFailed] =
    useState(false);
  const [widgetError, setWidgetError] = useState<string | null>(null);
  const attentionInFlight = useRef(false);
  const workCalendarInFlight = useRef(false);
  const widgetWindow = useMemo(getCurrentWindow, []);

  const refreshAttention = useCallback(async () => {
    if (attentionInFlight.current) {
      return;
    }
    attentionInFlight.current = true;
    try {
      setAttentionSnapshot(
        await invoke<AttentionSignalSnapshot>("get_attention_signal_snapshot"),
      );
    } catch (error) {
      setWidgetError(`Attention refresh failed: ${String(error)}`);
    } finally {
      attentionInFlight.current = false;
    }
  }, []);

  const refreshMirrors = useCallback(async () => {
    const [teams, telegram] = await Promise.allSettled([
      invoke<TaskbarMirrorStatus>("get_teams_mirror_status"),
      invoke<TaskbarMirrorStatus>("get_telegram_mirror_status"),
    ]);
    if (teams.status === "fulfilled") {
      setTeamsMirror(teams.value);
    }
    if (telegram.status === "fulfilled") {
      setTelegramMirror(telegram.value);
    }
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
    let timer: ReturnType<typeof setTimeout> | undefined;
    void Promise.allSettled([
      invoke<TaskbarMirrorStatus>("start_teams_mirror"),
      invoke<TaskbarMirrorStatus>("start_telegram_mirror"),
    ]).then(() => {
      if (!disposed) {
        void refreshMirrors();
      }
    });

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
          writePreferences({ x: payload.x, y: payload.y });
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
      setPinned(next);
      writePreferences({ pinned: next });
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

  const telegram = attentionSnapshot?.sources.find(
    ({ sourceKey }) => sourceKey === "telegram",
  );
  const teams = attentionSnapshot?.sources.find(
    ({ sourceKey }) => sourceKey === "teams",
  );
  const telegramCounter = telegram
    ? findSignal(telegram, "applicationCounter")
    : null;
  const teamsActivity = teams ? findSignal(teams, "activityStatus") : null;
  const telegramBadge =
    telegramCounter?.count && telegramCounter.count > 0
      ? String(telegramCounter.count)
      : null;
  const teamsBadge = teamsActivity?.needsAttention ? "•" : null;
  const calendarSelection =
    workCalendar?.status === "observed" ? workCalendar.selection : null;
  const calendarState = calendarSelection
    ? calendarSelection.classification === "active"
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
    ? `${formatCalendarRange(calendarSelection, now)}${
        calendarSelection.meetingLinkPresent === true ? " · Online meeting" : ""
      }`
    : workCalendarRefreshing
      ? "Reading the saved source without controlling Outlook."
      : workCalendarTransportFailed || workCalendar?.status === "error"
        ? "The secure source or local provider could not be read."
        : workCalendar?.status === "notConfigured"
          ? "Open Advanced to save one published calendar securely."
          : "The last refresh was unavailable; no cached event is shown.";

  return (
    <main className="widget-shell" data-tauri-drag-region>
      <section
        className="widget-zone widget-left"
        aria-label="Application attention"
        data-tauri-drag-region
      >
        <div className="widget-apps" data-tauri-drag-region>
          <AppSlot
            label="Microsoft Teams"
            shortLabel="Teams"
            badge={teamsBadge}
            status={teamsMirror}
          />
          <AppSlot
            label="Telegram"
            shortLabel="TG"
            badge={telegramBadge}
            status={telegramMirror}
          />
          <AppSlot label="Slack" shortLabel="Slack" badge={null} future />
          <AppSlot label="Viber" shortLabel="Viber" badge={null} future />
          <button
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
        <div data-tauri-drag-region>
          <span>Local</span>
          <time>{formatTime(now)}</time>
        </div>
        <div data-tauri-drag-region>
          <select
            aria-label="Secondary timezone"
            value={secondaryTimeZone}
            onChange={(event) => {
              setSecondaryTimeZone(event.target.value);
              writePreferences({ secondaryTimeZone: event.target.value });
            }}
          >
            {TIME_ZONE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label} · {timeZoneAbbreviation(now, option.value)}
              </option>
            ))}
          </select>
          <time>{formatTime(now, secondaryTimeZone)}</time>
        </div>
      </section>

      <section
        className="widget-zone widget-calendar"
        aria-label="Work calendar"
        data-tauri-drag-region
      >
        <div data-tauri-drag-region>
          <span
            className="widget-calendar__state"
            data-calendar-status={calendarSelection ? "observed" : undefined}
          >
            {calendarState}
          </span>
          <strong>{calendarTitle}</strong>
          <small>{calendarDetail}</small>
        </div>
      </section>

      <div className="widget-controls">
        <button
          aria-pressed={pinned}
          onClick={() => void togglePinned()}
          title={pinned ? "Unpin from always on top" : "Pin always on top"}
          type="button"
        >
          {pinned ? "Pinned" : "Pin"}
        </button>
        <button
          onClick={() => void invoke("quit_application")}
          title="Close Attention Hub"
          type="button"
        >
          ×
        </button>
      </div>

      {widgetError && (
        <p className="widget-error" role="status">
          {widgetError}
        </p>
      )}
    </main>
  );
}
