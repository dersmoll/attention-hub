import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { currentMonitor, getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  EVENT_SETTINGS_OPEN_EVENT,
  EVENT_SETTINGS_WINDOW_GEOMETRY,
  EVENT_SETTINGS_WINDOW_LABEL,
  type EventSettingsOpenPayload,
} from "./event-workspace-model";
import { writeStoredFloatingGeometry } from "./event-workspace-window";
import { HubCloseIcon } from "./HubCloseIcon";
import { openManagerWindow } from "./manager-window";
import { useWidgetPanelStyle } from "./use-widget-panel-style";
import { type WorkspaceSnapshot, WORKSPACE_CHANGED_EVENT } from "./workspace-model";

const NEW_PROJECT_VALUE = "__new_project__";
const CUSTOM_LINK_VALUE = "__custom_link__";
const projectDestination = (id: string) => `project:${id}`;
const listDestination = (id: string) => `list:${id}`;

interface EventWorkspaceSnapshot {
  eventToken: string;
  subject: string;
  start: string;
  end: string;
  projectId: string | null;
  listId: string | null;
  projectLinkId: string | null;
  linkUrl: string | null;
  recoveredFromBackup: boolean;
}

function initialEventToken() {
  return new URLSearchParams(window.location.search).get("eventToken");
}

