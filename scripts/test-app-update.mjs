import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const sourceUrl = new URL("../src/app-update-model.ts", import.meta.url);
const sourceText = await readFile(sourceUrl, "utf8");
const compiled = ts.transpileModule(sourceText, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  fileName: sourceUrl.pathname,
  reportDiagnostics: true,
});
assert.equal(compiled.diagnostics?.length ?? 0, 0);
const updateModel = await import(
  `data:text/javascript;base64,${Buffer.from(compiled.outputText).toString("base64")}`
);

const dismissedAt = Date.UTC(2026, 7, 26, 12);
const serialized = updateModel.serializeUpdatePromptDismissal(
  "0.7.0-beta.1",
  dismissedAt,
);

assert.deepEqual(updateModel.parseUpdatePromptRecord(serialized), {
  version: "0.7.0-beta.1",
  dismissedAt,
});
assert.equal(updateModel.parseUpdatePromptRecord("not-json"), null);
assert.equal(
  updateModel.shouldPromptForUpdate(
    "0.7.0-beta.1",
    serialized,
    dismissedAt + updateModel.APP_UPDATE_PROMPT_SNOOZE_MS - 1,
  ),
  false,
);
assert.equal(
  updateModel.shouldPromptForUpdate(
    "0.7.0-beta.1",
    serialized,
    dismissedAt + updateModel.APP_UPDATE_PROMPT_SNOOZE_MS,
  ),
  true,
);
assert.equal(
  updateModel.shouldPromptForUpdate("0.7.0-beta.2", serialized, dismissedAt),
  true,
);
assert.equal(updateModel.updateProgressPercent(25, 100), 25);
assert.equal(updateModel.updateProgressPercent(150, 100), 100);
assert.equal(updateModel.updateProgressPercent(25, null), null);

console.log("app update model tests passed");
