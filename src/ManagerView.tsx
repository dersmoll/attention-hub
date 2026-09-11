import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { linkifyPlainText } from "./rich-notes";
import { writeStoredFloatingGeometry } from "./event-workspace-window";
import { ActionIcon } from "./ActionIcon";
import { HubCloseIcon } from "./HubCloseIcon";
import { MANAGER_FOCUS_EVENT, MANAGER_WINDOW_LABEL, openManagerWindow } from "./manager-window";
import { useWidgetPanelStyle } from "./use-widget-panel-style";
import {
  isActionable,
  isDueToday,
  hasUnsavedNoteChanges,
  isUnscheduled,
  isReminderToday,
  needsAttention,
  sortActionItems,
  type ActionItem,
  type ActionItemOwnerKind,
  type DeleteImpact,
  type ProjectLink,
  type ProjectLinkKind,
  type WorkspaceSnapshot,
  WORKSPACE_CHANGED_EVENT,
} from "./workspace-model";

type SelectedOwner = { kind: ActionItemOwnerKind; id: string } | null;
type ProjectTab = "notes" | "links" | "todos";
type ManagerSection = "projects" | "all-todos";


interface TodoDraft {
  id: string | null;
  title: string;
  notes: string;
  dueOn: string;
  reminderDate: string;
  reminderTime: string;
}

const EMPTY_TODO: TodoDraft = {
  id: null,
  title: "",
  notes: "",
  dueOn: "",
  reminderDate: "",
  reminderTime: "",
};

function reminderParts(value: string | null) {
  if (!value) return { reminderDate: "", reminderTime: "" };
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return { reminderDate: "", reminderTime: "" };
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString();
  return { reminderDate: local.slice(0, 10), reminderTime: local.slice(11, 16) };
}

function formatDueDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  const localDate = new Date(year, month - 1, day);
  return Number.isFinite(localDate.getTime())
    ? localDate.toLocaleDateString([], { dateStyle: "medium" })
    : value;
}

function todoDraft(item: ActionItem): TodoDraft {
  return {
    id: item.id,
    title: item.title,
    notes: item.notes.map((segment) => segment.text).join(""),
    dueOn: item.dueOn ?? "",
    ...reminderParts(item.remindAt),
  };
}

function impactSummary(impact: DeleteImpact) {
  const labels: Array<[keyof DeleteImpact["counts"], string]> = [
    ["categories", "category"], ["projects", "project"], ["lists", "list"], ["links", "link"],
    ["actionItems", "to-do"], ["bindings", "calendar binding"],
  ];
  const affected = labels.flatMap(([key, label]) => {
    const count = impact.counts[key];
    return count ? [`${count} ${label}${count === 1 ? "" : "s"}`] : [];
  });
  return affected.length ? affected.join(", ") : "this item";
}

