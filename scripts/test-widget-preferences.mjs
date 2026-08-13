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
  pinned: false,
  secondaryTimeZone: "Europe/Kyiv",
  x: 120,
  y: -46,
  panelColor: "#f8fafc",
  panelOpacity: 100,
  appOrder: ["teams", "telegram", "outlook"],
  monitoredSources: ["teams", "telegram", "outlook"],
  liveVisualSources: ["teams", "telegram"],
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
  monitoredSources: ["outlook", "unsupported", "outlook"],
  liveVisualSources: ["telegram", "outlook", "telegram"],
});
assert.deepEqual(sourceControls.monitoredSources, ["outlook"]);
assert.deepEqual(sourceControls.liveVisualSources, ["telegram"]);

const paused = preferences.normalizeWidgetPreferences({
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
  pinned: false,
  secondaryTimeZone: "UTC",
  x: 10,
  y: 20,
  panelColor: "#f8fafc",
  panelOpacity: 100,
  appOrder: ["teams", "telegram", "outlook"],
  monitoredSources: ["teams", "telegram", "outlook"],
  liveVisualSources: ["teams", "telegram"],
});

console.log("widget preference migration tests passed");
