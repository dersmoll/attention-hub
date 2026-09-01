export const WIDGET_PREFERENCES_KEY = "attention-hub.widget.v1";
export const WIDGET_PREFERENCES_CHANGED_EVENT = "widget-preferences-changed";
export const DEFAULT_TIME_ZONE = "America/New_York";

export type AttentionAppKey =
  | "teams"
  | "telegram"
  | "outlook"
  | "slack"
  | "viber"
  | "whatsapp";
export type LiveVisualAppKey = Exclude<AttentionAppKey, "outlook">;
export type WidgetWidthMode = "recommended" | "slim";
export type ClockLayout = "horizontal" | "vertical";
export type PanelSurfaceMode = "light" | "dark" | "custom";

export const PANEL_SURFACE_COLORS = {
  light: { background: "#f8fafc", text: "#111827" },
  dark: { background: "#111827", text: "#f8fafc" },
} as const;
export const DEFAULT_PANEL_ACCENT_COLOR = "#377fc5";

export interface WidgetPreferences {
  sourceCatalogVersion: 2;
  pinned: boolean;
  primaryTimeZone: string | null;
  secondaryTimeZone: string;
  extraTimeZones: string[];
  clockLayout: ClockLayout;
  meetingStartSoundEnabled: boolean;
  showAppsPanel: boolean;
  showClocksPanel: boolean;
  x: number | null;
  y: number | null;
  panelSurface: PanelSurfaceMode;
  panelColor: string;
  panelTextColor: string;
  panelAccentColor: string;
  panelOpacity: number;
  widthMode: WidgetWidthMode;
  recommendedCalendarWidth: number | null;
  slimCalendarWidth: number | null;
  appOrder: AttentionAppKey[];
  monitoredSources: AttentionAppKey[];
  liveVisualSources: LiveVisualAppKey[];
}

export const DEFAULT_APP_ORDER: AttentionAppKey[] = [
  "teams",
  "telegram",
  "outlook",
  "slack",
  "viber",
  "whatsapp",
];
export const LIVE_VISUAL_APP_KEYS: LiveVisualAppKey[] = [
  "teams",
  "telegram",
  "slack",
  "viber",
  "whatsapp",
];
export const DEFAULT_MONITORED_SOURCES: AttentionAppKey[] = [
  "teams",
  "outlook",
];
export const DEFAULT_LIVE_VISUAL_SOURCES: LiveVisualAppKey[] = [
  "teams",
];
const LEGACY_APP_ORDER: AttentionAppKey[] = ["teams", "telegram", "outlook"];

export const DEFAULT_WIDGET_PREFERENCES: WidgetPreferences = {
  sourceCatalogVersion: 2,
  pinned: true,
  primaryTimeZone: null,
  secondaryTimeZone: DEFAULT_TIME_ZONE,
  extraTimeZones: [],
  clockLayout: "horizontal",
  meetingStartSoundEnabled: true,
  showAppsPanel: true,
  showClocksPanel: true,
  x: null,
  y: null,
  panelSurface: "light",
  panelColor: PANEL_SURFACE_COLORS.light.background,
  panelTextColor: PANEL_SURFACE_COLORS.light.text,
  panelAccentColor: DEFAULT_PANEL_ACCENT_COLOR,
  panelOpacity: 100,
  widthMode: "recommended",
  recommendedCalendarWidth: null,
  slimCalendarWidth: null,
  appOrder: [...DEFAULT_APP_ORDER],
  monitoredSources: [...DEFAULT_MONITORED_SOURCES],
  liveVisualSources: [...DEFAULT_LIVE_VISUAL_SOURCES],
};

function normalizeColor(value: unknown, fallback: string) {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value)
    ? value.toLowerCase()
    : fallback;
}

function normalizePanelSurface(
  value: unknown,
  panelColor: string,
): PanelSurfaceMode {
  if (value === "light" || value === "dark" || value === "custom") {
    return value;
  }

  return panelColor === PANEL_SURFACE_COLORS.light.background
    ? "light"
    : "custom";
}