export function ManagerView({ projectId = null, compact = false }: { projectId?: string | null; compact?: boolean }) {
  const panelStyle = useWidgetPanelStyle();
  const initialParams = new URLSearchParams(window.location.search);
  const initialProjectId = projectId ?? initialParams.get("projectId");
  const initialListId = compact ? null : initialParams.get("listId");
  const initialOwner: SelectedOwner = initialProjectId ? { kind: "project", id: initialProjectId } : initialListId ? { kind: "list", id: initialListId } : null;
  const initialFocus = initialParams.get("focus") === "todos" ? "todos" : "projects";
  const [snapshot, setSnapshot] = useState<WorkspaceSnapshot | null>(null);
  const [selected, setSelected] = useState<SelectedOwner>(initialOwner);
  const [managerSection, setManagerSection] = useState<ManagerSection>(initialOwner || initialFocus === "projects" ? "projects" : "all-todos");
  const [tab, setTab] = useState<ProjectTab>(compact ? "notes" : "todos");
  const [newProject, setNewProject] = useState("");
  const [newList, setNewList] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [newListCategoryId, setNewListCategoryId] = useState("");
  const [noteText, setNoteText] = useState("");
  const [noteProjectId, setNoteProjectId] = useState<string | null>(null);
  const [noteBaseline, setNoteBaseline] = useState<number | null>(null);
  const [noteDirty, setNoteDirty] = useState(false);
  const [noteConflict, setNoteConflict] = useState(false);
  const [todo, setTodo] = useState<TodoDraft>(EMPTY_TODO);
  const [todoOwner, setTodoOwner] = useState<SelectedOwner>(initialOwner);
  const [todoExpanded, setTodoExpanded] = useState(false);
  const [todoFilter, setTodoFilter] = useState<"all" | "unscheduled">("all");
  const [linkLabel, setLinkLabel] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [linkKind, setLinkKind] = useState<ProjectLinkKind>("other");
  const [editingLinkId, setEditingLinkId] = useState<string | null>(null);
  const [pendingRowDelete, setPendingRowDelete] = useState<{ kind: "link" | "todo"; id: string } | null>(null);
  const [expandedTodoNotesId, setExpandedTodoNotesId] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [deleteImpact, setDeleteImpact] = useState<DeleteImpact | null>(null);
  const [categoryDeleteImpact, setCategoryDeleteImpact] = useState<DeleteImpact | null>(null);
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [categoryName, setCategoryName] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [sidebarCreate, setSidebarCreate] = useState<"project" | "list" | "category" | null>(null);
  const [collapsedCategories, setCollapsedCategories] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const noteTextRef = useRef("");
  const focusRef = useRef<"projects" | "todos">(initialFocus);

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

  useEffect(() => {
    if (compact) return;
    const currentWindow = getCurrentWindow();
    const windowLabel = MANAGER_WINDOW_LABEL;
    let unlistenMoved: (() => void) | undefined;
    let unlistenResized: (() => void) | undefined;
    void (async () => {
      unlistenMoved = await currentWindow.onMoved(({ payload }) => writeStoredFloatingGeometry(windowLabel, payload));
      unlistenResized = await currentWindow.onResized(async ({ payload }) => writeStoredFloatingGeometry(windowLabel, payload.toLogical(await currentWindow.scaleFactor())));
    })().catch(() => setError("Window geometry could not be saved."));
    return () => { unlistenMoved?.(); unlistenResized?.(); };
  }, [compact]);

  const projects = useMemo(
    () => [...(snapshot?.projects ?? [])].filter((item) => item.archivedAt === null).sort((a, b) => a.sortIndex - b.sortIndex),
    [snapshot],
  );
  const archivedProjects = useMemo(
    () => [...(snapshot?.projects ?? [])].filter((item) => item.archivedAt !== null).sort((a, b) => a.name.localeCompare(b.name)),
    [snapshot],
  );
  const personalLists = useMemo(
    () => [...(snapshot?.lists ?? [])].sort((a, b) => a.sortIndex - b.sortIndex),
    [snapshot],
  );
  const personalCategories = useMemo(
    () => [...(snapshot?.categories ?? [])].sort((a, b) => a.sortIndex - b.sortIndex),
    [snapshot],
  );
  const owner = selected?.kind === "project"
    ? snapshot?.projects.find((item) => item.id === selected.id)
    : snapshot?.lists.find((item) => item.id === selected?.id);
  const project = selected?.kind === "project"
    ? snapshot?.projects.find((item) => item.id === selected.id) ?? null
    : null;
  const ownerTodos = useMemo(
    () => selected && snapshot
      ? sortActionItems(snapshot.actionItems.filter((item) => item.ownerKind === selected.kind && item.ownerId === selected.id))
      : [],
    [selected, snapshot],
  );
  const links = project && snapshot
    ? snapshot.links.filter((item) => item.projectId === project.id).sort((a, b) => a.sortIndex - b.sortIndex)
    : [];
  const unscheduledCount = ownerTodos.filter(isUnscheduled).length;
  const visibleOwnerTodos = todoFilter === "unscheduled" ? ownerTodos.filter(isUnscheduled) : ownerTodos;
  const allTodos = useMemo(
    () => sortActionItems(snapshot?.actionItems ?? []),
    [snapshot],
  );
  const visibleAllTodos = todoFilter === "unscheduled" ? allTodos.filter(isUnscheduled) : allTodos;
  const allUnscheduledCount = allTodos.filter(isUnscheduled).length;

  const ownerLabel = (item: ActionItem) => {
    if (!snapshot) return "Unknown";
    if (item.ownerKind === "project") {
      const match = snapshot.projects.find((candidate) => candidate.id === item.ownerId);
      return match ? `${match.name}${match.archivedAt ? " · Archived" : ""}` : "Unknown project";
    }
    const match = snapshot.lists.find((candidate) => candidate.id === item.ownerId);
    return match ? `Personal · ${match.name}` : "Unknown list";
  };

  const applyManagerFocus = useCallback((focus: "projects" | "todos", requestedProjectId?: string, requestedListId?: string) => {
    focusRef.current = focus;
    if (!snapshot) return;
    if (focus === "projects") {
      setManagerSection("projects");
      const requested = requestedProjectId && snapshot.projects.find((item) => item.id === requestedProjectId);
      if (requested) { setSelected({ kind: "project", id: requested.id }); setTab("notes"); return; }
      const requestedList = requestedListId && snapshot.lists.find((item) => item.id === requestedListId);
      if (requestedList) { setSelected({ kind: "list", id: requestedList.id }); setTab("todos"); return; }
      const first = snapshot.projects.find((item) => item.archivedAt === null);
      if (first) { setSelected({ kind: "project", id: first.id }); setTab("notes"); }
      return;
    }
    setManagerSection("all-todos");
    setTodoFilter("all");
  }, [snapshot]);

  useEffect(() => {
    if (compact || !snapshot || (selected && owner)) return;
    applyManagerFocus(focusRef.current);
  }, [applyManagerFocus, compact, owner, selected, snapshot]);

  useEffect(() => {
    if (compact) return;
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void listen<{ focus: "projects" | "todos"; projectId?: string; listId?: string }>(MANAGER_FOCUS_EVENT, ({ payload }) => applyManagerFocus(payload.focus, payload.projectId, payload.listId)).then((next) => { if (disposed) next(); else unlisten = next; });
    return () => { disposed = true; unlisten?.(); };
  }, [applyManagerFocus, compact]);

  useEffect(() => {
    setTodo(EMPTY_TODO);
    setTodoOwner(selected);
    setTodoExpanded(false);
    setTodoFilter("all");
    setEditingLinkId(null);
    setLinkLabel("");
    setLinkUrl("");
    setLinkKind("other");
    setPendingRowDelete(null);
    setExpandedTodoNotesId(null);
    setRenaming(false);
    setDeleteImpact(null);
  }, [selected]);

  useEffect(() => {
    if (selected?.kind !== "project") {
      setNoteProjectId(null);
      setNoteBaseline(null);
      setNoteDirty(false);
      setNoteConflict(false);
      return;
    }
    const selectedProject = snapshot?.projects.find((item) => item.id === selected.id);
    if (!selectedProject) return;
    if (noteProjectId !== selectedProject.id || !noteDirty) {
      setNoteText(selectedProject.notes.map((segment) => segment.text).join(""));
      noteTextRef.current = selectedProject.notes.map((segment) => segment.text).join("");
      setNoteProjectId(selectedProject.id);
      setNoteBaseline(selectedProject.notesRevision);
      setNoteDirty(false);
      setNoteConflict(false);
    } else if (noteBaseline !== selectedProject.notesRevision) {
      setNoteConflict(true);
    }
  }, [noteBaseline, noteDirty, noteProjectId, selected, snapshot]);

  const runMutation = async (command: string, args: Record<string, unknown>) => {
    try {
      const next = await invoke<WorkspaceSnapshot>(command, args);
      setSnapshot(next);
      setError(null);
      return next;
    } catch (cause) {
      setError(String(cause));
      return null;
    }
  };

  const swapOrder = async (
    command: string,
    idKey: string,
    items: Array<{ id: string; sortIndex: number }>,
    index: number,
    direction: -1 | 1,
  ) => {
    const other = items[index + direction];
    const current = items[index];
    if (!current || !other) return;
    try {
      await invoke<WorkspaceSnapshot>(command, { [idKey]: current.id, sortIndex: other.sortIndex });
      const next = await invoke<WorkspaceSnapshot>(command, { [idKey]: other.id, sortIndex: current.sortIndex });
      setSnapshot(next);
      setError(null);
    } catch (cause) { setError(String(cause)); }
  };

  const createOwner = async (kind: ActionItemOwnerKind) => {
    const value = kind === "project" ? newProject : newList;
    if (!value.trim()) return;
    const next = await runMutation(
      kind === "project" ? "create_project" : "create_list",
      kind === "project" ? { name: value } : { categoryId: newListCategoryId || null, name: value },
    );
    if (!next) return;
    const created = kind === "project" ? next.projects[next.projects.length - 1] : next.lists[next.lists.length - 1];
    if (created) setSelected({ kind, id: created.id });
    if (kind === "project") setNewProject(""); else setNewList("");
    setSidebarCreate(null);
  };

  const createCategory = async () => {
    if (!newCategory.trim()) return;
    const next = await runMutation("create_personal_category", { name: newCategory });
    if (next) { setNewCategory(""); setSidebarCreate(null); }
  };

  const renameCategory = async () => {
    if (!editingCategoryId || !categoryName.trim()) return;
    const next = await runMutation("rename_personal_category", { categoryId: editingCategoryId, name: categoryName });
    if (next) { setEditingCategoryId(null); setCategoryName(""); }
  };

  const prepareCategoryDelete = async (categoryId: string) => {
    try {
      setCategoryDeleteImpact(await invoke<DeleteImpact>("get_delete_impact", { entity: "category", id: categoryId }));
      setError(null);
    } catch (cause) { setError(String(cause)); }
  };

  const confirmCategoryDelete = async () => {
    if (!categoryDeleteImpact?.id) return;
    try {
      const next = await invoke<WorkspaceSnapshot>("delete_personal_category", { categoryId: categoryDeleteImpact.id, expectedRevision: categoryDeleteImpact.workspaceRevision });
      setSnapshot(next);
      setCategoryDeleteImpact(null);
      setError(null);
    } catch (cause) {
      await prepareCategoryDelete(categoryDeleteImpact.id);
      setError(String(cause));
    }
  };

  const saveTodo = async () => {
    const targetOwner = todoOwner ?? selected;
    if (!targetOwner || !todo.title.trim()) return;
    if ((todo.reminderDate && !todo.reminderTime) || (!todo.reminderDate && todo.reminderTime)) {
      setError("Choose both a reminder date and time, or clear both fields.");
      return;
    }
    const remindAt = todo.reminderDate
      ? new Date(`${todo.reminderDate}T${todo.reminderTime}:00`).toISOString()
      : null;
    const input = {
      ownerKind: targetOwner.kind,
      ownerId: targetOwner.id,
      title: todo.title,
      notes: linkifyPlainText(todo.notes),
      dueOn: todo.dueOn || null,
      remindAt,
    };
    const next = await runMutation(todo.id ? "update_action_item" : "create_action_item", todo.id ? { itemId: todo.id, input } : { input });
    if (next) { setTodo(EMPTY_TODO); setTodoExpanded(false); }
  };

  const toggleTodo = async (id: string, completed: boolean) => {
    await runMutation(completed ? "restore_action_item" : "complete_action_item", { itemId: id });
  };

  const saveNotes = async (expected = noteBaseline) => {
    if (!project || expected === null || !noteDirty) return;
    const projectId = project.id;
    const sentText = noteTextRef.current;
    try {
      const next = await invoke<WorkspaceSnapshot>("save_project_notes", {
        projectId,
        expectedNotesRevision: expected,
        notes: linkifyPlainText(sentText),
      });
      setSnapshot(next);
      const saved = next.projects.find((item) => item.id === projectId);
      if (!saved) return;
      setNoteBaseline(saved.notesRevision);
      setNoteDirty(hasUnsavedNoteChanges(noteTextRef.current, sentText));
      setNoteConflict(false);
      setError(null);
    } catch (cause) {
      setNoteConflict(true);
      setError(String(cause));
    }
  };

  useEffect(() => {
    if (!noteDirty || noteConflict || !project) return;
    const timer = window.setTimeout(() => void saveNotes(), 850);
    return () => window.clearTimeout(timer);
  }, [noteConflict, noteDirty, noteText, project]);

  const loadTheirNotes = () => {
    if (!project) return;
    const value = project.notes.map((segment) => segment.text).join("");
    setNoteText(value);
    noteTextRef.current = value;
    setNoteBaseline(project.notesRevision);
    setNoteDirty(false);
    setNoteConflict(false);
    setError(null);
  };

  const saveLink = async () => {
    if (!project || !linkLabel.trim() || !linkUrl.trim()) return;
    const input = { label: linkLabel, url: linkUrl, kind: linkKind };
    const next = await runMutation(editingLinkId ? "update_project_link" : "create_project_link", editingLinkId ? { linkId: editingLinkId, input } : { projectId: project.id, input });
    if (next) { setEditingLinkId(null); setLinkLabel(""); setLinkUrl(""); setLinkKind("other"); }
  };

  const beginLinkEdit = (link: ProjectLink) => {
    setEditingLinkId(link.id);
    setLinkLabel(link.label);
    setLinkUrl(link.url);
    setLinkKind(link.kind);
  };

  const renameOwner = async () => {
    if (!selected || !renameValue.trim()) return;
    const next = await runMutation(selected.kind === "project" ? "rename_project" : "rename_list", selected.kind === "project" ? { projectId: selected.id, name: renameValue } : { listId: selected.id, name: renameValue });
    if (next) setRenaming(false);
  };

  const archiveProject = async () => {
    if (!project) return;
    const archived = project.archivedAt === null;
    const next = await runMutation("set_project_archived", { projectId: project.id, archived });
    if (next && archived) setSelected(null);
  };

  const prepareDelete = async () => {
    if (!selected) return;
    try {
      setDeleteImpact(await invoke<DeleteImpact>("get_delete_impact", { entity: selected.kind, id: selected.id }));
      setError(null);
    } catch (cause) { setError(String(cause)); }
  };

  const confirmDelete = async () => {
    if (!selected || !deleteImpact) return;
    try {
      const next = await invoke<WorkspaceSnapshot>(selected.kind === "project" ? "delete_project" : "delete_list", selected.kind === "project"
        ? { projectId: selected.id, expectedRevision: deleteImpact.workspaceRevision }
        : { listId: selected.id, expectedRevision: deleteImpact.workspaceRevision });
      setSnapshot(next);
      setDeleteImpact(null);
      setSelected(null);
      setError(null);
    } catch (cause) {
      await prepareDelete();
      setError(String(cause));
    }
  };

  const ownerRow = (kind: ActionItemOwnerKind, id: string, name: string, archived = false) => {
    const todos = snapshot?.actionItems.filter((item) => item.ownerKind === kind && item.ownerId === id && item.completedAt === null) ?? [];
    return <button
      aria-label={`${name}, ${archived ? "archived" : `${todos.length} pending to-dos`}`}
      aria-current={selected?.kind === kind && selected.id === id ? "page" : undefined}
      className="manager-item"
      data-archived={archived || undefined}
      data-attention={todos.some((item) => needsAttention(item, new Date())) || undefined}
      data-due={todos.some((item) => isDueToday(item, new Date()) || isReminderToday(item, new Date())) || undefined}
      key={id}
      onClick={() => { setSelected({ kind, id }); setTab("todos"); }}
      type="button"
    ><span>{name}</span><small>{archived ? "Archived" : todos.length}</small></button>;
  };

  const selectedOrder = selected?.kind === "project"
    ? projects
    : selected?.kind === "list"
      ? personalLists.filter((item) => item.categoryId === snapshot?.lists.find((list) => list.id === selected.id)?.categoryId)
      : [];
  const selectedOrderIndex = selected ? selectedOrder.findIndex((item) => item.id === selected.id) : -1;

  const resetTodoDraft = () => {
    setTodo(EMPTY_TODO);
    setTodoOwner(selected);
    setTodoExpanded(false);
  };

  const todoDetails = (allowOwnerChange: boolean) => <div className="manager-todo-editor__details">
    {allowOwnerChange && <label>Move to<select onChange={(event) => { const [kind, id] = event.target.value.split(":", 2); setTodoOwner({ kind: kind as ActionItemOwnerKind, id }); }} value={todoOwner ? `${todoOwner.kind}:${todoOwner.id}` : ""}>{snapshot?.projects.map((item) => <option key={item.id} value={`project:${item.id}`}>{item.name}{item.archivedAt ? " (archived)" : ""}</option>)}{personalLists.map((item) => <option key={item.id} value={`list:${item.id}`}>Personal · {item.name}</option>)}</select></label>}
    <label className="manager-todo-editor__due">Due date<input onChange={(event) => setTodo((value) => ({ ...value, dueOn: event.target.value }))} type="date" value={todo.dueOn}/></label>
    <fieldset className="manager-todo-editor__reminder"><legend>Reminder</legend><input aria-label="Reminder date" onChange={(event) => setTodo((value) => ({ ...value, reminderDate: event.target.value }))} type="date" value={todo.reminderDate}/><input aria-label="Reminder time" onChange={(event) => setTodo((value) => ({ ...value, reminderTime: event.target.value }))} type="time" value={todo.reminderTime}/></fieldset>
    <label className="manager-todo-editor__notes">Notes<textarea onChange={(event) => setTodo((value) => ({ ...value, notes: event.target.value }))} placeholder="Optional notes and links" value={todo.notes}/></label>
  </div>;

  const moveTabFocus = (current: ProjectTab, direction: -1 | 1) => {
    const tabs: ProjectTab[] = ["notes", "links", "todos"];
    const index = tabs.indexOf(current);
    const next = tabs[(index + direction + tabs.length) % tabs.length];
    setTab(next);
    window.requestAnimationFrame(() => document.getElementById(`manager-tab-${next}`)?.focus());
  };

  const moveManagerTabFocus = (current: ManagerSection) => {
    const next = current === "projects" ? "all-todos" : "projects";
    applyManagerFocus(next === "projects" ? "projects" : "todos");
    window.requestAnimationFrame(() => document.getElementById(`manager-main-tab-${next}`)?.focus());
  };

  return <main className="manager-shell" data-compact={compact || undefined} style={panelStyle}>
    {!compact && <div aria-label="Project Hub sections" className="manager-primary-tabs" role="tablist">
      <button aria-controls="manager-projects-section" aria-selected={managerSection === "projects"} id="manager-main-tab-projects" onClick={() => applyManagerFocus("projects")} onKeyDown={(event) => { if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); moveManagerTabFocus("projects"); } }} role="tab" tabIndex={managerSection === "projects" ? 0 : -1} type="button">Projects</button>
      <button aria-controls="manager-all-todos-section" aria-selected={managerSection === "all-todos"} id="manager-main-tab-all-todos" onClick={() => applyManagerFocus("todos")} onKeyDown={(event) => { if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); moveManagerTabFocus("all-todos"); } }} role="tab" tabIndex={managerSection === "all-todos" ? 0 : -1} type="button">All To-dos <span>{allTodos.filter((item) => item.completedAt === null).length}</span></button>
    </div>}
    {!compact && managerSection === "projects" && <aside className="manager-items" id="manager-projects-sidebar">
      <section className="manager-items__section">
        <header><p>Projects <small>{projects.length}</small></p><span><button aria-expanded={sidebarCreate === "project"} className="manager-sidebar-add" onClick={() => setSidebarCreate((value) => value === "project" ? null : "project")} type="button">+ Add project</button></span></header>
        <nav aria-label="Projects">{projects.map((item) => ownerRow("project", item.id, item.name))}</nav>
        {archivedProjects.length > 0 && <div className="manager-archived">
          <button aria-expanded={showArchived} onClick={() => setShowArchived((value) => !value)} type="button">Archived ({archivedProjects.length})</button>
          {showArchived && <nav aria-label="Archived projects">{archivedProjects.map((item) => ownerRow("project", item.id, item.name, true))}</nav>}
        </div>}
        {sidebarCreate === "project" && <form onSubmit={(event) => { event.preventDefault(); void createOwner("project"); }}>
          <input aria-label="New project name" onChange={(event) => setNewProject(event.target.value)} placeholder="New project name" value={newProject}/>
          <button aria-label="Add project" className="manager-icon-action is-primary" title="Add project" type="submit"><ActionIcon name="add"/></button>
        </form>}
      </section>
      <section className="manager-items__section manager-items__personal">
        <header><p>Personal lists <small>{personalLists.length}</small></p><span><button aria-expanded={sidebarCreate === "list" || sidebarCreate === "category"} className="manager-sidebar-add" onClick={() => setSidebarCreate((value) => value === "list" || value === "category" ? null : "list")} type="button">+ Add</button></span></header>
        {(sidebarCreate === "list" || sidebarCreate === "category") && <div aria-label="Choose what to add" className="manager-create-switch" role="group"><button aria-pressed={sidebarCreate === "list"} onClick={() => setSidebarCreate("list")} type="button">List</button><button aria-pressed={sidebarCreate === "category"} onClick={() => setSidebarCreate("category")} type="button">Category</button></div>}
        <div className="manager-category">
          <p className="manager-category__label"><span>General</span><small>{personalLists.filter((item) => item.categoryId === null).length}</small></p>
          <nav aria-label="General personal lists">{personalLists.filter((item) => item.categoryId === null).map((item) => ownerRow("list", item.id, item.name))}</nav>
        </div>
        {personalCategories.map((category, categoryIndex) => <div className="manager-category" key={category.id}>
          <div className="manager-category__header">{editingCategoryId === category.id
            ? <form onSubmit={(event) => { event.preventDefault(); void renameCategory(); }}><input aria-label={`Rename ${category.name}`} autoFocus onChange={(event) => setCategoryName(event.target.value)} value={categoryName}/><button type="submit">Save</button><button onClick={() => setEditingCategoryId(null)} type="button">Cancel</button></form>
            : <><button aria-expanded={!collapsedCategories.includes(category.id)} className="manager-category__toggle" onClick={() => setCollapsedCategories((value) => value.includes(category.id) ? value.filter((id) => id !== category.id) : [...value, category.id])} type="button"><span aria-hidden="true" className="manager-category__chevron">{collapsedCategories.includes(category.id) ? "›" : "⌄"}</span><span className="manager-category__name">{category.name}</span><small>{personalLists.filter((item) => item.categoryId === category.id).length}</small></button><span><button aria-label={`Move ${category.name} up`} disabled={categoryIndex === 0} onClick={() => void swapOrder("move_personal_category", "categoryId", personalCategories, categoryIndex, -1)} type="button"><ActionIcon name="up"/></button><button aria-label={`Move ${category.name} down`} disabled={categoryIndex === personalCategories.length - 1} onClick={() => void swapOrder("move_personal_category", "categoryId", personalCategories, categoryIndex, 1)} type="button"><ActionIcon name="down"/></button><button aria-label={`Rename ${category.name}`} onClick={() => { setEditingCategoryId(category.id); setCategoryName(category.name); }} type="button"><ActionIcon name="edit"/></button><button aria-label={`Delete ${category.name}`} className="is-danger" onClick={() => void prepareCategoryDelete(category.id)} type="button"><ActionIcon name="delete"/></button></span></>}
          </div>
          {!collapsedCategories.includes(category.id) && <nav aria-label={`${category.name} personal lists`}>{personalLists.filter((item) => item.categoryId === category.id).map((item) => ownerRow("list", item.id, item.name))}</nav>}
        </div>)}
        {categoryDeleteImpact && <div className="manager-category__confirm" role="alert"><p>Delete {categoryDeleteImpact.name}? This removes {impactSummary(categoryDeleteImpact)}.</p><button autoFocus className="is-danger" onClick={() => void confirmCategoryDelete()} type="button">Delete</button><button onClick={() => setCategoryDeleteImpact(null)} type="button">Cancel</button></div>}
        {sidebarCreate === "list" && <form onSubmit={(event) => { event.preventDefault(); void createOwner("list"); }}>
          <input aria-label="New personal list name" onChange={(event) => setNewList(event.target.value)} placeholder="New list" value={newList}/>
          <select aria-label="New list category" onChange={(event) => setNewListCategoryId(event.target.value)} value={newListCategoryId}><option value="">General</option>{personalCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select>
          <button aria-label="Add personal list" className="manager-icon-action is-primary" title="Add personal list" type="submit"><ActionIcon name="add"/></button>
        </form>}
        {sidebarCreate === "category" && <form className="manager-category-create" onSubmit={(event) => { event.preventDefault(); void createCategory(); }}><input aria-label="New personal category name" onChange={(event) => setNewCategory(event.target.value)} placeholder="New category" value={newCategory}/><button aria-label="Add personal category" className="manager-icon-action is-primary" title="Add personal category" type="submit"><ActionIcon name="add"/></button></form>}
      </section>
    </aside>}
    <section aria-labelledby={!compact ? `manager-main-tab-${managerSection}` : undefined} className={`manager-detail${!compact && managerSection === "all-todos" ? " manager-all-todos" : ""}`} id={!compact && managerSection === "all-todos" ? "manager-all-todos-section" : "manager-projects-section"} role={!compact ? "tabpanel" : undefined}>
      {!compact && managerSection === "all-todos" ? <>
        <header className="manager-detail__header"><div><p>Overview</p><h1 id="manager-all-todos-title">All To-dos</h1></div><span className="manager-all-todos__summary">{allTodos.filter((item) => item.completedAt === null).length} open · {allTodos.filter((item) => item.completedAt !== null).length} completed</span></header>
        <div className="manager-todo-filters"><button aria-pressed={todoFilter === "all"} onClick={() => setTodoFilter("all")} type="button">All ({allTodos.length})</button><button aria-pressed={todoFilter === "unscheduled"} onClick={() => setTodoFilter("unscheduled")} type="button">Unscheduled ({allUnscheduledCount})</button></div>
        <div aria-hidden="true" className="manager-todo-columns manager-todo-columns--all"><span></span><span>To-do</span><span>Project / list</span><span>Due date</span><span>Reminder</span><span>Actions</span></div>
        <ol className="manager-todos manager-todos--all">{visibleAllTodos.map((item) => <li data-actionable={isActionable(item, new Date()) || undefined} data-completed={item.completedAt !== null || undefined} key={item.id}>
          <button aria-label={`${item.completedAt ? "Restore" : "Complete"} ${item.title}`} onClick={() => void toggleTodo(item.id, item.completedAt !== null)} type="button">{item.completedAt ? "↺" : null}</button>
          <span>{item.title}</span>
          <button className="manager-todo-owner" onClick={() => { setSelected({ kind: item.ownerKind, id: item.ownerId }); setTab("todos"); setManagerSection("projects"); }} type="button">{ownerLabel(item)}</button>
          <small aria-label={item.dueOn ? `Due date ${formatDueDate(item.dueOn)}` : "No due date"} className="manager-row-due">{item.dueOn ? formatDueDate(item.dueOn) : "—"}</small>
          <small aria-label={item.remindAt ? `Reminder ${new Date(item.remindAt).toLocaleString()}` : "No reminder"} className="manager-row-reminder">{item.remindAt ? new Date(item.remindAt).toLocaleString([], { dateStyle: "short", timeStyle: "short" }) : "—"}</small>
          <div className="manager-row-actions">{item.notes.length > 0 && <button aria-expanded={expandedTodoNotesId === item.id} aria-label={`Show notes for ${item.title}`} className="manager-icon-action" onClick={() => setExpandedTodoNotesId((value) => value === item.id ? null : item.id)} title="Notes" type="button"><ActionIcon name="notes"/></button>}<button aria-label={`Edit ${item.title}`} className="manager-icon-action" onClick={() => { setTodo(todoDraft(item)); setTodoOwner({ kind: item.ownerKind, id: item.ownerId }); setTodoExpanded(true); }} title="Edit" type="button"><ActionIcon name="edit"/></button>{pendingRowDelete?.kind === "todo" && pendingRowDelete.id === item.id ? <><button autoFocus className="is-danger" onClick={() => { void runMutation("delete_action_item", { itemId: item.id }); setPendingRowDelete(null); }} type="button">Confirm</button><button onClick={() => setPendingRowDelete(null)} type="button">Cancel</button></> : <button aria-label={`Delete ${item.title}`} className="manager-icon-action is-danger" onClick={() => setPendingRowDelete({ kind: "todo", id: item.id })} title="Delete" type="button"><ActionIcon name="delete"/></button>}</div>
          {expandedTodoNotesId === item.id && <p className="manager-todo-notes">{item.notes.map((segment, index) => segment.href ? <button key={`${segment.href}-${index}`} onClick={() => void invoke("open_action_item_note_url", { itemId: item.id, url: segment.href })} type="button">{segment.text}</button> : <span key={`text-${index}`}>{segment.text}</span>)}</p>}
          {todo.id === item.id && <form className="manager-todo-editor manager-todo-editor--inline" onSubmit={(event) => { event.preventDefault(); void saveTodo(); }}><div className="manager-todo-editor__main"><input aria-label={`Edit ${item.title}`} autoFocus onChange={(event) => setTodo((value) => ({ ...value, title: event.target.value }))} value={todo.title}/><button type="submit">Save</button><button onClick={resetTodoDraft} type="button">Cancel</button></div>{todoDetails(true)}</form>}
        </li>)}</ol>
        {visibleAllTodos.length === 0 && <p className="manager-empty">No matching to-dos.</p>}
      </> : owner ? <>
        <header className="manager-detail__header" onPointerDown={compact ? (pointerEvent) => { if (!(pointerEvent.target as HTMLElement).closest("button, input, select, a")) void getCurrentWindow().startDragging(); } : undefined}>
          <div><p>{selected?.kind === "project" ? "Project" : "Personal list"}</p>{renaming
            ? <form className="manager-rename" onSubmit={(event) => { event.preventDefault(); void renameOwner(); }}><input aria-label="New name" autoFocus onChange={(event) => setRenameValue(event.target.value)} value={renameValue}/><button type="submit">Save</button><button onClick={() => setRenaming(false)} type="button">Cancel</button></form>
            : <h1>{owner.name}</h1>}</div>
          {!renaming && !compact && <div className="manager-owner-actions">
            <button aria-label="Move up" className="manager-icon-action" disabled={selectedOrderIndex <= 0} onClick={() => selected && void swapOrder(selected.kind === "project" ? "move_project" : "move_list", selected.kind === "project" ? "projectId" : "listId", selectedOrder, selectedOrderIndex, -1)} title="Move up" type="button"><ActionIcon name="up"/></button>
            <button aria-label="Move down" className="manager-icon-action" disabled={selectedOrderIndex < 0 || selectedOrderIndex === selectedOrder.length - 1} onClick={() => selected && void swapOrder(selected.kind === "project" ? "move_project" : "move_list", selected.kind === "project" ? "projectId" : "listId", selectedOrder, selectedOrderIndex, 1)} title="Move down" type="button"><ActionIcon name="down"/></button>
            <button aria-label="Rename" className="manager-icon-action" onClick={() => { setRenameValue(owner.name); setRenaming(true); }} title="Rename" type="button"><ActionIcon name="edit"/></button>
            {project && <button aria-label={project.archivedAt ? "Restore project" : "Archive project"} className="manager-icon-action" onClick={() => void archiveProject()} title={project.archivedAt ? "Restore project" : "Archive project"} type="button"><ActionIcon name={project.archivedAt ? "restore" : "archive"}/></button>}
            <button aria-label="Delete" className="manager-icon-action is-danger" onClick={() => void prepareDelete()} title="Delete" type="button"><ActionIcon name="delete"/></button>
          </div>}
          {compact && <div className="manager-owner-actions"><button className="manager-open-hub" onClick={() => void openManagerWindow("projects", project?.id)} type="button">Open in Project Hub</button><button aria-label="Close project panel" className="hub-close-button" onClick={() => void getCurrentWindow().close()} type="button"><HubCloseIcon /></button></div>}
        </header>
        {selected?.kind === "list" && <label className="manager-list-category">Category<select onChange={(event) => void runMutation("set_list_category", { listId: selected.id, categoryId: event.target.value || null })} value={snapshot?.lists.find((item) => item.id === selected.id)?.categoryId ?? ""}><option value="">General</option>{personalCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>}
        {deleteImpact && <div className="manager-confirm" role="alert">
          <p><strong>Delete {deleteImpact.name} permanently?</strong></p>
          <p>This removes {impactSummary(deleteImpact)}. This cannot be undone.</p>
          <div><button autoFocus className="is-danger" onClick={() => void confirmDelete()} type="button">Delete permanently</button><button onClick={() => setDeleteImpact(null)} type="button">Cancel</button></div>
        </div>}
        {project && <div aria-label="Project sections" className="manager-tabs" role="tablist">{(["notes", "links", "todos"] as const).map((item) => <button aria-controls={`manager-panel-${item}`} aria-selected={tab === item} id={`manager-tab-${item}`} key={item} onClick={() => setTab(item)} onKeyDown={(event) => { if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); moveTabFocus(item, event.key === "ArrowLeft" ? -1 : 1); } }} role="tab" tabIndex={tab === item ? 0 : -1} type="button">{item === "todos" ? "To-dos" : item[0].toUpperCase() + item.slice(1)}</button>)}</div>}
        {(!project || tab === "todos") && <div aria-labelledby={project ? "manager-tab-todos" : undefined} className="manager-tab-panel" id={project ? "manager-panel-todos" : undefined} role={project ? "tabpanel" : undefined}>
          <div className="manager-todo-filters"><button aria-pressed={todoFilter === "all"} onClick={() => setTodoFilter("all")} type="button">All ({ownerTodos.length})</button><button aria-pressed={todoFilter === "unscheduled"} onClick={() => setTodoFilter("unscheduled")} type="button">Unscheduled ({unscheduledCount})</button></div>
          <div aria-hidden="true" className="manager-todo-columns"><span>To-do</span><span>Due date</span><span>Reminder</span><span>Actions</span></div>
          <ol className="manager-todos">{visibleOwnerTodos.map((item) => <li data-actionable={isActionable(item, new Date()) || undefined} data-completed={item.completedAt !== null || undefined} key={item.id}>
            <button aria-label={`${item.completedAt ? "Restore" : "Complete"} ${item.title}`} onClick={() => void toggleTodo(item.id, item.completedAt !== null)} type="button">{item.completedAt ? "↺" : null}</button>
            <span>{item.title}</span>
            <small aria-label={item.dueOn ? `Due date ${formatDueDate(item.dueOn)}` : "No due date"} className="manager-row-due">{item.dueOn ? `Due ${formatDueDate(item.dueOn)}` : "—"}</small>
            <small aria-label={item.remindAt ? `Reminder ${new Date(item.remindAt).toLocaleString()}` : "No reminder"} className="manager-row-reminder">{item.remindAt ? new Date(item.remindAt).toLocaleString([], { dateStyle: "short", timeStyle: "short" }) : "—"}</small>
            <div className="manager-row-actions">{item.notes.length > 0 && <button aria-expanded={expandedTodoNotesId === item.id} aria-label={`Show notes for ${item.title}`} className="manager-icon-action" onClick={() => setExpandedTodoNotesId((value) => value === item.id ? null : item.id)} title="Notes" type="button"><ActionIcon name="notes"/></button>}<button aria-label={`Edit ${item.title}`} className="manager-icon-action" onClick={() => { setTodo(todoDraft(item)); setTodoOwner({ kind: item.ownerKind, id: item.ownerId }); setTodoExpanded(true); }} title="Edit" type="button"><ActionIcon name="edit"/></button>{pendingRowDelete?.kind === "todo" && pendingRowDelete.id === item.id ? <><button autoFocus className="is-danger" onClick={() => { void runMutation("delete_action_item", { itemId: item.id }); setPendingRowDelete(null); }} type="button">Confirm</button><button onClick={() => setPendingRowDelete(null)} type="button">Cancel</button></> : <button aria-label={`Delete ${item.title}`} className="manager-icon-action is-danger" onClick={() => setPendingRowDelete({ kind: "todo", id: item.id })} title="Delete" type="button"><ActionIcon name="delete"/></button>}</div>
            {expandedTodoNotesId === item.id && <p className="manager-todo-notes">{item.notes.map((segment, index) => segment.href ? <button key={`${segment.href}-${index}`} onClick={() => void invoke("open_action_item_note_url", { itemId: item.id, url: segment.href })} type="button">{segment.text}</button> : <span key={`text-${index}`}>{segment.text}</span>)}</p>}
            {todo.id === item.id && <form className="manager-todo-editor manager-todo-editor--inline" onSubmit={(event) => { event.preventDefault(); void saveTodo(); }}>
              <div className="manager-todo-editor__main"><input aria-label={`Edit ${item.title}`} autoFocus onChange={(event) => setTodo((value) => ({ ...value, title: event.target.value }))} value={todo.title}/><button type="submit">Save</button><button onClick={resetTodoDraft} type="button">Cancel</button></div>
              {todoDetails(!compact)}
            </form>}
          </li>)}</ol>
          {!todo.id && <form className="manager-todo-editor" onSubmit={(event) => { event.preventDefault(); void saveTodo(); }}>
            <div className="manager-todo-editor__main"><input aria-label="To-do title" onChange={(event) => setTodo((value) => ({ ...value, title: event.target.value }))} placeholder="Add a to-do…" value={todo.title}/><button className="manager-todo-editor__expand" onClick={() => setTodoExpanded((value) => !value)} type="button">{todoExpanded ? "Hide details" : "Date, reminder, notes"}</button><button type="submit">Add</button></div>
            {todoExpanded && todoDetails(!compact)}
            {(todo.title || todoExpanded) && <div className="manager-todo-editor__footer"><button onClick={resetTodoDraft} type="button">Cancel</button></div>}
          </form>}
        </div>}
        {project && tab === "notes" && <div aria-labelledby="manager-tab-notes" className="manager-notes manager-tab-panel" id="manager-panel-notes" role="tabpanel"><textarea onChange={(event) => { noteTextRef.current = event.target.value; setNoteText(event.target.value); setNoteDirty(true); }} placeholder="Project notes" value={noteText}/>{noteConflict ? <div className="manager-notes__conflict" role="alert"><p>These notes changed in another window. Your text is still here.</p><button autoFocus onClick={() => void saveNotes(project.notesRevision)} type="button">Keep mine</button><button onClick={loadTheirNotes} type="button">Load theirs</button></div> : <p className="manager-notes__status">{noteDirty ? "Saving locally…" : "Saved locally."}</p>}</div>}
        {project && tab === "links" && <div aria-labelledby="manager-tab-links" className="manager-links manager-tab-panel" id="manager-panel-links" role="tabpanel">
          <ol>{links.map((link, linkIndex) => <li key={link.id}><button className="manager-link-open" onClick={() => void invoke("open_project_link", { linkId: link.id })} type="button"><span>{link.label}</span><small>{link.kind}</small></button><div className="manager-row-actions"><button aria-label={`Move ${link.label} up`} className="manager-icon-action" disabled={linkIndex === 0} onClick={() => void swapOrder("move_project_link", "linkId", links, linkIndex, -1)} title="Move up" type="button"><ActionIcon name="up"/></button><button aria-label={`Move ${link.label} down`} className="manager-icon-action" disabled={linkIndex === links.length - 1} onClick={() => void swapOrder("move_project_link", "linkId", links, linkIndex, 1)} title="Move down" type="button"><ActionIcon name="down"/></button><button aria-label={`Edit ${link.label}`} className="manager-icon-action" onClick={() => beginLinkEdit(link)} title="Edit" type="button"><ActionIcon name="edit"/></button>{pendingRowDelete?.kind === "link" && pendingRowDelete.id === link.id ? <><button autoFocus className="is-danger" onClick={() => { void runMutation("delete_project_link", { linkId: link.id }); setPendingRowDelete(null); }} type="button">Confirm</button><button onClick={() => setPendingRowDelete(null)} type="button">Cancel</button></> : <button aria-label={`Delete ${link.label}`} className="manager-icon-action is-danger" onClick={() => setPendingRowDelete({ kind: "link", id: link.id })} title="Delete" type="button"><ActionIcon name="delete"/></button>}</div></li>)}</ol>
          <form onSubmit={(event) => { event.preventDefault(); void saveLink(); }}><input aria-label="Link label" onChange={(event) => setLinkLabel(event.target.value)} placeholder="Label" value={linkLabel}/><input aria-label="Link URL" onChange={(event) => setLinkUrl(event.target.value)} placeholder="https://…" value={linkUrl}/><select aria-label="Link kind" onChange={(event) => setLinkKind(event.target.value as ProjectLinkKind)} value={linkKind}>{(["staging", "production", "design", "docs", "board", "repo", "other"] as const).map((kind) => <option key={kind} value={kind}>{kind[0].toUpperCase() + kind.slice(1)}</option>)}</select><button type="submit">{editingLinkId ? "Save" : "Add link"}</button>{editingLinkId && <button onClick={() => { setEditingLinkId(null); setLinkLabel(""); setLinkUrl(""); setLinkKind("other"); }} type="button">Cancel</button>}</form>
        </div>}
      </> : <p className="manager-empty">Select a project or personal list to view its content.</p>}
      {error && <p className="manager-error" role="alert">{error}</p>}
    </section>
  </main>;
}
