export const TODO_PREFERENCES_CHANGED_EVENT = "todo-preferences-changed";

const STORAGE_KEY = "attention-hub.todo-preferences.v1";
const LEGACY_STORAGE_KEY = "attention-hub.later-inbox-preferences.v1";

export interface TodoPreferences {
  dueNotificationsEnabled: boolean;
}

const defaults: TodoPreferences = {
  dueNotificationsEnabled: false,
};

export function readTodoPreferences(): TodoPreferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(LEGACY_STORAGE_KEY);
    const value = JSON.parse(raw ?? "null") as
      | Partial<TodoPreferences>
      | null;
    return {
      dueNotificationsEnabled:
        typeof value?.dueNotificationsEnabled === "boolean"
          ? value.dueNotificationsEnabled
          : defaults.dueNotificationsEnabled,
    };
  } catch {
    return { ...defaults };
  }
}

export function writeTodoPreferences(
  update: Partial<TodoPreferences>,
) {
  const next = { ...readTodoPreferences(), ...update };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}
