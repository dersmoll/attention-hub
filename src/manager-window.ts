import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { LogicalSize } from "@tauri-apps/api/window";
import { emitTo } from "@tauri-apps/api/event";
import { readStoredFloatingGeometry, reachableStoredPosition } from "./event-workspace-window";

export const MANAGER_WINDOW_LABEL = "manager";
export const MANAGER_FOCUS_EVENT = "manager-focus-requested";
export const MANAGER_WINDOW_GEOMETRY = { width: 940, height: 640, minWidth: 820, minHeight: 520 } as const;
const MANAGER_WINDOW_TITLE = "Attention Hub - Project Hub";

export async function openManagerWindow(focus: "projects" | "todos" = "projects", projectId?: string, listId?: string) {
  const existing = await WebviewWindow.getByLabel(MANAGER_WINDOW_LABEL);
  if (existing) { await existing.setTitle(MANAGER_WINDOW_TITLE); await existing.show(); await existing.setFocus(); await emitTo(MANAGER_WINDOW_LABEL, MANAGER_FOCUS_EVENT, { focus, projectId, listId }); return; }
  const stored = readStoredFloatingGeometry(MANAGER_WINDOW_LABEL);
  const params = new URLSearchParams({ focus });
  if (projectId) params.set("projectId", projectId);
  if (listId) params.set("listId", listId);
  const window = new WebviewWindow(MANAGER_WINDOW_LABEL, { url: `/?${params}`, title: MANAGER_WINDOW_TITLE, width: Math.max(MANAGER_WINDOW_GEOMETRY.minWidth, stored.width ?? MANAGER_WINDOW_GEOMETRY.width), height: Math.max(MANAGER_WINDOW_GEOMETRY.minHeight, stored.height ?? MANAGER_WINDOW_GEOMETRY.height), minWidth: MANAGER_WINDOW_GEOMETRY.minWidth, minHeight: MANAGER_WINDOW_GEOMETRY.minHeight, decorations: true, resizable: true, visible: false });
  window.once("tauri://created", () => { void (async () => {
    await window.setMinSize(new LogicalSize(MANAGER_WINDOW_GEOMETRY.minWidth, MANAGER_WINDOW_GEOMETRY.minHeight));
    const position = await reachableStoredPosition(stored);
    if (position) await window.setPosition(position).catch(() => undefined);
    await window.show();
    await window.setFocus();
  })(); });
}
