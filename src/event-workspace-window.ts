import { emitTo } from "@tauri-apps/api/event";
import {
  LogicalSize,
  PhysicalPosition,
} from "@tauri-apps/api/window";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import {
  EVENT_SETTINGS_OPEN_EVENT,
  EVENT_SETTINGS_WINDOW_GEOMETRY,
  EVENT_SETTINGS_WINDOW_LABEL,
  PROJECT_PANEL_OPEN_EVENT,
  PROJECT_NOTES_WINDOW_GEOMETRY,
  PROJECT_PANEL_WINDOW_GEOMETRY,
  PROJECT_PANEL_WINDOW_LABEL,
  PROJECT_TODOS_WINDOW_GEOMETRY,
  TODO_DETAIL_WINDOW_GEOMETRY,
  type EventSettingsOpenPayload,
  type PopupAnchor,
  type ProjectPanelOpenPayload,
} from "./event-workspace-model";

type FloatingGeometry = {
  width: number;
  height: number;
  minWidth: number;
  minHeight: number;
};

type StoredFloatingGeometry = Partial<{
  x: number;
  y: number;
  width: number;
  height: number;
}>;

const FLOATING_GEOMETRY_STORAGE_PREFIX = "attention-hub.floating-window.v1.";

function geometryStorageKey(label: string) {
  return `${FLOATING_GEOMETRY_STORAGE_PREFIX}${label}`;
}

