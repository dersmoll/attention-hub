import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { AttentionPanel } from "./AttentionPanel";
import { LaterInboxDataPanel } from "./LaterInboxDataPanel";
import { LaterInboxView } from "./LaterInboxView";
import { WidgetView } from "./WidgetView";
import {
  ATTENTION_POLL_INTERVAL_MS,
  type AttentionSignalSnapshot,
  type AttentionSourceKey,
  type TeamsMirrorStatus,
} from "./attention-model";
import type {
  WorkCalendarConfiguration,
  WorkCalendarSnapshot,
} from "./work-calendar-model";
import {
  type AttentionAppKey,
  type LiveVisualAppKey,
  DEFAULT_APP_ORDER,
  DEFAULT_LIVE_VISUAL_SOURCES,
  DEFAULT_MONITORED_SOURCES,
  DEFAULT_WIDGET_PREFERENCES,
  LIVE_VISUAL_APP_KEYS,
  WIDGET_PREFERENCES_CHANGED_EVENT,
  normalizeWidgetPreferences,
  readWidgetPreferences,
  writeWidgetPreferences,
} from "./widget-preferences";
import {
  canonicalTimeZone,
  searchTimeZones,
  timeZoneOptionLabel,
} from "./time-zone-options";
import {
  ADVANCED_FOCUS_EVENT,
  readAdvancedFocusTarget,
  type AdvancedFocusRequest,
} from "./advanced-focus";
import "./App.css";

type NotificationAccessStatus =
  | "unspecified"
  | "allowed"
  | "denied"
  | "unsupported"
  | "error";

interface NotificationAccessReport {
  accessStatus: NotificationAccessStatus;
  apiAvailable: boolean;
  packageIdentity: {
    present: boolean;
    fullName: string | null;
  };
  diagnostics: string[];
}

interface NotificationSnapshot {
  accessStatus: NotificationAccessStatus;
  capturedAt: string;
  notifications: AttentionNotification[];
  diagnostics: string[];
}

interface AttentionNotification {
  id: number;
  source: {
    displayName: string | null;
    appUserModelId: string | null;
    packageFamilyName: string | null;
  };
  createdAt: string | null;
  title: string | null;
  body: string[];
  rawTextElements: string[];
  diagnostics: string[];
}

interface ListenerStartReport {
  active: boolean;
  diagnostics: string[];
}

interface NotificationChangeSignal {
  kind: "added" | "removed" | "unknown";
  notificationId: number | null;
}

type AdvancedPage =
  | "general"
  | "clocks"
  | "apps"
  | "calendar"
  | "reminders"
  | "diagnostics";

const ADVANCED_PAGES: Array<{
  id: AdvancedPage;
  label: string;
  description: string;
}> = [
  {
    id: "general",
    label: "General",
    description: "Widget size and panel appearance.",
  },
  {
    id: "clocks",
    label: "Clocks",
    description: "Primary and secondary timezone settings.",
  },
  {
    id: "apps",
    label: "Apps",
    description: "Source visibility, visual mirrors, and ordering.",
  },
  {
    id: "calendar",
    label: "Calendar",
    description: "Connect and manage one secure Published ICS source.",
  },
  {
    id: "reminders",
    label: "Reminders",
    description: "Later Inbox storage and data controls.",
  },
  {
    id: "diagnostics",
    label: "Diagnostics",
    description: "Source observations and technical Windows evidence.",
  },
];

const PUBLISHED_ICS_UI_DEADLINE_MS = 20_000;
class PublishedIcsUiDeadlineError extends Error {}

function sourceScanLabel(
  snapshot: AttentionSignalSnapshot | null,
  sourceKey: AttentionAppKey,
) {
  const state = snapshot?.sources.find(
    (source) => source.sourceKey === sourceKey,
  )?.state;
  if (state === "observed") {
    return "Detected now";
  }
  if (state === "notRunning") {
    return "Not running";
  }
  if (state === "notExposed") {
    return "Running, but not exposed";
  }
  return state === "error" ? "Unavailable" : null;
}

async function invokePublishedIcsWithDeadline<T>(
  command: string,
  args: Record<string, unknown>,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      invoke<T>(command, args),
      new Promise<T>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new PublishedIcsUiDeadlineError()),
          PUBLISHED_ICS_UI_DEADLINE_MS,
        );
      }),
    ]);
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
}

