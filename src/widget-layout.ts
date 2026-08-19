export const WIDGET_CLOCK_WIDTH = 296;
export const WIDGET_CALENDAR_COMPACT_WIDTH = 304;
export const WIDGET_CALENDAR_SINGLE_WIDTH = 336;
export const WIDGET_CALENDAR_DUAL_WIDTH = 432;
export const WIDGET_ZONE_GAP = 8;
export const WIDGET_ICON_SIZE = 48;
export const WIDGET_ICON_GAP = 8;
export const WIDGET_LEFT_PADDING = 24;

export function widgetLeftWidth(visibleSourceCount: number) {
  const boundedCount = Math.min(6, Math.max(0, Math.trunc(visibleSourceCount)));
  const appCount = boundedCount + 2;
  return (
    WIDGET_LEFT_PADDING +
    appCount * WIDGET_ICON_SIZE +
    Math.max(0, appCount - 1) * WIDGET_ICON_GAP
  );
}

export type WidgetWidthMode = "compact" | "auto" | "wide";

export function widgetCalendarWidth(
  widthMode: WidgetWidthMode,
  showsNextEvent: boolean,
) {
  if (widthMode === "compact") {
    return WIDGET_CALENDAR_COMPACT_WIDTH;
  }
  if (widthMode === "wide" || showsNextEvent) {
    return WIDGET_CALENDAR_DUAL_WIDTH;
  }
  return WIDGET_CALENDAR_SINGLE_WIDTH;
}

export function widgetWidth(
  visibleSourceCount: number,
  widthMode: WidgetWidthMode = "auto",
  showsNextEvent = false,
) {
  return (
    widgetLeftWidth(visibleSourceCount) +
    WIDGET_CLOCK_WIDTH +
    widgetCalendarWidth(widthMode, showsNextEvent) +
    WIDGET_ZONE_GAP * 2
  );
}
