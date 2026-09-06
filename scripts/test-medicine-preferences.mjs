import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const here = dirname(fileURLToPath(import.meta.url));

// medicine-preferences.ts imports the grace normalizer from medicine-model.ts,
// so both are transpiled and the import is rewritten to the inlined module.
async function transpile(relativePath) {
  const sourceUrl = new URL(`../src/${relativePath}`, import.meta.url);
  const source = await readFile(sourceUrl, "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    fileName: sourceUrl.pathname,
    reportDiagnostics: true,
  });
  assert.equal(
    compiled.diagnostics?.length ?? 0,
    0,
    `${relativePath} must transpile without diagnostics`,
  );
  return compiled.outputText;
}

const modelUrl = `data:text/javascript;base64,${Buffer.from(await transpile("medicine-model.ts")).toString("base64")}`;
const preferencesSource = (await transpile("medicine-preferences.ts"))
  .replace('from "./medicine-model"', `from ${JSON.stringify(modelUrl)}`);

const storedValues = new Map();
globalThis.localStorage = {
  getItem: (key) => storedValues.get(key) ?? null,
  setItem: (key, value) => storedValues.set(key, value),
};

const preferences = await import(
  `data:text/javascript;base64,${Buffer.from(preferencesSource).toString("base64")}`
);

// Fresh installs must not opt into notifications.
assert.deepEqual(preferences.readMedicinePreferences(), {
  doseNotificationsEnabled: false,
  graceMinutes: 60,
});

// Unreadable storage falls back to the defaults rather than throwing.
storedValues.set("attention-hub.medicine-preferences.v1", "not-json");
assert.deepEqual(preferences.readMedicinePreferences(), {
  doseNotificationsEnabled: false,
  graceMinutes: 60,
});

// A partial record written by an older build keeps its known field.
storedValues.set(
  "attention-hub.medicine-preferences.v1",
  JSON.stringify({ doseNotificationsEnabled: true }),
);
assert.deepEqual(preferences.readMedicinePreferences(), {
  doseNotificationsEnabled: true,
  graceMinutes: 60,
});

// The grace window is clamped on read and on write, at both bounds.
for (const [input, expected] of [
  [0, 15],
  [14, 15],
  [15, 15],
  [60, 60],
  [240, 240],
  [241, 240],
  [10_000, 240],
  [42.4, 42],
  [42.6, 43],
]) {
  assert.equal(
    preferences.writeMedicinePreferences({ graceMinutes: input }).graceMinutes,
    expected,
    `grace ${input} should clamp to ${expected}`,
  );
  assert.equal(preferences.readMedicinePreferences().graceMinutes, expected);
}

// Non-numeric values fall back to the default rather than to a bound.
for (const input of [Number.NaN, Number.POSITIVE_INFINITY, "60", null, undefined, {}]) {
  assert.equal(
    preferences.writeMedicinePreferences({ graceMinutes: input }).graceMinutes,
    60,
    `grace ${String(input)} should fall back to the default`,
  );
}

// Enabling notifications must not disturb the stored grace window.
preferences.writeMedicinePreferences({ graceMinutes: 90 });
assert.deepEqual(
  preferences.writeMedicinePreferences({ doseNotificationsEnabled: true }),
  { doseNotificationsEnabled: true, graceMinutes: 90 },
);

// A non-boolean enabled flag is coerced rather than persisted as-is.
assert.equal(
  preferences.writeMedicinePreferences({ doseNotificationsEnabled: "yes" })
    .doseNotificationsEnabled,
  false,
);

// The Rust clamp must agree with the TypeScript one, or the widget could show a
// dose as due after the notifier had already written it off.
const rust = await readFile(resolve(here, "../src-tauri/src/medicine.rs"), "utf8");
assert.match(rust, /pub const MIN_GRACE_MINUTES: i64 = 15;/);
assert.match(rust, /pub const MAX_GRACE_MINUTES: i64 = 240;/);

const model = await import(modelUrl);
assert.equal(model.MIN_MEDICINE_GRACE_MINUTES, 15);
assert.equal(model.MAX_MEDICINE_GRACE_MINUTES, 240);

console.log("medicine preference checks passed");
