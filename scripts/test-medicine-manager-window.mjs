import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../src/medicine-manager-window.ts", import.meta.url), "utf8");

assert.match(source, /let opening: Promise<void> \| null = null/, "concurrent opens must share one manager-opening operation");
assert.match(source, /await new Promise<void>\(\(resolve, reject\)/, "the caller must wait until a newly created manager is ready");
assert.match(source, /await manager\.show\(\);\s*await manager\.setFocus\(\);\s*resolve\(\);/s, "creation must resolve only after the manager is visible and focused");
assert.match(source, /for \(let attempt = 0; attempt < 4; attempt \+= 1\)/, "a closing stale window handle must be retried");

const panelSource = await readFile(new URL("../src/MedicinePanelView.tsx", import.meta.url), "utf8");
assert.match(panelSource, /await openMedicineManagerWindow\(\); await close\(\);/, "the popup must close only after manager readiness");

console.log("medicine manager window checks passed");