function legacyPanelTextColor(panelColor: string) {
  const background = parseHexColor(panelColor);
  const dark = parseHexColor(PANEL_SURFACE_COLORS.light.text);
  const light = parseHexColor(PANEL_SURFACE_COLORS.dark.text);
  return contrastRatio(background, dark) >= contrastRatio(background, light)
    ? PANEL_SURFACE_COLORS.light.text
    : PANEL_SURFACE_COLORS.dark.text;
}

function normalizeOpacity(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(100, Math.max(25, Math.round(value)))
    : DEFAULT_WIDGET_PREFERENCES.panelOpacity;
}

function normalizeCalendarWidth(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(2_400, Math.max(160, Math.round(value)))
    : null;
}

function normalizeWidthMode(value: unknown): WidgetWidthMode {
  if (value === "recommended" || value === "compact" || value === "auto") {
    return "recommended";
  }
  if (value === "larger" || value === "wide") {
    return "recommended";
  }
  if (value === "slim") {
    return "slim";
  }
  return DEFAULT_WIDGET_PREFERENCES.widthMode;
}

function isValidTimeZone(value: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format(0);
    return true;
  } catch {
    return false;
  }
}

function canonicalTimeZone(value: string) {
  if (value === "Europe/Kiev") {
    return "Europe/Kyiv";
  }
  if (value === "Europe/Sarajevo" || value === "Europe/Skopje") {
    return "Europe/Belgrade";
  }
  return value;
}

function normalizePrimaryTimeZone(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = canonicalTimeZone(value);
  return isValidTimeZone(normalized) ? normalized : null;
}

function normalizeTimeZone(value: unknown) {
  if (typeof value !== "string") {
    return DEFAULT_WIDGET_PREFERENCES.secondaryTimeZone;
  }
  const normalized = canonicalTimeZone(value);
  return isValidTimeZone(normalized)
    ? normalized
    : DEFAULT_WIDGET_PREFERENCES.secondaryTimeZone;
}

function normalizeExtraTimeZones(
  value: unknown,
  primaryTimeZone: string | null,
  secondaryTimeZone: string,
) {
  if (!Array.isArray(value)) {
    return [];
  }
  const excluded = new Set(
    [primaryTimeZone, secondaryTimeZone].filter(
      (timeZone): timeZone is string => timeZone !== null,
    ),
  );
  const normalized: string[] = [];
  for (const candidate of value) {
    if (typeof candidate !== "string") {
      continue;
    }
    const timeZone = canonicalTimeZone(candidate);
    if (
      isValidTimeZone(timeZone) &&
      !excluded.has(timeZone) &&
      !normalized.includes(timeZone)
    ) {
      normalized.push(timeZone);
    }
    if (normalized.length === 3) {
      break;
    }
  }
  return normalized;
}

function normalizeClockLayout(value: unknown): ClockLayout {
  return value === "vertical" ? "vertical" : "horizontal";
}

function normalizeCoordinate(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.round(value)
    : null;
}

function normalizeAppOrder(
  value: unknown,
  migrateLegacyCatalog: boolean,
): AttentionAppKey[] {
  if (!Array.isArray(value)) {
    return [...DEFAULT_APP_ORDER];
  }
  const supported = new Set<AttentionAppKey>(DEFAULT_APP_ORDER);
  const unique = value.filter(
    (key, index): key is AttentionAppKey =>
      supported.has(key as AttentionAppKey) && value.indexOf(key) === index,
  );
  if (unique.length === DEFAULT_APP_ORDER.length) {
    return unique;
  }
  if (
    migrateLegacyCatalog &&
    unique.length === LEGACY_APP_ORDER.length &&
    LEGACY_APP_ORDER.every((key) => unique.includes(key))
  ) {
    return [
      ...unique,
      ...DEFAULT_APP_ORDER.filter((key) => !unique.includes(key)),
    ];
  }
  return [...DEFAULT_APP_ORDER];
}

function normalizeSourceSubset<T extends AttentionAppKey>(
  value: unknown,
  supportedSources: readonly T[],
  fallback: readonly T[],
): T[] {
  if (!Array.isArray(value)) {
    return [...fallback];
  }
  const selected = new Set(value);
  const normalized = supportedSources.filter((sourceKey) =>
    selected.has(sourceKey),
  );
  return normalized;
}

