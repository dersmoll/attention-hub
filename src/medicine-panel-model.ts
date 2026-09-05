import type { PopupAnchor } from "./event-workspace-model";

export const MEDICINE_PANEL_WINDOW_LABEL = "medicine-panel";
export const MEDICINE_PANEL_OPEN_EVENT = "medicine-panel-opened";
export const MEDICINE_PANEL_READY_EVENT = "medicine-panel-ready";
export const MEDICINE_PANEL_CLOSED_EVENT = "medicine-panel-closed";
export const MEDICINE_PANEL_WIDTH = 360;
export const MEDICINE_PANEL_BASE_HEIGHT = 48;
export const MEDICINE_PANEL_TREATMENT_HEIGHT = 58;
export const MEDICINE_PANEL_DOSE_HEIGHT = 34;
export const MEDICINE_PANEL_MORE_HEIGHT = 30;
export const MEDICINE_PANEL_FOOTER_HEIGHT = 38;

export interface MedicinePanelPayload {
  anchor: PopupAnchor;
  placement: "above" | "below";
  width: number;
  height: number;
}

export function medicinePanelHeight(treatmentCount: number, doseCount: number, hasMore: boolean) {
  return MEDICINE_PANEL_BASE_HEIGHT
    + Math.max(0, Math.min(3, Math.trunc(treatmentCount))) * MEDICINE_PANEL_TREATMENT_HEIGHT
    + Math.max(0, Math.min(8, Math.trunc(doseCount))) * MEDICINE_PANEL_DOSE_HEIGHT
    + Number(hasMore) * MEDICINE_PANEL_MORE_HEIGHT
    + MEDICINE_PANEL_FOOTER_HEIGHT;
}
