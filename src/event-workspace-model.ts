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