export function normalizeWidgetPreferences(
  value: Partial<WidgetPreferences> | null | undefined,
): WidgetPreferences {
  const migrateLegacyCatalog = value?.sourceCatalogVersion !== 2;
  const legacyMonitoredFallback = migrateLegacyCatalog
    ? DEFAULT_APP_ORDER
    : DEFAULT_WIDGET_PREFERENCES.monitoredSources;
  const legacyVisualFallback = migrateLegacyCatalog
    ? LIVE_VISUAL_APP_KEYS
    : DEFAULT_WIDGET_PREFERENCES.liveVisualSources;
  const primaryTimeZone = normalizePrimaryTimeZone(value?.primaryTimeZone);
  const secondaryTimeZone = normalizeTimeZone(value?.secondaryTimeZone);
  const panelColor = normalizeColor(
    value?.panelColor,
    DEFAULT_WIDGET_PREFERENCES.panelColor,
  );
  const panelTextColor = normalizeColor(
    value?.panelTextColor,
    legacyPanelTextColor(panelColor),
  );
  const panelAccentColor = normalizeColor(
    value?.panelAccentColor,
    DEFAULT_WIDGET_PREFERENCES.panelAccentColor,
  );
  return {
    sourceCatalogVersion: 2,
    pinned:
      typeof value?.pinned === "boolean"
        ? value.pinned
        : DEFAULT_WIDGET_PREFERENCES.pinned,
    primaryTimeZone,
    secondaryTimeZone,
    extraTimeZones: normalizeExtraTimeZones(
      value?.extraTimeZones,
      primaryTimeZone,
      secondaryTimeZone,
    ),
    clockLayout: normalizeClockLayout(value?.clockLayout),
    meetingStartSoundEnabled:
      typeof value?.meetingStartSoundEnabled === "boolean"
        ? value.meetingStartSoundEnabled
        : DEFAULT_WIDGET_PREFERENCES.meetingStartSoundEnabled,
    showAppsPanel:
      typeof value?.showAppsPanel === "boolean"
        ? value.showAppsPanel
        : DEFAULT_WIDGET_PREFERENCES.showAppsPanel,
    showClocksPanel:
      typeof value?.showClocksPanel === "boolean"
        ? value.showClocksPanel
        : DEFAULT_WIDGET_PREFERENCES.showClocksPanel,
    x: normalizeCoordinate(value?.x),
    y: normalizeCoordinate(value?.y),
    panelSurface: normalizePanelSurface(value?.panelSurface, panelColor),
    panelColor,
    panelTextColor,
    panelAccentColor,
    panelOpacity: normalizeOpacity(value?.panelOpacity),
    widthMode: normalizeWidthMode(value?.widthMode),
    recommendedCalendarWidth: normalizeCalendarWidth(
      value?.recommendedCalendarWidth,
    ),
    slimCalendarWidth: normalizeCalendarWidth(value?.slimCalendarWidth),
    appOrder: normalizeAppOrder(value?.appOrder, migrateLegacyCatalog),
    monitoredSources: normalizeSourceSubset(
      value?.monitoredSources,
      DEFAULT_APP_ORDER,
      value == null
        ? DEFAULT_WIDGET_PREFERENCES.monitoredSources
        : legacyMonitoredFallback,
    ),
    liveVisualSources: normalizeSourceSubset(
      value?.liveVisualSources,
      LIVE_VISUAL_APP_KEYS,
      value == null
        ? DEFAULT_WIDGET_PREFERENCES.liveVisualSources
        : legacyVisualFallback,
    ),
  };
}

export function readWidgetPreferences(): WidgetPreferences {
  try {
    return normalizeWidgetPreferences(
      JSON.parse(
        localStorage.getItem(WIDGET_PREFERENCES_KEY) ?? "null",
      ) as Partial<WidgetPreferences> | null,
    );
  } catch {
    return normalizeWidgetPreferences(null);
  }
}

