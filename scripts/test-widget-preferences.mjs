import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const sourceUrl = new URL("../src/widget-preferences.ts", import.meta.url);
const source = await readFile(sourceUrl, "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
  fileName: sourceUrl.pathname,
  reportDiagnostics: true,
});

assert.equal(
  compiled.diagnostics?.length ?? 0,
  0,
  "widget preference module must transpile without diagnostics",
);

const moduleUrl = `data:text/javascript;base64,${Buffer.from(compiled.outputText).toString("base64")}`;
const preferences = await import(moduleUrl);

const legacy = preferences.normalizeWidgetPreferences({
  pinned: false,
  secondaryTimeZone: "Europe/Kyiv",
  x: 120.4,
  y: -45.6,
});
assert.deepEqual(legacy, {
  sourceCatalogVersion: 2,
  pinned: false,
  primaryTimeZone: null,
  secondaryTimeZone: "Europe/Kyiv",
  extraTimeZones: [],
  clockLayout: "horizontal",
  meetingStartSoundEnabled: true,
  showAppsPanel: true,
  showClocksPanel: true,
  showTodayPanel: true,
  showProjectsPanel: true,
  x: 120,
  y: -46,
  panelSurface: "light",
  panelColor: "#f8fafc",
  panelTextColor: "#111827",
  panelAccentColor: "#377fc5",
  panelOpacity: 100,
  widthMode: "recommended",
  recommendedCalendarWidth: null,
  slimCalendarWidth: null,
  appOrder: ["teams", "telegram", "outlook", "slack", "viber", "whatsapp"],
  monitoredSources: [
    "teams",
    "telegram",
    "outlook",
    "slack",
    "viber",
    "whatsapp",
  ],
  liveVisualSources: ["teams", "telegram", "slack", "viber", "whatsapp"],
});

const malformed = preferences.normalizeWidgetPreferences({
  pinned: "false",
  secondaryTimeZone: "Invalid/Zone",
  x: Number.POSITIVE_INFINITY,
  y: "12",
  panelColor: "transparent",
  panelOpacity: 20,
  appOrder: ["teams", "teams", "outlook"],
});
assert.deepEqual(malformed, {
  sourceCatalogVersion: 2,
  pinned: true,
  primaryTimeZone: null,
  secondaryTimeZone: preferences.DEFAULT_TIME_ZONE,
  extraTimeZones: [],
  clockLayout: "horizontal",
  meetingStartSoundEnabled: true,
  showAppsPanel: true,
  showClocksPanel: true,
  showTodayPanel: true,
  showProjectsPanel: true,
  x: null,
  y: null,
  panelSurface: "light",
  panelColor: "#f8fafc",
  panelTextColor: "#111827",
  panelAccentColor: "#377fc5",
  panelOpacity: 25,
  widthMode: "recommended",
  recommendedCalendarWidth: null,
  slimCalendarWidth: null,
  appOrder: preferences.DEFAULT_APP_ORDER,
  monitoredSources: preferences.DEFAULT_APP_ORDER,
  liveVisualSources: preferences.LIVE_VISUAL_APP_KEYS,
});

const legacyCustomSurface = preferences.normalizeWidgetPreferences({
  panelColor: "#1e293b",
  panelOpacity: 80,
});
assert.equal(legacyCustomSurface.panelSurface, "custom");
assert.equal(legacyCustomSurface.panelColor, "#1e293b");
assert.equal(legacyCustomSurface.panelTextColor, "#f8fafc");

const darkSurface = preferences.normalizeWidgetPreferences({
  panelSurface: "dark",
  panelColor: "#f8fafc",
  panelTextColor: "#111827",
});
assert.equal(preferences.panelTextContrastRatio(darkSurface) >= 4.5, true);
assert.deepEqual(preferences.widgetPanelStyle(darkSurface), {
  "--widget-panel-background": "rgb(17 24 39 / 1)",
  "--widget-panel-solid": "#111827",
  "--widget-panel-foreground": "#f8fafc",
  "--widget-panel-accent": "#377fc5",
  "--widget-panel-accent-foreground": "#111827",
  "--widget-panel-muted": "#b3b6bc",
  "--widget-panel-border": "#4d535e",
  "--widget-panel-interactive-foreground": "#111827",
  "--widget-clock-picker-filter": "brightness(0) invert(1)",
});

const sourceControls = preferences.normalizeWidgetPreferences({
  sourceCatalogVersion: 2,
  monitoredSources: ["outlook", "unsupported", "outlook"],
  liveVisualSources: ["telegram", "outlook", "telegram"],
});
assert.deepEqual(sourceControls.monitoredSources, ["outlook"]);
assert.deepEqual(sourceControls.liveVisualSources, ["telegram"]);

