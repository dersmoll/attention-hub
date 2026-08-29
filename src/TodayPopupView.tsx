import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { emitTo, listen } from "@tauri-apps/api/event";
import {
  LogicalSize,
  availableMonitors,
  getCurrentWindow,
} from "@tauri-apps/api/window";
import {
  openEventSettingsWindow,
  openProjectStashWindow,
} from "./event-workspace-window";
import type { PopupAnchor } from "./event-workspace-model";
import {
  TODAY_POPUP_CLOSED_EVENT,
  TODAY_POPUP_OPEN_EVENT,
  TODAY_POPUP_READY_EVENT,
  type TodayPopupPayload,
} from "./today-popup-model";
import type { WorkCalendarDaySelection } from "./work-calendar-model";
import { todayPopupPosition } from "./today-popup-window";
import { useWidgetPanelStyle } from "./use-widget-panel-style";
import { HubCloseIcon } from "./HubCloseIcon";

function formatTime(value: string, timeZone: string) {
  return new Intl.DateTimeFormat([], {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone,
  }).format(new Date(value));
}

async function currentPopupAnchor(): Promise<PopupAnchor | null> {
  const currentWindow = getCurrentWindow();
  const [position, size, scaleFactor, monitors] = await Promise.all([
    currentWindow.outerPosition(),
    currentWindow.outerSize(),
    currentWindow.scaleFactor(),
    availableMonitors(),
  ]);
  const monitor = monitors.find(
    ({ workArea }) =>
      position.x >= workArea.position.x &&
      position.x < workArea.position.x + workArea.size.width &&
      position.y >= workArea.position.y &&
      position.y < workArea.position.y + workArea.size.height,
  );
  if (!monitor) return null;
  return {
    left: position.x,
    top: position.y,
    right: position.x + size.width,
    bottom: position.y + size.height,
    scaleFactor,
    monitorLeft: monitor.workArea.position.x,
    monitorTop: monitor.workArea.position.y,
    monitorRight: monitor.workArea.position.x + monitor.workArea.size.width,
    monitorBottom: monitor.workArea.position.y + monitor.workArea.size.height,
  };
}

