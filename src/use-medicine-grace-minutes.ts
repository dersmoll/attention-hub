import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { normalizeMedicineGraceMinutes } from "./medicine-model";
import {
  MEDICINE_PREFERENCES_CHANGED_EVENT,
  readMedicinePreferences,
  type MedicinePreferences,
} from "./medicine-preferences";

/** The shared grace window, kept live across windows.
 *
 * Every surface that classifies a dose has to agree on this value, or the
 * widget could show a dose as due after the notifier had already written it
 * off. Reading it through one hook is what keeps those surfaces in step. */
export function useMedicineGraceMinutes() {
  const [graceMinutes, setGraceMinutes] = useState(
    () => readMedicinePreferences().graceMinutes,
  );

  useEffect(() => {
    let disposed = false;
    let stopListening: (() => void) | undefined;
    void listen<Partial<MedicinePreferences>>(
      MEDICINE_PREFERENCES_CHANGED_EVENT,
      ({ payload }) => {
        if (!disposed) {
          setGraceMinutes(normalizeMedicineGraceMinutes(payload?.graceMinutes));
        }
      },
    ).then((unlisten) => {
      if (disposed) {
        unlisten();
      } else {
        stopListening = unlisten;
      }
    });

    return () => {
      disposed = true;
      stopListening?.();
    };
  }, []);

  return graceMinutes;
}
