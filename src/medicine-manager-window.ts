import { emitTo, listen } from "@tauri-apps/api/event";
import { createAuxiliaryWindow, findAuxiliaryWindow, revealAuxiliaryWindow, withAuxiliaryWindowDeadline } from "./auxiliary-window";
import { LogicalSize } from "@tauri-apps/api/window";
import { readStoredFloatingGeometry, reachableStoredPosition } from "./event-workspace-window";
import {
  MEDICINE_MANAGER_NAVIGATE_EVENT,
  MEDICINE_MANAGER_NAVIGATED_EVENT,
  MEDICINE_MANAGER_NAVIGATION_TIMEOUT_MS,
  MEDICINE_MANAGER_READY_EVENT,
  newNavigationRequestId,
  type MedicineManagerNavigationResult,
} from "./medicine-manager-navigation";

export const MEDICINE_MANAGER_WINDOW_LABEL = "medicine";
export const MEDICINE_MANAGER_WINDOW_GEOMETRY = {
  width: 940,
  height: 640,
  minWidth: 820,
  minHeight: 520,
} as const;

let opening: Promise<void> | null = null;

const wait = (milliseconds: number) => new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds));

async function revealExistingMedicineManager() {
  // Retry a disappearing handle briefly, but propagate readiness failures for
  // a still-registered window instead of multiplying the ten-second deadline.
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const existing = await findAuxiliaryWindow(MEDICINE_MANAGER_WINDOW_LABEL);
    if (!existing) return false;
    try {
      await revealAuxiliaryWindow(existing);
      return true;
    } catch (cause) {
      if (await findAuxiliaryWindow(MEDICINE_MANAGER_WINDOW_LABEL)) throw cause;
      await wait(50);
    }
  }
  return false;
}

export async function openMedicineManagerWindow() {
  if (opening) return opening;
  opening = (async () => {
    if (await revealExistingMedicineManager()) return;
    const stored = readStoredFloatingGeometry(MEDICINE_MANAGER_WINDOW_LABEL);
    const manager = await createAuxiliaryWindow(MEDICINE_MANAGER_WINDOW_LABEL, {
      url: "/",
      title: "Attention Hub - Medicine",
      width: Math.max(MEDICINE_MANAGER_WINDOW_GEOMETRY.minWidth, stored.width ?? MEDICINE_MANAGER_WINDOW_GEOMETRY.width),
      height: Math.max(MEDICINE_MANAGER_WINDOW_GEOMETRY.minHeight, stored.height ?? MEDICINE_MANAGER_WINDOW_GEOMETRY.height),
      minWidth: MEDICINE_MANAGER_WINDOW_GEOMETRY.minWidth,
      minHeight: MEDICINE_MANAGER_WINDOW_GEOMETRY.minHeight,
      decorations: true,
      resizable: true,
      visible: false,
    });
    await withAuxiliaryWindowDeadline(MEDICINE_MANAGER_WINDOW_LABEL, async () => {
      await manager.setMinSize(new LogicalSize(MEDICINE_MANAGER_WINDOW_GEOMETRY.minWidth, MEDICINE_MANAGER_WINDOW_GEOMETRY.minHeight));
      const position = await reachableStoredPosition(stored);
      if (position) await manager.setPosition(position).catch(() => undefined);
      await revealAuxiliaryWindow(manager);
    });
  })();
  try {
    await opening;
  } finally {
    opening = null;
  }
}

/** Open the manager at a treatment, optionally scrolled to one of its doses.
 *
 * Resolves with what the manager actually did. `applied: false` carries the
 * reason — an unfinished form, notes needing a decision, or a target that no
 * longer exists — so the caller can keep its own surface open and say why.
 *
 * `tauri://created` fires before the manager's React listeners exist, so the
 * target is sent when the manager announces itself. An already-open manager is
 * sent the target immediately as well; it ignores a duplicate request id, which
 * is cheaper than proving which of the two paths applies. */
export async function openMedicineManagerAt(target: { treatmentId: string; doseKey: string | null }) {
  const requestId = newNavigationRequestId();
  const stops: Array<() => void> = [];
  let settle: ((result: MedicineManagerNavigationResult) => void) | null = null;
  const acknowledged = new Promise<MedicineManagerNavigationResult>((resolve) => { settle = resolve; });
  const send = () => emitTo(MEDICINE_MANAGER_WINDOW_LABEL, MEDICINE_MANAGER_NAVIGATE_EVENT, {
    requestId, treatmentId: target.treatmentId, doseKey: target.doseKey,
  }).catch(() => undefined);

  try {
    stops.push(await listen<MedicineManagerNavigationResult>(MEDICINE_MANAGER_NAVIGATED_EVENT, ({ payload }) => {
      if (payload.requestId === requestId) settle?.(payload);
    }));
    stops.push(await listen(MEDICINE_MANAGER_READY_EVENT, () => void send()));
    await openMedicineManagerWindow();
    void send();
    const timeout = wait(MEDICINE_MANAGER_NAVIGATION_TIMEOUT_MS).then((): MedicineManagerNavigationResult => ({
      requestId,
      applied: false,
      reason: "Medicine did not respond. It is open — find the dose from there.",
    }));
    return await Promise.race([acknowledged, timeout]);
  } catch {
    return {
      requestId,
      applied: false,
      reason: "Medicine could not be opened at that dose.",
    } satisfies MedicineManagerNavigationResult;
  } finally {
    stops.forEach((stop) => stop());
  }
}
