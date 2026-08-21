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
assert.equal(
  converter.formatZonedConversion(
    new Date("2026-08-13T13:30:00Z"),
    new Date("2026-08-13T12:00:00Z"),
    "America/New_York",
  ),
  "09:30 today",
);
assert.equal(
  converter.formatZonedConversion(
    new Date("2026-08-14T00:30:00Z"),
    new Date("2026-08-13T12:00:00Z"),
    "Europe/Kyiv",
  ),
  "03:30 tomorrow",
);

const optionsUrl = new URL("../src/time-zone-options.ts", import.meta.url);
const optionsText = await readFile(optionsUrl, "utf8");
const compiledOptions = ts.transpileModule(optionsText, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  fileName: optionsUrl.pathname,
  reportDiagnostics: true,
});
assert.equal(compiledOptions.diagnostics?.length ?? 0, 0);
const options = await import(
  `data:text/javascript;base64,${Buffer.from(compiledOptions.outputText).toString("base64")}`
);
const supportedZones = options.getSupportedTimeZones(["Europe/Kyiv"]);
assert.equal(supportedZones.includes("Europe/Kyiv"), true);
assert.equal(supportedZones.includes("Europe/Kiev"), false);
assert.equal(supportedZones.includes("UTC"), true);
assert.equal(options.canonicalTimeZone("Europe/Kiev"), "Europe/Kyiv");
assert.equal(
  options.timeZoneOffsetLabel("UTC", new Date("2026-08-13T12:00:00Z")),
  "UTC+00:00",
);
assert.equal(
  options.timeZoneOffsetLabel(
    "America/New_York",
    new Date("2026-01-13T12:00:00Z"),
  ),
  "UTC-05:00",
);
assert.equal(
  options.advancedTimeZoneLabel(
    "Europe/Kyiv",
    new Date("2026-08-13T12:00:00Z"),
  ),
  "Europe/Kyiv — UTC+03:00",
);
assert.equal(options.shortTimeZoneLabel("America/New_York"), "New York");
assert.equal(
  options.timeZoneOptionLabel(
    "America/New_York",
    new Date("2026-01-13T12:00:00Z"),
  ),
  "(UTC-05:00) New York, Miami, Toronto — America/New_York",
);
assert.equal(
  options.timeZoneOptionLabel(
    "Europe/Kiev",
    new Date("2026-08-13T12:00:00Z"),
  ),
  "(UTC+03:00) Kyiv, Helsinki, Riga, Sofia, Tallinn, Vilnius — Europe/Kyiv",
);
const commonZones = options.getCommonTimeZones(
  ["Europe/Kyiv", "America/New_York"],
  new Date("2026-08-13T12:00:00Z"),
);
assert.equal(commonZones[0], "Europe/Kyiv");
assert.equal(commonZones[1], "America/New_York");
assert.equal(commonZones.length < supportedZones.length, true);
assert.deepEqual(
  options.searchTimeZones("tokyo", [], new Date("2026-08-13T12:00:00Z")),
  ["Asia/Tokyo"],
);
assert.deepEqual(
  options.searchTimeZones("miami", [], new Date("2026-08-13T12:00:00Z")),
  ["America/New_York"],
);

console.log("time-zone conversion tests passed");
