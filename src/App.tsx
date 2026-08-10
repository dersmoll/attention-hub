import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
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

interface AttentionSignalSnapshot {
  capturedAt: string;
  signals: AttentionSignal[];
  diagnostics: string[];
}

interface AttentionSignal {
  sourceKey: string;
  displayName: string;
  kind: string;
  count: number | null;
  needsAttention: boolean | null;
  origin: string;
  rawLabel: string | null;
  confidence: string;
  meaning: string;
  diagnostics: string[];
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

function App() {
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
  const [attentionRefreshing, setAttentionRefreshing] = useState(false);
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
    setAttentionRefreshing(true);

    try {
      const nextSnapshot = await invoke<AttentionSignalSnapshot>(
        "get_attention_signal_snapshot",
      );
      setAttentionSnapshot(nextSnapshot);
      setAttentionError(null);
    } catch (error) {
      setAttentionError(String(error));
    } finally {
      setAttentionRefreshing(false);
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
  }, [refreshAttentionSignals]);

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
    <main>
      <h1>Attention Hub</h1>
      <p>Milestone 1 Windows calendar-access diagnostic</p>

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

      <hr />

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
                        <td>{signal.count ?? "not exposed"}</td>
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
    </main>
  );
}

export default App;
