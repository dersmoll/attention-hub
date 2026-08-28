import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";
import {
  EVENT_SETTINGS_OPEN_EVENT,
  EVENT_SETTINGS_WINDOW_GEOMETRY,
  EVENT_SETTINGS_WINDOW_LABEL,
  type EventSettingsOpenPayload,
  type EventWorkspaceInput,
  type EventWorkspaceSnapshot,
} from "./event-workspace-model";
import {
  readStoredFloatingGeometry,
  writeStoredFloatingGeometry,
} from "./event-workspace-window";
import { useWidgetPanelStyle } from "./use-widget-panel-style";
import { HubCloseIcon } from "./HubCloseIcon";

const NEW_PROJECT_VALUE = "__new_project__";

function initialEventToken() {
  return new URLSearchParams(window.location.search).get("eventToken");
}

function eventTime(start: string, end: string) {
  const startDate = new Date(start);
  const endDate = new Date(end);
  if (!Number.isFinite(startDate.getTime()) || !Number.isFinite(endDate.getTime())) {
    return "Time unavailable";
  }
  const day = new Intl.DateTimeFormat([], { weekday: "short", month: "short", day: "numeric" });
  const time = new Intl.DateTimeFormat([], { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  return `${day.format(startDate)} · ${time.format(startDate)}–${time.format(endDate)}`;
}

export function EventSettingsView() {
  const panelStyle = useWidgetPanelStyle();
  const requestRef = useRef<string | null>(initialEventToken());
  const shellRef = useRef<HTMLElement>(null);
  const initialContentSizeAppliedRef = useRef(false);
  const [snapshot, setSnapshot] = useState<EventWorkspaceSnapshot | null>(null);
  const [projectValue, setProjectValue] = useState("");
  const [newProjectName, setNewProjectName] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [pending, setPending] = useState<"load" | "save" | "unlink" | "delete" | "open" | null>(null);
  const [deleteRequested, setDeleteRequested] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const selectedProject = useMemo(
    () => snapshot?.projects.find((project) => project.id === projectValue) ?? null,
    [projectValue, snapshot?.projects],
  );

  const applySnapshot = useCallback((next: EventWorkspaceSnapshot) => {
    setSnapshot(next);
    setProjectValue(next.binding?.projectId ?? "");
    setNewProjectName("");
    setLinkUrl(next.binding?.linkUrl ?? "");
    setDeleteRequested(false);
  }, []);

  const load = useCallback(async (eventToken: string) => {
    requestRef.current = eventToken;
    setPending("load");
    setError(null);
    try {
      const next = await invoke<EventWorkspaceSnapshot>("get_meeting_workspace", { eventToken });
      applySnapshot(next);
      setStatus(next.binding ? "Settings loaded." : "Choose a project, add a link, or both.");
    } catch (cause) {
      setError(String(cause));
    } finally {
      setPending(null);
    }
  }, [applySnapshot]);

  useEffect(() => {
    const eventToken = requestRef.current;
    if (eventToken) {
      void load(eventToken);
    } else {
      setError("No calendar event was selected. Reopen Today and try again.");
    }
  }, [load]);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void listen<EventSettingsOpenPayload>(EVENT_SETTINGS_OPEN_EVENT, ({ payload }) => {
      void load(payload.eventToken);
    }).then((stop) => {
      if (disposed) stop(); else unlisten = stop;
    });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [load]);

  useEffect(() => {
    if (snapshot) document.title = `Attention Hub - ${snapshot.event.subject}`;
  }, [snapshot]);

  useEffect(() => {
    let unlistenMoved: (() => void) | undefined;
    let unlistenResized: (() => void) | undefined;
    let disposed = false;
    const currentWindow = getCurrentWindow();
    void (async () => {
      unlistenMoved = await currentWindow.onMoved(({ payload }) => {
        writeStoredFloatingGeometry(EVENT_SETTINGS_WINDOW_LABEL, payload);
      });
      unlistenResized = await currentWindow.onResized(async ({ payload }) => {
        const scaleFactor = await currentWindow.scaleFactor();
        const logical = payload.toLogical(scaleFactor);
        writeStoredFloatingGeometry(EVENT_SETTINGS_WINDOW_LABEL, logical);
      });
    })().catch(() => {
      if (!disposed) setError("Window geometry could not be saved.");
    });
    return () => {
      disposed = true;
      unlistenMoved?.();
      unlistenResized?.();
    };
  }, []);

  useEffect(() => {
    if (!snapshot || initialContentSizeAppliedRef.current) return;
    const stored = readStoredFloatingGeometry(EVENT_SETTINGS_WINDOW_LABEL);
    if (typeof stored.height === "number") return;
    const frame = window.requestAnimationFrame(() => {
      const shell = shellRef.current;
      if (!shell) return;
      initialContentSizeAppliedRef.current = true;
      void getCurrentWindow().setSize(
        new LogicalSize(
          EVENT_SETTINGS_WINDOW_GEOMETRY.width,
          Math.max(EVENT_SETTINGS_WINDOW_GEOMETRY.minHeight, Math.ceil(shell.scrollHeight)),
        ),
      );
    });
    return () => window.cancelAnimationFrame(frame);
  }, [snapshot]);

  const save = async () => {
    if (!snapshot) return;
    const input: EventWorkspaceInput = {
      projectId: projectValue && projectValue !== NEW_PROJECT_VALUE ? projectValue : null,
      projectName: projectValue === NEW_PROJECT_VALUE ? newProjectName : "",
      linkUrl,
    };
    setPending("save");
    setError(null);
    try {
      const next = await invoke<EventWorkspaceSnapshot>("save_meeting_workspace", {
        eventToken: snapshot.event.eventToken,
        input,
      });
      applySnapshot(next);
      setStatus("Saved locally.");
    } catch (cause) {
      setError(String(cause));
    } finally {
      setPending(null);
    }
  };

  const unlink = async () => {
    if (!snapshot) return;
    setPending("unlink");
    setError(null);
    try {
      const next = await invoke<EventWorkspaceSnapshot>("unlink_meeting_workspace", {
        eventToken: snapshot.event.eventToken,
      });
      applySnapshot(next);
      setStatus("Event settings removed. The project stash was kept.");
    } catch (cause) {
      setError(String(cause));
    } finally {
      setPending(null);
    }
  };

  const deleteProject = async () => {
    if (!snapshot || !selectedProject) return;
    setPending("delete");
    setError(null);
    try {
      const next = await invoke<EventWorkspaceSnapshot>("delete_meeting_project", {
        eventToken: snapshot.event.eventToken,
        projectId: selectedProject.id,
      });
      applySnapshot(next);
      setStatus("Project stash deleted and its event assignments removed.");
    } catch (cause) {
      setError(String(cause));
    } finally {
      setPending(null);
    }
  };

  const openLink = async () => {
    if (!snapshot) return;
    setPending("open");
    try {
      await invoke("open_event_workspace_link", { eventToken: snapshot.event.eventToken });
      setStatus("Opened the saved event link.");
    } catch (cause) {
      setError(String(cause));
    } finally {
      setPending(null);
    }
  };

  const validSelection = projectValue !== NEW_PROJECT_VALUE || newProjectName.trim().length > 0;
  const hasDraft = projectValue.length > 0 || linkUrl.trim().length > 0;

  return (
    <main className="event-settings-shell" ref={shellRef} style={panelStyle}>
      <header
        onPointerDown={(event) => {
          if ((event.target as HTMLElement).closest("button, input, select, a")) return;
          void getCurrentWindow().startDragging();
        }}
      >
        <div>
          <span>Event settings</span>
          <h1>{snapshot?.event.subject ?? "Calendar event"}</h1>
          {snapshot && <p>{eventTime(snapshot.event.start, snapshot.event.end)}</p>}
        </div>
        <button aria-label="Close event settings" className="hub-close-button" onClick={() => void getCurrentWindow().close()} type="button"><HubCloseIcon /></button>
      </header>
      {pending === "load" && !snapshot ? <p className="event-settings-loading">Loading local settings…</p> : (
        <form onSubmit={(event) => { event.preventDefault(); void save(); }}>
          <label htmlFor="event-project">Project stash</label>
          <select disabled={pending !== null} id="event-project" onChange={(event) => { setProjectValue(event.target.value); setDeleteRequested(false); }} value={projectValue}>
            <option value="">No project stash</option>
            {snapshot?.projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
            <option value={NEW_PROJECT_VALUE}>+ New project stash</option>
          </select>
          {projectValue === NEW_PROJECT_VALUE && <>
            <label htmlFor="event-project-name">New project name</label>
            <input autoComplete="off" disabled={pending !== null} id="event-project-name" maxLength={80} onChange={(event) => setNewProjectName(event.target.value)} value={newProjectName} />
          </>}
          <label htmlFor="event-link">Event link <em>optional</em></label>
          <input autoComplete="url" disabled={pending !== null} id="event-link" inputMode="url" onChange={(event) => setLinkUrl(event.target.value)} placeholder="https://…" type="url" value={linkUrl} />
          <p className="event-settings-help">A recurring event shares these settings with its future occurrences. A one-off event keeps its own link.</p>
          <div className="event-settings-actions">
            <button disabled={pending !== null || !hasDraft || !validSelection} type="submit">{pending === "save" ? "Saving…" : "Save"}</button>
            {snapshot?.binding?.linkUrl && <button disabled={pending !== null} onClick={() => void openLink()} type="button">Open link</button>}
            {snapshot?.binding && <button disabled={pending !== null} onClick={() => void unlink()} type="button">Unlink</button>}
          </div>
          {selectedProject && <div className="event-settings-delete">
            {deleteRequested ? <>
              <span>Delete {selectedProject.name} and its assignments?</span>
              <button disabled={pending !== null} onClick={() => void deleteProject()} type="button">Delete</button>
              <button disabled={pending !== null} onClick={() => setDeleteRequested(false)} type="button">Keep</button>
            </> : <button disabled={pending !== null} onClick={() => setDeleteRequested(true)} type="button">Delete project stash…</button>}
          </div>}
        </form>
      )}
      {error && <p className="event-settings-error" role="alert">{error}</p>}
      <p aria-live="polite" className="event-settings-status">{status}</p>
    </main>
  );
}
