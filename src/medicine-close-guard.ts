export const MEDICINE_QUIT_SAVE_REQUEST_EVENT = "medicine-quit-save-request";
export const MEDICINE_QUIT_SAVE_RESULT_EVENT = "medicine-quit-save-result";

export type MedicineQuitSaveRequest = { requestId: string };
export type MedicineQuitSaveResult = MedicineQuitSaveRequest & { allowed: boolean };

/** Share one save-before-close gate between native and in-app close requests. */
export function createMedicineCloseGuard(
  save: () => Promise<boolean>,
  close: () => Promise<void>,
  failed: (reason: unknown) => void,
  busy: (value: boolean) => void,
) {
  let pending = false;
  let approved = false;
  return {
    isApproved: () => approved,
    async request() {
      if (pending || approved) return;
      pending = true;
      busy(true);
      try {
        if (!await save()) return;
        // Destruction bypasses native close events; suppress duplicate requests.
        approved = true;
        await close();
      } catch (reason) {
        approved = false;
        failed(reason);
      } finally {
        pending = false;
        if (!approved) busy(false);
      }
    },
  };
}
