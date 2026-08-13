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

assert.equal(layout.widgetLeftWidth(0), 72);
assert.equal(layout.widgetLeftWidth(1), 128);
assert.equal(layout.widgetLeftWidth(3), 240);
assert.equal(layout.widgetLeftWidth(6), 408);
assert.equal(layout.widgetCalendarWidth("compact", false), 304);
assert.equal(layout.widgetCalendarWidth("auto", false), 336);
assert.equal(layout.widgetCalendarWidth("auto", true), 432);
assert.equal(layout.widgetCalendarWidth("wide", false), 432);
assert.equal(layout.widgetWidth(0, "compact"), 688);
assert.equal(layout.widgetWidth(0), 720);
assert.equal(layout.widgetWidth(6), 1056);
assert.equal(layout.widgetWidth(6, "auto", true), 1152);
assert.equal(layout.widgetWidth(99, "wide"), 1152);

console.log("responsive widget layout tests passed");
