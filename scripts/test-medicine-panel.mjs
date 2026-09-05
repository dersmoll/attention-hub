import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const sourceUrl = new URL("../src/medicine-panel-model.ts", import.meta.url);
const sourceText = await readFile(sourceUrl, "utf8");
const compiled = ts.transpileModule(sourceText, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 }, fileName: sourceUrl.pathname, reportDiagnostics: true });
assert.equal(compiled.diagnostics?.length ?? 0, 0);
const panel = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputText).toString("base64")}`);
// Chrome that is always present: the toolbar and the panel footer.
assert.equal(panel.medicinePanelHeight(0, 0, false), 88);
assert.equal(panel.medicinePanelHeight(1, 1, false), 182);
// §4b bounds: at most 3 treatment headings and 8 dose rows, plus the more row.
assert.equal(panel.medicinePanelHeight(3, 8, true), 590);
assert.equal(panel.medicinePanelHeight(99, 99, true), 590);
// Bounds clamp rather than grow, so an overfull day cannot outgrow a full one.
assert.equal(panel.medicinePanelHeight(4, 9, true), panel.medicinePanelHeight(3, 8, true));
// Negative and fractional inputs floor rather than shrinking the panel.
assert.equal(panel.medicinePanelHeight(-3, -1, false), 88);
assert.equal(panel.medicinePanelHeight(1.9, 1.9, false), 182);

// A dose row must be budgeted at its rendered height, not its `min-height`.
// With `line-height: 1.5` the stacked 11px name and 9px detail plus 4px
// padding and 2px border come to 36px, and the 2px grid gap makes 38. Budgeting
// the 32px `min-height` instead clipped the footer once five rows were shown,
// so this pins the row cost rather than the total it happens to produce.
assert.equal(
  panel.medicinePanelHeight(1, 2, false) - panel.medicinePanelHeight(1, 1, false),
  38,
  "each dose row must be budgeted at its rendered height",
);
assert.equal(
  panel.medicinePanelHeight(2, 0, false) - panel.medicinePanelHeight(1, 0, false),
  56,
  "each treatment heading must be budgeted at its rendered height",
);
// The real-world case from the M19 review: two treatments, five doses.
assert.ok(
  panel.medicinePanelHeight(2, 5, false) >= 386,
  "must cover the measured height of a two-treatment, five-dose day",
);
console.log("medicine panel checks passed");
