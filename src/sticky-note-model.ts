export const STICKY_NOTE_WINDOW_LABEL = "sticky-note";
export const STICKY_NOTE_GEOMETRY_LABEL = "sticky-note";
export const STICKY_NOTE_MAX_CHARACTERS = 4_000;

export const STICKY_NOTE_WINDOW_GEOMETRY = {
  width: 320,
  height: 240,
  minWidth: 240,
  minHeight: 160,
} as const;

export interface StickyNoteSnapshot {
  revision: number;
  text: string;
  recoveredFromBackup: boolean;
}
