import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { AttentionPanel } from "./AttentionPanel";
import { WidgetView } from "./WidgetView";
import {
  ATTENTION_POLL_INTERVAL_MS,
  type AttentionSignalSnapshot,
  type TeamsMirrorStatus,
} from "./attention-model";
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

type CalendarAccessStatus =
  | "unspecified"
  | "allowed"
  | "denied"
  | "unsupported"
  | "error";

interface CalendarAccessReport {
  accessStatus: CalendarAccessStatus;
  apiAvailable: boolean;
  packageIdentity: {
    present: boolean;
    fullName: string | null;
  };
  storeAvailable: boolean;
  diagnostics: string[];
}

interface CalendarSnapshot {
  accessStatus: CalendarAccessStatus;
  capturedAt: string;
  rangeStart: string;
  rangeEnd: string;
  calendars: CalendarSource[];
  appointments: CalendarAppointment[];
  diagnostics: string[];
}

interface CalendarSource {
  id: string;
  displayName: string;
  sourceDisplayName: string | null;
  hidden: boolean;
  diagnostics: string[];
}

interface CalendarAppointment {
  id: string;
  calendarId: string;
  startAt: string;
  endAt: string;
  allDay: boolean;
  subject: string | null;
  location: string | null;
  busyStatus: string | null;
  sensitivity: string | null;
  isRecurring: boolean;
  diagnostics: string[];
}

type GraphEnvironmentStatus =
  | "ready"
  | "notConfigured"
  | "unavailable"
  | "error";

interface GraphEnvironmentReport {
  status: GraphEnvironmentStatus;
  helperAvailable: boolean;
  windowsSupported: boolean;
  clientIdConfigured: boolean;
  tenantIdConfigured: boolean;
  dotnetRuntimeVersion: string | null;
  msalVersion: string | null;
  brokerVersion: string | null;
  diagnostics: string[];
}

type OutlookMyDayProbeStatus = "observed" | "unavailable" | "busy" | "error";

interface OutlookMyDayStructureProbe {
  status: OutlookMyDayProbeStatus;
  capturedAtUnixMs: number;
  structureAvailable: boolean;
  semanticExtractionAllowed: boolean;
  sourceIdentityState: "unverifiedStructureOnly";
  outlookWindowCount: number;
  visibleWindowCount: number;
  minimizedWindowCount: number;
  offscreenWindowCount: number;
  topLevelElementCount: number;
  elementCount: number;
  structuralCandidateCount: number;
  rightPaneCandidateCount: number;
  returnedCandidateCount: number;
  englishMyDayMarkerCount: number;
  englishCalendarMarkerCount: number;
  selectedEnglishCalendarMarkerCount: number;
  propertyErrorCount: number;
  maximumDepthReached: number;
  depthLimitReached: boolean;
  gateWaitMs: number;
  scanMs: number;
  stopReason: "topLevel" | "elements" | "time" | null;
  limits: {
    gateWaitMs: number;
    scanMs: number;
    topLevelElements: number;
    outlookWindows: number;
    elements: number;
    depth: number;
    returnedCandidates: number;
  };
  windows: unknown[];
  controlTypes: unknown[];
  candidates: unknown[];
  diagnostics: string[];
}

