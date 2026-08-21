import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const sourceUrl = new URL("../src/widget-layout.ts", import.meta.url);
const sourceText = await readFile(sourceUrl, "utf8");
const compiled = ts.transpileModule(sourceText, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  fileName: sourceUrl.pathname,
  reportDiagnostics: true,
});
assert.equal(compiled.diagnostics?.length ?? 0, 0);
const layout = await import(
  `data:text/javascript;base64,${Buffer.from(compiled.outputText).toString("base64")}`
);

assert.equal(layout.widgetHeight("recommended"), 68);
assert.equal(layout.widgetHeight("larger"), 80);
assert.equal(layout.widgetClockWidth("recommended"), 208);
assert.equal(layout.widgetClockWidth("larger"), 240);
assert.equal(layout.widgetZoneGap("recommended"), 6);
assert.equal(layout.widgetZoneGap("larger"), 8);

assert.equal(layout.widgetLeftWidth(0), 16);
assert.equal(layout.widgetLeftWidth(1), 56);
assert.equal(layout.widgetLeftWidth(2), 100);
assert.equal(layout.widgetLeftWidth(3), 144);
assert.equal(layout.widgetLeftWidth(6), 276);
assert.equal(layout.widgetLeftWidth(0, "recommended"), 16);
assert.equal(layout.widgetLeftWidth(2, "recommended"), 100);
assert.equal(layout.widgetLeftWidth(6, "recommended"), 276);
assert.equal(layout.widgetCalendarWidth("recommended", false), 272);
assert.equal(layout.widgetCalendarWidth("recommended", true), 392);
assert.equal(layout.widgetCalendarWidth("larger", false), 416);
assert.equal(layout.widgetCalendarWidth("larger", true), 416);
assert.equal(layout.widgetWidth(0, "recommended"), 582);
assert.equal(layout.widgetWidth(2, "recommended"), 666);
assert.equal(layout.widgetWidth(6, "recommended"), 842);
assert.equal(layout.widgetWidth(0, "recommended", true), 702);
assert.equal(layout.widgetWidth(2, "recommended", true), 786);
assert.equal(layout.widgetWidth(6, "recommended", true), 962);
assert.equal(layout.widgetWidth(2), 666);
assert.equal(layout.widgetWidth(2, "larger"), 876);
assert.equal(layout.widgetWidth(6, "larger"), 1100);
assert.equal(layout.widgetWidth(99, "larger"), 1100);

console.log("responsive widget layout tests passed");
