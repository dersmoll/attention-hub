import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const sourceUrl = new URL("../src/attention-model.ts", import.meta.url);
const sourceText = await readFile(sourceUrl, "utf8");
const compiled = ts.transpileModule(sourceText, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
  fileName: sourceUrl.pathname,
  reportDiagnostics: true,
});

assert.equal(
  compiled.diagnostics?.length ?? 0,
  0,
  "attention model must transpile without diagnostics",
);

const moduleUrl = `data:text/javascript;base64,${Buffer.from(compiled.outputText).toString("base64")}`;
const model = await import(moduleUrl);
const capturedAt = new Date().toISOString();

function source(sourceKey, needsAttention, state = "observed") {
  return {
    sourceKey,
    displayName: sourceKey,
    state,
    signals:
      state === "observed"
        ? [
            {
              sourceKey,
              displayName: sourceKey,
              kind: "test",
              count: needsAttention ? 1 : 0,
              needsAttention,
              origin: "test",
              rawLabel: null,
              confidence: "high",
              inferred: false,
              meaning: "test",
              diagnostics: [],
            },
          ]
        : [],
    diagnostics: [],
  };
}

const snapshot = {
  capturedAt,
  sources: [
    source("telegram", true),
    source("outlook", false),
    source("teams", false),
  ],
  signals: [],
  diagnostics: [],
};

const selectedClear = model.buildAttentionPanelModel(
  snapshot,
  null,
  0,
  Date.now(),
  ["outlook", "teams"],
);
assert.equal(selectedClear.kind, "allClear");
assert.equal(selectedClear.observedCount, 2);
assert.match(selectedClear.detail, /All 2 selected sources/);
assert.deepEqual(
  selectedClear.sources.map(({ key }) => key),
  ["outlook", "teams"],
);

const selectedAttention = model.buildAttentionPanelModel(
  snapshot,
  null,
  0,
  Date.now(),
  ["telegram", "outlook"],
);
assert.equal(selectedAttention.kind, "needsAttention");
assert.match(selectedAttention.detail, /2\/2 selected sources observed/);

const paused = model.buildAttentionPanelModel(
  { ...snapshot, sources: [] },
  null,
  0,
  Date.now(),
  [],
);
assert.equal(paused.kind, "nothingObserved");
assert.equal(paused.headline, "Semantic monitoring paused");
assert.equal(paused.observedCount, 0);

const visualOnly = model.buildAttentionPanelModel(
  { ...snapshot, sources: [source("slack", false, "notExposed")] },
  null,
  0,
  Date.now(),
  ["slack"],
);
assert.equal(visualOnly.kind, "nothingObserved");
assert.equal(visualOnly.headline, "Semantic monitoring paused");
assert.equal(visualOnly.sources.length, 1);

const missingSelected = model.buildAttentionPanelModel(
  { ...snapshot, sources: [source("teams", false)] },
  null,
  0,
  Date.now(),
  ["teams", "outlook"],
);
assert.equal(missingSelected.kind, "noAttentionDetected");
assert.match(missingSelected.detail, /Unavailable sources prevent an all-clear/);

console.log("attention coverage tests passed");
