import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const sourceUrl = new URL("../src/focus-timer-model.ts", import.meta.url);
const source = await readFile(sourceUrl, "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  fileName: sourceUrl.pathname,
  reportDiagnostics: true,
});
assert.equal(compiled.diagnostics?.length ?? 0, 0);
const timer = await import(
  `data:text/javascript;base64,${Buffer.from(compiled.outputText).toString("base64")}`
);

const started = timer.startFocusTimer(timer.resetFocusTimer(), 1_000);
assert.deepEqual(started, { elapsedMs: 0, startedAtUnixMs: 1_000 });
assert.equal(timer.focusTimerElapsedMs(started, 4_750), 3_750);
assert.equal(timer.formatFocusTimer(timer.focusTimerElapsedMs(started, 4_750)), "00:00:03");

const paused = timer.pauseFocusTimer(started, 62_250);
assert.deepEqual(paused, { elapsedMs: 61_250, startedAtUnixMs: null });
assert.equal(timer.formatFocusTimer(paused.elapsedMs), "00:01:01");
assert.deepEqual(timer.startFocusTimer(paused, 80_000), {
  elapsedMs: 61_250,
  startedAtUnixMs: 80_000,
});
assert.deepEqual(timer.resetFocusTimer(), { elapsedMs: 0, startedAtUnixMs: null });

const values = new Map();
const storage = {
  getItem: (key) => values.get(key) ?? null,
  setItem: (key, value) => values.set(key, value),
};
timer.writeFocusTimerState(started, storage);
assert.deepEqual(timer.readFocusTimerState(storage, 5_000), started);
values.set(timer.FOCUS_TIMER_STORAGE_KEY, "not json");
assert.deepEqual(timer.readFocusTimerState(storage), timer.EMPTY_FOCUS_TIMER);
assert.deepEqual(
  timer.normalizeFocusTimerState({ elapsedMs: -40, startedAtUnixMs: 9_000 }, 5_000),
  { elapsedMs: 0, startedAtUnixMs: 5_000 },
);
assert.equal(timer.formatFocusTimer(100 * 60 * 60 * 1_000 + 2_000), "100:00:02");

console.log("focus timer model tests passed");
