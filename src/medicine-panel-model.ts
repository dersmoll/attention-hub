import type { PopupAnchor } from "./event-workspace-model";

export const MEDICINE_PANEL_WINDOW_LABEL = "medicine-panel";
export const MEDICINE_PANEL_OPEN_EVENT = "medicine-panel-opened";
export const MEDICINE_PANEL_READY_EVENT = "medicine-panel-ready";
export const MEDICINE_PANEL_CLOSED_EVENT = "medicine-panel-closed";
export const MEDICINE_PANEL_WIDTH = 360;
/* Opening size only. The panel measures its own content once mounted and
 * corrects any shortfall, because this arithmetic cannot see line-height,
 * a wrapped treatment name, or the user's font scale. An earlier revision
 * assumed a dose row was its 32px `min-height`; with `line-height: 1.5` the
 * two stacked labels plus padding and border make it 36px, and five rows of
 * that error clipped the footer. Keep these close, but do not trust them. */
export const MEDICINE_PANEL_BASE_HEIGHT = 52;
export const MEDICINE_PANEL_TREATMENT_HEIGHT = 56;
export const MEDICINE_PANEL_DOSE_HEIGHT = 38;
export const MEDICINE_PANEL_MORE_HEIGHT = 30;
export const MEDICINE_PANEL_FOOTER_HEIGHT = 36;

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
