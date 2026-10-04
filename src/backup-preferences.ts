import { normalizeWidgetPreferences, MEDICINE_PANEL_UPGRADE_KEY } from "./widget-preferences";
import { normalizeMedicineGraceMinutes } from "./medicine-model";
import { normalizeFocusTimerState, pauseFocusTimer } from "./focus-timer-model";

export const BACKUP_RESTORED_EVENT = "backup-restored";
const BASE_KEYS = ["attention-hub.widget.v1", "attention-hub.medicine-preferences.v1", "attention-hub.todo-preferences.v1", "attention-hub.calendar-skips.v1", "attention-hub.focus-timer.v1"];
const LEGACY_TODO_KEY = "attention-hub.later-inbox-preferences.v1";
export const BACKUP_PREFERENCE_KEYS = [...BASE_KEYS, MEDICINE_PANEL_UPGRADE_KEY, LEGACY_TODO_KEY, ...["manager", "medicine", "sticky-note", "event-settings", "project-panel", "project-panel-notes", "project-panel-todos", "project-panel-todo"].map(label => `attention-hub.floating-window.v1.${label}`)];
export type BackupPreferences = Record<string, string>;
type PreferenceStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function captureBackupPreferences(storage: Pick<Storage, "getItem"> = localStorage): BackupPreferences {
  return Object.fromEntries(BACKUP_PREFERENCE_KEYS.flatMap(key => {
    const value = storage.getItem(key);
    return value === null ? [] : [[key, value]];
  }));
}

export function normalizeBackupPreferences(input: BackupPreferences, now = Date.now()): BackupPreferences {
  const result: BackupPreferences = { [MEDICINE_PANEL_UPGRADE_KEY]: "1", "attention-hub.todo-preferences.v1": '{"dueNotificationsEnabled":false}' };
  for (const [key, raw] of Object.entries(input)) {
    if (!BACKUP_PREFERENCE_KEYS.includes(key) || typeof raw !== "string" || raw.length > 1_000_000) throw new Error("Unsupported backup preference.");
    if (key === MEDICINE_PANEL_UPGRADE_KEY) continue;
    const value = JSON.parse(raw);
    if (key.endsWith("calendar-skips.v1")) {
      if (!Array.isArray(value)) throw new Error("Invalid calendar choices.");
      result[key] = JSON.stringify(value.filter(entry => typeof entry?.occurrenceId === "string" && Number.isFinite(entry.expiresAt) && entry.expiresAt > now));
      continue;
    }
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid backup settings.");
    if (key.endsWith("widget.v1")) result[key] = JSON.stringify(normalizeWidgetPreferences(value));
    else if (key.endsWith("medicine-preferences.v1")) result[key] = JSON.stringify({ doseNotificationsEnabled: value.doseNotificationsEnabled === true, graceMinutes: normalizeMedicineGraceMinutes(value.graceMinutes) });
    else if (key.endsWith("todo-preferences.v1") || key === LEGACY_TODO_KEY) {
      if (key !== LEGACY_TODO_KEY || !("attention-hub.todo-preferences.v1" in input)) result["attention-hub.todo-preferences.v1"] = JSON.stringify({ dueNotificationsEnabled: value.dueNotificationsEnabled === true });
    }
    else if (key.endsWith("focus-timer.v1")) result[key] = JSON.stringify(pauseFocusTimer(normalizeFocusTimerState(value, now), now));
    else {
      const geometry = Object.fromEntries(["x", "y", "width", "height"].filter(field => field in value).map(field => [field, value[field]]));
      if (!Object.values(geometry).every(Number.isFinite) || ("width" in geometry && geometry.width < 1) || ("height" in geometry && geometry.height < 1) || ("x" in geometry && Math.abs(geometry.x) > 100000) || ("y" in geometry && Math.abs(geometry.y) > 100000)) throw new Error("Invalid saved window position.");
      if ("width" in geometry) geometry.width = Math.min(1600, geometry.width);
      if ("height" in geometry) geometry.height = Math.min(1200, geometry.height);
      result[key] = JSON.stringify(geometry);
    }
  }
  return result;
}

/** Export usable settings when an older profile contains an unreadable value. */
export function exportBackupPreferences(input: BackupPreferences, now = Date.now()) {
  const readable: BackupPreferences = {};
  for (const [key, raw] of Object.entries(input)) {
    try {
      normalizeBackupPreferences({ [key]: raw }, now);
      readable[key] = raw;
    } catch {
      if (!BACKUP_PREFERENCE_KEYS.includes(key)) throw new Error("Unsupported backup preference.");
      readable[key] = key.endsWith("calendar-skips.v1") ? "[]" : "{}";
    }
  }
  return normalizeBackupPreferences(readable, now);
}

/** Recovery deliberately restores the exact preimage, including old malformed values. */
export function replaceBackupPreferences(input: BackupPreferences, storage: PreferenceStorage = localStorage) {
  if (Object.entries(input).some(([key, value]) => !BACKUP_PREFERENCE_KEYS.includes(key) || typeof value !== "string")) throw new Error("Unsupported recovery preferences.");
  for (const key of BACKUP_PREFERENCE_KEYS) {
    if (key in input) storage.setItem(key, input[key]);
    else storage.removeItem(key);
  }
}

export function applyBackupPreferences(input: BackupPreferences, storage: PreferenceStorage = localStorage) {
  const normalized = normalizeBackupPreferences(input);
  const original = captureBackupPreferences(storage);
  try { replaceBackupPreferences(normalized, storage); }
  catch (cause) {
    try { replaceBackupPreferences(original, storage); }
    catch { throw new Error("Settings recovery is pending. Restart Attention Hub to retry recovery."); }
    throw cause;
  }
}
