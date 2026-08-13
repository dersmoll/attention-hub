import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { AttentionPanel } from "./AttentionPanel";
import { WidgetView } from "./WidgetView";
import {
  ATTENTION_POLL_INTERVAL_MS,
  type AttentionSignalSnapshot,
  type TeamsMirrorStatus,
} from "./attention-model";
import type {
  WorkCalendarConfiguration,
  WorkCalendarSnapshot,
} from "./work-calendar-model";
import {
  type AttentionAppKey,
  DEFAULT_APP_ORDER,
  DEFAULT_WIDGET_PREFERENCES,
  WIDGET_PREFERENCES_CHANGED_EVENT,
  normalizeWidgetPreferences,
  readWidgetPreferences,
  writeWidgetPreferences,
} from "./widget-preferences";
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

const PUBLISHED_ICS_UI_DEADLINE_MS = 20_000;

class PublishedIcsUiDeadlineError extends Error {}

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
  const [teamsMirror, setTeamsMirror] = useState<TeamsMirrorStatus | null>(null);
  const [teamsMirrorPending, setTeamsMirrorPending] = useState(false);
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

  const refreshAttentionSignals = useCallback(async () => {
    if (attentionRequestInFlight.current) {
      return;
    }

    attentionRequestInFlight.current = true;
    setAttentionRefreshing(true);

    try {
      const nextSnapshot = await invoke<AttentionSignalSnapshot>(
        "get_attention_signal_snapshot",
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

  const runTeamsMirrorCommand = useCallback(
    async (command: "start_teams_mirror" | "stop_teams_mirror") => {
      setTeamsMirrorPending(true);
      setTeamsMirrorError(null);

      try {
        setTeamsMirror(await invoke<TeamsMirrorStatus>(command));
      } catch (error) {
        const message = String(error);
        try {
          setTeamsMirror(
            await invoke<TeamsMirrorStatus>("get_teams_mirror_status"),
          );
        } catch {
          // Preserve the command failure below when status refresh also fails.
        }
        setTeamsMirrorError(message);
      } finally {
        setTeamsMirrorPending(false);
      }
    },
    [],
  );

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

  return (
    <main className="advanced-shell">
      <header className="app-header">
        <p className="eyebrow">Local-first Windows observer</p>
        <h1>Attention Hub</h1>
        <p>What currently needs my attention?</p>
      </header>

      <section aria-labelledby="widget-preferences-heading">
        <p className="eyebrow">Compact widget</p>
        <h2 id="widget-preferences-heading">Appearance and app order</h2>
        <p>
          Changes apply immediately. Calendar warning colors remain fixed so
          “starting soon” and “meeting started” keep their meaning.
        </p>

        <div className="widget-preferences-grid">
          <fieldset className="widget-preference-card">
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
              min="85"
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
              Text and border colors are selected automatically for contrast.
            </small>
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

          <fieldset className="widget-preference-card">
            <legend>Left-panel app order</legend>
            <ol className="widget-app-order">
              {widgetPreferences.appOrder.map((sourceKey, index) => {
                const labels: Record<AttentionAppKey, string> = {
                  teams: "Microsoft Teams",
                  telegram: "Telegram",
                  outlook: "Microsoft Outlook",
                };
                return (
                  <li key={sourceKey}>
                    <span>{labels[sourceKey]}</span>
                    <span className="widget-app-order__actions">
                      <button
                        aria-label={`Move ${labels[sourceKey]} up`}
                        disabled={index === 0}
                        onClick={() => moveApp(sourceKey, -1)}
                        type="button"
                      >
                        Move up
                      </button>
                      <button
                        aria-label={`Move ${labels[sourceKey]} down`}
                        disabled={index === widgetPreferences.appOrder.length - 1}
                        onClick={() => moveApp(sourceKey, 1)}
                        type="button"
                      >
                        Move down
                      </button>
                    </span>
                  </li>
                );
              })}
            </ol>
            <small>
              Advanced remains fixed at the end. Native Teams and Telegram
              visuals follow their app positions.
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
        </div>
      </section>

      <section aria-live="polite">
        <p className="eyebrow">Work calendar</p>
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
              ? "The widget received one fresh active-or-next event."
              : "No cached event was retained."}
          </p>
        )}

      </section>

      <AttentionPanel
        snapshot={attentionSnapshot}
        refreshError={attentionError}
        consecutiveRefreshFailures={attentionFailureCount}
        now={attentionClock}
        refreshing={attentionRefreshing}
        onRefresh={() => void refreshAttentionSignals()}
        teamsMirror={teamsMirror}
        teamsMirrorPending={teamsMirrorPending}
        teamsMirrorError={teamsMirrorError}
        onTeamsMirrorToggle={() =>
          void runTeamsMirrorCommand(
            teamsMirror?.enabled
              ? "stop_teams_mirror"
              : "start_teams_mirror",
          )
        }
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

  return windowLabel === "advanced" ? <AdvancedView /> : <WidgetView />;
}

export default App;
