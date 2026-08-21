import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const sourceUrl = new URL("../src/advanced-focus.ts", import.meta.url);
const sourceText = await readFile(sourceUrl, "utf8");
const compiled = ts.transpileModule(sourceText, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  fileName: sourceUrl.pathname,
  reportDiagnostics: true,
});
assert.equal(compiled.diagnostics?.length ?? 0, 0);
const advancedFocus = await import(
  `data:text/javascript;base64,${Buffer.from(compiled.outputText).toString("base64")}`
);

assert.equal(advancedFocus.advancedWindowUrl(), "/");
assert.equal(
  advancedFocus.advancedWindowUrl("work-calendar"),
  "/?advancedFocus=work-calendar",
);
assert.equal(
  advancedFocus.readAdvancedFocusTarget("?advancedFocus=work-calendar"),
  "work-calendar",
);
assert.equal(advancedFocus.readAdvancedFocusTarget("?advancedFocus=unknown"), null);
assert.equal(advancedFocus.readAdvancedFocusTarget(""), null);

console.log("advanced focus routing tests passed");
