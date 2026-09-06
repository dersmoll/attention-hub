import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { PhysicalPosition } from "@tauri-apps/api/window";
import { MEDICINE_PANEL_WINDOW_LABEL, type MedicinePanelPayload } from "./medicine-panel-model";

export function medicinePanelPosition(payload: MedicinePanelPayload) {
  const gap = Math.round(5 * payload.anchor.scaleFactor);
  const width = Math.round(payload.width * payload.anchor.scaleFactor);
  const height = Math.round(payload.height * payload.anchor.scaleFactor);
  const preferredX = payload.anchor.right - width;
  const preferredY = payload.placement === "above"
    ? payload.anchor.top - gap - height
    : payload.anchor.bottom + gap;
  return new PhysicalPosition(
    Math.min(Math.max(payload.anchor.monitorLeft, preferredX), payload.anchor.monitorRight - width),
    Math.min(Math.max(payload.anchor.monitorTop, preferredY), payload.anchor.monitorBottom - height),
  );
}

export async function createMedicinePanelWindow(
  payload: MedicinePanelPayload,
  onPositioned: () => void,
  onClosed: () => void,
  onError?: (message: string) => void,
) {
  const existing = await WebviewWindow.getByLabel(MEDICINE_PANEL_WINDOW_LABEL);
  if (existing) {
    await existing.close();
    throw new Error("Medicine panel was still closing.");
  }
  const popup = new WebviewWindow(MEDICINE_PANEL_WINDOW_LABEL, {
    url: "/?window=medicine-panel",
    title: "Attention Hub - Medicine",
    width: payload.width,
    height: payload.height,
    decorations: false,
    resizable: false,
    transparent: true,
    shadow: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    visible: false,
  });
  popup.once("tauri://created", () => {
    void popup.setPosition(medicinePanelPosition(payload)).then(onPositioned).catch((cause) => onError?.(`Medicine panel could not be positioned: ${String(cause)}`));
  });
  popup.once("tauri://destroyed", onClosed);
  popup.once("tauri://error", ({ payload: error }) => {
    onClosed();
    onError?.(`Medicine panel failed: ${String(error)}`);
  });
}