export function writeWidgetPreferences(
  update: Partial<WidgetPreferences>,
): WidgetPreferences {
  const next = normalizeWidgetPreferences({
    ...readWidgetPreferences(),
    ...update,
  });
  localStorage.setItem(WIDGET_PREFERENCES_KEY, JSON.stringify(next));
  return next;
}

interface RgbColor {
  red: number;
  green: number;
  blue: number;
}

function parseHexColor(value: string): RgbColor {
  return {
    red: Number.parseInt(value.slice(1, 3), 16),
    green: Number.parseInt(value.slice(3, 5), 16),
    blue: Number.parseInt(value.slice(5, 7), 16),
  };
}

function relativeLuminance({ red, green, blue }: RgbColor) {
  const channels = [red, green, blue].map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.04045
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrastRatio(first: RgbColor, second: RgbColor) {
  const firstLuminance = relativeLuminance(first);
  const secondLuminance = relativeLuminance(second);
  return (
    (Math.max(firstLuminance, secondLuminance) + 0.05) /
    (Math.min(firstLuminance, secondLuminance) + 0.05)
  );
}

function mixColors(
  foreground: RgbColor,
  background: RgbColor,
  foregroundWeight: number,
) {
  const backgroundWeight = 1 - foregroundWeight;
  const toHex = (value: number) =>
    Math.round(value).toString(16).padStart(2, "0");
  const red = toHex(
    foreground.red * foregroundWeight + background.red * backgroundWeight,
  );
  const green = toHex(
    foreground.green * foregroundWeight + background.green * backgroundWeight,
  );
  const blue = toHex(
    foreground.blue * foregroundWeight + background.blue * backgroundWeight,
  );
  return `#${red}${green}${blue}`;
}

export function panelSurfaceColors(preferences: WidgetPreferences) {
  const preset =
    preferences.panelSurface === "custom"
      ? null
      : PANEL_SURFACE_COLORS[preferences.panelSurface];
  return {
    background: preset?.background ?? preferences.panelColor,
    text: preset?.text ?? preferences.panelTextColor,
  };
}

export function panelTextContrastRatio(preferences: WidgetPreferences) {
  const colors = panelSurfaceColors(preferences);
  return contrastRatio(
    parseHexColor(colors.background),
    parseHexColor(colors.text),
  );
}

export function panelAccentContrastRatio(preferences: WidgetPreferences) {
  const colors = panelSurfaceColors(preferences);
  return contrastRatio(
    parseHexColor(colors.background),
    parseHexColor(preferences.panelAccentColor),
  );
}

export function widgetPanelStyle(preferences: WidgetPreferences) {
  const colors = panelSurfaceColors(preferences);
  const background = parseHexColor(colors.background);
  const foreground = parseHexColor(colors.text);
  const accent = parseHexColor(preferences.panelAccentColor);
  const dark = parseHexColor(PANEL_SURFACE_COLORS.light.text);
  const light = parseHexColor(PANEL_SURFACE_COLORS.dark.text);
  const accentForeground =
    contrastRatio(accent, dark) >= contrastRatio(accent, light)
      ? PANEL_SURFACE_COLORS.light.text
      : PANEL_SURFACE_COLORS.dark.text;
  const alpha = preferences.panelOpacity / 100;
  const borderForegroundWeight =
    relativeLuminance(background) < 0.18 ? 0.26 : 0.5;

  return {
    "--widget-panel-background": `rgb(${background.red} ${background.green} ${background.blue} / ${alpha})`,
    "--widget-panel-solid": colors.background,
    "--widget-panel-foreground": colors.text,
    "--widget-panel-accent": preferences.panelAccentColor,
    "--widget-panel-accent-foreground": accentForeground,
    "--widget-panel-muted": mixColors(foreground, background, 0.7),
    "--widget-panel-border": mixColors(
      foreground,
      background,
      borderForegroundWeight,
    ),
    "--widget-panel-interactive-foreground": colors.background,
    "--widget-clock-picker-filter":
      relativeLuminance(background) < 0.5
        ? "brightness(0) invert(1)"
        : "none",
  };
}