export function TodayPopupView() {
  const panelStyle = useWidgetPanelStyle();
  const [payload, setPayload] = useState<TodayPopupPayload | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void listen<TodayPopupPayload>(TODAY_POPUP_OPEN_EVENT, ({ payload: next }) => {
      if (disposed) return;
      setPayload(next);
      setError(null);
      const currentWindow = getCurrentWindow();
      void currentWindow
        .setSize(new LogicalSize(next.width, next.height))
        .then(() => currentWindow.setPosition(todayPopupPosition(next)))
        .then(() => currentWindow.show())
        .then(() => currentWindow.setFocus());
    }).then((stop) => {
      if (disposed) stop(); else unlisten = stop;
      if (!disposed) void emitTo("main", TODAY_POPUP_READY_EVENT);
    });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  const close = async () => {
    await emitTo("main", TODAY_POPUP_CLOSED_EVENT).catch(() => undefined);
    await getCurrentWindow().close();
  };

  const openEventSettings = async (selection: WorkCalendarDaySelection) => {
    if (!selection.eventToken) return;
    const anchor = await currentPopupAnchor();
    if (!anchor) {
      setError("Event settings could not be positioned.");
      return;
    }
    await openEventSettingsWindow(
      { eventToken: selection.eventToken, anchor },
      (message) => setError(message),
    );
  };

  const openProjectStash = async (selection: WorkCalendarDaySelection) => {
    const projectId = selection.eventWorkspace?.projectId;
    if (!projectId) return;
    const anchor = await currentPopupAnchor();
    if (!anchor) {
      setError("Project stash could not be positioned.");
      return;
    }
    await openProjectStashWindow(
      { projectId, anchor },
      (message) => setError(message),
    );
  };

  const openEventLink = async (selection: WorkCalendarDaySelection) => {
    if (!selection.eventToken) return;
    try {
      await invoke("open_event_workspace_link", {
        eventToken: selection.eventToken,
      });
      setError(null);
    } catch {
      setError("The saved event link could not be opened.");
    }
  };

  if (!payload) return null;

  return (
    <main className="today-popup-shell widget-calendar-day-panel" style={panelStyle}>
      <header>
        <div>
          <strong>Today</strong>
          <span>
            {payload.selections.length} event
            {payload.selections.length === 1 ? "" : "s"} · {Math.floor(
              payload.occupiedMinutes / 60,
            )}
            h {payload.occupiedMinutes % 60}m in timed meetings
          </span>
        </div>
        <button aria-label="Close today's meeting summary" className="hub-close-button" onClick={() => void close()} type="button">
          <HubCloseIcon />
        </button>
      </header>
      <ol>
        {payload.selections.length === 0 ? (
          <li className="widget-calendar-day-panel__empty">
            No meetings today.
          </li>
        ) : payload.selections.map((selection, index) => {
          const startMs = Date.parse(selection.start);
          const endMs = Date.parse(selection.end);
          const finished = Number.isFinite(endMs) && endMs <= now.getTime();
          const live =
            !selection.cancelled &&
            !finished &&
            Number.isFinite(startMs) &&
            Number.isFinite(endMs) &&
            startMs <= now.getTime() &&
            now.getTime() < endMs;
          return (
            <li
              data-cancelled={selection.cancelled || undefined}
              data-event-workspace={selection.eventWorkspace ? "linked" : undefined}
              data-finished={finished || undefined}
              data-live={live || undefined}
              key={selection.eventToken ?? `${selection.start}|${selection.end}|${index}`}
            >
              <time>
                {selection.allDay
                  ? "All day"
                  : `${formatTime(selection.start, payload.systemTimeZone)}–${formatTime(
                      selection.end,
                      payload.systemTimeZone,
                    )}`}
              </time>
              <span className="widget-calendar-day-panel__subject" title={selection.subject}>
                {finished && <span className="sr-only">Finished: </span>}
                {selection.cancelled && <span className="sr-only">Cancelled: </span>}
                {live && <span className="sr-only">Live now: </span>}
                {selection.subject}
              </span>
              {selection.eventToken && !selection.cancelled && (
                <span className="widget-calendar-day-panel__actions">
                  {selection.eventWorkspace?.linkUrlPresent && (
                    <button
                      aria-label={`Open saved link for ${selection.subject}`}
                      className="widget-calendar-day-panel__link"
                      onClick={() => void openEventLink(selection)}
                      title={selection.eventWorkspace.linkUrl ?? "Open saved event link"}
                      type="button"
                    >
                      <svg aria-hidden="true" viewBox="0 0 24 24">
                        <path d="M14 5h5v5M19 5l-9 9M10 6H6a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1v-4" />
                      </svg>
                    </button>
                  )}
                  {selection.eventWorkspace?.projectId && (
                    <button
                      aria-label={`Open ${selection.eventWorkspace.projectName ?? "project"} stash`}
                      className="widget-calendar-day-panel__stash"
                      onClick={() => void openProjectStash(selection)}
                      title={`Open ${selection.eventWorkspace.projectName ?? "project"} stash`}
                      type="button"
                    >
                      <svg aria-hidden="true" viewBox="0 0 24 24">
                        <path d="M5 5h14v14H5zM8 9h8M8 13h6" />
                      </svg>
                    </button>
                  )}
                  <button
                    aria-label={`Open settings for ${selection.subject}`}
                    className="widget-calendar-day-panel__settings"
                    onClick={() => void openEventSettings(selection)}
                    title="Event settings"
                    type="button"
                  >
                    <svg aria-hidden="true" viewBox="0 0 24 24">
                      <circle cx="6" cy="12" r="1.2" fill="currentColor" stroke="none" />
                      <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" />
                      <circle cx="18" cy="12" r="1.2" fill="currentColor" stroke="none" />
                    </svg>
                  </button>
                </span>
              )}
            </li>
          );
        })}
      </ol>
      {error && <p className="today-popup-shell__error" role="status">{error}</p>}
    </main>
  );
}
