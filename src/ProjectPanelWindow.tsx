import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  PROJECT_PANEL_OPEN_EVENT,
  type ProjectPanelOpenPayload,
} from "./event-workspace-model";
import { HubCloseIcon } from "./HubCloseIcon";
import { ManagerView } from "./ManagerView";
import { projectPanelGeometryLabel, writeStoredFloatingGeometry } from "./event-workspace-window";
import { useWidgetPanelStyle } from "./use-widget-panel-style";
import {
  sortActionItems,
  type WorkspaceSnapshot,
  WORKSPACE_CHANGED_EVENT,
} from "./workspace-model";

type ProjectPanelView = "project" | "notes" | "todos" | "todo";

function initialPayload() {
  const params = new URLSearchParams(window.location.search);
  return {
    projectId: params.get("projectId") ?? "",
    itemId: params.get("itemId") ?? "",
    view: (params.get("view") ?? "project") as ProjectPanelView,
  };
}

function TodoDetailView({ itemId }: { itemId: string }) {
  const panelStyle = useWidgetPanelStyle();
  const [snapshot, setSnapshot] = useState<WorkspaceSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    try { setSnapshot(await invoke<WorkspaceSnapshot>("get_workspace_snapshot")); setError(null); }
    catch (cause) { setError(String(cause)); }
  }, []);

  useEffect(() => {
    void refresh();
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void listen(WORKSPACE_CHANGED_EVENT, () => void refresh()).then((next) => { if (disposed) next(); else unlisten = next; });
    return () => { disposed = true; unlisten?.(); };
  }, [refresh]);

  const item = snapshot?.actionItems.find((candidate) => candidate.id === itemId) ?? null;
  const owner = item?.ownerKind === "project"
    ? snapshot?.projects.find((candidate) => candidate.id === item.ownerId)?.name
    : snapshot?.lists.find((candidate) => candidate.id === item?.ownerId)?.name;
  const close = async () => {
    const currentWindow = getCurrentWindow();
    const position = await currentWindow.outerPosition().catch(() => null);
    if (position) writeStoredFloatingGeometry(projectPanelGeometryLabel("todo"), position);
    await currentWindow.close();
  };
  const openNoteUrl = async (url: string) => {
    try { await invoke("open_action_item_note_url", { itemId, url }); setError(null); }
    catch (cause) { setError(String(cause)); }
  };

  return <main className="project-quick-view todo-detail-view" data-view="todo" style={panelStyle}>
    <header onPointerDown={(event) => { if (!(event.target as HTMLElement).closest("button, a")) void getCurrentWindow().startDragging(); }}>
      <div><span>{owner ?? "To-do"}</span><strong>To-do details</strong></div>
      <button aria-label="Close to-do details" className="hub-close-button" onClick={() => void close()} type="button"><HubCloseIcon /></button>
    </header>
    {item ? <section className="todo-detail-view__body">
      <h1 data-completed={item.completedAt !== null || undefined}>{item.title}</h1>
      <dl>
        <div><dt>Status</dt><dd>{item.completedAt ? "Completed" : "Open"}</dd></div>
        <div><dt>Project / list</dt><dd>{owner ?? "Unknown"}</dd></div>
        <div><dt>Due date</dt><dd>{item.dueOn ? new Date(`${item.dueOn}T12:00:00`).toLocaleDateString([], { dateStyle: "medium" }) : "Not set"}</dd></div>
        <div><dt>Reminder</dt><dd>{item.remindAt ? new Date(item.remindAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "Not set"}</dd></div>
        {item.completedAt && <div><dt>Completed</dt><dd>{new Date(item.completedAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</dd></div>}
      </dl>
      <div className="todo-detail-view__notes"><strong>Notes</strong>{item.notes.length
        ? <p>{item.notes.map((segment, index) => segment.href
          ? <button key={`${segment.href}-${index}`} onClick={() => void openNoteUrl(segment.href!)} type="button">{segment.text}</button>
          : <span key={`text-${index}`}>{segment.text}</span>)}</p>
        : <p>No notes.</p>}</div>
    </section> : <p className="project-quick-view__empty">This to-do is no longer available.</p>}
    {error && <p className="project-quick-view__error" role="status">{error}</p>}
  </main>;
}

function ProjectQuickView({ projectId, view }: { projectId: string; view: "notes" | "todos" }) {
  const panelStyle = useWidgetPanelStyle();
  const [snapshot, setSnapshot] = useState<WorkspaceSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setSnapshot(await invoke<WorkspaceSnapshot>("get_workspace_snapshot"));
      setError(null);
    } catch (cause) {
      setError(String(cause));
    }
  }, []);

  useEffect(() => {
    void refresh();
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void listen(WORKSPACE_CHANGED_EVENT, () => void refresh()).then((next) => {
      if (disposed) next();
      else unlisten = next;
    });
    return () => { disposed = true; unlisten?.(); };
  }, [refresh]);

  const project = snapshot?.projects.find((item) => item.id === projectId) ?? null;
  const todos = useMemo(() => sortActionItems(
    snapshot?.actionItems.filter((item) => item.ownerKind === "project" && item.ownerId === projectId && item.completedAt === null) ?? [],
  ), [projectId, snapshot]);

  const completeTodo = async (itemId: string) => {
    try {
      setSnapshot(await invoke<WorkspaceSnapshot>("complete_action_item", { itemId }));
      setError(null);
    } catch (cause) {
      setError(String(cause));
    }
  };

  const openNoteUrl = async (url: string) => {
    try {
      await invoke("open_project_note_url", { projectId, url });
      setError(null);
    } catch (cause) {
      setError(String(cause));
    }
  };

  const close = async () => {
    const currentWindow = getCurrentWindow();
    const position = await currentWindow.outerPosition().catch(() => null);
    if (position) writeStoredFloatingGeometry(projectPanelGeometryLabel(view), position);
    await currentWindow.close();
  };

  return <main className="project-quick-view" data-view={view} style={panelStyle}>
    <header onPointerDown={(event) => { if (!(event.target as HTMLElement).closest("button, a")) void getCurrentWindow().startDragging(); }}>
      <div><span>{project?.name ?? "Project"}</span><strong>{view === "notes" ? "Notes" : "To-dos"}</strong></div>
      <button aria-label="Close project details" className="hub-close-button" onClick={() => void close()} type="button"><HubCloseIcon /></button>
    </header>
    {view === "notes" ? <section className="project-quick-view__notes">
      {project?.notes.length ? <p>{project.notes.map((segment, index) => segment.href
        ? <button key={`${segment.href}-${index}`} onClick={() => void openNoteUrl(segment.href!)} type="button">{segment.text}</button>
        : <span key={`text-${index}`}>{segment.text}</span>)}</p>
        : <p className="project-quick-view__empty">No project notes.</p>}
    </section> : <ol className="project-quick-view__todos">
      {todos.length ? todos.map((item) => <li key={item.id}>
        <button aria-label={`Complete ${item.title}`} onClick={() => void completeTodo(item.id)} type="button">✓</button>
        <div><span>{item.title}</span>{(item.dueOn || item.remindAt) && <small>{[
          item.dueOn ? `Due ${item.dueOn}` : null,
          item.remindAt ? `Reminder ${new Date(item.remindAt).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}` : null,
        ].filter(Boolean).join(" · ")}</small>}</div>
      </li>) : <li className="project-quick-view__empty">No pending to-dos.</li>}
    </ol>}
    {error && <p className="project-quick-view__error" role="status">{error}</p>}
  </main>;
}

export function ProjectPanelWindow() {
  const [payload, setPayload] = useState(initialPayload);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void listen<ProjectPanelOpenPayload>(PROJECT_PANEL_OPEN_EVENT, ({ payload: next }) => {
      setPayload({ projectId: next.projectId, itemId: next.itemId ?? "", view: next.view ?? "project" });
    }).then((next) => { if (disposed) next(); else unlisten = next; });
    return () => { disposed = true; unlisten?.(); };
  }, []);

  if (payload.view === "todo") return <TodoDetailView itemId={payload.itemId}/>;
  return payload.view === "notes" || payload.view === "todos"
    ? <ProjectQuickView key={`${payload.projectId}-${payload.view}`} projectId={payload.projectId} view={payload.view}/>
    : <ManagerView compact key={payload.projectId} projectId={payload.projectId}/>;
}
