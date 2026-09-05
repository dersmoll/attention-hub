export const WIDGET_COMPACT_CLOCK_WIDTH = 144;
export const WIDGET_COMPACT_HEIGHT = 55;
export const WIDGET_SLIM_HEIGHT = 38  ;
export const WIDGET_CALENDAR_COMPACT_WIDTH = 260;
export const WIDGET_CALENDAR_COMPACT_DUAL_WIDTH = 392;
export const WIDGET_COMPACT_DESTINATIONS_WIDTH = 88;
export const WIDGET_SLIM_DESTINATIONS_WIDTH = 66;
export const WIDGET_COMPACT_UTILITY_WIDTH = 20;
export const WIDGET_SLIM_UTILITY_WIDTH = 64;
export const WIDGET_DRAG_HANDLE_WIDTH = 18;
export const WIDGET_COMPACT_ICON_SIZE = 32;
export const WIDGET_COMPACT_ICON_GAP = 4;
export const WIDGET_COMPACT_LEFT_PADDING = 16;
export const WIDGET_SLIM_ICON_SIZE = 32;
export const WIDGET_SLIM_ICON_GAP = 2;
export const WIDGET_SLIM_LEFT_PADDING = 4;
export const WIDGET_SLIM_CLOCK_ITEM_WIDTH = 84;
export const WIDGET_PRIMARY_CLOCK_SECONDS_WIDTH = 10;
export const WIDGET_TIME_FOCUS_CLOCK_WIDTH = 240;
export const WIDGET_SLIM_TIME_FOCUS_CLOCK_WIDTH = 192;
export const WIDGET_SLIM_CALENDAR_WIDTH = 320;
export const WIDGET_SLIM_CALENDAR_DUAL_WIDTH = 520;
export const WIDGET_SLIM_CALENDAR_MAX_WIDTH = 600;
export const WIDGET_SLIM_CALENDAR_DUAL_MAX_WIDTH = 800;
export const CALENDAR_DAY_PANEL_ROW_HEIGHT = 216;
export const CALENDAR_DAY_PANEL_WINDOW_EXTRA_HEIGHT = 224;
export const CALENDAR_DAY_PANEL_BASE_HEIGHT = 54;
export const CALENDAR_DAY_PANEL_EVENT_HEIGHT = 22;
export const CALENDAR_DAY_PANEL_MAX_EVENTS = 24;
export const TODAY_TODO_SECTION_BASE_HEIGHT = 30;
export const TODAY_TODO_ROW_HEIGHT = 30;
export const TODAY_TODO_MAX_ITEMS = 8;

export type WidgetWidthMode = "recommended" | "slim";

export function widgetCalendarMinimumWidth(
  widthMode: WidgetWidthMode,
  showsNextEvent: boolean,
) {
  if (widthMode === "slim") {
    return showsNextEvent
      ? WIDGET_SLIM_CALENDAR_DUAL_WIDTH
      : WIDGET_SLIM_CALENDAR_WIDTH;
  }
  return showsNextEvent
    ? WIDGET_CALENDAR_COMPACT_DUAL_WIDTH
    : WIDGET_CALENDAR_COMPACT_WIDTH;
}

export function widgetHeight(widthMode: WidgetWidthMode = "recommended") {
  if (widthMode === "slim") {
    return WIDGET_SLIM_HEIGHT;
  }
  return WIDGET_COMPACT_HEIGHT;
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
  return WIDGET_COMPACT_CLOCK_WIDTH;
}

export function widgetClockPanelWidth(
  widthMode: WidgetWidthMode = "recommended",
  clockCount = 2,
  clockLayout: "horizontal" | "vertical" | "timeFocus" = "horizontal",
) {
  if (clockLayout === "timeFocus") {
    return widthMode === "slim"
      ? WIDGET_SLIM_TIME_FOCUS_CLOCK_WIDTH
      : WIDGET_TIME_FOCUS_CLOCK_WIDTH;
  }
  const boundedCount = Math.min(5, Math.max(2, Math.trunc(clockCount)));
  if (widthMode === "slim") {
    return boundedCount * WIDGET_SLIM_CLOCK_ITEM_WIDTH + WIDGET_PRIMARY_CLOCK_SECONDS_WIDTH;
  }
  const base = widgetClockWidth(widthMode);
  if (clockLayout === "vertical") {
    return base + WIDGET_PRIMARY_CLOCK_SECONDS_WIDTH;
  }
  return (
    base +
    (boundedCount - 2) * (WIDGET_COMPACT_CLOCK_WIDTH / 2) +
    WIDGET_PRIMARY_CLOCK_SECONDS_WIDTH
  );
}

export function widgetZoneGap(widthMode: WidgetWidthMode = "recommended") {
  void widthMode;
  return 0;
}

