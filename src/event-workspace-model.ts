export const EVENT_WORKSPACE_CHANGED_EVENT = "meeting-workspace-changed";
export const EVENT_SETTINGS_OPEN_EVENT = "event-settings-opened";
export const PROJECT_STASH_OPEN_EVENT = "project-stash-opened";
export const EVENT_SETTINGS_WINDOW_LABEL = "event-settings";
export const PROJECT_STASH_WINDOW_LABEL = "project-stash";

export const EVENT_SETTINGS_WINDOW_GEOMETRY = {
  width: 350,
  height: 260,
  minWidth: 300,
  minHeight: 210,
} as const;

export const PROJECT_STASH_WINDOW_GEOMETRY = {
  width: 360,
  height: 280,
  minWidth: 300,
  minHeight: 200,
} as const;

export const MAX_PROJECT_NOTE_CHARACTERS = 4_000;

export interface ProjectNoteSegment {
  text: string;
  href: string | null;
}

export interface EventWorkspaceContext {
  eventToken: string;
  subject: string;
  start: string;
  end: string;
}

export interface EventBindingContext {
  projectId: string | null;
  linkUrl: string | null;
}

export interface ProjectContext {
  id: string;
  name: string;
  notes: ProjectNoteSegment[];
  createdAt: string;
  updatedAt: string;
  bindingCount: number;
}

export interface EventWorkspaceSnapshot {
  schemaVersion: 2;
  event: EventWorkspaceContext;
  binding: EventBindingContext | null;
  projects: ProjectContext[];
  recoveredFromBackup: boolean;
}

export interface EventWorkspaceInput {
  projectId: string | null;
  projectName: string;
  linkUrl: string;
}

export interface ProjectStashSnapshot {
  schemaVersion: 2;
  project: ProjectContext;
  recoveredFromBackup: boolean;
}

export interface ProjectStashInput {
  notes: ProjectNoteSegment[];
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

export interface ProjectStashOpenPayload {
  projectId: string;
  anchor: PopupAnchor;
}
