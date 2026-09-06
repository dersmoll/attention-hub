import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [dataPanel, manager, native] = await Promise.all([
  readFile(new URL("../src/MedicineDataPanel.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/MedicineManagerView.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src-tauri/src/medicine.rs", import.meta.url), "utf8"),
]);

assert.match(dataPanel, /export_medicine_data/, "Medicine export must use a dedicated native command");
assert.match(dataPanel, /preview_medicine_import/, "import must be previewed before replacement");
assert.match(dataPanel, /Replace the current Medicine data\?/, "import must state its replacement semantics");
assert.match(dataPanel, /unencrypted Medicine data/, "export must disclose plain-text health data");
assert.match(native, /const TRANSFER_FORMAT: &str = "attention-hub-medicine"/, "portable files need a Medicine-specific format marker");
assert.match(native, /local_store::write_portable/, "exports must use the portable writer");
assert.match(native, /expected_digest/, "imports must reject a file that changed after preview");
assert.match(native, /isolate_imported_note_revisions/, "imports must reject pre-import note autosaves");

assert.match(manager, /const placeholderDay = medicineLocalDay\(\)/, "new treatments need only an internal placeholder range");
assert.match(manager, /Add the first medicine to set this treatment’s course dates\./, "the form must explain where course dates come from");
assert.doesNotMatch(manager, /setTreatmentStart|setTreatmentEnd|treatmentStart|treatmentEnd/, "the treatment form must not collect its own dates");

console.log("medicine transfer checks passed");
