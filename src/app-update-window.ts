import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { check } from "@tauri-apps/plugin-updater";
import {
  APP_UPDATE_PROMPT_STORAGE_KEY,
  shouldPromptForUpdate,
} from "./app-update-model";

export const APP_UPDATE_WINDOW_LABEL = "update";

export async function openAppUpdateWindow() {
  const existing = await WebviewWindow.getByLabel(APP_UPDATE_WINDOW_LABEL);
  if (existing) {
    await existing.unminimize();
    await existing.show();
    await existing.setFocus();
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const updateWindow = new WebviewWindow(APP_UPDATE_WINDOW_LABEL, {
      url: "/",
      title: "Attention Hub update",
      width: 420,
      height: 240,
      minWidth: 420,
      minHeight: 240,
      maxWidth: 420,
      maxHeight: 240,
      center: true,
      focus: true,
      resizable: false,
      maximizable: false,
      alwaysOnTop: true,
    });
    updateWindow.once("tauri://created", () => resolve());
    updateWindow.once("tauri://error", (error) => reject(error));
  });
}

export async function checkAndOpenAppUpdate() {
  const update = await check({ timeout: 30_000 });
  if (!update) {
    return false;
  }

  try {
    const storedPrompt = window.localStorage.getItem(
      APP_UPDATE_PROMPT_STORAGE_KEY,
    );
    if (!shouldPromptForUpdate(update.version, storedPrompt)) {
      return false;
    }
    await openAppUpdateWindow();
    return true;
  } finally {
    await update.close().catch(() => undefined);
  }
}
