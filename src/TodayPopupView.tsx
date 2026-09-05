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
  openProjectPanelWindow,
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
import { useMedicineGraceMinutes } from "./use-medicine-grace-minutes";
import { useWidgetPanelStyle } from "./use-widget-panel-style";
import { HubCloseIcon } from "./HubCloseIcon";
import { EventWorkspaceActions } from "./EventWorkspaceActions";
import { openManagerWindow } from "./manager-window";
import { openMedicineManagerWindow } from "./medicine-manager-window";
import { boundedDoseRows, medicineDailyRows, medicineDoseStateLabel, medicineFoodRuleLabel, type MedicineDailyDoseRow, type MedicineSnapshot } from "./medicine-model";
import { deferActionItemToTomorrow, isFromActiveOwner, isVisibleInToday, sortActionItems, type ActionItem, type WorkspaceSnapshot, WORKSPACE_CHANGED_EVENT } from "./workspace-model";
import { todayPopupHeight, TODAY_DOSE_MAX_ITEMS, TODAY_TODO_MAX_ITEMS } from "./widget-layout";

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
  const graceMinutes = useMedicineGraceMinutes();
  const [payload, setPayload] = useState<TodayPopupPayload | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [error, setError] = useState<string | null>(null);
  const [workspace, setWorkspace] = useState<WorkspaceSnapshot | null>(null);
  const [medicine, setMedicine] = useState<MedicineSnapshot | null>(null);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;
    const refresh = async () => {
      try { const next = await invoke<MedicineSnapshot>("get_medicine_snapshot"); if (!disposed) setMedicine(next); }
      catch (cause) { if (!disposed) setError(String(cause)); }
    };
    void listen("medicine-changed", () => void refresh()).then((stop) => { if (disposed) stop(); else unlisten = stop; });
    void refresh();
    return () => { disposed = true; unlisten?.(); };
  }, []);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;
    const refresh = async () => {
      try {
        const next = await invoke<WorkspaceSnapshot>("get_workspace_snapshot");
        if (!disposed) setWorkspace(next);
      } catch (cause) { if (!disposed) setError(String(cause)); }
    };
    void listen(WORKSPACE_CHANGED_EVENT, () => void refresh()).then((next) => { if (disposed) next(); else unlisten = next; });
    void refresh();
    return () => { disposed = true; unlisten?.(); };
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

  useEffect(() => {
    // Escape closes lightweight popups. Both windows are read-and-record
    // surfaces with no form to cancel first, so the key is unambiguous here.
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) {
        event.preventDefault();
        void close();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

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

  const openProjectPanel = async (selection: WorkCalendarDaySelection, view: "project" | "notes" | "todos" = "project") => {
    const projectId = selection.eventWorkspace?.projectId;
    if (!projectId) return;
    const anchor = await currentPopupAnchor();
    if (!anchor) {
      setError("Project panel could not be positioned.");
      return;
    }
    await openProjectPanelWindow(
      { projectId, view, anchor },
      (message) => setError(message),
    );
  };

  const openTodoDetails = async (item: ActionItem) => {
    const anchor = await currentPopupAnchor();
    if (!anchor) { setError("To-do details could not be positioned."); return; }
    await openProjectPanelWindow({
      projectId: item.ownerKind === "project" ? item.ownerId : "",
      itemId: item.id,
      view: "todo",
      anchor,
    }, (message) => setError(message));
  };

  const openEventLink = async (selection: WorkCalendarDaySelection) => {
    if (!selection.eventToken) return;
    try {
      await invoke("open_event_workspace_link_from_workspace", {
        eventToken: selection.eventToken,
      });
      setError(null);
    } catch {
      setError("The saved event link could not be opened.");
    }
  };

  const openEventProject = (selection: WorkCalendarDaySelection) => {
    return selection.eventWorkspace?.projectId
      ? openProjectPanel(selection)
      : openEventSettings(selection);
  };

  const pendingProjectTodos = (projectId: string | null | undefined) => projectId
    ? workspace?.actionItems.filter((item) => item.ownerKind === "project" && item.ownerId === projectId && item.completedAt === null).length ?? 0
    : 0;

  const todayTodos = sortActionItems(workspace?.actionItems.filter((item) => isVisibleInToday(item, now) && isFromActiveOwner(item, workspace)) ?? []);
  const openTodayTodos = todayTodos.filter((item) => item.completedAt === null);
  const hasMoreTodos = todayTodos.length > TODAY_TODO_MAX_ITEMS;
  const visibleTodos = todayTodos.slice(0, hasMoreTodos ? TODAY_TODO_MAX_ITEMS - 1 : TODAY_TODO_MAX_ITEMS);
  const ownerName = (kind: "project" | "list", id: string) => kind === "project"
    ? workspace?.projects.find((item) => item.id === id)?.name ?? "Project"
    : workspace?.lists.find((item) => item.id === id)?.name ?? "Personal";
  const todayDoses = medicine ? medicineDailyRows(medicine, now, graceMinutes) : [];
  const { visible: visibleDoses, hidden: hiddenDoses } = boundedDoseRows(todayDoses, TODAY_DOSE_MAX_ITEMS);

  useEffect(() => {
    if (!payload) return;
    const next = { ...payload, height: Math.min(payload.maxHeight, todayPopupHeight(payload.selections.length, todayDoses.length, todayTodos.length)) };
    const currentWindow = getCurrentWindow();
    void currentWindow.setSize(new LogicalSize(next.width, next.height)).then(() => currentWindow.setPosition(todayPopupPosition(next)));
  }, [todayTodos.length, todayDoses.length, payload]);

  const recordDose = async (row: MedicineDailyDoseRow, state: "taken" | "skipped" | "undo") => {
    try {
      const skip = state === "skipped" || (state === "undo" && row.state === "skipped");
      const command = skip ? "set_medicine_dose_skipped" : "set_medicine_dose_taken";
      const next = await invoke<MedicineSnapshot>(command, { medicineId: row.dose.medicineId, slotDay: row.dose.slotDay, slotTime: row.dose.slotTime, [skip ? "skipped" : "taken"]: state !== "undo" });
      setMedicine(next); setError(null);
    } catch (cause) { setError(String(cause)); }
  };

  const toggleTodo = async (item: ActionItem) => {
    try { setWorkspace(await invoke<WorkspaceSnapshot>(item.completedAt ? "restore_action_item" : "complete_action_item", { itemId: item.id })); setError(null); }
    catch (cause) { setError(String(cause)); }
  };

  const deferTodo = async (item: ActionItem) => {
    const schedule = deferActionItemToTomorrow(item, now);
    try {
      setWorkspace(await invoke<WorkspaceSnapshot>("update_action_item", {
        itemId: item.id,
        input: { ownerKind: item.ownerKind, ownerId: item.ownerId, title: item.title, notes: item.notes, ...schedule },
      }));
      setError(null);
    } catch (cause) { setError(String(cause)); }
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
            h {payload.occupiedMinutes % 60}m in calls
          </span>
        </div>
        <button aria-label="Close today's meeting summary" className="hub-close-button" onClick={() => void close()} type="button">
          <HubCloseIcon />
        </button>
      </header>
      <ol className="today-popup-events">
        {payload.selections.length === 0 ? (
          <li className="widget-calendar-day-panel__empty">
            No calls today.
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
              <button className="widget-calendar-day-panel__subject" onClick={() => void openEventProject(selection)} title={selection.eventWorkspace?.projectName ? `Open ${selection.eventWorkspace.projectName}` : "Assign a project"} type="button">
                {finished && <span className="sr-only">Finished: </span>}
                {selection.cancelled && <span className="sr-only">Cancelled: </span>}
                {live && <span className="sr-only">Live now: </span>}
                {selection.subject}
              </button>
              {selection.eventToken && !selection.cancelled && (
                <EventWorkspaceActions
                  className="widget-calendar-day-panel__actions"
                  onOpenLink={() => void openEventLink(selection)}
                  onOpenSettings={() => void openEventSettings(selection)}
                  onOpenNotes={() => void openProjectPanel(selection, "notes")}
                  onOpenTodos={() => void openProjectPanel(selection, "todos")}
                  pendingTodoCount={pendingProjectTodos(selection.eventWorkspace?.projectId)}
                  subject={selection.subject}
                  workspace={selection.eventWorkspace}
                />
              )}
            </li>
          );
        })}
      </ol>
      {todayDoses.length > 0 && <section className="today-popup-todos today-popup-medicine" aria-labelledby="today-medicine-heading">
        <header><strong id="today-medicine-heading">MEDICINE</strong><span>{todayDoses.filter((row) => row.state !== "taken" && row.state !== "skipped").length} left</span></header>
        <ol>{visibleDoses.map((row) => { const recorded = row.state === "taken" || row.state === "skipped"; const foodRule = medicineFoodRuleLabel(row.medicine.foodRule); return <li data-completed={recorded || undefined} data-state={row.state} key={`${row.dose.medicineId}:${row.dose.slotDay}:${row.dose.slotTime}`}><time className="today-popup-medicine__time">{row.dose.slotTime}</time><span className="today-popup-medicine__title"><span className="sr-only">{medicineDoseStateLabel(row.state)}: </span>{row.medicine.name}{row.medicine.strength || row.medicine.doseAmount ? ` · ${[row.medicine.strength, row.medicine.doseAmount].filter(Boolean).join(" ")}` : ""}<small>{row.treatment.name} · {medicineDoseStateLabel(row.state)}{foodRule === "Any time" ? "" : ` · ${foodRule}`}</small></span>{!recorded && <button aria-label={`Skip ${row.medicine.name}`} className="today-popup-medicine__skip" onClick={() => void recordDose(row, "skipped")} type="button">Skip</button>}<button aria-label={recorded ? `Undo ${row.medicine.name}` : `Take ${row.medicine.name}`} className="today-popup-todos__check" onClick={() => void recordDose(row, recorded ? "undo" : "taken")} type="button"><span aria-hidden="true">{row.state === "taken" ? "✓" : row.state === "skipped" ? "–" : ""}</span></button></li>; })}{hiddenDoses > 0 && <li className="today-popup-todos__more"><button onClick={() => void openMedicineManagerWindow()} type="button">+{hiddenDoses} more</button></li>}</ol>
      </section>}
      {todayTodos.length > 0 && <section className="today-popup-todos" aria-labelledby="today-todos-heading">
        <header><strong id="today-todos-heading">TODO</strong><span>{openTodayTodos.length} need attention</span></header>
        <ol>{visibleTodos.map((item) => <li data-completed={item.completedAt !== null || undefined} key={item.id}>
          <button aria-label={`${item.completedAt ? "Restore" : "Complete"} ${item.title}`} className="today-popup-todos__check" onClick={() => void toggleTodo(item)} type="button"><span aria-hidden="true">{item.completedAt ? "✓" : ""}</span></button>
          <button className="today-popup-todos__title" onClick={() => void openTodoDetails(item)} title={`Open details for ${item.title}`} type="button">{item.title}</button>
          <small>{ownerName(item.ownerKind, item.ownerId)}</small>
          {!item.completedAt && <button aria-label={`Move ${item.title} to tomorrow`} className="today-popup-todos__defer" onClick={() => void deferTodo(item)} title="Move to tomorrow" type="button"><svg aria-hidden="true" viewBox="0 0 16 16"><path d="M8 2v3m-4.2-.8L5.9 6M2 8h3m7.5-3.5A5.5 5.5 0 1 1 5 12.9"/><path d="m3.7 11.1 1.5 2.2-2.6.4"/></svg><span>Not today</span></button>}
        </li>)}{hasMoreTodos && <li className="today-popup-todos__more"><button onClick={() => void openManagerWindow("todos")} type="button">+{todayTodos.length - visibleTodos.length} more</button></li>}</ol>
      </section>}
      {error && <p className="today-popup-shell__error" role="status">{error}</p>}
    </main>
  );
}
