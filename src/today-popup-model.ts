import type { PopupAnchor } from "./event-workspace-model";
import type { WorkCalendarDaySelection } from "./work-calendar-model";

export const TODAY_POPUP_WINDOW_LABEL = "today";
export const TODAY_POPUP_OPEN_EVENT = "today-popup-opened";
export const TODAY_POPUP_READY_EVENT = "today-popup-ready";
export const TODAY_POPUP_CLOSED_EVENT = "today-popup-closed";

export interface TodayPopupPayload {
  anchor: PopupAnchor;
  placement: "above" | "below";
  width: number;
  height: number;
  maxHeight: number;
  occupiedMinutes: number;
  systemTimeZone: string;
  /**
   * Whether the sender is reading this calendar as a school timetable. The
   * popup is a separate window with no access to preferences, so the widget
   * tells it which vocabulary to use.
   */
  schoolMode: boolean;
  selections: WorkCalendarDaySelection[];
}
