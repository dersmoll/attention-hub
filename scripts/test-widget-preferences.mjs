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
  secondaryTimeZone: "Europe/Kyiv",
  x: 120,
  y: -46,
  panelColor: "#f8fafc",
  panelOpacity: 100,
  widthMode: "auto",
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
  ...preferences.DEFAULT_WIDGET_PREFERENCES,
  panelOpacity: 85,
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
  preferences.DEFAULT_APP_ORDER,
);
assert.deepEqual(
  migratedFixedSources.liveVisualSources,
  preferences.DEFAULT_LIVE_VISUAL_SOURCES,
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
  secondaryTimeZone: "UTC",
  x: 10,
  y: 20,
  panelColor: "#f8fafc",
  panelOpacity: 100,
  widthMode: "auto",
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
