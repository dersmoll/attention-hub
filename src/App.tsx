import {
  type CSSProperties,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { getVersion } from "@tauri-apps/api/app";
import { invoke } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { AttentionPanel } from "./AttentionPanel";
import { LaterInboxDataPanel } from "./LaterInboxDataPanel";
import { LaterInboxView } from "./LaterInboxView";
import { EventSettingsView } from "./EventSettingsView";
import { ProjectStashView } from "./ProjectStashView";
import { TodayPopupView } from "./TodayPopupView";
import { WidgetView } from "./WidgetView";
import { AppUpdatePanel } from "./AppUpdatePanel";
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
  type PanelSurfaceMode,
  DEFAULT_APP_ORDER,
  DEFAULT_LIVE_VISUAL_SOURCES,
  DEFAULT_MONITORED_SOURCES,
  DEFAULT_WIDGET_PREFERENCES,
  LIVE_VISUAL_APP_KEYS,
  WIDGET_PREFERENCES_CHANGED_EVENT,
  normalizeWidgetPreferences,
  panelTextContrastRatio,
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
import "./App.scss";

type AdvancedPage =
  | "general"
  | "clocks"
  | "apps"
  | "calendar"
  | "reminders"
  | "updates"
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
    id: "updates",
    label: "Updates",
    description: "Check for signed Attention Hub releases.",
  },
  {
    id: "diagnostics",
    label: "Diagnostics",
    description: "Source observations and technical Windows evidence.",
  },
];

const PUBLISHED_ICS_UI_DEADLINE_MS = 20_000;
class PublishedIcsUiDeadlineError extends Error {}

