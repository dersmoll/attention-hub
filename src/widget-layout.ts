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

export type WidgetWidthMode = "recommended" | "larger";

export function widgetHeight(widthMode: WidgetWidthMode = "recommended") {
  return widthMode === "recommended" ? WIDGET_COMPACT_HEIGHT : WIDGET_HEIGHT;
}

export function widgetClockWidth(widthMode: WidgetWidthMode = "recommended") {
  return widthMode === "recommended"
    ? WIDGET_COMPACT_CLOCK_WIDTH
    : WIDGET_CLOCK_WIDTH;
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
) {
  return (
    widgetLeftWidth(visibleSourceCount, widthMode) +
    widgetClockWidth(widthMode) +
    widgetCalendarWidth(widthMode, showsNextEvent) +
    WIDGET_UTILITY_WIDTH +
    widgetZoneGap(widthMode) * 3
  );
}
