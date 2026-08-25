export const WIDGET_CLOCK_WIDTH = 240;
export const WIDGET_COMPACT_CLOCK_WIDTH = 208;
export const WIDGET_HEIGHT = 80;
export const WIDGET_COMPACT_HEIGHT = 68;
export const WIDGET_CALENDAR_COMPACT_WIDTH = 272;
export const WIDGET_CALENDAR_COMPACT_DUAL_WIDTH = 392;
export const WIDGET_CALENDAR_DUAL_WIDTH = 416;
export const WIDGET_UTILITY_WIDTH = 68;
export const WIDGET_ZONE_GAP = 8;
export const WIDGET_COMPACT_ZONE_GAP = 6;
export const WIDGET_ICON_SIZE = 48;
export const WIDGET_ICON_GAP = 8;
export const WIDGET_LEFT_PADDING = 24;
export const WIDGET_COMPACT_ICON_SIZE = 40;
export const WIDGET_COMPACT_ICON_GAP = 4;
export const WIDGET_COMPACT_LEFT_PADDING = 16;
export const CALENDAR_DAY_PANEL_ROW_HEIGHT = 216;
export const CALENDAR_DAY_PANEL_WINDOW_EXTRA_HEIGHT = 224;

export type WidgetWidthMode = "recommended" | "larger";

export function widgetHeight(widthMode: WidgetWidthMode = "recommended") {
  return widthMode === "recommended" ? WIDGET_COMPACT_HEIGHT : WIDGET_HEIGHT;
}

export function calendarDayPanelDirection(
  widgetTop: number,
  widgetHeight: number,
  monitorTop: number,
  monitorHeight: number,
) {
  const widgetCenter = widgetTop + widgetHeight / 2;
  const monitorCenter = monitorTop + monitorHeight / 2;
  return widgetCenter >= monitorCenter ? "above" : "below";
}

export function calendarDayPanelPhysicalOffset(scaleFactor: number) {
  const safeScaleFactor =
    Number.isFinite(scaleFactor) && scaleFactor > 0 ? scaleFactor : 1;
  return Math.round(CALENDAR_DAY_PANEL_ROW_HEIGHT * safeScaleFactor);
}

export function widgetClockWidth(widthMode: WidgetWidthMode = "recommended") {
  return widthMode === "recommended"
    ? WIDGET_COMPACT_CLOCK_WIDTH
    : WIDGET_CLOCK_WIDTH;
}

export function widgetClockPanelWidth(
  widthMode: WidgetWidthMode = "recommended",
  clockCount = 2,
  clockLayout: "horizontal" | "vertical" = "horizontal",
) {
  const base = widgetClockWidth(widthMode);
  if (clockLayout === "vertical") {
    return base;
  }
  const boundedCount = Math.min(5, Math.max(2, Math.trunc(clockCount)));
  return base + (boundedCount - 2) * (widthMode === "recommended" ? 104 : 120);
}

export function widgetZoneGap(widthMode: WidgetWidthMode = "recommended") {
  return widthMode === "recommended"
    ? WIDGET_COMPACT_ZONE_GAP
    : WIDGET_ZONE_GAP;
}

export function widgetLeftWidth(
  visibleSourceCount: number,
  widthMode: WidgetWidthMode = "recommended",
) {
  const boundedCount = Math.min(6, Math.max(0, Math.trunc(visibleSourceCount)));
  const recommended = widthMode === "recommended";
  const iconSize = recommended ? WIDGET_COMPACT_ICON_SIZE : WIDGET_ICON_SIZE;
  const iconGap = recommended ? WIDGET_COMPACT_ICON_GAP : WIDGET_ICON_GAP;
  const padding = recommended
    ? WIDGET_COMPACT_LEFT_PADDING
    : WIDGET_LEFT_PADDING;
  return (
    padding +
    boundedCount * iconSize +
    Math.max(0, boundedCount - 1) * iconGap
  );
}

export function widgetCalendarWidth(
  widthMode: WidgetWidthMode,
  showsNextEvent: boolean,
) {
  if (widthMode === "recommended") {
    return showsNextEvent
      ? WIDGET_CALENDAR_COMPACT_DUAL_WIDTH
      : WIDGET_CALENDAR_COMPACT_WIDTH;
  }
  return WIDGET_CALENDAR_DUAL_WIDTH;
}

export function widgetWidth(
  visibleSourceCount: number,
  widthMode: WidgetWidthMode = "recommended",
  showsNextEvent = false,
  clockCount = 2,
  clockLayout: "horizontal" | "vertical" = "horizontal",
) {
  return (
    widgetLeftWidth(visibleSourceCount, widthMode) +
    widgetClockPanelWidth(widthMode, clockCount, clockLayout) +
    widgetCalendarWidth(widthMode, showsNextEvent) +
    WIDGET_UTILITY_WIDTH +
    widgetZoneGap(widthMode) * 3
  );
}