export function projectPanelGeometryLabel(view: "notes" | "todos" | "todo") {
  return `${PROJECT_PANEL_WINDOW_LABEL}-${view}`;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function readStoredFloatingGeometry(label: string): StoredFloatingGeometry {
  try {
    const value = JSON.parse(localStorage.getItem(geometryStorageKey(label)) ?? "null") as
      | StoredFloatingGeometry
      | null;
    if (!value) return {};
    return Object.fromEntries(
      Object.entries(value).filter(([, item]) => isFiniteNumber(item)),
    ) as StoredFloatingGeometry;
  } catch {
    return {};
  }
}

export function writeStoredFloatingGeometry(
  label: string,
  update: StoredFloatingGeometry,
) {
  localStorage.setItem(
    geometryStorageKey(label),
    JSON.stringify({ ...readStoredFloatingGeometry(label), ...update }),
  );
}

function geometryWithStoredSize(label: string, geometry: FloatingGeometry): FloatingGeometry {
  const stored = readStoredFloatingGeometry(label);
  return {
    ...geometry,
    width:
      isFiniteNumber(stored.width) && stored.width >= geometry.minWidth && stored.width <= 1600
        ? stored.width
        : geometry.width,
    height:
      isFiniteNumber(stored.height) && stored.height >= geometry.minHeight && stored.height <= 1200
        ? stored.height
        : geometry.height,
  };
}

function geometryWithinAnchor(
  anchor: PopupAnchor,
  geometry: FloatingGeometry,
): FloatingGeometry {
  const availableWidth =
    (anchor.monitorRight - anchor.monitorLeft) / anchor.scaleFactor - 16;
  const availableHeight =
    (anchor.monitorBottom - anchor.monitorTop) / anchor.scaleFactor - 16;
  return {
    ...geometry,
    width: Math.max(geometry.minWidth, Math.min(geometry.width, availableWidth)),
    height: Math.max(geometry.minHeight, Math.min(geometry.height, availableHeight)),
  };
}

function anchoredPosition(
  anchor: PopupAnchor,
  geometry: FloatingGeometry,
  stored: StoredFloatingGeometry,
) {
  const gap = Math.round(6 * anchor.scaleFactor);
  const width = Math.round(geometry.width * anchor.scaleFactor);
  const height = Math.round(geometry.height * anchor.scaleFactor);
  const leftCandidate = anchor.left - gap - width;
  const storedX = isFiniteNumber(stored.x) ? stored.x : null;
  const storedY = isFiniteNumber(stored.y) ? stored.y : null;
  const x =
    storedX !== null
      ? Math.min(Math.max(anchor.monitorLeft, storedX), anchor.monitorRight - width)
      : leftCandidate >= anchor.monitorLeft
      ? leftCandidate
      : Math.min(
          Math.max(anchor.monitorLeft, anchor.right + gap),
          anchor.monitorRight - width,
        );
  return new PhysicalPosition(
    x,
    Math.min(
      Math.max(anchor.monitorTop, storedY ?? anchor.top),
      anchor.monitorBottom - height,
    ),
  );
}

async function showAnchoredWindow(
  label: string,
  title: string,
  eventName: string,
  payload: EventSettingsOpenPayload | ProjectPanelOpenPayload,
  geometry: FloatingGeometry,
  onError?: (message: string) => void,
  rememberGeometry = true,
  geometryLabel = label,
) {
  const existing = await WebviewWindow.getByLabel(label);
  const stored = rememberGeometry ? readStoredFloatingGeometry(geometryLabel) : {};
  const resolvedGeometry = geometryWithinAnchor(
    payload.anchor,
    rememberGeometry ? geometryWithStoredSize(geometryLabel, geometry) : geometry,
  );
  const position = anchoredPosition(payload.anchor, resolvedGeometry, stored);
  if (existing) {
    await existing.setMinSize(new LogicalSize(geometry.minWidth, geometry.minHeight));
    await existing.setSize(new LogicalSize(resolvedGeometry.width, resolvedGeometry.height));
    await existing.setPosition(position);
    await existing.unminimize();
    await existing.show();
    await existing.setFocus();
    await emitTo(label, eventName, payload);
    return;
  }

  const params = new URLSearchParams(
    "eventToken" in payload
      ? { eventToken: payload.eventToken }
      : { projectId: payload.projectId, ...(payload.itemId ? { itemId: payload.itemId } : {}), ...(payload.view ? { view: payload.view } : {}) },
  );
  const window = new WebviewWindow(label, {
    url: `/?${params.toString()}`,
    title,
    ...resolvedGeometry,
    decorations: false,
    resizable: true,
    transparent: true,
    shadow: false,
    alwaysOnTop: true,
    visible: false,
  });
  window.once("tauri://created", () => {
    void (async () => {
      await window.setPosition(position).catch(() => undefined);
      await window.show();
      await window.setFocus();
    })().catch((cause) => onError?.(`${title} could not be shown: ${String(cause)}`));
  });
  window.once("tauri://error", ({ payload: error }) => {
    onError?.(`${title} window failed: ${String(error)}`);
  });
}

export function openEventSettingsWindow(
  payload: EventSettingsOpenPayload,
  onError?: (message: string) => void,
) {
  return showAnchoredWindow(
    EVENT_SETTINGS_WINDOW_LABEL,
    "Attention Hub - Event settings",
    EVENT_SETTINGS_OPEN_EVENT,
    payload,
    EVENT_SETTINGS_WINDOW_GEOMETRY,
    onError,
  );
}

export function openProjectPanelWindow(
  payload: ProjectPanelOpenPayload,
  onError?: (message: string) => void,
) {
  const quickView = payload.view === "notes" || payload.view === "todos" || payload.view === "todo" ? payload.view : null;
  const geometry = payload.view === "notes"
    ? PROJECT_NOTES_WINDOW_GEOMETRY
    : payload.view === "todos"
      ? PROJECT_TODOS_WINDOW_GEOMETRY
      : payload.view === "todo"
        ? TODO_DETAIL_WINDOW_GEOMETRY
      : PROJECT_PANEL_WINDOW_GEOMETRY;
  return showAnchoredWindow(
    PROJECT_PANEL_WINDOW_LABEL,
    "Attention Hub - Project",
    PROJECT_PANEL_OPEN_EVENT,
    payload,
    geometry,
    onError,
    quickView !== null,
    quickView ? projectPanelGeometryLabel(quickView) : PROJECT_PANEL_WINDOW_LABEL,
  );
}