function eventTime(start: string, end: string) {
  const startDate = new Date(start);
  const endDate = new Date(end);
  if (!Number.isFinite(startDate.getTime()) || !Number.isFinite(endDate.getTime())) return "Time unavailable";
  const day = new Intl.DateTimeFormat([], { weekday: "short", month: "short", day: "numeric" });
  const time = new Intl.DateTimeFormat([], { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  return `${day.format(startDate)} · ${time.format(startDate)}–${time.format(endDate)}`;
}

export function EventSettingsView() {
  const panelStyle = useWidgetPanelStyle();
  const requestRef = useRef<string | null>(initialEventToken());
  const shellRef = useRef<HTMLElement>(null);
  const [event, setEvent] = useState<EventWorkspaceSnapshot | null>(null);
  const [workspace, setWorkspace] = useState<WorkspaceSnapshot | null>(null);
  const [destinationValue, setDestinationValue] = useState("");
  const [newProjectName, setNewProjectName] = useState("");
  const [projectLinkValue, setProjectLinkValue] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [pending, setPending] = useState<"load" | "save" | "unlink" | "open" | "destination" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const dirtyRef = useRef(false);

  const load = useCallback(async (eventToken: string, preserveDraft = false) => {
    requestRef.current = eventToken;
    setPending("load");
    setError(null);
    try {
      const [nextEvent, nextWorkspace] = await Promise.all([
        invoke<EventWorkspaceSnapshot>("get_event_workspace", { eventToken }),
        invoke<WorkspaceSnapshot>("get_workspace_snapshot"),
      ]);
      setEvent(nextEvent);
      setWorkspace(nextWorkspace);
      if (!preserveDraft || !dirtyRef.current) {
        setDestinationValue(nextEvent.projectId ? projectDestination(nextEvent.projectId) : nextEvent.listId ? listDestination(nextEvent.listId) : "");
        setNewProjectName("");
        setProjectLinkValue(nextEvent.projectLinkId ?? (nextEvent.linkUrl ? CUSTOM_LINK_VALUE : ""));
        setLinkUrl(nextEvent.linkUrl ?? "");
        dirtyRef.current = false;
      }
      setStatus(nextEvent.projectId || nextEvent.listId || nextEvent.projectLinkId || nextEvent.linkUrl ? "Settings loaded." : "Choose a destination and optionally add a Today link.");
    } catch (cause) { setError(String(cause)); }
    finally { setPending(null); }
  }, []);

  useEffect(() => {
    const token = requestRef.current;
    if (token) void load(token); else setError("No calendar event was selected. Reopen Today and try again.");
  }, [load]);

  useEffect(() => {
    let disposed = false;
    const stops: Array<() => void> = [];
    void Promise.all([
      listen<EventSettingsOpenPayload>(EVENT_SETTINGS_OPEN_EVENT, ({ payload }) => void load(payload.eventToken)),
      listen(WORKSPACE_CHANGED_EVENT, () => { const token = requestRef.current; if (token) void load(token, true); }),
    ]).then((next) => { if (disposed) next.forEach((stop) => stop()); else stops.push(...next); });
    return () => { disposed = true; stops.forEach((stop) => stop()); };
  }, [load]);

  useEffect(() => { if (event) document.title = `Attention Hub - ${event.subject}`; }, [event]);

  useEffect(() => {
    let unlistenMoved: (() => void) | undefined;
    let unlistenResized: (() => void) | undefined;
    const currentWindow = getCurrentWindow();
    void (async () => {
      unlistenMoved = await currentWindow.onMoved(({ payload }) => writeStoredFloatingGeometry(EVENT_SETTINGS_WINDOW_LABEL, payload));
      unlistenResized = await currentWindow.onResized(async ({ payload }) => writeStoredFloatingGeometry(EVENT_SETTINGS_WINDOW_LABEL, payload.toLogical(await currentWindow.scaleFactor())));
    })().catch(() => setError("Window geometry could not be saved."));
    return () => { unlistenMoved?.(); unlistenResized?.(); };
  }, []);

  useEffect(() => {
    if (!event) return;
    const frame = window.requestAnimationFrame(() => {
      if (!shellRef.current) return;
      void (async () => {
        const currentWindow = getCurrentWindow();
        const scaleFactor = await currentWindow.scaleFactor();
        const currentSize = (await currentWindow.innerSize()).toLogical(scaleFactor);
        const monitor = await currentMonitor();
        const maxHeight = monitor ? monitor.workArea.size.toLogical(monitor.scaleFactor).height - 32 : 560;
        const wantedHeight = Math.min(maxHeight, Math.max(EVENT_SETTINGS_WINDOW_GEOMETRY.minHeight, Math.ceil(shellRef.current?.scrollHeight ?? 0)));
        if (wantedHeight > currentSize.height + 1) await currentWindow.setSize(new LogicalSize(currentSize.width, wantedHeight));
      })().catch(() => setError("The event settings panel could not resize automatically. Scroll to reach the remaining controls."));
    });
    return () => window.cancelAnimationFrame(frame);
  }, [event, destinationValue, projectLinkValue]);

  const save = async () => {
    if (!event) return;
    setPending("save");
    setError(null);
    try {
      let projectId = destinationValue.startsWith("project:") ? destinationValue.slice("project:".length) : null;
      const listId = destinationValue.startsWith("list:") ? destinationValue.slice("list:".length) : null;
      if (destinationValue === NEW_PROJECT_VALUE) {
        const next = await invoke<WorkspaceSnapshot>("create_project", { name: newProjectName });
        projectId = next.projects[next.projects.length - 1]?.id ?? null;
      }
      await invoke("save_event_workspace", { eventToken: event.eventToken, input: {
        projectId,
        listId,
        projectLinkId: projectLinkValue && projectLinkValue !== CUSTOM_LINK_VALUE ? projectLinkValue : null,
        linkUrl: projectLinkValue === CUSTOM_LINK_VALUE ? linkUrl.trim() || null : null,
      } });
      dirtyRef.current = false;
      await load(event.eventToken);
      setStatus("Saved locally.");
    } catch (cause) { setError(String(cause)); }
    finally { setPending(null); }
  };

  const unlink = async () => {
    if (!event) return;
    setPending("unlink");
    try {
      await invoke("unlink_event_workspace", { eventToken: event.eventToken });
      dirtyRef.current = false;
      await load(event.eventToken);
      setStatus("Event settings removed. The destination was kept.");
    } catch (cause) { setError(String(cause)); }
    finally { setPending(null); }
  };

  const openLink = async () => {
    if (!event) return;
    setPending("open");
    try { await invoke("open_event_workspace_link_from_workspace", { eventToken: event.eventToken }); setStatus("Opened the saved event link."); }
    catch (cause) { setError(String(cause)); }
    finally { setPending(null); }
  };

  const openDestination = async () => {
    if (!event?.projectId && !event?.listId) return;
    setPending("destination");
    setError(null);
    try {
      await openManagerWindow(
        "projects",
        event.projectId ?? undefined,
        event.listId ?? undefined,
      );
      setStatus("Opened the saved destination in Project Hub.");
    } catch (cause) {
      setError(String(cause));
    } finally {
      setPending(null);
    }
  };

  const markDirty = () => { dirtyRef.current = true; };
  const selectedProjectId = destinationValue.startsWith("project:") ? destinationValue.slice("project:".length) : null;
  const projectLinks = workspace?.links.filter((link) => link.projectId === selectedProjectId) ?? [];
  const uncategorizedLists = workspace?.lists.filter((list) => list.categoryId === null) ?? [];
  const savedDestinationName = event?.projectId
    ? workspace?.projects.find((project) => project.id === event.projectId)?.name
    : event?.listId
      ? workspace?.lists.find((list) => list.id === event.listId)?.name
      : null;
  const hasDraft = destinationValue.length > 0 || projectLinkValue.length > 0 || linkUrl.trim().length > 0;
  const validSelection = (destinationValue !== NEW_PROJECT_VALUE || newProjectName.trim().length > 0)
    && (projectLinkValue !== CUSTOM_LINK_VALUE || linkUrl.trim().length > 0);

  return <main className="event-settings-shell" ref={shellRef} style={panelStyle}>
    <header onPointerDown={(pointerEvent) => { if (!(pointerEvent.target as HTMLElement).closest("button, input, select, a")) void getCurrentWindow().startDragging(); }}>
      <div><span>Event settings</span><h1>{event?.subject ?? "Calendar event"}</h1>{event && <p>{eventTime(event.start, event.end)}</p>}</div>
      <button aria-label="Close event settings" className="hub-close-button" onClick={() => void getCurrentWindow().close()} type="button"><HubCloseIcon /></button>
    </header>
    {pending === "load" && !event ? <p className="event-settings-loading">Loading local settings…</p> : <form onSubmit={(formEvent) => { formEvent.preventDefault(); void save(); }}>
      <label htmlFor="event-destination">Destination</label>
      <select disabled={pending !== null} id="event-destination" onChange={(changeEvent) => { setDestinationValue(changeEvent.target.value); setProjectLinkValue(""); setLinkUrl(""); markDirty(); }} value={destinationValue}>
        <option value="">No destination</option>
        <optgroup label="Projects">
          {workspace?.projects.filter((project) => project.archivedAt === null || project.id === event?.projectId).map((project) => <option key={project.id} value={projectDestination(project.id)}>{project.name}{project.archivedAt ? " (archived)" : ""}</option>)}
          <option value={NEW_PROJECT_VALUE}>+ New project</option>
        </optgroup>
        {uncategorizedLists.length > 0 && <optgroup label="Personal lists · General">{uncategorizedLists.map((list) => <option key={list.id} value={listDestination(list.id)}>{list.name}</option>)}</optgroup>}
        {workspace?.categories.map((category) => {
          const lists = workspace.lists.filter((list) => list.categoryId === category.id);
          return lists.length > 0 ? <optgroup key={category.id} label={`Personal lists · ${category.name}`}>{lists.map((list) => <option key={list.id} value={listDestination(list.id)}>{list.name}</option>)}</optgroup> : null;
        })}
      </select>
      {destinationValue === NEW_PROJECT_VALUE && <><label htmlFor="event-project-name">New project name</label><input autoComplete="off" disabled={pending !== null} id="event-project-name" maxLength={80} onChange={(changeEvent) => { setNewProjectName(changeEvent.target.value); markDirty(); }} value={newProjectName}/></>}
      <label htmlFor="event-project-link">Today link <em>optional</em></label>
      <select disabled={pending !== null} id="event-project-link" onChange={(changeEvent) => { setProjectLinkValue(changeEvent.target.value); if (changeEvent.target.value !== CUSTOM_LINK_VALUE) setLinkUrl(""); markDirty(); }} value={projectLinkValue}>
        <option value="">No Today link</option>
        {projectLinks.map((link) => <option key={link.id} value={link.id}>{link.label} · {link.kind}</option>)}
        <option value={CUSTOM_LINK_VALUE}>Custom link…</option>
      </select>
      {projectLinkValue === CUSTOM_LINK_VALUE && <><label htmlFor="event-link">Custom URL</label><input autoComplete="url" disabled={pending !== null} id="event-link" inputMode="url" onChange={(changeEvent) => { setLinkUrl(changeEvent.target.value); markDirty(); }} placeholder="https://…" type="url" value={linkUrl}/></>}
      <p className="event-settings-help">Projects can reuse Project Hub links. Personal lists can use a custom link. A recurring event shares these settings with future occurrences.</p>
      <div className="event-settings-actions"><button disabled={pending !== null || !hasDraft || !validSelection} type="submit">{pending === "save" ? "Saving…" : "Save"}</button>{(event?.projectId || event?.listId) && <button disabled={pending !== null} onClick={() => void openDestination()} type="button">{pending === "destination" ? "Opening…" : `Open ${savedDestinationName ?? "destination"}`}</button>}{(event?.projectLinkId || event?.linkUrl) && <button disabled={pending !== null} onClick={() => void openLink()} type="button">Open link</button>}{(event?.projectId || event?.listId || event?.projectLinkId || event?.linkUrl) && <button disabled={pending !== null} onClick={() => void unlink()} type="button">Unlink</button>}</div>
    </form>}
    {event?.recoveredFromBackup && <p className="event-settings-recovery">Showing the previous valid local backup.</p>}
    {error && <p className="event-settings-error" role="alert">{error}</p>}
    <p aria-live="polite" className="event-settings-status">{status}</p>
  </main>;
}
