import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { LogicalSize } from "@tauri-apps/api/window";
import { readStoredFloatingGeometry, reachableStoredPosition } from "./event-workspace-window";

export const MEDICINE_MANAGER_WINDOW_LABEL = "medicine";
export const MEDICINE_MANAGER_WINDOW_GEOMETRY = {
  width: 940,
  height: 640,
  minWidth: 820,
  minHeight: 520,
} as const;

export async function openMedicineManagerWindow() {
  const existing = await WebviewWindow.getByLabel(MEDICINE_MANAGER_WINDOW_LABEL);
  if (existing) {
    await existing.show();
    await existing.setFocus();
    return;
  }
  const stored = readStoredFloatingGeometry(MEDICINE_MANAGER_WINDOW_LABEL);
  const window = new WebviewWindow(MEDICINE_MANAGER_WINDOW_LABEL, {
    url: "/",
    title: "Attention Hub - Medicine",
    width: Math.max(MEDICINE_MANAGER_WINDOW_GEOMETRY.minWidth, stored.width ?? MEDICINE_MANAGER_WINDOW_GEOMETRY.width),
    height: Math.max(MEDICINE_MANAGER_WINDOW_GEOMETRY.minHeight, stored.height ?? MEDICINE_MANAGER_WINDOW_GEOMETRY.height),
    minWidth: MEDICINE_MANAGER_WINDOW_GEOMETRY.minWidth,
    minHeight: MEDICINE_MANAGER_WINDOW_GEOMETRY.minHeight,
    decorations: true,
    resizable: true,
    visible: false,
  });
  window.once("tauri://created", () => {
    void (async () => {
      await window.setMinSize(new LogicalSize(MEDICINE_MANAGER_WINDOW_GEOMETRY.minWidth, MEDICINE_MANAGER_WINDOW_GEOMETRY.minHeight));
      const position = await reachableStoredPosition(stored);
      if (position) await window.setPosition(position).catch(() => undefined);
      await window.show();
      await window.setFocus();
    })();
  });
}
