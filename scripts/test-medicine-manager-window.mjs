import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../src/medicine-manager-window.ts", import.meta.url), "utf8");

assert.match(source, /let opening: Promise<void> \| null = null/, "concurrent opens must share one manager-opening operation");
assert.match(source, /await new Promise<void>\(\(resolve, reject\)/, "the caller must wait until a newly created manager is ready");
assert.match(source, /await manager\.show\(\);\s*await manager\.setFocus\(\);\s*resolve\(\);/s, "creation must resolve only after the manager is visible and focused");
assert.match(source, /for \(let attempt = 0; attempt < 4; attempt \+= 1\)/, "a closing stale window handle must be retried");

const panelSource = await readFile(new URL("../src/MedicinePanelView.tsx", import.meta.url), "utf8");
assert.match(panelSource, /await openMedicineManagerWindow\(\); await close\(\);/, "the popup must close only after manager readiness");

/* Contextual overflow navigation. `tauri://created` fires before the manager's
 * React listeners exist, so a target sent on creation alone would be dropped;
 * and the surface that asked must not close until the manager says it moved. */
assert.match(source, /listen\(MEDICINE_MANAGER_READY_EVENT, \(\) => void send\(\)\)/, "a newly created manager must be sent the target when it announces itself");
assert.match(source, /Promise\.race\(\[acknowledged, timeout\]\)/, "a manager that never acknowledges must fail rather than hang the caller");

const managerSource = await readFile(new URL("../src/MedicineManagerView.tsx", import.meta.url), "utf8");
assert.match(managerSource, /keep\(stop\); if \(!disposed\) void emit\(MEDICINE_MANAGER_READY_EVENT\)/, "readiness must be announced only once the target listener exists");
assert.match(managerSource, /handledNavigations\.current\.has\(target\.requestId\)/, "a duplicated request must be applied once");
/* Readiness proves the listener exists, not that the first snapshot has landed.
 * A manager created *by* this navigation would otherwise call a valid target
 * stale, which is the common case rather than an edge one. */
assert.match(managerSource, /const fresh = await invoke<MedicineSnapshot>\("get_medicine_snapshot"\)\.catch\(\(\) => null\);/, "an unknown target must be re-checked against fresh data before being refused");
assert.doesNotMatch(managerSource, /latestNavigate\.current = async[\s\S]{0,2000}selectTreatment\(/, "navigation must not route through selectTreatment, which clears the drafts it must protect");

for (const [guard, note] of [
  [/if \(deleteTarget\) return/, "a pending delete"],
  [/if \(showNewMedicine \|\| editingMedicineId\) return/, "an open medicine form"],
  [/if \(showNewTreatment \|\| renamingTreatment\) return/, "an open treatment form"],
  [/if \(!await latestSaveNotes\.current\(\)\)/, "notes needing a decision"],
]) {
  assert.match(managerSource, guard, `${note} must block navigation instead of being discarded`);
}

/* The acknowledgement is what closes the originating window, so it must not be
 * sent before the dose has actually reached the screen — otherwise a target
 * that turned out not to be there closes the popup with nothing to show for it
 * and no way to say so. */
assert.doesNotMatch(managerSource, /setScrollTarget\(\{[^}]*\}\);\s*await respond\(true/, "the handler must not acknowledge a dose target it has not yet displayed");
assert.match(managerSource, /void respondToNavigation\(scrollTarget\.requestId, true, null\);/, "a displayed dose must be acknowledged by the effect that displayed it");
assert.match(managerSource, /void respondToNavigation\(scrollTarget\.requestId, false, reason\);/, "a dose that never appeared must be reported, not acknowledged");

for (const [view, label] of [[panelSource, "the Medicine popup"], [await readFile(new URL("../src/TodayPopupView.tsx", import.meta.url), "utf8"), "Today"]]) {
  assert.match(view, /if \(result\.applied\) await close\(\);/, `${label} must close only after a successful handoff`);
  assert.match(view, /else set(ActionError|Error)\(result\.reason/, `${label} must report why navigation was refused`);
}

console.log("medicine manager window checks passed");
