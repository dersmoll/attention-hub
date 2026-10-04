import type { MedicinePanelPayload } from "./medicine-panel-model";
import { isFromActiveOwner, sortActionItems, type ActionItem, type WorkspaceSnapshot } from "./workspace-model";

export const TODO_POPUP_WINDOW_LABEL = "todo-popup";
export const TODO_POPUP_OPEN_EVENT = "todo-popup-opened";
export const TODO_POPUP_READY_EVENT = "todo-popup-ready";
export const TODO_POPUP_CLOSED_EVENT = "todo-popup-closed";
export const TODO_POPUP_WIDTH = 360;
export type TodoPopupPayload = MedicinePanelPayload;

/** Retain only tasks completed in this opening, so Undo stays in the same row. */
export function todoPopupGroups(snapshot: WorkspaceSnapshot, retained: ReadonlySet<string> = new Set(), order: readonly string[] = []) {
  const rank = new Map(order.map((id, index) => [id, index]));
  const items = sortActionItems(snapshot.actionItems.filter(item => isFromActiveOwner(item, snapshot)
    && (item.completedAt === null || retained.has(item.id))));
  if (order.length) items.sort((a, b) => (rank.get(a.id) ?? order.length) - (rank.get(b.id) ?? order.length));
  const groups = new Map<string, { key: string; label: string; items: ActionItem[] }>();
  for (const item of items) {
    const key = `${item.ownerKind}:${item.ownerId}`;
    if (!groups.has(key)) {
      const project = snapshot.projects.find(p => p.id === item.ownerId);
      const list = snapshot.lists.find(l => l.id === item.ownerId);
      const category = snapshot.categories.find(c => c.id === list?.categoryId);
      const label = item.ownerKind === "project" ? project?.name ?? "Project"
        : [category?.name ?? "Personal", list?.name ?? "List"].join(" · ");
      groups.set(key, { key, label, items: [] });
    }
    groups.get(key)!.items.push(item);
  }
  return [...groups.values()];
}
