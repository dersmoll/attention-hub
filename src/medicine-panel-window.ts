import { createAuxiliaryWindow, findAuxiliaryWindow, waitForAuxiliaryWindowVisible, withAuxiliaryWindowDeadline } from "./auxiliary-window";
import { auxiliaryWindowFailureMessage } from "./auxiliary-window-lifecycle";
import { PhysicalPosition } from "@tauri-apps/api/window";
import { MEDICINE_PANEL_WINDOW_LABEL, type MedicinePanelPayload } from "./medicine-panel-model";

export function medicinePanelPosition(payload: MedicinePanelPayload) {
  const { anchor } = payload;
  const gap = Math.round(5 * anchor.scaleFactor);
  const width = Math.round(payload.width * anchor.scaleFactor);
  const height = Math.round(payload.height * anchor.scaleFactor);
  const preferredX = payload.placement === "left"
    ? anchor.left - gap - width
    : payload.placement === "right"
      ? anchor.right + gap
      : anchor.right - width;
  const preferredY = payload.placement === "above"
    ? anchor.top - gap - height
    : payload.placement === "below"
      ? anchor.bottom + gap
      : anchor.top;
  // An oversized popup cannot fit, but its top-left must remain reachable.
  const maxX = Math.max(anchor.monitorLeft, anchor.monitorRight - width);
  const maxY = Math.max(anchor.monitorTop, anchor.monitorBottom - height);
  return new PhysicalPosition(
    Math.min(Math.max(anchor.monitorLeft, preferredX), maxX),
    Math.min(Math.max(anchor.monitorTop, preferredY), maxY),
  );
}

export async function createMedicinePanelWindow(
  payload: MedicinePanelPayload,
  onPositioned: () => void,
  onClosed: () => void,
  onError?: (message: string) => void,
) {
  try {
    const existing = await findAuxiliaryWindow(MEDICINE_PANEL_WINDOW_LABEL);
    if (existing) {
      throw new Error("Medicine panel is already open.");
    }
    const popup = await createAuxiliaryWindow(MEDICINE_PANEL_WINDOW_LABEL, {
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
    await withAuxiliaryWindowDeadline(MEDICINE_PANEL_WINDOW_LABEL, async () => {
      await popup.once("tauri://destroyed", onClosed);
      await popup.setPosition(medicinePanelPosition(payload));
      onPositioned();
      await waitForAuxiliaryWindowVisible(popup);
    });
  } catch {
    onClosed();
    const message = auxiliaryWindowFailureMessage(MEDICINE_PANEL_WINDOW_LABEL);
    onError?.(message);
    throw new Error(message);
  }
}
