import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const source = await readFile(new URL("../src/medicine-close-guard.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
const { createMedicineCloseGuard, MEDICINE_QUIT_SAVE_REQUEST_EVENT, MEDICINE_QUIT_SAVE_RESULT_EVENT } = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputText).toString("base64")}`);
const deferred = () => { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; };

// Native X, Alt+F4 and the custom close may arrive while the same save is pending.
const saving = deferred();
let saves = 0, closes = 0;
const busy = [];
const guard = createMedicineCloseGuard(() => { saves++; return saving.promise; }, async () => {
  assert.equal(guard.isApproved(), true, "destruction must be approved only after save");
  closes++;
}, () => assert.fail("unexpected error"), (value) => busy.push(value));
const first = guard.request();
await guard.request();
assert.equal(saves, 1);
assert.equal(closes, 0, "never close ahead of persistence");
saving.resolve(true);
await first;
await guard.request();
assert.equal(closes, 1);
assert.deepEqual(busy, [true], "notes stay disabled until successful window teardown");

// Conflict, changed text during save, or an active autosave keeps the draft visible.
let canClose = false;
const retry = createMedicineCloseGuard(async () => canClose, async () => { closes++; }, () => assert.fail("unexpected error"), () => {});
await retry.request();
assert.equal(retry.isApproved(), false);
assert.equal(closes, 1);
canClose = true;
await retry.request();
assert.equal(closes, 2);

// A native close failure must permit another request, not leave approval latched.
let attempts = 0, failures = 0;
const nativeFailure = createMedicineCloseGuard(async () => true, async () => { if (++attempts === 1) throw new Error("close failed"); }, () => { failures++; }, () => {});
await nativeFailure.request();
assert.equal(nativeFailure.isApproved(), false);
await nativeFailure.request();
assert.equal(attempts, 2);
assert.equal(failures, 1);

const failedSave = createMedicineCloseGuard(async () => { throw new Error("write failed"); }, async () => assert.fail("must retain draft"), () => { failures++; }, () => {});
await failedSave.request();
assert.equal(failedSave.isApproved(), false);
assert.equal(failures, 2);
console.log("medicine close guard checks passed");

assert.equal(MEDICINE_QUIT_SAVE_REQUEST_EVENT, "medicine-quit-save-request");
assert.equal(MEDICINE_QUIT_SAVE_RESULT_EVENT, "medicine-quit-save-result");
const widgetSource = await readFile(new URL("../src/WidgetView.tsx", import.meta.url), "utf8");
const managerSource = await readFile(new URL("../src/MedicineManagerView.tsx", import.meta.url), "utf8");
assert.match(widgetSource, /onClick=\{\(\) => void requestApplicationQuit\(\)\}/, "the main close control must use the save-before-quit coordinator");
assert.match(widgetSource, /emitTo\(MEDICINE_MANAGER_WINDOW_LABEL, MEDICINE_QUIT_SAVE_REQUEST_EVENT/, "quit must request a Medicine save");
assert.match(managerSource, /latestSaveNotes\.current\(\)/, "Medicine must finish its current note save before answering quit");
assert.match(managerSource, /emitTo\("main", MEDICINE_QUIT_SAVE_RESULT_EVENT/, "Medicine must answer the widget's quit request");

// Tauri's guarded native close requires destroy, scoped only to Medicine.
const capability = JSON.parse(await readFile(new URL("../src-tauri/capabilities/medicine-close.json", import.meta.url), "utf8"));
assert.deepEqual(capability.windows, ["medicine"]);
assert.ok(capability.permissions.includes("core:window:allow-destroy"));
