import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const sourceUrl = new URL("../src/zoom-meeting-model.ts", import.meta.url);
const sourceText = await readFile(sourceUrl, "utf8");
const compiled = ts.transpileModule(sourceText, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  fileName: sourceUrl.pathname,
  reportDiagnostics: true,
});
assert.equal(compiled.diagnostics?.length ?? 0, 0);
const model = await import(
  `data:text/javascript;base64,${Buffer.from(compiled.outputText).toString("base64")}`
);

const live = model.nextZoomMeetingPresence(model.INITIAL_ZOOM_MEETING_PRESENCE, {
  state: "live",
  minimized: false,
  candidateCount: 1,
});
assert.deepEqual(live, { visible: true, minimized: false, misses: 0 });

const firstMiss = model.nextZoomMeetingPresence(live, {
  state: "inactive",
  minimized: false,
  candidateCount: 0,
});
assert.deepEqual(firstMiss, { visible: true, minimized: false, misses: 1 });
assert.deepEqual(
  model.nextZoomMeetingPresence(firstMiss, {
    state: "uncertain",
    minimized: false,
    candidateCount: 0,
  }),
  model.INITIAL_ZOOM_MEETING_PRESENCE,
);

const minimized = model.nextZoomMeetingPresence(firstMiss, {
  state: "live",
  minimized: true,
  candidateCount: 1,
});
assert.deepEqual(minimized, { visible: true, minimized: true, misses: 0 });

console.log("zoom meeting model tests passed");
