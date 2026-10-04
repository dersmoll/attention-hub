import { invoke } from "@tauri-apps/api/core";
import { emit, emitTo, listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import {
  AUXILIARY_WINDOW_FAILURE_EVENT, AUXILIARY_WINDOW_READY_EVENT,
  auxiliaryWindowFailureMessage, createReadyAuxiliaryWindow, withWindowDeadline,
  type AuxiliaryWindowReady,
} from "./auxiliary-window-lifecycle";

type WindowOptions = NonNullable<ConstructorParameters<typeof WebviewWindow>[1]>;
const opening = new Map<string, Promise<WebviewWindow>>();

/** Only a fixed, user-facing message crosses windows; native error strings can
 * contain filesystem paths or URLs and must never become a widget notice. */
export async function withAuxiliaryWindowDeadline<T>(label: string, operation: () => Promise<T>): Promise<T> {
  try {
    return await withWindowDeadline(operation);
  } catch {
    const message = auxiliaryWindowFailureMessage(label);
    void emitTo("main", AUXILIARY_WINDOW_FAILURE_EVENT, { label, message }).catch(() => undefined);
    throw new Error(message);
  }
}

export function announceAuxiliaryWindowReady() {
  const requestId = new URLSearchParams(window.location.search).get("auxiliaryRequestId");
  const label = getCurrentWindow().label;
  if (requestId && label !== "main") {
    void emit(AUXILIARY_WINDOW_READY_EVENT, { label, requestId }).catch(() => undefined);
  }
}

export async function findAuxiliaryWindow(label: string) {
  const pending = opening.get(label);
  if (pending) return pending;
  return withAuxiliaryWindowDeadline(label, async () => {
    const existing = await WebviewWindow.getByLabel(label);
    // A registered label may outlive failed native creation. A native query
    // must answer before treating that label as a usable window.
    if (existing) await existing.isVisible();
    return existing;
  });
}

export function createAuxiliaryWindow(label: string, options: WindowOptions): Promise<WebviewWindow> {
  const pending = opening.get(label);
  if (pending) return pending;
  const requestId = crypto.randomUUID();
  const url = new URL(options.url ?? "/", "http://tauri.localhost");
  url.searchParams.set("auxiliaryRequestId", requestId);
  const operation = withAuxiliaryWindowDeadline(label, () => createReadyAuxiliaryWindow({
    label, requestId,
    subscribe: (ready) => listen<AuxiliaryWindowReady>(AUXILIARY_WINDOW_READY_EVENT, ({ payload }) => ready(payload)),
    create: () => invoke<void>("create_auxiliary_window", {
      options: { ...options, label, url: `${url.pathname}${url.search}` },
    }),
    resolveWindow: async () => {
      const created = await WebviewWindow.getByLabel(label);
      if (!created) throw new Error("Window unavailable");
      return created;
    },
  }));
  opening.set(label, operation);
  void operation.finally(() => { if (opening.get(label) === operation) opening.delete(label); }).catch(() => undefined);
  return operation;
}

export async function waitForAuxiliaryWindowVisible(window: WebviewWindow) {
  let active = true;
  try {
    await withAuxiliaryWindowDeadline(window.label, async () => {
      while (active) {
        const visible = await window.isVisible();
        if (!active || visible) return;
        await new Promise<void>((resolve) => setTimeout(resolve, 50));
      }
    });
  } finally {
    active = false;
  }
}

export async function revealAuxiliaryWindow(window: WebviewWindow) {
  return withAuxiliaryWindowDeadline(window.label, async () => {
    await window.unminimize();
    await window.show();
    await window.setFocus();
    await waitForAuxiliaryWindowVisible(window);
  });
}