const migratedFixedSources = preferences.normalizeWidgetPreferences({
  appOrder: ["outlook", "teams", "telegram"],
  monitoredSources: ["teams", "telegram", "outlook"],
  liveVisualSources: ["teams", "telegram"],
});
assert.deepEqual(migratedFixedSources.appOrder, [
  "outlook",
  "teams",
  "telegram",
  "slack",
  "viber",
  "whatsapp",
]);
assert.deepEqual(
  migratedFixedSources.monitoredSources,
  ["teams", "telegram", "outlook"],
);
assert.deepEqual(
  migratedFixedSources.liveVisualSources,
  ["teams", "telegram"],
);

const fresh = preferences.normalizeWidgetPreferences(null);
assert.deepEqual(fresh.monitoredSources, ["teams", "outlook"]);
assert.deepEqual(fresh.liveVisualSources, ["teams"]);
assert.equal(fresh.primaryTimeZone, null);
assert.equal(fresh.widthMode, "recommended");
assert.deepEqual(fresh.extraTimeZones, []);
assert.equal(fresh.clockLayout, "horizontal");
assert.equal(fresh.meetingStartSoundEnabled, true);
assert.equal(fresh.showAppsPanel, true);
assert.equal(fresh.showClocksPanel, true);
assert.equal(fresh.showTodayPanel, true);
assert.equal(fresh.showProjectsPanel, true);

const hiddenPanels = preferences.normalizeWidgetPreferences({
  sourceCatalogVersion: 2,
  showAppsPanel: false,
  showClocksPanel: false,
  showTodayPanel: false,
  showProjectsPanel: false,
});
assert.equal(hiddenPanels.showAppsPanel, false);
assert.equal(hiddenPanels.showClocksPanel, false);
assert.equal(hiddenPanels.showTodayPanel, false);
assert.equal(hiddenPanels.showProjectsPanel, false);
assert.equal(
  preferences.normalizeWidgetPreferences({
    sourceCatalogVersion: 2,
    showAppsPanel: "no",
    showClocksPanel: null,
  }).showAppsPanel,
  true,
);

const meetingSound = preferences.normalizeWidgetPreferences({
  sourceCatalogVersion: 2,
  meetingStartSoundEnabled: true,
});
assert.equal(meetingSound.meetingStartSoundEnabled, true);
assert.equal(
  preferences.normalizeWidgetPreferences({
    sourceCatalogVersion: 2,
    meetingStartSoundEnabled: false,
  }).meetingStartSoundEnabled,
  false,
);
assert.equal(
  preferences.normalizeWidgetPreferences({
    sourceCatalogVersion: 2,
    meetingStartSoundEnabled: "yes",
  }).meetingStartSoundEnabled,
  true,
);

const multipleClocks = preferences.normalizeWidgetPreferences({
  sourceCatalogVersion: 2,
  primaryTimeZone: "Europe/Kyiv",
  secondaryTimeZone: "America/New_York",
  extraTimeZones: [
    "Europe/Belgrade",
    "Europe/Belgrade",
    "Invalid/Zone",
    "Europe/Sarajevo",
    "Europe/Skopje",
    "Asia/Tokyo",
  ],
  clockLayout: "vertical",
});
assert.deepEqual(multipleClocks.extraTimeZones, [
  "Europe/Belgrade",
  "Asia/Tokyo",
]);
assert.equal(multipleClocks.clockLayout, "vertical");
assert.equal(
  preferences.normalizeWidgetPreferences({ clockLayout: "timeFocus" })
    .clockLayout,
  "timeFocus",
);
assert.equal(
  preferences.normalizeWidgetPreferences({ clockLayout: "unsupported" })
    .clockLayout,
  "horizontal",
);

