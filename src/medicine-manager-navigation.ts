/** Contract for opening the Medicine manager *at* something.
 *
 * `+N more` used to open the manager with no destination, leaving the user to
 * find the dose that had just been hidden from them. Carrying a target turns
 * that into navigation, but the manager is also the only place unfinished
 * medicine forms and unsaved treatment notes live — so navigation asks, and the
 * manager is free to refuse rather than discard a draft.
 *
 * Native window creation does not mean the manager's listeners exist yet, so the
 * handshake is: the manager broadcasts `READY` once it is listening, the opener
 * sends the target, and the manager acknowledges whether it actually applied it.
 * Only an acknowledged navigation may close the surface that started it. */

export const MEDICINE_MANAGER_READY_EVENT = "medicine-manager-ready";
export const MEDICINE_MANAGER_NAVIGATE_EVENT = "medicine-manager-navigate";
export const MEDICINE_MANAGER_NAVIGATED_EVENT = "medicine-manager-navigated";

/** Long enough to cover a cold window mount, short enough that a wedged manager
 * reports a failure instead of leaving the caller waiting. */
export const MEDICINE_MANAGER_NAVIGATION_TIMEOUT_MS = 6_000;

export interface MedicineManagerTarget {
  requestId: string;
  treatmentId: string;
  /** `medicineId:slotDay:slotTime`, or null to open the treatment only. */
  doseKey: string | null;
}

export interface MedicineManagerNavigationResult {
  requestId: string;
  applied: boolean;
  /** Why nothing moved. Present only when `applied` is false. */
  reason: string | null;
}

export function medicineDoseKey(dose: { medicineId: string; slotDay: string; slotTime: string }) {
  return `${dose.medicineId}:${dose.slotDay}:${dose.slotTime}`;
}

export function newNavigationRequestId() {
  return globalThis.crypto?.randomUUID?.()
    ?? `nav-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