function workCalendarStopReasonMessage(stopReason: string | null) {
  if (stopReason === "redirectBlocked") {
    return "This calendar link redirects. Use the final direct Outlook publication URL instead.";
  }
  if (stopReason === "disallowedSource" || stopReason === "invalidUrl") {
    return "Use a direct, credential-free Microsoft Outlook Published ICS link.";
  }
  if (stopReason === "titleCapabilityNotConfirmed") {
    return "Confirm the exact Outlook publication level before saving this source.";
  }
  if (stopReason === "requestTimeout" || stopReason === "commandDeadline") {
    return "Calendar verification timed out safely. The pasted link is still available to retry.";
  }
  return "The source was not saved because bounded verification did not complete successfully.";
}

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
  const [appVersion, setAppVersion] = useState<string | null>(null);
  const [frontendNotice, setFrontendNotice] = useState<string | null>(null);
  const frontendNoticeTimerRef = useRef<number | null>(null);
  const [primaryTimeZoneSearch, setPrimaryTimeZoneSearch] = useState("");
  const [secondaryTimeZoneSearch, setSecondaryTimeZoneSearch] = useState("");
  const [extraTimeZoneSearch, setExtraTimeZoneSearch] = useState("");
  const currentTimeZones = useMemo(
    () =>
      [
        widgetPreferences.primaryTimeZone,
        widgetPreferences.secondaryTimeZone,
        ...widgetPreferences.extraTimeZones,
      ].filter((value): value is string => value !== null),
    [
      widgetPreferences.primaryTimeZone,
      widgetPreferences.secondaryTimeZone,
      widgetPreferences.extraTimeZones,
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
  const extraTimeZoneOptions = useMemo(
    () =>
      searchTimeZones(extraTimeZoneSearch, currentTimeZones).filter(
        (timeZone) => !currentTimeZones.includes(timeZone),
      ),
    [currentTimeZones, extraTimeZoneSearch],
  );

  const showFrontendNotice = useCallback((message: string) => {
    setFrontendNotice(message);
    if (frontendNoticeTimerRef.current !== null) {
      window.clearTimeout(frontendNoticeTimerRef.current);
    }
    frontendNoticeTimerRef.current = window.setTimeout(() => {
      setFrontendNotice(null);
      frontendNoticeTimerRef.current = null;
    }, 4_500);
  }, []);

  useEffect(
    () => () => {
      if (frontendNoticeTimerRef.current !== null) {
        window.clearTimeout(frontendNoticeTimerRef.current);
      }
    },
    [],
  );

  const applyWidgetPreferences = useCallback(
    (update: Parameters<typeof writeWidgetPreferences>[0]) => {
      const next = writeWidgetPreferences(update);
      setWidgetPreferences(next);
      void emit(WIDGET_PREFERENCES_CHANGED_EVENT, next).catch(() =>
        showFrontendNotice(
          "The setting was saved, but the widget may need to be reopened.",
        ),
      );
    },
    [showFrontendNotice],
  );

  const selectPanelSurface = useCallback(
    (panelSurface: PanelSurfaceMode) => {
      applyWidgetPreferences({ panelSurface });
    },
    [applyWidgetPreferences],
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
    } catch {
      setAttentionError(
        "The selected app sources could not be read. Retrying automatically.",
      );
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
    } catch {
      setCatalogScanError(
        "The one-time app scan could not finish. No source choices were changed.",
      );
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
      if (nextSnapshot.status === "observed" && nextSnapshot.configured) {
        setPublishedIcsUrl("");
        setWorkCalendarError(null);
      } else {
        setWorkCalendarError(
          workCalendarStopReasonMessage(nextSnapshot.stopReason),
        );
      }
      await refreshWorkCalendarConfiguration();
    } catch {
      setWorkCalendarError(
        "Calendar verification did not finish safely. The pasted link is still available to retry.",
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
    } catch {
      setTeamsMirrorError("The Teams visual status could not be read.");
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
    void getVersion().then(setAppVersion).catch(() => setAppVersion(null));
  }, []);

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

  const activePageDetails =
    ADVANCED_PAGES.find((page) => page.id === activePage) ?? ADVANCED_PAGES[0];

  return (
    <main className="advanced-shell">
      {frontendNotice && (
        <p className="advanced-notice" role="status">
          {frontendNotice}
        </p>
      )}
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
          {appVersion ? ` · v${appVersion}` : ""}
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
            <legend>Appearance</legend>
            <div className="panel-surface-options">
              {([
                ["light", "Light", "#F8FAFC", "#111827"],
                ["dark", "Dark", "#111827", "#F8FAFC"],
                ["custom", "Custom colors", widgetPreferences.panelColor, widgetPreferences.panelTextColor],
              ] as const).map(([value, label, background, text]) => (
                <label
                  className="panel-surface-option"
                  data-selected={widgetPreferences.panelSurface === value}
                  key={value}
                  style={{
                    "--panel-surface-preview-background": background,
                    "--panel-surface-preview-text": text,
                  } as CSSProperties}
                >
                  <input
                    checked={widgetPreferences.panelSurface === value}
                    name="widget-panel-surface"
                    onChange={() => selectPanelSurface(value)}
                    type="radio"
                    value={value}
                  />
                  <span className="panel-surface-option__preview" aria-hidden="true">
                    Aa
                  </span>
                  <span>{label}</span>
                </label>
              ))}
            </div>

            {widgetPreferences.panelSurface === "custom" && (
              <div className="panel-surface-colors">
                <div>
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
                </div>
                <div>
                  <label htmlFor="widget-panel-text-color">Text color</label>
                  <div className="widget-color-control">
                    <input
                      id="widget-panel-text-color"
                      onChange={(event) =>
                        applyWidgetPreferences({ panelTextColor: event.target.value })
                      }
                      type="color"
                      value={widgetPreferences.panelTextColor}
                    />
                    <output htmlFor="widget-panel-text-color">
                      {widgetPreferences.panelTextColor.toUpperCase()}
                    </output>
                  </div>
                </div>
              </div>
            )}

            <label className="widget-appearance-pin">
              <input
                checked={widgetPreferences.pinned}
                onChange={(event) =>
                  applyWidgetPreferences({ pinned: event.target.checked })
                }
                type="checkbox"
              />
              Keep Attention Hub above other windows
            </label>

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
              Text, borders, and controls use this two-color surface. The
              desktop behind translucent panels can still reduce readability.
            </small>
            {widgetPreferences.panelSurface === "custom" &&
              panelTextContrastRatio(widgetPreferences) < 4.5 && (
                <small className="widget-preference-warning" role="status">
                  These custom colors have low contrast. Choose colors that are
                  easier to read together.
                </small>
              )}
            {widgetPreferences.panelOpacity < 60 && (
              <small className="widget-preference-warning" role="status">
                Low opacity may make text and controls difficult to read over a
                busy desktop.
              </small>
            )}
            <button
              onClick={() =>
                applyWidgetPreferences({
                  panelSurface: DEFAULT_WIDGET_PREFERENCES.panelSurface,
                  panelColor: DEFAULT_WIDGET_PREFERENCES.panelColor,
                  panelTextColor: DEFAULT_WIDGET_PREFERENCES.panelTextColor,
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
                    | "slim",
                })
              }
              value={widgetPreferences.widthMode}
            >
              <option value="recommended">Recommended</option>
              <option value="slim">Compact single-line</option>
            </select>
            <small>
              Recommended uses the dense two-line layout. Compact single-line
              uses a unified horizontal rail.
            </small>
          </fieldset>

          <fieldset
            className="widget-preference-card widget-visible-panels"
            hidden={activePage !== "general"}
          >
            <legend>Visible panels</legend>
            <label>
              <input
                checked={widgetPreferences.showAppsPanel}
                onChange={(event) =>
                  applyWidgetPreferences({
                    showAppsPanel: event.target.checked,
                  })
                }
                type="checkbox"
              />
              Show app shortcuts
            </label>
            <label>
              <input
                checked={widgetPreferences.showClocksPanel}
                onChange={(event) =>
                  applyWidgetPreferences({
                    showClocksPanel: event.target.checked,
                  })
                }
                type="checkbox"
              />
              Show clocks
            </label>
            <small>
              Hidden panels keep their app and timezone configuration. Native
              visual mirrors pause while app shortcuts are hidden.
            </small>
          </fieldset>

          <fieldset
            className="widget-preference-card"
            hidden={activePage !== "clocks"}
          >
            <legend>Clocks</legend>
            <div className="widget-clock-layout-control">
              <label htmlFor="widget-clock-layout">Clock layout</label>
              <select
                disabled={widgetPreferences.widthMode === "slim"}
                id="widget-clock-layout"
                onChange={(event) =>
                  applyWidgetPreferences({
                    clockLayout: event.target.value as
                      | "horizontal"
                      | "vertical",
                  })
                }
                value={widgetPreferences.clockLayout}
              >
                <option value="horizontal">Horizontal columns</option>
                <option value="vertical">Vertical list</option>
              </select>
              <small>
                Horizontal mode grows the clock panel. Vertical mode keeps its
                current width and shows one compact time-and-city row per zone.
                Compact single-line always presents time and city horizontally
                and preserves this choice for the other size presets.
              </small>
            </div>
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
              list. Search by city, country, IANA name, or UTC offset.
            </small>
            <small>
              IANA timezone rules automatically apply summer and winter clock
              changes wherever the selected zone observes them.
            </small>
            <label htmlFor="widget-extra-time-zone">Additional timezones</label>
            {widgetPreferences.extraTimeZones.length > 0 && (
              <ul className="widget-extra-time-zones">
                {widgetPreferences.extraTimeZones.map((timeZone) => (
                  <li key={timeZone}>
                    <span>{timeZoneOptionLabel(timeZone)}</span>
                    <button
                      aria-label={`Remove ${timeZone}`}
                      onClick={() =>
                        applyWidgetPreferences({
                          extraTimeZones:
                            widgetPreferences.extraTimeZones.filter(
                              (candidate) => candidate !== timeZone,
                            ),
                        })
                      }
                      type="button"
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <input
              aria-label="Search additional timezones"
              className="widget-time-zone-search"
              disabled={widgetPreferences.extraTimeZones.length >= 3}
              onChange={(event) => setExtraTimeZoneSearch(event.target.value)}
              placeholder="Search Serbia, Sarajevo, Skopje…"
              type="search"
              value={extraTimeZoneSearch}
            />
            <select
              disabled={widgetPreferences.extraTimeZones.length >= 3}
              id="widget-extra-time-zone"
              onChange={(event) => {
                if (!event.target.value) {
                  return;
                }
                applyWidgetPreferences({
                  extraTimeZones: [
                    ...widgetPreferences.extraTimeZones,
                    event.target.value,
                  ],
                });
                setExtraTimeZoneSearch("");
              }}
              value=""
            >
              <option value="">
                {widgetPreferences.extraTimeZones.length >= 3
                  ? "Maximum of five clocks reached"
                  : "Add a timezone…"}
              </option>
              {extraTimeZoneOptions.map((timeZone) => (
                <option key={timeZone} value={timeZone}>
                  {timeZoneOptionLabel(timeZone)}
                </option>
              ))}
            </select>
            <small>
              Add up to three display-only clocks. Time conversion remains
              between the primary and secondary zones.
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

        <div className="calendar-attention-settings">
          <div>
            <h3>Meeting start attention</h3>
            <p>
              The calendar panel pulses visually when a timed meeting starts.
              Reduced-motion mode keeps a static high-contrast outline.
            </p>
          </div>
          <label>
            <input
              checked={widgetPreferences.meetingStartSoundEnabled}
              onChange={(event) =>
                applyWidgetPreferences({
                  meetingStartSoundEnabled: event.target.checked,
                })
              }
              type="checkbox"
            />{" "}
            Play the bundled meeting notification sound one minute before an
            upcoming meeting
          </label>
          <button
            onClick={() =>
              void invoke("play_meeting_start_sound").catch(() =>
                showFrontendNotice(
                  "The meeting sound could not be played on this device.",
                ),
              )
            }
            type="button"
          >
            Test sound
          </button>
          <small>
            Sound is enabled by default, contains no meeting data, and fires once
            per observed timed meeting, one minute before it starts, while
            Attention Hub is running.
          </small>
        </div>

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

      <section className="advanced-page-body" hidden={activePage !== "updates"}>
        <AppUpdatePanel variant="settings" />
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
          <small>Source observations and bounded diagnostics</small>
        </summary>
        <div className="technical-details__content">
      <p>
        Source-owned attention evidence. Semantic Teams, Telegram, and Outlook
        matching currently depends on English application accessibility labels;
        other UI languages can report a truthful not-exposed state.
      </p>

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
  if (windowLabel === "update") {
    return <AppUpdatePanel variant="dialog" />;
  }
  if (windowLabel === "event-settings") {
    return <EventSettingsView />;
  }
  if (windowLabel === "project-stash") {
    return <ProjectStashView />;
  }
  if (windowLabel === "today") {
    return <TodayPopupView />;
  }
  return <WidgetView />;
}

export default App;
