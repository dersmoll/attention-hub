export const WIDGET_CLOCK_WIDTH = 240;
export const WIDGET_COMPACT_CLOCK_WIDTH = 208;
export const WIDGET_HEIGHT = 80;
export const WIDGET_COMPACT_HEIGHT = 68;
export const WIDGET_SLIM_HEIGHT = 44;
export const WIDGET_CALENDAR_COMPACT_WIDTH = 272;
export const WIDGET_CALENDAR_COMPACT_DUAL_WIDTH = 392;
export const WIDGET_CALENDAR_DUAL_WIDTH = 416;
export const WIDGET_UTILITY_WIDTH = 68;
export const WIDGET_SLIM_UTILITY_WIDTH = 112;
export const WIDGET_SLIM_DRAG_HANDLE_WIDTH = 18;
export const WIDGET_ZONE_GAP = 8;
export const WIDGET_COMPACT_ZONE_GAP = 6;
export const WIDGET_ICON_SIZE = 48;
export const WIDGET_ICON_GAP = 8;
export const WIDGET_LEFT_PADDING = 24;
export const WIDGET_COMPACT_ICON_SIZE = 40;
export const WIDGET_COMPACT_ICON_GAP = 4;
export const WIDGET_COMPACT_LEFT_PADDING = 16;
export const WIDGET_SLIM_ICON_SIZE = 32;
export const WIDGET_SLIM_ICON_GAP = 2;
export const WIDGET_SLIM_LEFT_PADDING = 4;
export const WIDGET_SLIM_CLOCK_ITEM_WIDTH = 88;
export const WIDGET_SLIM_CALENDAR_WIDTH = 260;
export const WIDGET_SLIM_CALENDAR_DUAL_WIDTH = 520;
export const WIDGET_SLIM_CALENDAR_MAX_WIDTH = 600;
export const WIDGET_SLIM_CALENDAR_DUAL_MAX_WIDTH = 800;
export const CALENDAR_DAY_PANEL_ROW_HEIGHT = 216;
export const CALENDAR_DAY_PANEL_WINDOW_EXTRA_HEIGHT = 224;
export const CALENDAR_DAY_PANEL_BASE_HEIGHT = 64;
export const CALENDAR_DAY_PANEL_EVENT_HEIGHT = 21;
export const CALENDAR_DAY_PANEL_MAX_EVENTS = 24;

export type WidgetWidthMode = "recommended" | "larger" | "slim";

