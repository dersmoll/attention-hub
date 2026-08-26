import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const tag = process.argv[2];
assert.match(tag ?? "", /^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/, "Pass a v-prefixed SemVer tag.");
const expectedVersion = tag.slice(1);

const packageJson = JSON.parse(await readFile("package.json", "utf8"));
const tauriConfig = JSON.parse(await readFile("src-tauri/tauri.conf.json", "utf8"));
const cargoToml = await readFile("src-tauri/Cargo.toml", "utf8");
const cargoLock = await readFile("src-tauri/Cargo.lock", "utf8");

const cargoVersion = cargoToml.match(
  /^\[package\][\s\S]*?^version\s*=\s*"([^"]+)"/m,
)?.[1];
const lockedVersion = cargoLock.match(
  /^name = "attention-hub"\r?\nversion = "([^"]+)"/m,
)?.[1];

const versions = {
  "package.json": packageJson.version,
  "src-tauri/Cargo.toml": cargoVersion,
  "src-tauri/Cargo.lock": lockedVersion,
  "src-tauri/tauri.conf.json": tauriConfig.version,
};

for (const [file, version] of Object.entries(versions)) {
  assert.equal(version, expectedVersion, `${file} version must match ${tag}.`);
}

console.log(`release versions match ${tag}`);
