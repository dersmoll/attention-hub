import { createAuxiliaryWindow, findAuxiliaryWindow, revealAuxiliaryWindow } from "./auxiliary-window";
import { check } from "@tauri-apps/plugin-updater";
import {
  APP_UPDATE_PROMPT_STORAGE_KEY,
  shouldPromptForUpdate,
} from "./app-update-model";

export const APP_UPDATE_WINDOW_LABEL = "update";

export async function openAppUpdateWindow() {
  const existing = await findAuxiliaryWindow(APP_UPDATE_WINDOW_LABEL);
  if (existing) {
    await revealAuxiliaryWindow(existing);
    return;
  }

  const updateWindow = await createAuxiliaryWindow(APP_UPDATE_WINDOW_LABEL, {
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
  await revealAuxiliaryWindow(updateWindow);
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
