export const EVENT_SETTINGS_OPEN_EVENT = "event-settings-opened";
export const PROJECT_PANEL_OPEN_EVENT = "project-panel-opened";
export const EVENT_SETTINGS_WINDOW_LABEL = "event-settings";
export const PROJECT_PANEL_WINDOW_LABEL = "project-panel";

export const EVENT_SETTINGS_WINDOW_GEOMETRY = {
  width: 350,
  height: 260,
  minWidth: 300,
  minHeight: 210,
} as const;

export const PROJECT_PANEL_WINDOW_GEOMETRY = {
  width: 420,
  height: 480,
  minWidth: 360,
  minHeight: 360,
} as const;

export const PROJECT_NOTES_WINDOW_GEOMETRY = {
  width: 360,
  height: 240,
  minWidth: 320,
  minHeight: 180,
} as const;

export const PROJECT_TODOS_WINDOW_GEOMETRY = {
  width: 380,
  height: 360,
  minWidth: 320,
  minHeight: 220,
} as const;

export const TODO_DETAIL_WINDOW_GEOMETRY = {
  width: 360,
  height: 280,
  minWidth: 320,
  minHeight: 220,
} as const;

export interface MonitorBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** How much of a restored window's top-left must land on a monitor for the
 * title bar to be grabbable. */
export const MIN_REACHABLE_EDGE = 96;

/** Is a stored window position still usable on the monitors connected now?
 *
 * Saved coordinates outlive the display that produced them. A window placed on
 * a second monitor and restored after undocking opens at coordinates no monitor
 * covers: it is running, focusable by the taskbar, and completely invisible.
 * Falling back to the system's own placement is recoverable; an off-screen
 * window is not. */
export function positionIsReachable(
  x: number,
  y: number,
  monitors: readonly MonitorBounds[],
  minReachableEdge = MIN_REACHABLE_EDGE,
) {
  return monitors.some(
    (monitor) =>
      x >= monitor.x &&
      y >= monitor.y &&
      x <= monitor.x + monitor.width - minReachableEdge &&
      y <= monitor.y + monitor.height - minReachableEdge,
  );
}

export interface PopupAnchor {
  left: number;
  top: number;
  right: number;
  bottom: number;
  scaleFactor: number;
  monitorLeft: number;
  monitorTop: number;
  monitorRight: number;
  monitorBottom: number;
}

export interface EventSettingsOpenPayload {
  eventToken: string;
  anchor: PopupAnchor;
}

export interface ProjectPanelOpenPayload {
  projectId: string;
  itemId?: string;
  view?: "project" | "notes" | "todos" | "todo";
  anchor: PopupAnchor;
}