function AdvancedView() {
  const [outlookMyDayProbe, setOutlookMyDayProbe] =
    useState<OutlookMyDayStructureProbe | null>(null);
  const [outlookMyDayProbePending, setOutlookMyDayProbePending] = useState(false);
  const [outlookMyDayProbeError, setOutlookMyDayProbeError] = useState<
    string | null
  >(null);
  const [graphEnvironment, setGraphEnvironment] =
    useState<GraphEnvironmentReport | null>(null);
  const [graphEnvironmentPending, setGraphEnvironmentPending] = useState(false);
  const [graphEnvironmentError, setGraphEnvironmentError] = useState<
    string | null
  >(null);
  const [calendarReport, setCalendarReport] =
    useState<CalendarAccessReport | null>(null);
  const [calendarSnapshot, setCalendarSnapshot] =
    useState<CalendarSnapshot | null>(null);
  const [calendarPending, setCalendarPending] = useState(false);
  const [calendarSnapshotPending, setCalendarSnapshotPending] = useState(false);
  const [calendarError, setCalendarError] = useState<string | null>(null);
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

  const refreshGraphEnvironment = useCallback(async () => {
    setGraphEnvironmentPending(true);
    setGraphEnvironmentError(null);

    try {
      setGraphEnvironment(
        await invoke<GraphEnvironmentReport>("get_graph_calendar_environment"),
      );
    } catch (error) {
      setGraphEnvironmentError(String(error));
    } finally {
      setGraphEnvironmentPending(false);
    }
  }, []);

  const runCalendarCommand = useCallback(
    async (
      command: "get_calendar_access_status" | "request_calendar_read_access",
    ) => {
      setCalendarPending(true);
      setCalendarError(null);

      try {
        setCalendarReport(await invoke<CalendarAccessReport>(command));
      } catch (error) {
        setCalendarError(String(error));
      } finally {
        setCalendarPending(false);
      }
    },
    [],
  );

  const refreshCalendarSnapshot = useCallback(async () => {
    setCalendarSnapshotPending(true);
    setCalendarError(null);

    try {
      setCalendarSnapshot(
        await invoke<CalendarSnapshot>("get_calendar_snapshot"),
      );
    } catch (error) {
      setCalendarError(String(error));
    } finally {
      setCalendarSnapshotPending(false);
    }
  }, []);

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

  const runOutlookMyDayStructureProbe = useCallback(async () => {
    setOutlookMyDayProbePending(true);
    setOutlookMyDayProbeError(null);
    setOutlookMyDayProbe(null);

    try {
      setOutlookMyDayProbe(
        await invoke<OutlookMyDayStructureProbe>(
          "get_outlook_my_day_structure_probe",
        ),
      );
    } catch (error) {
      setOutlookMyDayProbeError(String(error));
    } finally {
      setOutlookMyDayProbePending(false);
    }
  }, []);

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
    void refreshGraphEnvironment();
  }, [refreshGraphEnvironment]);

  useEffect(() => {
    void runCalendarCommand("get_calendar_access_status");
  }, [runCalendarCommand]);

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

      <section aria-live="polite">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Milestone 4A manual diagnostic</p>
            <h2>New Outlook My Day structure</h2>
            <p>
              With Outlook My Day → Calendar already open, run one fresh
              sanitized structure scan. Attention Hub will not control Outlook.
            </p>
          </div>
          <button
            disabled={outlookMyDayProbePending}
            onClick={() => void runOutlookMyDayStructureProbe()}
            type="button"
          >
            {outlookMyDayProbePending
              ? "Inspecting sanitized structure…"
              : "Run sanitized structure probe"}
          </button>
        </div>

        {outlookMyDayProbeError && (
          <p className="error">
            Outlook My Day diagnostic error: {outlookMyDayProbeError}
          </p>
        )}
        {outlookMyDayProbe && (
          <p>
            Fresh result: <strong>{outlookMyDayProbe.status}</strong>. Detailed
            sanitized fields are shown under Technical diagnostics below.
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

      <details className="technical-details" open>
        <summary>
          <span>Technical diagnostics and spike evidence</span>
          <small>Graph, calendar, notifications, and raw source data</small>
        </summary>
        <div className="technical-details__content">
          <p>Milestone 4A New Outlook My Day observer diagnostic</p>

          <section aria-live="polite">
            <div className="section-heading">
              <div>
                <h2>New Outlook My Day structure</h2>
                <p>
                  Manually open Outlook Mail and My Day → Calendar first. This
                  one-shot probe never launches, focuses, clicks, or navigates
                  Outlook and returns sanitized structure only.
                </p>
              </div>
              <button
                disabled={outlookMyDayProbePending}
                onClick={() => void runOutlookMyDayStructureProbe()}
                type="button"
              >
                {outlookMyDayProbePending
                  ? "Inspecting sanitized structure…"
                  : "Run sanitized structure probe"}
              </button>
            </div>

            {outlookMyDayProbeError && (
              <p className="error">
                Outlook My Day diagnostic error: {outlookMyDayProbeError}
              </p>
            )}

            {outlookMyDayProbe && (
              <>
                <dl>
                  <dt>Fresh probe status</dt>
                  <dd data-status={outlookMyDayProbe.status}>
                    {outlookMyDayProbe.status}
                  </dd>

                  <dt>Structure available</dt>
                  <dd>{String(outlookMyDayProbe.structureAvailable)}</dd>

                  <dt>Semantic extraction allowed</dt>
                  <dd>{String(outlookMyDayProbe.semanticExtractionAllowed)}</dd>

                  <dt>Source identity</dt>
                  <dd>{outlookMyDayProbe.sourceIdentityState}</dd>

                  <dt>Outlook windows</dt>
                  <dd>
                    {outlookMyDayProbe.outlookWindowCount} accessible;{" "}
                    {outlookMyDayProbe.visibleWindowCount} visible;{" "}
                    {outlookMyDayProbe.minimizedWindowCount} minimized
                  </dd>

                  <dt>Bounded traversal</dt>
                  <dd>
                    {outlookMyDayProbe.elementCount} elements;{" "}
                    {outlookMyDayProbe.structuralCandidateCount} structural
                    candidates; {outlookMyDayProbe.rightPaneCandidateCount} in
                    the right-pane region
                  </dd>

                  <dt>English diagnostic markers</dt>
                  <dd>
                    My Day {outlookMyDayProbe.englishMyDayMarkerCount}; Calendar{" "}
                    {outlookMyDayProbe.englishCalendarMarkerCount}; selected{" "}
                    {outlookMyDayProbe.selectedEnglishCalendarMarkerCount}
                  </dd>

                  <dt>Timing</dt>
                  <dd>
                    Gate {outlookMyDayProbe.gateWaitMs} ms; scan{" "}
                    {outlookMyDayProbe.scanMs} ms
                  </dd>
                </dl>

                <ul>
                  {outlookMyDayProbe.diagnostics.map((diagnostic) => (
                    <li key={diagnostic}>{diagnostic}</li>
                  ))}
                </ul>

                <details>
                  <summary>Sanitized structure JSON</summary>
                  <pre>{JSON.stringify(outlookMyDayProbe, null, 2)}</pre>
                </details>
              </>
            )}
          </section>

          <hr />

          <p>Milestone 2 paused Microsoft Graph calendar-provider diagnostic</p>

      <section aria-live="polite">
        <div className="section-heading">
          <div>
            <h2>Microsoft Graph helper environment</h2>
            <p>
              Phase 0 checks the local MSAL.NET/WAM helper and registration
              configuration only. It does not sign in or contact Microsoft Graph.
            </p>
          </div>
          <button
            disabled={graphEnvironmentPending}
            onClick={() => void refreshGraphEnvironment()}
            type="button"
          >
            {graphEnvironmentPending ? "Checking…" : "Refresh Graph environment"}
          </button>
        </div>

        {graphEnvironmentError && (
          <p className="error">
            Graph environment error: {graphEnvironmentError}
          </p>
        )}

        {graphEnvironment ? (
          <>
            <dl>
              <dt>Environment status</dt>
              <dd data-status={graphEnvironment.status}>
                {graphEnvironment.status}
              </dd>

              <dt>Helper available</dt>
              <dd>{String(graphEnvironment.helperAvailable)}</dd>

              <dt>Windows/WAM supported</dt>
              <dd>{String(graphEnvironment.windowsSupported)}</dd>

              <dt>Client ID configured</dt>
              <dd>{String(graphEnvironment.clientIdConfigured)}</dd>

              <dt>Tenant ID configured</dt>
              <dd>{String(graphEnvironment.tenantIdConfigured)}</dd>

              <dt>.NET runtime</dt>
              <dd>{graphEnvironment.dotnetRuntimeVersion ?? "—"}</dd>

              <dt>MSAL.NET</dt>
              <dd>{graphEnvironment.msalVersion ?? "—"}</dd>

              <dt>WAM broker package</dt>
              <dd>{graphEnvironment.brokerVersion ?? "—"}</dd>
            </dl>

            <h3>Graph helper diagnostics</h3>
            {graphEnvironment.diagnostics.length > 0 ? (
              <ul>
                {graphEnvironment.diagnostics.map((diagnostic) => (
                  <li key={diagnostic}>{diagnostic}</li>
                ))}
              </ul>
            ) : (
              <p>None.</p>
            )}
          </>
        ) : (
          <p>Inspecting the local Graph helper…</p>
        )}
      </section>

      <hr />

      <p>Milestone 1 Windows appointment-store evidence</p>

      <section aria-live="polite">
        <div className="section-heading">
          <div>
            <h2>Windows calendar access</h2>
            <p>
              Read-only access to calendars already available through Windows.
              The seven-day debug snapshot excludes bodies, people, and meeting
              links.
            </p>
          </div>
          <button
            disabled={calendarPending || calendarReport?.apiAvailable === false}
            onClick={() =>
              void runCalendarCommand("request_calendar_read_access")
            }
            type="button"
          >
            {calendarPending ? "Waiting for Windows…" : "Request read-only access"}
          </button>
        </div>

        {calendarError && (
          <p className="error">Calendar diagnostic error: {calendarError}</p>
        )}

        {calendarReport ? (
          <>
            <dl>
              <dt>Access result</dt>
              <dd data-status={calendarReport.accessStatus}>
                {calendarReport.accessStatus}
              </dd>

              <dt>WinRT API available</dt>
              <dd>{String(calendarReport.apiAvailable)}</dd>

              <dt>Package identity present</dt>
              <dd>{String(calendarReport.packageIdentity.present)}</dd>

              <dt>Package full name</dt>
              <dd>{calendarReport.packageIdentity.fullName ?? "—"}</dd>

              <dt>Appointment store returned</dt>
              <dd>{String(calendarReport.storeAvailable)}</dd>
            </dl>

            <h3>Calendar diagnostics</h3>
            {calendarReport.diagnostics.length > 0 ? (
              <ul>
                {calendarReport.diagnostics.map((diagnostic) => (
                  <li key={diagnostic}>{diagnostic}</li>
                ))}
              </ul>
            ) : (
              <p>None.</p>
            )}

            <button
              disabled={calendarPending}
              onClick={() =>
                void runCalendarCommand("get_calendar_access_status")
              }
              type="button"
            >
              Refresh environment diagnostic
            </button>

            <button
              disabled={
                calendarSnapshotPending ||
                calendarReport.accessStatus !== "allowed"
              }
              onClick={() => void refreshCalendarSnapshot()}
              type="button"
            >
              {calendarSnapshotPending
                ? "Reading calendars…"
                : "Refresh seven-day snapshot"}
            </button>
          </>
        ) : (
          <p>Inspecting Windows calendar API availability…</p>
        )}

        {calendarSnapshot && (
          <>
            <h3>Current seven-day calendar snapshot</h3>
            <p>
              Calendars: <strong>{calendarSnapshot.calendars.length}</strong>;
              appointments: <strong>{calendarSnapshot.appointments.length}</strong>;
              captured: <time>{calendarSnapshot.capturedAt}</time>
            </p>
            <p>
              UTC range: <time>{calendarSnapshot.rangeStart}</time> to{" "}
              <time>{calendarSnapshot.rangeEnd}</time>
            </p>

            {calendarSnapshot.calendars.length > 0 ? (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Calendar</th>
                      <th>Source</th>
                      <th>Hidden</th>
                      <th>Calendar ID / diagnostics</th>
                    </tr>
                  </thead>
                  <tbody>
                    {calendarSnapshot.calendars.map((calendar) => (
                      <tr key={calendar.id}>
                        <td>{calendar.displayName}</td>
                        <td>{calendar.sourceDisplayName ?? "—"}</td>
                        <td>{String(calendar.hidden)}</td>
                        <td>
                          {calendar.id}
                          {calendar.diagnostics.length > 0 && (
                            <pre>{JSON.stringify(calendar.diagnostics, null, 2)}</pre>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p>No appointment calendars returned.</p>
            )}

            {calendarSnapshot.appointments.length > 0 ? (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Start / end (UTC)</th>
                      <th>Subject / location</th>
                      <th>State</th>
                      <th>Calendar / appointment ID</th>
                    </tr>
                  </thead>
                  <tbody>
                    {calendarSnapshot.appointments.map((appointment) => (
                      <tr
                        key={`${appointment.calendarId}-${appointment.id}-${appointment.startAt}`}
                      >
                        <td>
                          {appointment.startAt}
                          <small>{appointment.endAt}</small>
                        </td>
                        <td>
                          {appointment.subject ?? "—"}
                          <small>{appointment.location ?? "No location"}</small>
                        </td>
                        <td>
                          {appointment.busyStatus ?? "unknown"}
                          <small>
                            sensitivity: {appointment.sensitivity ?? "unknown"}
                          </small>
                          <small>all day: {String(appointment.allDay)}</small>
                          <small>
                            recurring: {String(appointment.isRecurring)}
                          </small>
                        </td>
                        <td>
                          {appointment.calendarId}
                          <small>{appointment.id}</small>
                          {appointment.diagnostics.length > 0 && (
                            <pre>
                              {JSON.stringify(appointment.diagnostics, null, 2)}
                            </pre>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p>No appointments returned in the current seven-day range.</p>
            )}

            {calendarSnapshot.diagnostics.length > 0 && (
              <>
                <h3>Snapshot diagnostics</h3>
                <ul>
                  {calendarSnapshot.diagnostics.map((diagnostic) => (
                    <li key={diagnostic}>{diagnostic}</li>
                  ))}
                </ul>
              </>
            )}
          </>
        )}
      </section>

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
