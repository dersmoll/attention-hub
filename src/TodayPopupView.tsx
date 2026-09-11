import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { emit, emitTo, listen } from "@tauri-apps/api/event";
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
import { calendarVocabulary } from "./calendar-vocabulary";
import { EventWorkspaceActions } from "./EventWorkspaceActions";
import { openManagerWindow } from "./manager-window";
import { openMedicineManagerAt, openMedicineManagerWindow } from "./medicine-manager-window";
import { medicineDoseKey } from "./medicine-manager-navigation";
import { boundedDoseRows, medicineDailyRows, medicineDoseStateLabel, medicineFoodRuleLabel, medicineTreatmentsWithoutDosesToday, type MedicineDailyDoseRow, type MedicineSnapshot } from "./medicine-model";
import { deferActionItemToTomorrow, isFromActiveOwner, isVisibleInToday, sortActionItems, type ActionItem, type WorkspaceSnapshot, WORKSPACE_CHANGED_EVENT } from "./workspace-model";
import { todayPopupHeight, TODAY_DOSE_MAX_ITEMS, TODAY_TODO_MAX_ITEMS } from "./widget-layout";
import { CALENDAR_SKIPS_CHANGED_EVENT, readSkippedCalendarOccurrences, setCalendarOccurrenceSkipped } from "./calendar-skip-store";

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
  const [medicineError, setMedicineError] = useState<string | null>(null);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [skippedCalendarOccurrences, setSkippedCalendarOccurrences] = useState<ReadonlySet<string>>(() => readSkippedCalendarOccurrences());
  const [workspace, setWorkspace] = useState<WorkspaceSnapshot | null>(null);
  const [medicine, setMedicine] = useState<MedicineSnapshot | null>(null);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void listen(CALENDAR_SKIPS_CHANGED_EVENT, () => {
      if (!disposed) setSkippedCalendarOccurrences(readSkippedCalendarOccurrences());
    }).then((next) => { if (disposed) next(); else unlisten = next; });
    return () => { disposed = true; unlisten?.(); };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;
    const refresh = async () => {
      try { const next = await invoke<MedicineSnapshot>("get_medicine_snapshot"); if (!disposed) { setMedicine(next); setMedicineError(null); } }
      catch { if (!disposed) setMedicineError("Medicine could not refresh. Retrying automatically."); }
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
        if (!disposed) { setWorkspace(next); setWorkspaceError(null); }
      } catch { if (!disposed) setWorkspaceError("Projects and to-dos could not refresh. Retrying automatically."); }
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
      setActionError(null);
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
      setActionError("Event settings could not be positioned.");
      return;
    }
    await openEventSettingsWindow(
      { eventToken: selection.eventToken, anchor },
      (message) => setActionError(message),
    );
  };

  const openProjectPanel = async (selection: WorkCalendarDaySelection, view: "project" | "notes" | "todos" = "project") => {
    const projectId = selection.eventWorkspace?.projectId;
    if (!projectId) return;
    const anchor = await currentPopupAnchor();
    if (!anchor) {
      setActionError("Project panel could not be positioned.");
      return;
    }
    await openProjectPanelWindow(
      { projectId, view, anchor },
      (message) => setActionError(message),
    );
  };

  const openTodoDetails = async (item: ActionItem) => {
    const anchor = await currentPopupAnchor();
    if (!anchor) { setActionError("To-do details could not be positioned."); return; }
    await openProjectPanelWindow({
      projectId: item.ownerKind === "project" ? item.ownerId : "",
      itemId: item.id,
      view: "todo",
      anchor,
    }, (message) => setActionError(message));
  };

  const openEventLink = async (selection: WorkCalendarDaySelection) => {
    if (!selection.eventToken) return;
    try {
      await invoke("open_event_workspace_link_from_workspace", {
        eventToken: selection.eventToken,
      });
      setActionError(null);
    } catch {
      setActionError("The saved event link could not be opened.");
    }
  };

  const toggleEventSkipped = (selection: WorkCalendarDaySelection) => {
    const skipped = skippedCalendarOccurrences.has(selection.occurrenceId);
    setSkippedCalendarOccurrences(setCalendarOccurrenceSkipped(selection, !skipped));
    void emit(CALENDAR_SKIPS_CHANGED_EVENT);
  };

  const pendingDestinationTodos = (projectId: string | null | undefined, listId: string | null | undefined) => projectId || listId
    ? workspace?.actionItems.filter((item) => item.ownerKind === (projectId ? "project" : "list") && item.ownerId === (projectId ?? listId) && item.completedAt === null).length ?? 0
    : 0;

  const todayTodos = sortActionItems(workspace?.actionItems.filter((item) => isVisibleInToday(item, now) && isFromActiveOwner(item, workspace)) ?? []);
  const openTodayTodos = todayTodos.filter((item) => item.completedAt === null);
  const hasMoreTodos = todayTodos.length > TODAY_TODO_MAX_ITEMS;
  const visibleTodos = todayTodos.slice(0, hasMoreTodos ? TODAY_TODO_MAX_ITEMS - 1 : TODAY_TODO_MAX_ITEMS);
  const ownerName = (kind: "project" | "list", id: string) => kind === "project"
    ? workspace?.projects.find((item) => item.id === id)?.name ?? "Project"
    : workspace?.lists.find((item) => item.id === id)?.name ?? "Personal";
  const todayDoses = medicine ? medicineDailyRows(medicine, now, graceMinutes) : [];
  const continuingTreatments = medicine ? medicineTreatmentsWithoutDosesToday(medicine, now, graceMinutes) : [];
  const liveDoses = boundedDoseRows(todayDoses, TODAY_DOSE_MAX_ITEMS);
  /* This popup re-renders every second, and which doses fit depends on their
   * state — a dose turning Due can displace a recorded one. Landing between
   * pressing a button and releasing it, that moves the row under the pointer.
   * Hold the dose list still for the length of an activation, then apply
   * whatever arrived. Only the list is held: the popup's height follows the
   * total dose count, which a reordering does not change. */
  const [frozenDoses, setFrozenDoses] = useState<typeof liveDoses | null>(null);
  const { visible: visibleDoses, hidden: hiddenDoses, hiddenItems: hiddenDoseItems } = frozenDoses ?? liveDoses;
  const dosePointerDown = useRef(false);
  const dosePending = useRef(false);
  const heldDoses = useRef<typeof liveDoses | null>(null);
  const holdDoses = () => {
    heldDoses.current = frozenDoses ?? liveDoses;
    setFrozenDoses((current) => current ?? liveDoses);
  };
  /* `click` fires after `pointerup`, so the press is over before the action it
   * started exists. `recordDose` re-asserts the hold synchronously with the
   * content that was on screen when the press began, and the release is
   * deferred a task so the two normally batch into no repaint. */
  const reholdDoses = () => {
    const view = heldDoses.current;
    if (view) setFrozenDoses((current) => current ?? view);
  };
  const releaseDoses = useCallback(() => {
    if (!dosePending.current && !dosePointerDown.current) setFrozenDoses(null);
  }, []);
  useEffect(() => {
    const onPointerUp = () => { dosePointerDown.current = false; window.setTimeout(releaseDoses, 0); };
    const onKeyUp = (event: KeyboardEvent) => { if (event.key === "Enter" || event.key === " ") window.setTimeout(releaseDoses, 0); };
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    // A press that ends outside this window never delivers `pointerup` here.
    window.addEventListener("blur", onPointerUp);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
      window.removeEventListener("blur", onPointerUp);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [releaseDoses]);
  /* Overflow names a dose, so it navigates to that dose. Today stays open when
   * the manager refuses — an unfinished form there is worth reporting rather
   * than closing this window over. */
  const openHiddenDose = async () => {
    const target = hiddenDoseItems[0];
    if (!target) { await openMedicineManagerWindow(); await close(); return; }
    const result = await openMedicineManagerAt({ treatmentId: target.treatment.id, doseKey: medicineDoseKey(target.dose) });
    if (result.applied) await close();
    else setActionError(result.reason ?? "Medicine could not be opened at that dose.");
  };

  useEffect(() => {
    if (!payload) return;
    const next = { ...payload, height: Math.min(payload.maxHeight, todayPopupHeight(payload.selections.length, todayDoses.length, todayTodos.length, medicine?.recoveredFromBackup === true, continuingTreatments.length > 0)) };
    const currentWindow = getCurrentWindow();
    void currentWindow.setSize(new LogicalSize(next.width, next.height)).then(() => currentWindow.setPosition(todayPopupPosition(next)));
  }, [todayTodos.length, todayDoses.length, continuingTreatments.length, medicine?.recoveredFromBackup, payload]);

  const recordDose = async (row: MedicineDailyDoseRow, state: "taken" | "skipped" | "undo") => {
    if (dosePending.current) return;
    // Both synchronous, before any await, so the deferred release can see that
    // an action now owns the hold.
    dosePending.current = true;
    reholdDoses();
    try {
      const skip = state === "skipped" || (state === "undo" && row.state === "skipped");
      const command = skip ? "set_medicine_dose_skipped" : "set_medicine_dose_taken";
      const next = await invoke<MedicineSnapshot>(command, { medicineId: row.dose.medicineId, slotDay: row.dose.slotDay, slotTime: row.dose.slotTime, [skip ? "skipped" : "taken"]: state !== "undo" });
      setMedicine(next); setActionError(null);
    } catch { setActionError("Medicine could not be updated. Try again."); }
    finally { dosePending.current = false; releaseDoses(); }
  };

  const toggleTodo = async (item: ActionItem) => {
    try { setWorkspace(await invoke<WorkspaceSnapshot>(item.completedAt ? "restore_action_item" : "complete_action_item", { itemId: item.id })); setActionError(null); }
    catch { setActionError("The to-do could not be updated. Try again."); }
  };

  const deferTodo = async (item: ActionItem) => {
    const schedule = deferActionItemToTomorrow(item, now);
    try {
      setWorkspace(await invoke<WorkspaceSnapshot>("update_action_item", {
        itemId: item.id,
        input: { ownerKind: item.ownerKind, ownerId: item.ownerId, title: item.title, notes: item.notes, ...schedule },
      }));
      setActionError(null);
    } catch { setActionError("The to-do could not be deferred. Try again."); }
  };

  if (!payload) return null;
  // The sender tells us which vocabulary to use; this window has no
  // preferences of its own. See TodayPopupPayload.schoolMode.
  const vocabulary = calendarVocabulary(payload.schoolMode);

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
            h {payload.occupiedMinutes % 60}m {vocabulary.occupiedSuffix}
          </span>
        </div>
        <button aria-label={vocabulary.closeDayPanel} className="hub-close-button" onClick={() => void close()} type="button">
          <HubCloseIcon />
        </button>
      </header>
      <ol className="today-popup-events">
        {payload.selections.length === 0 ? (
          <li className="widget-calendar-day-panel__empty">
            {/* An empty list only means an empty day when the day was actually
                read. See TodayPopupPayload.dayState. */}
            {payload.dayState === "verified"
              ? vocabulary.emptyDay
              : payload.dayState === "loading"
                ? vocabulary.loadingDay
                : payload.dayState === "incomplete"
                  ? vocabulary.incompleteDay
                  : vocabulary.unknownDay}
          </li>
        ) : payload.selections.map((selection, index) => {
          const startMs = Date.parse(selection.start);
          const endMs = Date.parse(selection.end);
          const finished = Number.isFinite(endMs) && endMs <= now.getTime();
          const skipped = skippedCalendarOccurrences.has(selection.occurrenceId);
          const live =
            !selection.cancelled &&
            !skipped &&
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
              data-skipped={skipped || undefined}
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
              <button className="widget-calendar-day-panel__subject" onClick={() => void openEventSettings(selection)} title={`Open settings for ${selection.subject}`} type="button">
                {finished && <span className="sr-only">Finished: </span>}
                {selection.cancelled && <span className="sr-only">Cancelled: </span>}
                {skipped && <span className="sr-only">Skipped: </span>}
                {live && <span className="sr-only">Live now: </span>}
                {selection.subject}
              </button>
              {!selection.cancelled && !selection.allDay && <div className="widget-calendar-day-panel__actions">
                <button aria-label={`${skipped ? "Undo skip for" : "Skip"} ${selection.subject}`} className="widget-calendar-day-panel__skip" onClick={() => toggleEventSkipped(selection)} type="button">{skipped ? "Undo" : "Skip"}</button>
                {!skipped && selection.eventToken && <EventWorkspaceActions
                  className=""
                  onOpenLink={() => void openEventLink(selection)}
                  onOpenSettings={() => void openEventSettings(selection)}
                  onOpenNotes={() => void openProjectPanel(selection, "notes")}
                  onOpenTodos={() => selection.eventWorkspace?.listId ? void openManagerWindow("projects", undefined, selection.eventWorkspace.listId) : void openProjectPanel(selection, "todos")}
                  pendingTodoCount={pendingDestinationTodos(selection.eventWorkspace?.projectId, selection.eventWorkspace?.listId)}
                  subject={selection.subject}
                  workspace={selection.eventWorkspace}
                />}
              </div>}
            </li>
          );
        })}
      </ol>
      {medicine?.recoveredFromBackup && <p className="medicine-recovery-notice" role="status">Showing recovered Medicine backup data.</p>}
      {(todayDoses.length > 0 || continuingTreatments.length > 0) && <section className="today-popup-todos today-popup-medicine" aria-labelledby="today-medicine-heading">
        <header><strong id="today-medicine-heading">Medicine</strong><span>{todayDoses.length > 0 ? `${todayDoses.filter((row) => row.state !== "taken" && row.state !== "skipped").length} left` : "Course active"}</span></header>
        {todayDoses.length > 0 && <ol onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") holdDoses(); }} onPointerDown={() => { dosePointerDown.current = true; holdDoses(); }}>{visibleDoses.map((row) => { const recorded = row.state === "taken" || row.state === "skipped"; const foodRule = medicineFoodRuleLabel(row.medicine.foodRule); return <li data-completed={recorded || undefined} data-state={row.state} key={`${row.dose.medicineId}:${row.dose.slotDay}:${row.dose.slotTime}`}><time className="today-popup-medicine__time">{row.dose.slotTime}</time><span className="today-popup-medicine__title"><span className="sr-only">{medicineDoseStateLabel(row.state)}: </span>{row.medicine.name}{row.medicine.strength || row.medicine.doseAmount ? ` · ${[row.medicine.strength, row.medicine.doseAmount].filter(Boolean).join(" ")}` : ""}<small>{row.treatment.name} · {medicineDoseStateLabel(row.state)}{foodRule === "Any time" ? "" : ` · ${foodRule}`}</small></span>{!recorded && <button aria-label={`Skip ${row.medicine.name}`} className="today-popup-medicine__skip" onClick={() => void recordDose(row, "skipped")} type="button">Skip</button>}<button aria-label={recorded ? `Undo ${row.medicine.name}` : `Take ${row.medicine.name}`} className="today-popup-todos__check" onClick={() => void recordDose(row, recorded ? "undo" : "taken")} type="button"><span aria-hidden="true">{row.state === "taken" ? "✓" : row.state === "skipped" ? "–" : ""}</span></button></li>; })}{hiddenDoses > 0 && <li className="today-popup-todos__more"><button onClick={() => void openHiddenDose()} type="button">+{hiddenDoses} more</button></li>}</ol>}
        {continuingTreatments.length > 0 && <p className="today-popup-medicine__continues" role="status"><strong>{continuingTreatments.length === 1 ? continuingTreatments[0].name : `${continuingTreatments.length} treatments`} {continuingTreatments.length === 1 ? "continues" : "continue"}</strong><span>No doses scheduled today.</span></p>}
      </section>}
      {todayTodos.length > 0 && <section className="today-popup-todos" aria-labelledby="today-todos-heading">
        <header><strong id="today-todos-heading">To Do:</strong><span>{openTodayTodos.length} need attention</span></header>
        <ol>{visibleTodos.map((item) => <li data-completed={item.completedAt !== null || undefined} key={item.id}>
          <button aria-label={`${item.completedAt ? "Restore" : "Complete"} ${item.title}`} className="today-popup-todos__check" onClick={() => void toggleTodo(item)} type="button"><span aria-hidden="true">{item.completedAt ? "✓" : ""}</span></button>
          <button className="today-popup-todos__title" onClick={() => void openTodoDetails(item)} title={`Open details for ${item.title}`} type="button">{item.title}</button>
          <small>{ownerName(item.ownerKind, item.ownerId)}</small>
          {!item.completedAt && <button aria-label={`Move ${item.title} to tomorrow`} className="today-popup-todos__defer" onClick={() => void deferTodo(item)} title="Move to tomorrow" type="button"><svg aria-hidden="true" viewBox="0 0 16 16"><path d="M8 2v3m-4.2-.8L5.9 6M2 8h3m7.5-3.5A5.5 5.5 0 1 1 5 12.9"/><path d="m3.7 11.1 1.5 2.2-2.6.4"/></svg><span>Not today</span></button>}
        </li>)}{hasMoreTodos && <li className="today-popup-todos__more"><button onClick={() => void openManagerWindow("todos")} type="button">+{todayTodos.length - visibleTodos.length} more</button></li>}</ol>
      </section>}
      {[actionError, workspaceError, medicineError].filter(Boolean).map((message) => <p className="today-popup-shell__error" key={message} role="status">{message}</p>)}
    </main>
  );
}