export function widgetHeight(widthMode: WidgetWidthMode = "recommended") {
  if (widthMode === "slim") {
    return WIDGET_SLIM_HEIGHT;
  }
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

export function calendarDayPanelHeight(eventCount: number) {
  const boundedCount = Math.min(
    CALENDAR_DAY_PANEL_MAX_EVENTS,
    Math.max(1, Math.trunc(Number.isFinite(eventCount) ? eventCount : 1)),
  );
  return (
    CALENDAR_DAY_PANEL_BASE_HEIGHT +
    boundedCount * CALENDAR_DAY_PANEL_EVENT_HEIGHT
  );
}

export function calendarDayPanelWindowExtraHeight(eventCount: number) {
  return calendarDayPanelHeight(eventCount) + 5;
}

export function calendarDayPanelPhysicalOffset(
  scaleFactor: number,
  panelHeight = CALENDAR_DAY_PANEL_ROW_HEIGHT,
) {
  const safeScaleFactor =
    Number.isFinite(scaleFactor) && scaleFactor > 0 ? scaleFactor : 1;
  const safePanelHeight =
    Number.isFinite(panelHeight) && panelHeight > 0
      ? panelHeight
      : CALENDAR_DAY_PANEL_ROW_HEIGHT;
  return Math.round(safePanelHeight * safeScaleFactor);
}

export function widgetClockWidth(widthMode: WidgetWidthMode = "recommended") {
  if (widthMode === "slim") {
    return WIDGET_SLIM_CLOCK_ITEM_WIDTH * 2;
  }
  return widthMode === "recommended"
    ? WIDGET_COMPACT_CLOCK_WIDTH
    : WIDGET_CLOCK_WIDTH;
}

export function widgetClockPanelWidth(
  widthMode: WidgetWidthMode = "recommended",
  clockCount = 2,
  clockLayout: "horizontal" | "vertical" = "horizontal",
) {
  const boundedCount = Math.min(5, Math.max(2, Math.trunc(clockCount)));
  if (widthMode === "slim") {
    return boundedCount * WIDGET_SLIM_CLOCK_ITEM_WIDTH;
  }
  const base = widgetClockWidth(widthMode);
  if (clockLayout === "vertical") {
    return base;
  }
  return base + (boundedCount - 2) * (widthMode === "recommended" ? 104 : 120);
}

export function widgetZoneGap(widthMode: WidgetWidthMode = "recommended") {
  if (widthMode === "slim") {
    return 0;
  }
  return widthMode === "recommended"
    ? WIDGET_COMPACT_ZONE_GAP
    : WIDGET_ZONE_GAP;
}

export function widgetLeftWidth(
  visibleSourceCount: number,
  widthMode: WidgetWidthMode = "recommended",
) {
  const boundedCount = Math.min(6, Math.max(0, Math.trunc(visibleSourceCount)));
  if (widthMode === "slim") {
    if (boundedCount === 0) {
      return 0;
    }
    return (
      WIDGET_SLIM_LEFT_PADDING * 2 +
      boundedCount * WIDGET_SLIM_ICON_SIZE +
      Math.max(0, boundedCount - 1) * WIDGET_SLIM_ICON_GAP
    );
  }
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
  contentLength = 0,
) {
  if (widthMode === "slim") {
    const safeLength = Number.isFinite(contentLength)
      ? Math.max(0, Math.trunc(contentLength))
      : 0;
    const baseWidth = showsNextEvent
      ? WIDGET_SLIM_CALENDAR_DUAL_WIDTH
      : WIDGET_SLIM_CALENDAR_WIDTH;
    const maxWidth = showsNextEvent
      ? WIDGET_SLIM_CALENDAR_DUAL_MAX_WIDTH
      : WIDGET_SLIM_CALENDAR_MAX_WIDTH;
    const growthThreshold = showsNextEvent ? 76 : 36;
    const growthPerCharacter = showsNextEvent ? 4 : 5;
    return Math.min(
      maxWidth,
      baseWidth + Math.max(0, safeLength - growthThreshold) * growthPerCharacter,
    );
  }
  if (widthMode === "recommended") {
    return showsNextEvent
      ? WIDGET_CALENDAR_COMPACT_DUAL_WIDTH
      : WIDGET_CALENDAR_COMPACT_WIDTH;
  }
  return WIDGET_CALENDAR_DUAL_WIDTH;
}

export function widgetUtilityWidth(
  widthMode: WidgetWidthMode = "recommended",
) {
  return widthMode === "slim"
    ? WIDGET_SLIM_UTILITY_WIDTH
    : WIDGET_UTILITY_WIDTH;
}

export function widgetWidth(
  visibleSourceCount: number,
  widthMode: WidgetWidthMode = "recommended",
  showsNextEvent = false,
  clockCount = 2,
  clockLayout: "horizontal" | "vertical" = "horizontal",
  showAppsPanel = true,
  showClocksPanel = true,
  calendarContentLength = 0,
) {
  const segmentWidths = [
    showAppsPanel && visibleSourceCount > 0
      ? widgetLeftWidth(visibleSourceCount, widthMode)
      : 0,
    showClocksPanel
      ? widgetClockPanelWidth(widthMode, clockCount, clockLayout)
      : 0,
    widgetCalendarWidth(widthMode, showsNextEvent, calendarContentLength),
    widthMode === "slim" ? WIDGET_SLIM_DRAG_HANDLE_WIDTH : 0,
    widgetUtilityWidth(widthMode),
  ].filter((width) => width > 0);
  return (
    segmentWidths.reduce((total, width) => total + width, 0) +
    widgetZoneGap(widthMode) * Math.max(0, segmentWidths.length - 1)
  );
}