function AdvancedView() {
  const initialAdvancedFocus = readAdvancedFocusTarget(window.location.search);
  const [activePage, setActivePage] = useState<AdvancedPage>(
    initialAdvancedFocus === "work-calendar" ? "calendar" : "general",
  );
  const [widgetPreferences, setWidgetPreferences] = useState(
    readWidgetPreferences,
  );
  const [publishedIcsUrl, setPublishedIcsUrl] = useState("");
  const [titleCapabilityConfirmed, setTitleCapabilityConfirmed] =
    useState(false);
  const [workCalendarConfiguration, setWorkCalendarConfiguration] =
    useState<WorkCalendarConfiguration | null>(null);
  const [workCalendarSnapshot, setWorkCalendarSnapshot] =
    useState<WorkCalendarSnapshot | null>(null);
  const [workCalendarPending, setWorkCalendarPending] = useState<
    "save" | "refresh" | "remove" | null
  >(null);
  const [workCalendarError, setWorkCalendarError] = useState<string | null>(null);
  const [attentionSnapshot, setAttentionSnapshot] =
    useState<AttentionSignalSnapshot | null>(null);
  const [attentionError, setAttentionError] = useState<string | null>(null);
  const [attentionFailureCount, setAttentionFailureCount] = useState(0);
  const [attentionRefreshing, setAttentionRefreshing] = useState(false);
  const [attentionClock, setAttentionClock] = useState(() => Date.now());
  const attentionRequestInFlight = useRef(false);
  const workCalendarSectionRef = useRef<HTMLElement>(null);
  const publishedIcsInputRef = useRef<HTMLInputElement>(null);
  const [catalogScan, setCatalogScan] =
    useState<AttentionSignalSnapshot | null>(null);
  const [catalogScanPending, setCatalogScanPending] = useState(false);
  const [catalogScanError, setCatalogScanError] = useState<string | null>(null);
  const [teamsMirror, setTeamsMirror] = useState<TeamsMirrorStatus | null>(null);
  const [teamsMirrorError, setTeamsMirrorError] = useState<string | null>(null);
  const [report, setReport] = useState<NotificationAccessReport | null>(null);
  const [snapshot, setSnapshot] = useState<NotificationSnapshot | null>(null);
  const [listenerReport, setListenerReport] = useState<ListenerStartReport | null>(
    null,
  );
  const [lastChange, setLastChange] = useState<NotificationChangeSignal | null>(
    null,
  );
  const [pendingAction, setPendingAction] = useState<
    "refresh" | "request" | "snapshot" | null
  >(null);
  const [frontendError, setFrontendError] = useState<string | null>(null);
  const [primaryTimeZoneSearch, setPrimaryTimeZoneSearch] = useState("");
  const [secondaryTimeZoneSearch, setSecondaryTimeZoneSearch] = useState("");
  const currentTimeZones = useMemo(
    () =>
      [
        widgetPreferences.primaryTimeZone,
        widgetPreferences.secondaryTimeZone,
      ].filter((value): value is string => value !== null),
    [
      widgetPreferences.primaryTimeZone,
      widgetPreferences.secondaryTimeZone,
    ],
  );
  const primaryTimeZoneOptions = useMemo(
    () => searchTimeZones(primaryTimeZoneSearch, currentTimeZones),
    [currentTimeZones, primaryTimeZoneSearch],
  );
  const secondaryTimeZoneOptions = useMemo(
    () => searchTimeZones(secondaryTimeZoneSearch, currentTimeZones),
    [currentTimeZones, secondaryTimeZoneSearch],
  );

  const applyWidgetPreferences = useCallback(
    (update: Parameters<typeof writeWidgetPreferences>[0]) => {
      const next = writeWidgetPreferences(update);
      setWidgetPreferences(next);
      void emit(WIDGET_PREFERENCES_CHANGED_EVENT, next).catch((error) =>
        setFrontendError(`Widget preference update failed: ${String(error)}`),
      );
    },
    [],
  );

  const moveApp = useCallback(
    (sourceKey: AttentionAppKey, direction: -1 | 1) => {
      const currentIndex = widgetPreferences.appOrder.indexOf(sourceKey);
      const nextIndex = currentIndex + direction;
      if (currentIndex < 0 || nextIndex < 0 || nextIndex >= DEFAULT_APP_ORDER.length) {
        return;
      }
      const appOrder = [...widgetPreferences.appOrder];
      [appOrder[currentIndex], appOrder[nextIndex]] = [
        appOrder[nextIndex],
        appOrder[currentIndex],
      ];
      applyWidgetPreferences({ appOrder });
    },
    [applyWidgetPreferences, widgetPreferences.appOrder],
  );

  const toggleMonitoredSource = useCallback(
    (sourceKey: AttentionAppKey) => {
      const selected = new Set(widgetPreferences.monitoredSources);
      if (selected.has(sourceKey)) {
        selected.delete(sourceKey);
      } else {
        selected.add(sourceKey);
      }
      applyWidgetPreferences({
        monitoredSources: DEFAULT_APP_ORDER.filter((key) => selected.has(key)),
      });
    },
    [applyWidgetPreferences, widgetPreferences.monitoredSources],
  );

  const toggleLiveVisual = useCallback(
    (sourceKey: LiveVisualAppKey) => {
      const selected = new Set(widgetPreferences.liveVisualSources);
      if (selected.has(sourceKey)) {
        selected.delete(sourceKey);
      } else {
        selected.add(sourceKey);
      }
      applyWidgetPreferences({
        liveVisualSources: LIVE_VISUAL_APP_KEYS.filter((key) =>
          selected.has(key),
        ),
      });
    },
    [applyWidgetPreferences, widgetPreferences.liveVisualSources],
  );

  const refreshAttentionSignals = useCallback(async () => {
    if (attentionRequestInFlight.current) {
      return;
    }

    attentionRequestInFlight.current = true;
    setAttentionRefreshing(true);

    try {
      const nextSnapshot = await invoke<AttentionSignalSnapshot>(
        "get_attention_signal_snapshot",
        { sourceKeys: widgetPreferences.monitoredSources },
      );
      setAttentionSnapshot(nextSnapshot);
      setAttentionError(null);
      setAttentionFailureCount(0);
      setAttentionClock(Date.now());
    } catch (error) {
      setAttentionError(String(error));
      setAttentionFailureCount((count) => count + 1);
    } finally {
      attentionRequestInFlight.current = false;
      setAttentionRefreshing(false);
    }
  }, [widgetPreferences.monitoredSources]);

  const scanFixedSources = useCallback(async () => {
    setCatalogScanPending(true);
    setCatalogScanError(null);
    try {
      setCatalogScan(
        await invoke<AttentionSignalSnapshot>("get_attention_signal_snapshot", {
          sourceKeys: DEFAULT_APP_ORDER,
        }),
      );
    } catch (error) {
      setCatalogScanError(String(error));
    } finally {
      setCatalogScanPending(false);
    }
  }, []);

  const refreshWorkCalendarConfiguration = useCallback(async () => {
    try {
      setWorkCalendarConfiguration(
        await invoke<WorkCalendarConfiguration>(
          "get_work_calendar_configuration",
        ),
      );
    } catch {
      setWorkCalendarError(
        "The secure work-calendar configuration could not be read.",
      );
    }
  }, []);

  const focusWorkCalendarSetup = useCallback(() => {
    setActivePage("calendar");
    requestAnimationFrame(() => {
      workCalendarSectionRef.current?.scrollIntoView({
        block: "start",
        behavior: "auto",
      });
      publishedIcsInputRef.current?.focus({ preventScroll: true });
    });
  }, []);

  const saveWorkCalendarSource = useCallback(async () => {
    const secretUrl = publishedIcsUrl.trim();
    setPublishedIcsUrl("");
    setWorkCalendarSnapshot(null);
    setWorkCalendarError(null);
    if (!secretUrl) {
      setWorkCalendarError("Enter the locally generated ICS link first.");
      return;
    }
    if (!titleCapabilityConfirmed) {
      setWorkCalendarError(
        "Confirm the exact Outlook publication level before saving this source.",
      );
      return;
    }

    setWorkCalendarPending("save");
    try {
      const nextSnapshot =
        await invokePublishedIcsWithDeadline<WorkCalendarSnapshot>(
          "save_work_calendar_source",
          {
            publishedUrl: secretUrl,
            titleCapabilityConfirmed,
          },
        );
      setWorkCalendarSnapshot(nextSnapshot);
      await refreshWorkCalendarConfiguration();
    } catch {
      setWorkCalendarError(
        "The source was not saved because bounded verification did not finish safely.",
      );
      await refreshWorkCalendarConfiguration();
    } finally {
      setWorkCalendarPending(null);
    }
  }, [
    publishedIcsUrl,
    refreshWorkCalendarConfiguration,
    titleCapabilityConfirmed,
  ]);

  const refreshSavedWorkCalendar = useCallback(async () => {
    setWorkCalendarPending("refresh");
    setWorkCalendarSnapshot(null);
    setWorkCalendarError(null);
    try {
      setWorkCalendarSnapshot(
        await invokePublishedIcsWithDeadline<WorkCalendarSnapshot>(
          "get_work_calendar_snapshot",
          {},
        ),
      );
    } catch {
      setWorkCalendarError(
        "The saved calendar did not return a fresh bounded result.",
      );
    } finally {
      setWorkCalendarPending(null);
    }
  }, []);

  const removeWorkCalendarSource = useCallback(async () => {
    setWorkCalendarPending("remove");
    setWorkCalendarSnapshot(null);
    setWorkCalendarError(null);
    try {
      setWorkCalendarConfiguration(
        await invokePublishedIcsWithDeadline<WorkCalendarConfiguration>(
          "remove_work_calendar_source",
          {},
        ),
      );
    } catch {
      setWorkCalendarError("The saved work-calendar source could not be removed.");
      await refreshWorkCalendarConfiguration();
    } finally {
      setWorkCalendarPending(null);
    }
  }, [refreshWorkCalendarConfiguration]);

  const refreshTeamsMirror = useCallback(async () => {
    try {
      setTeamsMirror(
        await invoke<TeamsMirrorStatus>("get_teams_mirror_status"),
      );
      setTeamsMirrorError(null);
    } catch (error) {
      setTeamsMirrorError(String(error));
    }
  }, []);

  const runCommand = useCallback(
    async (
      command: "get_notification_access_status" | "request_notification_access",
      action: "refresh" | "request",
    ) => {
      setPendingAction(action);
      setFrontendError(null);

      try {
        setReport(await invoke<NotificationAccessReport>(command));
      } catch (error) {
        setFrontendError(String(error));
      } finally {
        setPendingAction(null);
      }
    },
    [],
  );

  const refreshSnapshot = useCallback(async () => {
    setPendingAction("snapshot");
    setFrontendError(null);

    try {
      setSnapshot(await invoke<NotificationSnapshot>("get_notification_snapshot"));
    } catch (error) {
      setFrontendError(String(error));
    } finally {
      setPendingAction(null);
    }
  }, []);

  useEffect(() => {
    void refreshWorkCalendarConfiguration();
  }, [refreshWorkCalendarConfiguration]);

  useEffect(() => {
    if (readAdvancedFocusTarget(window.location.search) === "work-calendar") {
      focusWorkCalendarSetup();
    }

    let disposed = false;
    let stopListening: (() => void) | undefined;
    void listen<AdvancedFocusRequest>(
      ADVANCED_FOCUS_EVENT,
      ({ payload }) => {
        if (!disposed && payload.target === "work-calendar") {
          focusWorkCalendarSetup();
        }
      },
    ).then((unlisten) => {
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
  }, [focusWorkCalendarSetup]);

  useEffect(() => {
    let disposed = false;
    let stopListening: (() => void) | undefined;
    void listen(WIDGET_PREFERENCES_CHANGED_EVENT, ({ payload }) => {
      if (!disposed) {
        setWidgetPreferences(
          normalizeWidgetPreferences(
            payload as Partial<typeof widgetPreferences>,
          ),
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
    void runCommand("get_notification_access_status", "refresh");
  }, [runCommand]);

  useEffect(() => {
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const poll = async () => {
      await refreshAttentionSignals();
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
  }, [refreshAttentionSignals]);

  useEffect(() => {
    const timer = window.setInterval(() => setAttentionClock(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const poll = async () => {
      await refreshTeamsMirror();
      if (!disposed) {
        timer = setTimeout(() => void poll(), 2_000);
      }
    };

    void poll();

    return () => {
      disposed = true;
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [refreshTeamsMirror]);

  useEffect(() => {
    if (report?.accessStatus === "allowed") {
      void refreshSnapshot();
    }
  }, [refreshSnapshot, report?.accessStatus]);

  useEffect(() => {
    if (report?.accessStatus !== "allowed") {
      return;
    }

    let disposed = false;
    let stopListening: (() => void) | undefined;

    void (async () => {
      try {
        const unlisten = await listen<NotificationChangeSignal>(
          "notification-state-changed",
          (event) => {
            setLastChange(event.payload);
            void refreshSnapshot();
          },
        );

        if (disposed) {
          unlisten();
          return;
        }

        stopListening = unlisten;
        const listener = await invoke<ListenerStartReport>(
          "start_notification_listener",
        );

        if (!disposed) {
          setListenerReport(listener);
        }
      } catch (error) {
        if (!disposed) {
          setFrontendError(String(error));
        }
      }
    })();

    return () => {
      disposed = true;
      stopListening?.();
    };
  }, [refreshSnapshot, report?.accessStatus]);

  const activePageDetails =
    ADVANCED_PAGES.find((page) => page.id === activePage) ?? ADVANCED_PAGES[0];

  return (
    <main className="advanced-shell">
      <aside className="advanced-sidebar">
        <div className="advanced-brand">
          <span aria-hidden="true" className="advanced-brand__mark">
            A
          </span>
          <span>
            <strong>Attention Hub</strong>
            <small>Settings</small>
          </span>
        </div>
        <nav aria-label="Advanced settings pages" className="advanced-nav">
          {ADVANCED_PAGES.map((page) => (
            <button
              aria-current={activePage === page.id ? "page" : undefined}
              key={page.id}
              onClick={() => setActivePage(page.id)}
              type="button"
            >
              {page.label}
            </button>
          ))}
        </nav>
        <p className="advanced-sidebar__note">
          Local-first Windows observer
        </p>
      </aside>

      <div className="advanced-content">
        <header className="advanced-page-header">
          <h1>{activePageDetails.label}</h1>
          <p>{activePageDetails.description}</p>
        </header>

      <section
        aria-labelledby="widget-preferences-heading"
        hidden={!(["general", "clocks", "apps"] as AdvancedPage[]).includes(activePage)}
      >
        <h2 className="sr-only" id="widget-preferences-heading">
          Widget settings
        </h2>

        <div className="widget-preferences-grid">
          <fieldset
            className="widget-preference-card"
            hidden={activePage !== "general"}
          >
            <legend>Panel surface</legend>
            <label htmlFor="widget-panel-color">Background color</label>
            <div className="widget-color-control">
              <input
                id="widget-panel-color"
                onChange={(event) =>
                  applyWidgetPreferences({ panelColor: event.target.value })
                }
                type="color"
                value={widgetPreferences.panelColor}
              />
              <output htmlFor="widget-panel-color">
                {widgetPreferences.panelColor.toUpperCase()}
              </output>
            </div>

            <label htmlFor="widget-panel-opacity">
              Background opacity
              <output htmlFor="widget-panel-opacity">
                {widgetPreferences.panelOpacity}%
              </output>
            </label>
            <input
              id="widget-panel-opacity"
              max="100"
              min="25"
              onChange={(event) =>
                applyWidgetPreferences({
                  panelOpacity: Number(event.target.value),
                })
              }
              step="1"
              type="range"
              value={widgetPreferences.panelOpacity}
            />
            <small>
              Text and borders adapt to the selected color. The desktop behind
              translucent panels can still reduce readability.
            </small>
            {widgetPreferences.panelOpacity < 60 && (
              <small className="widget-preference-warning" role="status">
                Low opacity may make text and controls difficult to read over a
                busy desktop.
              </small>
            )}
            <button
              onClick={() =>
                applyWidgetPreferences({
                  panelColor: DEFAULT_WIDGET_PREFERENCES.panelColor,
                  panelOpacity: DEFAULT_WIDGET_PREFERENCES.panelOpacity,
                })
              }
              type="button"
            >
              Reset panel appearance
            </button>
          </fieldset>

          <fieldset
            className="widget-preference-card"
            hidden={activePage !== "general"}
          >
            <legend>Widget size</legend>
            <label htmlFor="widget-width-mode">Size preset</label>
            <select
              id="widget-width-mode"
              onChange={(event) =>
                applyWidgetPreferences({
                  widthMode: event.target.value as
                    | "recommended"
                    | "larger",
                })
              }
              value={widgetPreferences.widthMode}
            >
              <option value="recommended">Recommended</option>
              <option value="larger">Larger</option>
            </select>
            <small>
              Recommended uses the current dense 68 px layout. Larger uses an
              80 px layout with a fixed 416 px calendar area.
            </small>
          </fieldset>

          <fieldset
            className="widget-preference-card"
            hidden={activePage !== "clocks"}
          >
            <legend>Clocks</legend>
            <label htmlFor="widget-primary-time-zone">Primary timezone</label>
            <input
              aria-label="Search primary timezones"
              className="widget-time-zone-search"
              onChange={(event) => setPrimaryTimeZoneSearch(event.target.value)}
              placeholder="Search city, IANA name, or UTC offset"
              type="search"
              value={primaryTimeZoneSearch}
            />
            <select
              id="widget-primary-time-zone"
              onChange={(event) =>
                applyWidgetPreferences({
                  primaryTimeZone: event.target.value || null,
                })
              }
              value={widgetPreferences.primaryTimeZone ?? ""}
            >
              <option value="">
                {`System (${canonicalTimeZone(
                  Intl.DateTimeFormat().resolvedOptions().timeZone,
                )})`}
              </option>
              {primaryTimeZoneOptions.map((timeZone) => (
                <option key={timeZone} value={timeZone}>
                  {timeZoneOptionLabel(timeZone)}
                </option>
              ))}
            </select>
            <small>
              This changes the primary clock and time converter only. Calendar,
              reminders, and Windows keep using their established time rules.
            </small>
            <button
              disabled={widgetPreferences.primaryTimeZone === null}
              onClick={() => applyWidgetPreferences({ primaryTimeZone: null })}
              type="button"
            >
              Use system timezone
            </button>
            <label htmlFor="widget-secondary-time-zone">
              Secondary timezone
            </label>
            <input
              aria-label="Search secondary timezones"
              className="widget-time-zone-search"
              onChange={(event) => setSecondaryTimeZoneSearch(event.target.value)}
              placeholder="Search city, IANA name, or UTC offset"
              type="search"
              value={secondaryTimeZoneSearch}
            />
            <select
              id="widget-secondary-time-zone"
              onChange={(event) =>
                applyWidgetPreferences({
                  secondaryTimeZone: event.target.value,
                })
              }
              value={widgetPreferences.secondaryTimeZone}
            >
              {secondaryTimeZoneOptions.map((timeZone) => (
                <option key={timeZone} value={timeZone}>
                  {timeZoneOptionLabel(timeZone)}
                </option>
              ))}
            </select>
            <small>
              The widget shows a short city label and a compact common-zone
              list. Search here to reach the full IANA catalog.
            </small>
          </fieldset>

          <fieldset
            className="widget-preference-card"
            hidden={activePage !== "apps"}
          >
            <legend>Left-panel app order</legend>
            <ol className="widget-app-order">
              {widgetPreferences.appOrder.map((sourceKey, index) => {
                const labels: Record<AttentionAppKey, string> = {
                  teams: "Microsoft Teams",
                  telegram: "Telegram",
                  outlook: "Microsoft Outlook",
                  slack: "Slack",
                  viber: "Viber",
                  whatsapp: "WhatsApp",
                };
                return (
                  <li key={sourceKey}>
                    <span>{labels[sourceKey]}</span>
                    <span className="widget-app-order__actions">
                      <button
                        aria-label={`Move ${labels[sourceKey]} up`}
                        disabled={index === 0}
                        onClick={() => moveApp(sourceKey, -1)}
                        title="Move up"
                        type="button"
                      >
                        ↑
                      </button>
                      <button
                        aria-label={`Move ${labels[sourceKey]} down`}
                        disabled={index === widgetPreferences.appOrder.length - 1}
                        onClick={() => moveApp(sourceKey, 1)}
                        title="Move down"
                        type="button"
                      >
                        ↓
                      </button>
                    </span>
                  </li>
                );
              })}
            </ol>
            <small>
              Advanced remains fixed at the end. Enabled native visual surfaces
              follow their app positions.
            </small>
            <button
              onClick={() =>
                applyWidgetPreferences({ appOrder: [...DEFAULT_APP_ORDER] })
              }
              type="button"
            >
              Reset default order
            </button>
          </fieldset>

          <fieldset
            className="widget-preference-card"
            hidden={activePage !== "apps"}
          >
            <legend>Source monitoring</legend>
            <p>
              Showing {widgetPreferences.monitoredSources.length} of 6 fixed
              sources. Microsoft Teams, Telegram, and Microsoft Outlook provide
              semantic attention state; Slack, Viber, and WhatsApp provide app
              presence and visual-only badges.
            </p>
            <div className="widget-source-controls">
              {widgetPreferences.appOrder.map((sourceKey) => {
                const labels: Record<AttentionAppKey, string> = {
                  teams: "Microsoft Teams",
                  telegram: "Telegram",
                  outlook: "Microsoft Outlook",
                  slack: "Slack",
                  viber: "Viber",
                  whatsapp: "WhatsApp",
                };
                const monitored = widgetPreferences.monitoredSources.includes(
                  sourceKey,
                );
                const supportsVisual = sourceKey !== "outlook";
                const scanLabel = sourceScanLabel(catalogScan, sourceKey);
                return (
                  <div className="widget-source-control" key={sourceKey}>
                    <label>
                      <input
                        checked={monitored}
                        onChange={() => toggleMonitoredSource(sourceKey)}
                        type="checkbox"
                      />
                        Show {labels[sourceKey]}
                    </label>
                    {supportsVisual && (
                      <label className="widget-source-control__visual">
                        <input
                          checked={widgetPreferences.liveVisualSources.includes(
                            sourceKey,
                          )}
                          disabled={!monitored}
                          onChange={() => toggleLiveVisual(sourceKey)}
                          type="checkbox"
                        />
                        Show live taskbar icon and badge surface
                      </label>
                    )}
                    {scanLabel && (
                      <small className="widget-source-control__scan-result">
                        Last manual scan: {scanLabel}
                      </small>
                    )}
                  </div>
                );
              })}
            </div>
            <small>
              Live taskbar pixels remain visual-only. Turning them off does not
              change the source-owned attention signal.
            </small>
            <button
              disabled={catalogScanPending}
              onClick={() => void scanFixedSources()}
              type="button"
            >
              {catalogScanPending
                ? "Scanning supported apps…"
                : "Scan six supported apps now"}
            </button>
            <small aria-live="polite">
              This one-time local scan checks only the six fixed sources and
              does not enable or save any source selection.
              {catalogScan?.capturedAt
                ? ` Last scan: ${new Date(catalogScan.capturedAt).toLocaleTimeString()}.`
                : ""}
            </small>
            {catalogScanError && (
              <small className="error" role="alert">
                Supported-app scan failed: {catalogScanError}
              </small>
            )}
            <button
              onClick={() =>
                applyWidgetPreferences({
                  monitoredSources: [...DEFAULT_MONITORED_SOURCES],
                  liveVisualSources: [...DEFAULT_LIVE_VISUAL_SOURCES],
                })
              }
              type="button"
            >
              Reset to Teams + Outlook
            </button>
            <button
              onClick={() =>
                applyWidgetPreferences({
                  monitoredSources: [...DEFAULT_APP_ORDER],
                  liveVisualSources: [...LIVE_VISUAL_APP_KEYS],
                })
              }
              type="button"
            >
              Enable all six
            </button>
          </fieldset>
        </div>
      </section>

      <div
        className="advanced-page-body"
        hidden={activePage !== "reminders"}
      >
        <LaterInboxDataPanel />
      </div>

      <section
        aria-live="polite"
        className="advanced-page-body"
        hidden={activePage !== "calendar"}
        id="work-calendar-setup"
        ref={workCalendarSectionRef}
      >
        <h2>Connect one published work calendar</h2>
        <p>
          Paste the generated ICS link into this masked local field. Attention
          Hub verifies one fresh title-capable event before saving the link for
          this Windows user and showing only the active or next event in the
          widget.
        </p>

        <form
          className="secret-probe-form"
          onSubmit={(event) => {
            event.preventDefault();
            void saveWorkCalendarSource();
          }}
        >
          <label htmlFor="published-ics-url">Published ICS link</label>
          <div className="secret-probe-form__controls">
            <input
              aria-describedby="published-ics-url-help"
              autoCapitalize="none"
              autoComplete="off"
              id="published-ics-url"
              ref={publishedIcsInputRef}
              maxLength={4096}
              onChange={(event) => setPublishedIcsUrl(event.target.value)}
              placeholder="https://outlook.office365.com/…/calendar.ics"
              spellCheck={false}
              type="password"
              value={publishedIcsUrl}
            />
            <button
              disabled={
                workCalendarPending !== null ||
                !publishedIcsUrl.trim() ||
                !titleCapabilityConfirmed
              }
              type="submit"
            >
              {workCalendarPending === "save"
                ? "Verifying and saving securely…"
                : "Save securely and use in widget"}
            </button>
          </div>
          <small id="published-ics-url-help">
            The field is cleared as soon as an action starts. The link is never
            logged, returned, or added to evidence; it is persisted only after
            successful verification and only in Windows Credential Manager.
          </small>
          <label>
            <input
              checked={titleCapabilityConfirmed}
              onChange={(event) =>
                setTitleCapabilityConfirmed(event.target.checked)
              }
              type="checkbox"
            />{" "}
            I set this exact Outlook calendar publication to “Can view titles
            and locations”. Attention Hub will discard location.
          </label>
        </form>

        <div className="calendar-configuration">
          <p>
            Secure source: {" "}
            <strong>
              {workCalendarConfiguration?.configured
                ? "configured"
                : workCalendarConfiguration?.storageAvailable === false
                  ? "storage unavailable"
                  : "not configured"}
            </strong>
          </p>
          <div className="actions">
            <button
              disabled={
                workCalendarPending !== null ||
                !workCalendarConfiguration?.configured
              }
              onClick={() => void refreshSavedWorkCalendar()}
              type="button"
            >
              {workCalendarPending === "refresh"
                ? "Refreshing saved calendar…"
                : "Refresh saved calendar"}
            </button>
            <button
              disabled={
                workCalendarPending !== null ||
                !workCalendarConfiguration?.configured
              }
              onClick={() => void removeWorkCalendarSource()}
              type="button"
            >
              {workCalendarPending === "remove"
                ? "Removing saved source…"
                : "Remove saved calendar"}
            </button>
          </div>
          <small>
            One saved source only. Replacing it requires a fresh verified link.
            Removing it clears the widget calendar immediately.
          </small>
        </div>

        {workCalendarError && (
          <p className="error">Work calendar: {workCalendarError}</p>
        )}
        {workCalendarSnapshot && (
          <p>
            Saved-source result: {" "}
            <strong>{workCalendarSnapshot.status}</strong>. {" "}
            {workCalendarSnapshot.selection
              ? `The widget received one fresh active-or-next event${workCalendarSnapshot.overlappingSelections.length > 0 ? " and one simultaneous or overlapping event" : ""}.`
              : "No cached event was retained."}
          </p>
        )}

      </section>

      <div
        className="advanced-page-body advanced-diagnostics"
        hidden={activePage !== "diagnostics"}
      >
      <AttentionPanel
        snapshot={attentionSnapshot}
        refreshError={attentionError}
        consecutiveRefreshFailures={attentionFailureCount}
        now={attentionClock}
        monitoredSources={
          widgetPreferences.monitoredSources as AttentionSourceKey[]
        }
        refreshing={attentionRefreshing}
        onRefresh={() => void refreshAttentionSignals()}
        teamsMirror={teamsMirror}
        teamsMirrorError={teamsMirrorError}
        teamsVisualEnabled={widgetPreferences.liveVisualSources.includes("teams")}
        onTeamsVisualToggle={() => toggleLiveVisual("teams")}
      />

      <details className="technical-details">
        <summary>
          <span>Technical diagnostics</span>
          <small>Notifications and raw source data</small>
        </summary>
        <div className="technical-details__content">
      <p>Milestone 0 persistent attention-signal evidence</p>

      <section aria-live="polite">
        <div className="section-heading">
          <div>
            <h2>Source-owned persistent state</h2>
            <p>
              Read from application/window accessibility state. This does not
              create or require Windows notifications.
            </p>
          </div>
          <button
            disabled={attentionRefreshing}
            onClick={() => void refreshAttentionSignals()}
            type="button"
          >
            {attentionRefreshing ? "Reading…" : "Refresh signals"}
          </button>
        </div>

        {attentionError && (
          <p className="error">Attention-signal error: {attentionError}</p>
        )}

        {attentionSnapshot ? (
          <>
            <p>
              Signals: <strong>{attentionSnapshot.signals.length}</strong>;
              captured: <time>{attentionSnapshot.capturedAt}</time>
            </p>
            <dl>
              {attentionSnapshot.sources.map((source) => (
                <div className="source-observation" key={source.sourceKey}>
                  <dt>{source.displayName}</dt>
                  <dd data-status={source.state}>{source.state}</dd>
                </div>
              ))}
            </dl>
            {attentionSnapshot.signals.length > 0 ? (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Source</th>
                      <th>Signal</th>
                      <th>Count</th>
                      <th>Needs attention</th>
                      <th>Origin / confidence</th>
                      <th>Observed label / meaning</th>
                    </tr>
                  </thead>
                  <tbody>
                    {attentionSnapshot.signals.map((signal) => (
                      <tr key={`${signal.sourceKey}-${signal.kind}`}>
                        <td>{signal.displayName}</td>
                        <td>{signal.kind}</td>
                        <td>
                          {signal.count ?? "not exposed"}
                          {signal.inferred && <small>inferred observation</small>}
                        </td>
                        <td>
                          {signal.needsAttention === null
                            ? "unknown"
                            : String(signal.needsAttention)}
                        </td>
                        <td>
                          {signal.origin}
                          <small>{signal.confidence} confidence</small>
                        </td>
                        <td>
                          {signal.rawLabel ?? "—"}
                          <small>{signal.meaning}</small>
                          {signal.diagnostics.length > 0 && (
                            <pre>{JSON.stringify(signal.diagnostics, null, 2)}</pre>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p>No persistent attention signals found.</p>
            )}

            {attentionSnapshot.diagnostics.length > 0 && (
              <>
                <h3>Signal diagnostics</h3>
                <ul>
                  {attentionSnapshot.diagnostics.map((diagnostic) => (
                    <li key={diagnostic}>{diagnostic}</li>
                  ))}
                </ul>
              </>
            )}
          </>
        ) : (
          <p>Reading persistent attention signals…</p>
        )}
      </section>

      <hr />

      <h2>Windows Notification Center comparison</h2>
      <p>
        Retained as spike evidence; this section observes existing notifications
        and does not generate any.
      </p>

      <div className="actions">
        <button
          disabled={pendingAction !== null}
          onClick={() =>
            void runCommand("get_notification_access_status", "refresh")
          }
          type="button"
        >
          {pendingAction === "refresh" ? "Refreshing…" : "Refresh status"}
        </button>
        <button
          disabled={pendingAction !== null || report?.apiAvailable === false}
          onClick={() =>
            void runCommand("request_notification_access", "request")
          }
          type="button"
        >
          {pendingAction === "request" ? "Waiting for Windows…" : "Request access"}
        </button>
        <button
          disabled={pendingAction !== null || report?.accessStatus !== "allowed"}
          onClick={() => void refreshSnapshot()}
          type="button"
        >
          {pendingAction === "snapshot" ? "Reading…" : "Refresh snapshot"}
        </button>
      </div>

      {frontendError && <p className="error">Frontend error: {frontendError}</p>}

      {report ? (
        <section aria-live="polite">
          <dl>
            <dt>Access status</dt>
            <dd data-status={report.accessStatus}>{report.accessStatus}</dd>

            <dt>WinRT API available</dt>
            <dd>{String(report.apiAvailable)}</dd>

            <dt>Package identity present</dt>
            <dd>{String(report.packageIdentity.present)}</dd>

            <dt>Package full name</dt>
            <dd>{report.packageIdentity.fullName ?? "—"}</dd>

            <dt>Live listener active</dt>
            <dd>{listenerReport ? String(listenerReport.active) : "starting…"}</dd>

            <dt>Last native change</dt>
            <dd>
              {lastChange
                ? `${lastChange.kind}; notification ID ${lastChange.notificationId ?? "unknown"}`
                : "none observed"}
            </dd>
          </dl>

          <h2>Diagnostics</h2>
          {report.diagnostics.length > 0 ? (
            <ul>
              {report.diagnostics.map((diagnostic) => (
                <li key={diagnostic}>{diagnostic}</li>
              ))}
            </ul>
          ) : (
            <p>None.</p>
          )}
          {listenerReport && listenerReport.diagnostics.length > 0 && (
            <>
              <h3>Listener diagnostics</h3>
              <ul>
                {listenerReport.diagnostics.map((diagnostic) => (
                  <li key={diagnostic}>{diagnostic}</li>
                ))}
              </ul>
            </>
          )}
        </section>
      ) : (
        <p>Reading Windows notification access status…</p>
      )}

      <section>
        <h2>Current notification snapshot</h2>
        {snapshot ? (
          <>
            <p>
              Count: <strong>{snapshot.notifications.length}</strong>; captured:{" "}
              <time>{snapshot.capturedAt}</time>
            </p>

            {snapshot.notifications.length > 0 ? (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Source</th>
                      <th>Created</th>
                      <th>Title</th>
                      <th>Body</th>
                      <th>Raw text / diagnostics</th>
                    </tr>
                  </thead>
                  <tbody>
                    {snapshot.notifications.map((notification) => (
                      <tr key={`${notification.source.appUserModelId}-${notification.id}`}>
                        <td>{notification.id}</td>
                        <td>
                          <strong>{notification.source.displayName ?? "Unknown"}</strong>
                          <small>{notification.source.appUserModelId ?? "No AUMID"}</small>
                          <small>
                            {notification.source.packageFamilyName ?? "No package family"}
                          </small>
                        </td>
                        <td>{notification.createdAt ?? "—"}</td>
                        <td>{notification.title ?? "—"}</td>
                        <td>{notification.body.join("\n") || "—"}</td>
                        <td>
                          <pre>{JSON.stringify(notification.rawTextElements, null, 2)}</pre>
                          {notification.diagnostics.length > 0 && (
                            <pre>{JSON.stringify(notification.diagnostics, null, 2)}</pre>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p>No current notifications returned.</p>
            )}

            {snapshot.diagnostics.length > 0 && (
              <>
                <h3>Snapshot diagnostics</h3>
                <ul>
                  {snapshot.diagnostics.map((diagnostic) => (
                    <li key={diagnostic}>{diagnostic}</li>
                  ))}
                </ul>
              </>
            )}
          </>
        ) : (
          <p>No snapshot requested yet.</p>
        )}
      </section>
        </div>
      </details>
      </div>
      </div>
    </main>
  );
}

function App() {
  const windowLabel = getCurrentWindow().label;

  useEffect(() => {
    document.documentElement.dataset.window = windowLabel;
    document.body.dataset.window = windowLabel;
    return () => {
      delete document.documentElement.dataset.window;
      delete document.body.dataset.window;
    };
  }, [windowLabel]);

  if (windowLabel === "advanced") {
    return <AdvancedView />;
  }
  if (windowLabel === "later") {
    return <LaterInboxView />;
  }
  return <WidgetView />;
}

export default App;
