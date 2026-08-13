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

export interface WidgetPreferences {
  sourceCatalogVersion: 2;
  pinned: boolean;
  secondaryTimeZone: string;
  x: number | null;
  y: number | null;
  panelColor: string;
  panelOpacity: number;
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
export const DEFAULT_LIVE_VISUAL_SOURCES: LiveVisualAppKey[] = [
  "teams",
  "telegram",
  "slack",
  "viber",
  "whatsapp",
];
const LEGACY_APP_ORDER: AttentionAppKey[] = ["teams", "telegram", "outlook"];
const LEGACY_LIVE_VISUAL_SOURCES: LiveVisualAppKey[] = ["teams", "telegram"];

export const DEFAULT_WIDGET_PREFERENCES: WidgetPreferences = {
  sourceCatalogVersion: 2,
  pinned: true,
  secondaryTimeZone: DEFAULT_TIME_ZONE,
  x: null,
  y: null,
  panelColor: "#f8fafc",
  panelOpacity: 100,
  appOrder: [...DEFAULT_APP_ORDER],
  monitoredSources: [...DEFAULT_APP_ORDER],
  liveVisualSources: [...DEFAULT_LIVE_VISUAL_SOURCES],
};

function normalizeColor(value: unknown) {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value)
    ? value.toLowerCase()
    : DEFAULT_WIDGET_PREFERENCES.panelColor;
}

function normalizeOpacity(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(100, Math.max(85, Math.round(value)))
    : DEFAULT_WIDGET_PREFERENCES.panelOpacity;
}

function normalizeTimeZone(value: unknown) {
  if (typeof value !== "string") {
    return DEFAULT_WIDGET_PREFERENCES.secondaryTimeZone;
  }
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format(0);
    return value;
  } catch {
    return DEFAULT_WIDGET_PREFERENCES.secondaryTimeZone;
  }
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
  legacyDefaults: readonly T[] = [],
  migrateLegacyCatalog = false,
): T[] {
  if (!Array.isArray(value)) {
    return [...fallback];
  }
  const selected = new Set(value);
  const normalized = supportedSources.filter((sourceKey) =>
    selected.has(sourceKey),
  );
  if (
    migrateLegacyCatalog &&
    normalized.length === legacyDefaults.length &&
    legacyDefaults.every((key) => normalized.includes(key))
  ) {
    return [...fallback];
  }
  return normalized;
}

export function normalizeWidgetPreferences(
  value: Partial<WidgetPreferences> | null | undefined,
): WidgetPreferences {
  const migrateLegacyCatalog = value?.sourceCatalogVersion !== 2;
  return {
    sourceCatalogVersion: 2,
    pinned:
      typeof value?.pinned === "boolean"
        ? value.pinned
        : DEFAULT_WIDGET_PREFERENCES.pinned,
    secondaryTimeZone: normalizeTimeZone(value?.secondaryTimeZone),
    x: normalizeCoordinate(value?.x),
    y: normalizeCoordinate(value?.y),
    panelColor: normalizeColor(value?.panelColor),
    panelOpacity: normalizeOpacity(value?.panelOpacity),
    appOrder: normalizeAppOrder(value?.appOrder, migrateLegacyCatalog),
    monitoredSources: normalizeSourceSubset(
      value?.monitoredSources,
      DEFAULT_APP_ORDER,
      DEFAULT_WIDGET_PREFERENCES.monitoredSources,
      LEGACY_APP_ORDER,
      migrateLegacyCatalog,
    ),
    liveVisualSources: normalizeSourceSubset(
      value?.liveVisualSources,
      DEFAULT_LIVE_VISUAL_SOURCES,
      DEFAULT_WIDGET_PREFERENCES.liveVisualSources,
      LEGACY_LIVE_VISUAL_SOURCES,
      migrateLegacyCatalog,
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

export function widgetPanelStyle(preferences: WidgetPreferences) {
  const background = parseHexColor(preferences.panelColor);
  const dark = parseHexColor("#111827");
  const light = parseHexColor("#f8fafc");
  const useDarkForeground =
    contrastRatio(background, dark) >= contrastRatio(background, light);
  const foreground = useDarkForeground ? "#111827" : "#f8fafc";
  const mutedCandidate = useDarkForeground ? "#475569" : "#e2e8f0";
  const muted =
    contrastRatio(background, parseHexColor(mutedCandidate)) >= 4.5
      ? mutedCandidate
      : foreground;
  const borderCandidate = useDarkForeground ? "#334155" : "#e2e8f0";
  const border =
    contrastRatio(background, parseHexColor(borderCandidate)) >= 3
      ? borderCandidate
      : foreground;
  const alpha = preferences.panelOpacity / 100;

  return {
    "--widget-panel-background": `rgb(${background.red} ${background.green} ${background.blue} / ${alpha})`,
    "--widget-panel-solid": preferences.panelColor,
    "--widget-panel-foreground": foreground,
    "--widget-panel-muted": muted,
    "--widget-panel-border": border,
  };
}
