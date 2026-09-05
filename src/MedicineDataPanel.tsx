import { invoke } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useState } from "react";
import { openMedicineManagerWindow } from "./medicine-manager-window";
import {
  MAX_MEDICINE_GRACE_MINUTES,
  MIN_MEDICINE_GRACE_MINUTES,
  normalizeMedicineGraceMinutes,
  type MedicineDeleteImpact,
  type MedicineSnapshot,
} from "./medicine-model";
import {
  MEDICINE_PREFERENCES_CHANGED_EVENT,
  readMedicinePreferences,
  writeMedicinePreferences,
} from "./medicine-preferences";

/** Separate from `<WorkspaceDataPanel>` on purpose: the two own different
 * snapshots and subscribe to different change events. */
export function MedicineDataPanel() {
  const [snapshot, setSnapshot] = useState<MedicineSnapshot | null>(null);
  const [impact, setImpact] = useState<MedicineDeleteImpact | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preferences, setPreferences] = useState(readMedicinePreferences);
  const [graceDraft, setGraceDraft] = useState(() => `${readMedicinePreferences().graceMinutes}`);

  const refresh = useCallback(async () => {
    try { setSnapshot(await invoke<MedicineSnapshot>("get_medicine_snapshot")); setError(null); }
    catch (cause) { setError(String(cause)); }
  }, []);

  useEffect(() => {
    void refresh();
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void listen("medicine-changed", () => void refresh()).then((next) => { if (disposed) next(); else unlisten = next; });
    return () => { disposed = true; unlisten?.(); };
  }, [refresh]);

  const applyPreferences = (update: Parameters<typeof writeMedicinePreferences>[0]) => {
    const next = writeMedicinePreferences(update);
    setPreferences(next);
    setGraceDraft(`${next.graceMinutes}`);
    void emit(MEDICINE_PREFERENCES_CHANGED_EVENT, next);
  };

  const commitGrace = () => {
    // Clamp on commit rather than per keystroke, so typing "1" on the way to
    // "120" is not rewritten to the 15-minute floor under the cursor.
    applyPreferences({ graceMinutes: normalizeMedicineGraceMinutes(Number(graceDraft)) });
  };

  const prepareDeleteAll = async () => {
    try { setImpact(await invoke<MedicineDeleteImpact>("get_medicine_delete_impact", { entity: "medicine-store", id: null })); setError(null); }
    catch (cause) { setError(String(cause)); }
  };

  const deleteAll = async () => {
    if (!impact) return;
    setPending(true);
    try { setSnapshot(await invoke<MedicineSnapshot>("delete_all_medicine_data", { expectedRevision: impact.medicineRevision })); setImpact(null); setError(null); }
    catch (cause) { await prepareDeleteAll(); setError(String(cause)); }
    finally { setPending(false); }
  };

  const treatments = snapshot?.treatments.length ?? 0;
  const medicines = snapshot?.medicines.length ?? 0;
  const doses = snapshot?.doses.length ?? 0;
  const recorded = snapshot?.doses.filter((dose) => dose.takenAt || dose.skippedAt).length ?? 0;
  const impactParts = impact
    ? [[impact.treatments, "treatments"], [impact.medicines, "medicines"], [impact.doses, "dose records"]]
      .filter(([count]) => (count as number) > 0)
      .map(([count, label]) => `${count} ${label}`)
    : [];

  return <section aria-labelledby="medicine-data-heading" className="workspace-data-panel">
    <h2 id="medicine-data-heading">Medicine storage and data</h2>
    <p>{treatments} treatment{treatments === 1 ? "" : "s"}, {medicines} medicine{medicines === 1 ? "" : "s"}, and {doses} planned dose{doses === 1 ? "" : "s"} ({recorded} recorded).</p>
    <div className="workspace-data-card">
      <p>
        Treatments, medicines, and dose records are stored in their own local
        versioned file with one previous valid backup. They are kept out of the
        workspace export, so exporting Projects and to-dos never includes
        medicine data. No cloud sync is used.
      </p>
      <p className="workspace-plaintext-disclosure">
        <strong>This file is unencrypted.</strong> Treatment names, medicine
        names, strengths, schedules, and your full dose history are saved as
        plain text on this PC. Attention Hub adds no password or encryption of
        its own, so the file is protected only by your Windows user account and
        whatever disk encryption this PC already uses. Anyone who can read your
        Windows profile can read it.
      </p>
      {snapshot?.storagePath && <p>Data file: <code>{snapshot.storagePath}</code></p>}
      {snapshot?.recoveredFromBackup && <p className="workspace-recovery" role="status">The previous valid backup is currently being shown.</p>}
      <label className="workspace-notification-setting">
        <input
          checked={preferences.doseNotificationsEnabled}
          onChange={(event) => applyPreferences({ doseNotificationsEnabled: event.target.checked })}
          type="checkbox"
        /> Show Windows notifications when a scheduled dose is due
      </label>
      <p className="workspace-setting-hint">
        Notifications name no medicine, so nothing identifying appears on your
        lock screen. A dose is announced once, and only while its grace window
        is still open — a dose whose window passed while Attention Hub was
        closed is left alone and shown as missed.
      </p>
      <label className="workspace-notification-setting">
        Grace window
        <input
          aria-describedby="medicine-grace-hint"
          max={MAX_MEDICINE_GRACE_MINUTES}
          min={MIN_MEDICINE_GRACE_MINUTES}
          onBlur={commitGrace}
          onChange={(event) => setGraceDraft(event.target.value)}
          onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); commitGrace(); } }}
          step={5}
          type="number"
          value={graceDraft}
        /> minutes
      </label>
      <p className="workspace-setting-hint" id="medicine-grace-hint">
        How long a dose stays due after its time before it counts as missed,
        from {MIN_MEDICINE_GRACE_MINUTES} to {MAX_MEDICINE_GRACE_MINUTES} minutes.
        The same window decides when a reminder can still be raised.
      </p>
      <div className="actions">
        <button onClick={() => void openMedicineManagerWindow()} type="button">Open Medicine</button>
        {!impact
          ? <button disabled={pending || !snapshot || treatments + medicines + doses === 0} onClick={() => void prepareDeleteAll()} type="button">Delete all medicine data…</button>
          : <span aria-label="Confirm deletion" className="workspace-delete-confirm" role="group">
            <span>{impactParts.join(", ") || "No medicine data"} will be removed.</span>
            <button autoFocus disabled={pending} onClick={() => void deleteAll()} type="button">Permanently delete all</button>
            <button onClick={() => setImpact(null)} type="button">Cancel</button>
          </span>}
      </div>
    </div>
    {error && <p className="error" role="alert">Medicine: {error}</p>}
  </section>;
}