export function widgetLeftWidth(
  visibleSourceCount: number,
  widthMode: WidgetWidthMode = "recommended",
) {
  const boundedCount = Math.min(7, Math.max(0, Math.trunc(visibleSourceCount)));
  if (widthMode === "slim") {
    if (boundedCount === 0) {
      return 0;
    }
    return (
      boundedCount * WIDGET_SLIM_ICON_SIZE
    );
  }
  return (
    WIDGET_COMPACT_LEFT_PADDING +
    boundedCount * WIDGET_COMPACT_ICON_SIZE +
    Math.max(0, boundedCount - 1) * WIDGET_COMPACT_ICON_GAP
  );
}

export function widgetCalendarWidth(
  widthMode: WidgetWidthMode,
  showsNextEvent: boolean,
  contentLength = 0,
  preferredWidth: number | null = null,
) {
  const minimumWidth = widgetCalendarMinimumWidth(widthMode, showsNextEvent);
  if (preferredWidth !== null && Number.isFinite(preferredWidth)) {
    return Math.max(minimumWidth, Math.round(preferredWidth));
  }
  if (widthMode === "slim") {
    const safeLength = Number.isFinite(contentLength)
      ? Math.max(0, Math.trunc(contentLength))
      : 0;
    const baseWidth = minimumWidth;
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
  return showsNextEvent
    ? WIDGET_CALENDAR_COMPACT_DUAL_WIDTH
    : WIDGET_CALENDAR_COMPACT_WIDTH;
}

export function todayPopupHeight(eventCount: number, doseCount = 0, todoCount = 0) {
  const boundedDoses = Math.min(TODAY_TODO_MAX_ITEMS, Math.max(0, Math.trunc(doseCount)));
  const boundedTodos = Math.min(TODAY_TODO_MAX_ITEMS, Math.max(0, Math.trunc(todoCount)));
  return calendarDayPanelHeight(eventCount) + (boundedDoses > 0 ? TODAY_TODO_SECTION_BASE_HEIGHT + boundedDoses * TODAY_TODO_ROW_HEIGHT : 0) + (boundedTodos > 0 ? TODAY_TODO_SECTION_BASE_HEIGHT + boundedTodos * TODAY_TODO_ROW_HEIGHT : 0);
}

export function widgetFixedWidth(
  visibleSourceCount: number,
  widthMode: WidgetWidthMode = "recommended",
  clockCount = 2,
  clockLayout: "horizontal" | "vertical" | "timeFocus" = "horizontal",
  showAppsPanel = true,
  showClocksPanel = true,
  showTodayPanel = true,
  showProjectsPanel = true,
  showMedicinePanel = false,
) {
  const segmentWidths = [
    showAppsPanel && visibleSourceCount > 0
      ? widgetLeftWidth(visibleSourceCount, widthMode)
      : 0,
    showClocksPanel
      ? widgetClockPanelWidth(widthMode, clockCount, clockLayout)
      : 0,
    widgetDestinationsWidth(
      widthMode,
      showTodayPanel,
      showProjectsPanel,
      showMedicinePanel,
    ),
    WIDGET_DRAG_HANDLE_WIDTH,
    widgetUtilityWidth(widthMode),
  ].filter((width) => width > 0);
  return (
    segmentWidths.reduce((total, width) => total + width, 0) +
    widgetZoneGap(widthMode) * segmentWidths.length
  );
}

export function widgetDestinationsWidth(
  widthMode: WidgetWidthMode = "recommended",
  showTodayPanel = true,
  showProjectsPanel = true,
  showMedicinePanel = false,
) {
  if (widthMode === "slim") {
    return 33 * (Number(showTodayPanel) + Number(showProjectsPanel) + Number(showMedicinePanel));
  }
  return (showTodayPanel ? 60 : 0) + (showProjectsPanel ? 28 : 0) + (showMedicinePanel ? 44 : 0);
}

export function widgetUtilityWidth(
  widthMode: WidgetWidthMode = "recommended",
) {
  if (widthMode === "slim") {
    return WIDGET_SLIM_UTILITY_WIDTH;
  }
  return WIDGET_COMPACT_UTILITY_WIDTH;
}

export function widgetWidth(
  visibleSourceCount: number,
  widthMode: WidgetWidthMode = "recommended",
  showsNextEvent = false,
  clockCount = 2,
  clockLayout: "horizontal" | "vertical" | "timeFocus" = "horizontal",
  showAppsPanel = true,
  showClocksPanel = true,
  calendarContentLength = 0,
  preferredCalendarWidth: number | null = null,
  showTodayPanel = true,
  showProjectsPanel = true,
  showCalendarPanel = true,
  showMedicinePanel = false,
) {
  return (
    widgetFixedWidth(
      visibleSourceCount,
      widthMode,
      clockCount,
      clockLayout,
      showAppsPanel,
      showClocksPanel,
      showTodayPanel,
      showProjectsPanel,
      showMedicinePanel,
    ) +
    (showCalendarPanel
      ? widgetCalendarWidth(
          widthMode,
          showsNextEvent,
          calendarContentLength,
          preferredCalendarWidth,
        )
      : 0)
  );
}
