import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const sourceUrl = new URL("../src/medicine-panel-model.ts", import.meta.url);
const sourceText = await readFile(sourceUrl, "utf8");
const compiled = ts.transpileModule(sourceText, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 }, fileName: sourceUrl.pathname, reportDiagnostics: true });
assert.equal(compiled.diagnostics?.length ?? 0, 0);
const panel = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputText).toString("base64")}`);
// Chrome that is always present: the toolbar and the panel footer.
assert.equal(panel.medicinePanelHeight(0, 0, false), 86);
assert.equal(panel.medicinePanelHeight(1, 1, false), 178);
// §4b bounds: at most 3 treatment headings and 8 dose rows, plus the more row.
assert.equal(panel.medicinePanelHeight(3, 8, true), 562);
assert.equal(panel.medicinePanelHeight(99, 99, true), 562);
// Bounds clamp rather than grow, so an overfull day cannot outgrow a full one.
assert.equal(panel.medicinePanelHeight(4, 9, true), panel.medicinePanelHeight(3, 8, true));
// Negative and fractional inputs floor rather than shrinking the panel.
assert.equal(panel.medicinePanelHeight(-3, -1, false), 86);
assert.equal(panel.medicinePanelHeight(1.9, 1.9, false), 178);
console.log("medicine panel checks passed");
