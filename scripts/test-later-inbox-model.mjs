import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const sourceUrl = new URL("../src/later-inbox-model.ts", import.meta.url);
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

const base = {
  context: null,
  url: null,
  updatedAt: "2026-08-14T08:00:00Z",
  completedAt: null,
};
const items = [
  {
    ...base,
    id: "newer",
    title: "Newer",
    createdAt: "2026-08-14T10:00:00Z",
    followUpAt: null,
  },
  {
    ...base,
    id: "due-later",
    title: "Due later",
    createdAt: "2026-08-14T09:00:00Z",
    followUpAt: "2026-08-14T11:00:00Z",
  },
  {
    ...base,
    id: "due-first",
    title: "Due first",
    createdAt: "2026-08-14T08:00:00Z",
    followUpAt: "2026-08-14T10:00:00Z",
  },
  {
    ...base,
    id: "completed",
    title: "Completed",
    createdAt: "2026-08-14T07:00:00Z",
    followUpAt: null,
    completedAt: "2026-08-14T11:30:00Z",
  },
];

const now = new Date("2026-08-14T12:00:00Z");
assert.equal(model.isLaterInboxItemDue(items[2], now), true);
assert.equal(model.isLaterInboxItemDue(items[3], now), false);
assert.deepEqual(
  model.sortOpenLaterInboxItems(items, now).map(({ id }) => id),
  ["due-first", "due-later", "newer"],
);
assert.deepEqual(
  model.sortCompletedLaterInboxItems(items).map(({ id }) => id),
  ["completed"],
);

const localValue = "2026-08-14T15:30";
const isoValue = model.fromLocalDateTimeInput(localValue);
assert.equal(typeof isoValue, "string");
assert.equal(model.toLocalDateTimeInput(isoValue), localValue);
assert.equal(model.fromLocalDateTimeInput(""), null);

console.log("later inbox model tests passed");
