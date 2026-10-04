import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

// Execute the production coordinate functions without importing window-opening
// code or invoking Tauri. Their return value still uses Tauri's real DPI class.
async function loadPositionFunction(file, name) {
  const sourceUrl = new URL(`../src/${file}`, import.meta.url);
  const source = await readFile(sourceUrl, "utf8");
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const declaration = tree.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === name);
  assert.ok(declaration, `${name} must remain an independently testable coordinate function`);
  const compiled = ts.transpileModule(
    `import { PhysicalPosition } from ${JSON.stringify(import.meta.resolve("@tauri-apps/api/window"))};\n${declaration.getText(tree)}`,
    { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 }, reportDiagnostics: true },
  );
  assert.equal(compiled.diagnostics?.length ?? 0, 0);
  const module = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputText).toString("base64")}`);
  return module[name];
}

const today = await loadPositionFunction("today-popup-window.ts", "todayPopupPosition");
const medicine = await loadPositionFunction("medicine-panel-window.ts", "medicinePanelPosition");
const anchor = {
  left: 600, top: 600, right: 664, bottom: 664, scaleFactor: 1,
  monitorLeft: 100, monitorTop: 200, monitorRight: 2100, monitorBottom: 1400,
};
let assertions = 0;
function expectPosition(position, expected, message) {
  assert.equal(position.type, "Physical", message);
  assert.deepEqual([position.x, position.y], expected, message);
  assertions += 1;
}

for (const [label, position, horizontalX] of [["Today", today, 600], ["Medicine", medicine, 364]]) {
  const payload = { anchor, width: 300, height: 240 };
  expectPosition(position({ ...payload, placement: "above" }), [horizontalX, 355], `${label}: existing above alignment`);
  expectPosition(position({ ...payload, placement: "below" }), [horizontalX, 669], `${label}: existing below alignment`);
  expectPosition(position({ ...payload, placement: "left" }), [295, 600], `${label}: left rail placement`);
  expectPosition(position({ ...payload, placement: "right" }), [669, 600], `${label}: right rail placement`);

  const scaled = { ...payload, anchor: { ...anchor, scaleFactor: 1.25 } };
  expectPosition(position({ ...scaled, placement: "left" }), [219, 600], `${label}: fractional DPI scales popup and gap once`);
  expectPosition(position({ ...scaled, placement: "right" }), [670, 600], `${label}: fractional DPI right gap`);

  expectPosition(position({ ...payload, placement: "left", anchor: { ...anchor, left: 110, top: 210 } }), [100, 210], `${label}: left edge clamp`);
  expectPosition(position({ ...payload, placement: "right", anchor: { ...anchor, right: 2090, top: 1390 } }), [1800, 1160], `${label}: right and bottom edge clamp`);
  expectPosition(position({ ...payload, placement: "above", anchor: { ...anchor, top: 205 } }), [horizontalX, 200], `${label}: top edge clamp`);

  const negativeMonitor = {
    left: -1000, top: -600, right: -936, bottom: -536, scaleFactor: 1,
    monitorLeft: -1920, monitorTop: -1080, monitorRight: 0, monitorBottom: 0,
  };
  expectPosition(position({ ...payload, anchor: negativeMonitor, placement: "left" }), [-1305, -600], `${label}: negative monitor origin`);
  expectPosition(position({ ...payload, anchor: negativeMonitor, placement: "right" }), [-931, -600], `${label}: negative monitor right placement`);

  for (const placement of ["above", "below", "left", "right"]) {
    // Neither dimension fits. Keep the top-left visible instead of clamping
    // against an inverted interval that pushes it outside this monitor.
    const tinyMonitor = { ...anchor, monitorLeft: -300, monitorTop: 150, monitorRight: -100, monitorBottom: 270 };
    expectPosition(position({ ...payload, anchor: tinyMonitor, placement }), [-300, 150], `${label}: oversized ${placement} popup remains reachable`);
  }
  expectPosition(position({ ...payload, anchor: { ...anchor, monitorRight: 300 }, placement: "right" }), [100, 600], `${label}: width-only overflow preserves vertical alignment`);
  expectPosition(position({ ...payload, anchor: { ...anchor, monitorBottom: 320 }, placement: "right" }), [669, 200], `${label}: height-only overflow preserves side alignment`);
}

console.log(`popup placement checks passed (${assertions} coordinate cases)`);
