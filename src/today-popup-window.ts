import { PhysicalPosition } from "@tauri-apps/api/window";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import {
  TODAY_POPUP_WINDOW_LABEL,
  type TodayPopupPayload,
} from "./today-popup-model";

export function todayPopupPosition(payload: TodayPopupPayload) {
  const { anchor } = payload;
  const gap = Math.round(5 * anchor.scaleFactor);
  const width = Math.round(payload.width * anchor.scaleFactor);
  const height = Math.round(payload.height * anchor.scaleFactor);
  const preferredX = anchor.left;
  const preferredY =
    payload.placement === "above"
      ? anchor.top - gap - height
      : anchor.bottom + gap;
  return new PhysicalPosition(
    Math.min(
      Math.max(anchor.monitorLeft, preferredX),
      anchor.monitorRight - width,
    ),
    Math.min(
      Math.max(anchor.monitorTop, preferredY),
      anchor.monitorBottom - height,
    ),
  );
}

export async function createTodayPopupWindow(
  payload: TodayPopupPayload,
  onPositioned: () => void,
  onClosed: () => void,
  onError?: (message: string) => void,
) {
  const existing = await WebviewWindow.getByLabel(TODAY_POPUP_WINDOW_LABEL);
  if (existing) {
    await existing.close();
  }

  const popup = new WebviewWindow(TODAY_POPUP_WINDOW_LABEL, {
    url: "/?window=today",
    title: "Attention Hub - Today",
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
    void popup
      .setPosition(todayPopupPosition(payload))
      .then(onPositioned)
      .catch((cause) => {
        onError?.(`Today popup could not be positioned: ${String(cause)}`);
      });
  });
  popup.once("tauri://destroyed", onClosed);
  popup.once("tauri://error", ({ payload: error }) => {
    onClosed();
    onError?.(`Today popup failed: ${String(error)}`);
  });
}