assert.equal(
  preferences.normalizeWidgetPreferences({ widthMode: "compact" }).widthMode,
  "recommended",
);
assert.equal(
  preferences.normalizeWidgetPreferences({ widthMode: "auto" }).widthMode,
  "recommended",
);
assert.equal(
  preferences.normalizeWidgetPreferences({ widthMode: "wide" }).widthMode,
  "recommended",
);
assert.equal(
  preferences.normalizeWidgetPreferences({ widthMode: "larger" }).widthMode,
  "recommended",
);
assert.equal(
  preferences.normalizeWidgetPreferences({ widthMode: "slim" }).widthMode,
  "slim",
);
const customGeometry = preferences.normalizeWidgetPreferences({
  panelAccentColor: "#AABBCC",
  recommendedCalendarWidth: 412.4,
  slimCalendarWidth: 10_000,
});
assert.equal(customGeometry.panelAccentColor, "#aabbcc");
assert.equal(customGeometry.recommendedCalendarWidth, 412);
assert.equal(customGeometry.slimCalendarWidth, 2_400);
assert.equal(
  preferences.panelAccentContrastRatio(preferences.DEFAULT_WIDGET_PREFERENCES) >= 3,
  true,
);
assert.equal(
  preferences.panelAccentContrastRatio(
    preferences.normalizeWidgetPreferences({
      panelAccentColor: "#f8fafc",
    }),
  ) < 3,
  true,
);
const malformedGeometry = preferences.normalizeWidgetPreferences({
  panelAccentColor: "transparent",
  recommendedCalendarWidth: Number.NaN,
  slimCalendarWidth: "520",
});
assert.equal(malformedGeometry.panelAccentColor, "#377fc5");
assert.equal(malformedGeometry.recommendedCalendarWidth, null);
assert.equal(malformedGeometry.slimCalendarWidth, null);

const primaryTimeZoneOverride = preferences.normalizeWidgetPreferences({
  sourceCatalogVersion: 2,
  primaryTimeZone: "Europe/Kyiv",
});
assert.equal(primaryTimeZoneOverride.primaryTimeZone, "Europe/Kyiv");
const canonicalKyiv = preferences.normalizeWidgetPreferences({
  sourceCatalogVersion: 2,
  primaryTimeZone: "Europe/Kiev",
  secondaryTimeZone: "Europe/Kiev",
});
assert.equal(canonicalKyiv.primaryTimeZone, "Europe/Kyiv");
assert.equal(canonicalKyiv.secondaryTimeZone, "Europe/Kyiv");
assert.equal(
  preferences.normalizeWidgetPreferences({
    sourceCatalogVersion: 2,
    primaryTimeZone: "Invalid/Zone",
  }).primaryTimeZone,
  null,
);

const currentFixedSources = preferences.normalizeWidgetPreferences({
  sourceCatalogVersion: 2,
  appOrder: preferences.DEFAULT_APP_ORDER,
  monitoredSources: ["teams", "telegram", "outlook"],
  liveVisualSources: ["teams", "telegram"],
});
assert.deepEqual(currentFixedSources.monitoredSources, [
  "teams",
  "telegram",
  "outlook",
]);
assert.deepEqual(currentFixedSources.liveVisualSources, ["teams", "telegram"]);

const paused = preferences.normalizeWidgetPreferences({
  sourceCatalogVersion: 2,
  monitoredSources: [],
  liveVisualSources: [],
});
assert.deepEqual(paused.monitoredSources, []);
assert.deepEqual(paused.liveVisualSources, []);

const storedValues = new Map();
globalThis.localStorage = {
  getItem: (key) => storedValues.get(key) ?? null,
  setItem: (key, value) => storedValues.set(key, value),
};

storedValues.set(preferences.WIDGET_PREFERENCES_KEY, "not-json");
assert.deepEqual(
  preferences.readWidgetPreferences(),
  preferences.DEFAULT_WIDGET_PREFERENCES,
);

storedValues.set(
  preferences.WIDGET_PREFERENCES_KEY,
  JSON.stringify({
    pinned: false,
    secondaryTimeZone: "UTC",
    x: 10,
    y: 20,
  }),
);
assert.deepEqual(preferences.readWidgetPreferences(), {
  sourceCatalogVersion: 2,
  pinned: false,
  primaryTimeZone: null,
  secondaryTimeZone: "UTC",
  extraTimeZones: [],
  clockLayout: "horizontal",
  meetingStartSoundEnabled: true,
  showAppsPanel: true,
  showClocksPanel: true,
  showTodayPanel: true,
  showProjectsPanel: true,
  x: 10,
  y: 20,
  panelSurface: "light",
  panelColor: "#f8fafc",
  panelTextColor: "#111827",
  panelAccentColor: "#377fc5",
  panelOpacity: 100,
  widthMode: "recommended",
  recommendedCalendarWidth: null,
  slimCalendarWidth: null,
  appOrder: [
    "teams",
    "telegram",
    "outlook",
    "slack",
    "viber",
    "whatsapp",
  ],
  monitoredSources: [
    "teams",
    "telegram",
    "outlook",
    "slack",
    "viber",
    "whatsapp",
  ],
  liveVisualSources: ["teams", "telegram", "slack", "viber", "whatsapp"],
});

console.log("widget preference migration tests passed");
