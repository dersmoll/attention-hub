import {
  DEFAULT_MEDICINE_GRACE_MINUTES,
  normalizeMedicineGraceMinutes,
} from "./medicine-model";

export const MEDICINE_PREFERENCES_CHANGED_EVENT = "medicine-preferences-changed";

const STORAGE_KEY = "attention-hub.medicine-preferences.v1";

export interface MedicinePreferences {
  doseNotificationsEnabled: boolean;
  /** Shared by the due/missed display split and notification eligibility, so
   * the widget and the notifier can never disagree about which doses are live. */
  graceMinutes: number;
}

const defaults: MedicinePreferences = {
  doseNotificationsEnabled: false,
  graceMinutes: DEFAULT_MEDICINE_GRACE_MINUTES,
};

export function readMedicinePreferences(): MedicinePreferences {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as
      | Partial<MedicinePreferences>
      | null;
    return {
      doseNotificationsEnabled:
        typeof value?.doseNotificationsEnabled === "boolean"
          ? value.doseNotificationsEnabled
          : defaults.doseNotificationsEnabled,
      graceMinutes: normalizeMedicineGraceMinutes(value?.graceMinutes),
    };
  } catch {
    return { ...defaults };
  }
}

export function writeMedicinePreferences(
  update: Partial<MedicinePreferences>,
) {
  const next = { ...readMedicinePreferences(), ...update };
  const normalized: MedicinePreferences = {
    doseNotificationsEnabled: next.doseNotificationsEnabled === true,
    graceMinutes: normalizeMedicineGraceMinutes(next.graceMinutes),
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  return normalized;
}
