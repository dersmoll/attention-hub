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

let opening: Promise<void> | null = null;

const wait = (milliseconds: number) => new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds));

async function revealExistingMedicineManager() {
  // `getByLabel` can briefly return a handle whose native window is already
  // tearing down. Retrying gives Tauri time to remove that stale handle before
  // deciding a new manager needs to be created.
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const existing = await WebviewWindow.getByLabel(MEDICINE_MANAGER_WINDOW_LABEL);
    if (!existing) return false;
    try {
      await existing.show();
      await existing.setFocus();
      return true;
    } catch {
      await wait(50);
    }
  }
  return false;
}

export async function openMedicineManagerWindow() {
  if (opening) return opening;
  opening = (async () => {
    if (await revealExistingMedicineManager()) return;
    const stored = readStoredFloatingGeometry(MEDICINE_MANAGER_WINDOW_LABEL);
    const manager = new WebviewWindow(MEDICINE_MANAGER_WINDOW_LABEL, {
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
    await new Promise<void>((resolve, reject) => {
      manager.once("tauri://created", () => {
        void (async () => {
          await manager.setMinSize(new LogicalSize(MEDICINE_MANAGER_WINDOW_GEOMETRY.minWidth, MEDICINE_MANAGER_WINDOW_GEOMETRY.minHeight));
          const position = await reachableStoredPosition(stored);
          if (position) await manager.setPosition(position).catch(() => undefined);
          await manager.show();
          await manager.setFocus();
          resolve();
        })().catch(reject);
      });
      manager.once("tauri://error", ({ payload: error }) => reject(new Error(String(error))));
    });
  })();
  try {
    await opening;
  } finally {
    opening = null;
  }
}
