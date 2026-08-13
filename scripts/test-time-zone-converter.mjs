import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const sourceUrl = new URL("../src/time-zone-converter.ts", import.meta.url);
const sourceText = await readFile(sourceUrl, "utf8");
const compiled = ts.transpileModule(sourceText, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  fileName: sourceUrl.pathname,
  reportDiagnostics: true,
});
assert.equal(compiled.diagnostics?.length ?? 0, 0);
const converter = await import(
  `data:text/javascript;base64,${Buffer.from(compiled.outputText).toString("base64")}`
);

assert.equal(
  converter
    .convertZonedTimeToInstant(
      "09:30",
      new Date("2026-08-13T12:00:00Z"),
      "America/New_York",
    )
    ?.toISOString(),
  "2026-08-13T13:30:00.000Z",
);
assert.equal(
  converter
    .convertZonedTimeToInstant(
      "09:30",
      new Date("2026-01-13T12:00:00Z"),
      "America/New_York",
    )
    ?.toISOString(),
  "2026-01-13T14:30:00.000Z",
);
assert.equal(
  converter.convertZonedTimeToInstant(
    "02:30",
    new Date("2026-03-08T12:00:00Z"),
    "America/New_York",
  ),
  null,
);
assert.equal(
  converter.convertZonedTimeToInstant("25:00", new Date(), "UTC"),
  null,
);

console.log("time-zone conversion tests passed");
