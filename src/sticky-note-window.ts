import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { LogicalSize, PhysicalPosition } from "@tauri-apps/api/window";
import type { PopupAnchor } from "./event-workspace-model";
import {
  reachableStoredPosition,
  readStoredFloatingGeometry,
} from "./event-workspace-window";
import {
  STICKY_NOTE_GEOMETRY_LABEL,
  STICKY_NOTE_WINDOW_GEOMETRY,
  STICKY_NOTE_WINDOW_LABEL,
} from "./sticky-note-model";

function restoredSize() {
  const stored = readStoredFloatingGeometry(STICKY_NOTE_GEOMETRY_LABEL);
  const { minWidth, minHeight, width, height } = STICKY_NOTE_WINDOW_GEOMETRY;
  return {
    width: typeof stored.width === "number" && stored.width >= minWidth && stored.width <= 1600
      ? stored.width
      : width,
    height: typeof stored.height === "number" && stored.height >= minHeight && stored.height <= 1200
      ? stored.height
      : height,
  };
}

function fallbackPosition(anchor: PopupAnchor, width: number, height: number) {
  const gap = Math.round(6 * anchor.scaleFactor);
  const physicalWidth = Math.round(width * anchor.scaleFactor);
  const physicalHeight = Math.round(height * anchor.scaleFactor);
  const rightCandidate = anchor.right + gap;
  const leftCandidate = anchor.left - gap - physicalWidth;
  const x = rightCandidate + physicalWidth <= anchor.monitorRight
    ? rightCandidate
    : Math.max(anchor.monitorLeft, leftCandidate);
  return new PhysicalPosition(
    x,
    Math.min(
      Math.max(anchor.monitorTop, anchor.top),
      Math.max(anchor.monitorTop, anchor.monitorBottom - physicalHeight),
    ),
  );
}

export async function openStickyNoteWindow(
  anchor: PopupAnchor,
  onClosed: () => void,
  onError?: (message: string) => void,
) {
  const existing = await WebviewWindow.getByLabel(STICKY_NOTE_WINDOW_LABEL);
  if (existing) {
    await existing.unminimize();
    await existing.show();
    await existing.setFocus();
    return;
  }

  const size = restoredSize();
  const stored = readStoredFloatingGeometry(STICKY_NOTE_GEOMETRY_LABEL);
  const position = await reachableStoredPosition(stored)
    ?? fallbackPosition(anchor, size.width, size.height);
  const noteWindow = new WebviewWindow(STICKY_NOTE_WINDOW_LABEL, {
    url: "/?window=sticky-note",
    title: "Attention Hub - Sticky note",
    ...size,
    minWidth: STICKY_NOTE_WINDOW_GEOMETRY.minWidth,
    minHeight: STICKY_NOTE_WINDOW_GEOMETRY.minHeight,
    decorations: false,
    resizable: true,
    transparent: true,
    shadow: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    visible: false,
  });
  noteWindow.once("tauri://created", () => {
    void (async () => {
      await noteWindow.setMinSize(new LogicalSize(
        STICKY_NOTE_WINDOW_GEOMETRY.minWidth,
        STICKY_NOTE_WINDOW_GEOMETRY.minHeight,
      ));
      await noteWindow.setPosition(position);
      await noteWindow.show();
      await noteWindow.setFocus();
    })().catch((cause) => onError?.(`Sticky note could not be shown: ${String(cause)}`));
  });
  noteWindow.once("tauri://destroyed", onClosed);
  noteWindow.once("tauri://error", ({ payload }) => {
    onClosed();
    onError?.(`Sticky-note window failed: ${String(payload)}`);
  });
}
