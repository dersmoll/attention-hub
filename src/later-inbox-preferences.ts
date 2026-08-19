export const LATER_INBOX_PREFERENCES_CHANGED_EVENT =
  "later-inbox-preferences-changed";

const STORAGE_KEY = "attention-hub.later-inbox-preferences.v1";

export interface LaterInboxPreferences {
  dueNotificationsEnabled: boolean;
}

const defaults: LaterInboxPreferences = {
  dueNotificationsEnabled: false,
};

export function readLaterInboxPreferences(): LaterInboxPreferences {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as
      | Partial<LaterInboxPreferences>
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

export function writeLaterInboxPreferences(
  update: Partial<LaterInboxPreferences>,
) {
  const next = { ...readLaterInboxPreferences(), ...update };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}
