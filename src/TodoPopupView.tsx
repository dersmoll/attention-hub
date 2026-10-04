import { invoke } from "@tauri-apps/api/core";
import { emitTo, listen } from "@tauri-apps/api/event";
import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { withAuxiliaryWindowDeadline } from "./auxiliary-window";
import { TODO_POPUP_WINDOW_LABEL } from "./todo-popup-model";
import { HubCloseIcon } from "./HubCloseIcon";
import { TodoContent } from "./TodoContent";
import { openManagerWindow } from "./manager-window";
import { TODO_POPUP_CLOSED_EVENT, TODO_POPUP_OPEN_EVENT, TODO_POPUP_READY_EVENT, todoPopupGroups, type TodoPopupPayload } from "./todo-popup-model";
import { todoPopupPosition } from "./todo-popup-window";
import { WORKSPACE_CHANGED_EVENT, type ActionItem, type WorkspaceSnapshot } from "./workspace-model";
import { useWidgetPanelStyle } from "./use-widget-panel-style";

export function TodoPopupView() {
  const style = useWidgetPanelStyle();
  const [payload, setPayload] = useState<TodoPopupPayload | null>(null);
  const [snapshot, setSnapshot] = useState<WorkspaceSnapshot | null>(null);
  const [frozen, setFrozen] = useState<WorkspaceSnapshot | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [retained, setRetained] = useState<Set<string>>(() => new Set());
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const checkButtons = useRef(new Map<string, HTMLButtonElement>());
  const order = useRef<string[]>([]);
  const pending = useRef(false);
  const pressing = useRef(false);
  const shown = useRef(false);
  const shell = useRef<HTMLElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const toolbar = useRef<HTMLElement>(null);
  const footer = useRef<HTMLElement>(null);
  const display = frozen ?? snapshot;
  const groups = useMemo(() => {
    if (!display) return [];
    const next = todoPopupGroups(display, retained, order.current);
    for (const group of next) for (const item of group.items) {
      if (!order.current.includes(item.id)) order.current.push(item.id);
    }
    return next;
  }, [display, retained]);
  const activeCount = groups.reduce((total, group) => total + group.items.filter(item => item.completedAt === null).length, 0);
  const acceptSnapshot = useCallback((next: WorkspaceSnapshot) => {
    setSnapshot(current => !current || next.revision >= current.revision ? next : current);
  }, []);
  useEffect(() => {
    let disposed = false;
    const stops: Array<() => void> = [];
    const refresh = async () => {
      try {
        const next = await invoke<WorkspaceSnapshot>("get_workspace_snapshot");
        if (!disposed) { acceptSnapshot(next); setLoadFailed(false); }
      } catch { if (!disposed) setLoadFailed(true); }
    };
    void listen(WORKSPACE_CHANGED_EVENT, () => void refresh()).then(stop => disposed ? stop() : stops.push(stop));
    void listen<TodoPopupPayload>(TODO_POPUP_OPEN_EVENT, ({ payload: next }) => {
      if (disposed) return;
      setPayload(next); void refresh();
    }).then(stop => { if (disposed) stop(); else { stops.push(stop); void emitTo("main", TODO_POPUP_READY_EVENT); } });
    return () => { disposed = true; stops.forEach(stop => stop()); };
  }, [acceptSnapshot]);

  const close = useCallback(async () => {
    await emitTo("main", TODO_POPUP_CLOSED_EVENT).catch(() => undefined);
    await getCurrentWindow().close();
  }, []);
  const release = useCallback(() => { if (!pending.current && !pressing.current) setFrozen(null); }, []);
  useEffect(() => {
    const up = () => { pressing.current = false; window.setTimeout(release, 0); };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) { event.preventDefault(); void close(); }
    };
    window.addEventListener("pointerup", up); window.addEventListener("pointercancel", up);
    window.addEventListener("blur", up); window.addEventListener("keyup", up); window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("pointerup", up); window.removeEventListener("pointercancel", up);
      window.removeEventListener("blur", up); window.removeEventListener("keyup", up); window.removeEventListener("keydown", key);
    };
  }, [close, release]);

  useEffect(() => {
    if (!payload) return;
    let disposed = false;
    let busy = false;
    let queued = false;
    let lastHeight = 0;
    const current = getCurrentWindow();
    const maxHeight = Math.max(120, Math.min(600, Math.floor((payload.anchor.monitorBottom - payload.anchor.monitorTop) / payload.anchor.scaleFactor - 12)));
    const measure = async () => {
      if (disposed) return;
      if (busy) { queued = true; return; }
      busy = true;
      try {
        do {
          queued = false;
          const natural = (content.current?.scrollHeight ?? 0) + (toolbar.current?.offsetHeight ?? 32) + (footer.current?.offsetHeight ?? 20) + 34;
          const height = Math.min(maxHeight, Math.max(120, Math.ceil(natural)));
          if (height !== lastHeight) {
            const next = { ...payload, height };
            await withAuxiliaryWindowDeadline(TODO_POPUP_WINDOW_LABEL, () => current.setSize(new LogicalSize(next.width, next.height)));
            if (disposed) return;
            await withAuxiliaryWindowDeadline(TODO_POPUP_WINDOW_LABEL, () => current.setPosition(todoPopupPosition(next)));
            lastHeight = height;
          }
          if (!disposed && !shown.current) {
            await withAuxiliaryWindowDeadline(TODO_POPUP_WINDOW_LABEL, () => current.show());
            if (disposed) return;
            await withAuxiliaryWindowDeadline(TODO_POPUP_WINDOW_LABEL, () => current.setFocus());
            shown.current = true;
          }
        } while (!disposed && queued);
      } catch { if (!disposed) setActionError("The popup size could not be updated. Close and reopen To-dos."); }
      finally { busy = false; }
    };
    const observer = new ResizeObserver(() => void measure());
    if (content.current) observer.observe(content.current);
    if (toolbar.current) observer.observe(toolbar.current);
    if (footer.current) observer.observe(footer.current);
    void measure();
    return () => { disposed = true; observer.disconnect(); };
  }, [payload]);

  const toggleComplete = async (item: ActionItem) => {
    if (pending.current) return;
    const hadFocus = document.activeElement === checkButtons.current.get(item.id);
    pending.current = true; setPendingId(item.id); setFrozen(current => current ?? snapshot);
    try {
      const next = await invoke<WorkspaceSnapshot>(item.completedAt ? "restore_action_item" : "complete_action_item", { itemId: item.id });
      setRetained(current => new Set([...current, item.id]));
      acceptSnapshot(next); setLoadFailed(false); setActionError(null);
    } catch { setActionError("The task could not be updated. Try again."); }
    finally {
      pending.current = false; setPendingId(null); release();
      if (hadFocus) requestAnimationFrame(() => {
        const button = checkButtons.current.get(item.id);
        if (document.activeElement === document.body || document.activeElement === button) button?.focus({ preventScroll: true });
      });
    }
  };
  const manage = async () => {
    try { await openManagerWindow("todos"); await close(); }
    catch { setActionError("Project Hub could not be opened. Your To-dos remain available here."); }
  };

  return <main className="medicine-panel todo-popup" ref={shell} style={style}
    onPointerDown={() => { pressing.current = true; setFrozen(current => current ?? snapshot); }}
    onKeyDown={event => { if (event.key === "Enter" || event.key === " ") setFrozen(current => current ?? snapshot); }}>
    <button type="button" aria-label="Close To-dos popup" className="hub-close-button medicine-panel__close" onClick={() => void close()}><HubCloseIcon /></button>
    <header className="medicine-panel__toolbar" ref={toolbar}><strong>To-dos</strong><button type="button" onClick={() => void manage()}>Manage to-dos</button></header>
    <div className="todo-popup__body"><div ref={content} className="todo-popup__content">
      {snapshot?.recoveredFromBackup && <p role="status">Showing recovered workspace backup data.</p>}
      {groups.map(group => <section key={group.key} aria-label={group.label}>
        <header><div><strong>{group.label}</strong><span>{group.items.filter(item => !item.completedAt).length} open</span></div></header>
        <ol>{group.items.map(item => <li key={item.id} data-completed={item.completedAt !== null || undefined}>
          <button type="button" className="medicine-panel__check" role="checkbox" aria-checked={item.completedAt !== null}
            aria-label={`${item.completedAt ? "Undo completion of" : "Complete"} ${item.title}`} disabled={pendingId !== null}
            ref={element => { if (element) checkButtons.current.set(item.id, element); else checkButtons.current.delete(item.id); }}
            onClick={() => void toggleComplete(item)}><span aria-hidden="true">{item.completedAt ? "✓" : ""}</span></button>
          <TodoContent item={item} expanded={expanded === item.id} onToggle={() => setExpanded(current => current === item.id ? null : item.id)} showSchedule />
        </li>)}</ol>
      </section>)}
      {!groups.length && <p role="status">{loadFailed ? "To-dos could not be loaded." : !snapshot ? "Loading to-dos…" : "No open to-dos."}</p>}
      {loadFailed && snapshot && <p className="medicine-panel__error" role="alert">To-dos could not be refreshed. These tasks may be out of date.</p>}
      {actionError && <p className="medicine-panel__error" role="alert">{actionError}</p>}
    </div></div>
    <footer className="medicine-panel__footer" ref={footer}><span>{snapshot ? `${activeCount} open · completed tasks stay here for Undo until you close` : "To-dos"}</span></footer>
  </main>;
}
