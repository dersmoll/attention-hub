import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";
import { getAllWindows } from "@tauri-apps/api/window";
import { open, save } from "@tauri-apps/plugin-dialog";
import { WorkspaceDataPanel } from "./WorkspaceDataPanel";
import { MedicineDataPanel } from "./MedicineDataPanel";
import { applyBackupPreferences, BACKUP_RESTORED_EVENT, captureBackupPreferences, exportBackupPreferences, normalizeBackupPreferences, replaceBackupPreferences, type BackupPreferences } from "./backup-preferences";
import { WIDGET_PREFERENCES_CHANGED_EVENT, readWidgetPreferences } from "./widget-preferences";
import { MEDICINE_PREFERENCES_CHANGED_EVENT, readMedicinePreferences } from "./medicine-preferences";
import { TODO_PREFERENCES_CHANGED_EVENT, readTodoPreferences } from "./todo-preferences";
import { CALENDAR_SKIPS_CHANGED_EVENT } from "./calendar-skip-store";
import { WORKSPACE_CHANGED_EVENT } from "./workspace-model";
import { clearWorkCalendarDisplayCache } from "./work-calendar-display-cache";

type Preview = { digest: string; currentFingerprint: string; exportedAt: string; counts: { projects: number; lists: number; todos: number; treatments: number; medicines: number; doses: number }; hasCalendarConnection: boolean; preferences: BackupPreferences; unmatchedCalendarBindings?: number };
type Selection = { settings: boolean; workspace: boolean; medicine: boolean; stickyNote: boolean; calendarConnection: boolean };
const selectionLabels: Record<keyof Selection, string> = { settings: "Settings and calendar choices", workspace: "Projects, lists, notes, links and to-dos", medicine: "Medicine, treatments and dose history", stickyNote: "Sticky note", calendarConnection: "Saved calendar connection" };

export async function publishBackupRestored() {
  clearWorkCalendarDisplayCache();
  await Promise.all([
    emit(WIDGET_PREFERENCES_CHANGED_EVENT, readWidgetPreferences()),
    emit(MEDICINE_PREFERENCES_CHANGED_EVENT, readMedicinePreferences()),
    emit(TODO_PREFERENCES_CHANGED_EVENT, readTodoPreferences()),
    ...[WORKSPACE_CHANGED_EVENT, "medicine-changed", "sticky-note-changed", CALENDAR_SKIPS_CHANGED_EVENT, "work-calendar-changed", BACKUP_RESTORED_EVENT].map(name => emit(name)),
  ]);
}

export function BackupRestorePanel() {
  const [busy, setBusy] = useState(false);
  const [includeConnection, setIncludeConnection] = useState(false);
  const [preview, setPreview] = useState<{ path: string; value: Preview } | null>(null);
  const [selection, setSelection] = useState<Selection>({ settings: true, workspace: true, medicine: true, stickyNote: true, calendarConnection: false });
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recoveryPending, setRecoveryPending] = useState(false);
  const [recoveryPath, setRecoveryPath] = useState<string | null>(null);

  const exportEverything = async () => {
    setBusy(true); setError(null);
    try {
      const destination = await save({ defaultPath: `attention-hub-backup-${new Date().toISOString().slice(0, 10)}.json`, filters: [{ name: "Attention Hub backup", extensions: ["json"] }] });
      if (!destination) return;
      const path = await invoke<string>("export_app_backup", { destinationPath: destination, preferences: exportBackupPreferences(captureBackupPreferences()), includeCalendarConnection: includeConnection });
      setStatus(`Everything exported to ${path}`);
    } catch (cause) { setError(String(cause)); }
    finally { setBusy(false); }
  };

  const chooseBackup = async () => {
    setBusy(true); setError(null); setStatus(null); setPreview(null);
    try {
      const path = await open({ multiple: false, directory: false, filters: [{ name: "Attention Hub backup", extensions: ["json"] }] });
      if (typeof path !== "string") return;
      const value = await invoke<Preview>("preview_app_backup", { sourcePath: path, currentPreferences: captureBackupPreferences() });
      normalizeBackupPreferences(value.preferences);
      setSelection({ settings: true, workspace: true, medicine: true, stickyNote: true, calendarConnection: false });
      setPreview({ path, value });
    } catch (cause) { setError(String(cause)); }
    finally { setBusy(false); }
  };

  const restore = async () => {
    if (!preview) return;
    setBusy(true); setError(null); setStatus(null);
    let transactionId: string | undefined;
    let original: BackupPreferences | undefined;
    let holdRecovery = false;
    let commitRequested = false;
    try {
      document.getElementById("root")!.inert = true;
      await emit("backup-restore-busy", true);
      original = captureBackupPreferences();
      const windows = await getAllWindows();
      if (windows.some(window => window.label !== "main" && window.label !== "advanced")) throw new Error("Close the popups, Project Hub, Medicine and note windows after saving any drafts, then retry restore.");
      const result = await invoke<{ transactionId: string; preferences: BackupPreferences; recoveryPath?: string }>("begin_app_backup_restore", { sourcePath: preview.path, expectedDigest: preview.value.digest, expectedCurrentFingerprint: preview.value.currentFingerprint, currentPreferences: original, recoveryPreferences: exportBackupPreferences(original), selection });
      transactionId = result.transactionId;
      setRecoveryPath(result.recoveryPath ?? null);
      if (selection.settings) applyBackupPreferences(result.preferences);
      commitRequested = true;
      await invoke("finish_app_backup_restore", { transactionId, commit: true });
      await invoke("ack_app_backup_restore", { transactionId }).catch(() => undefined);
      transactionId = undefined;
      setPreview(null);
      setStatus("Selected data restored. A recovery copy of your previous data was saved locally. Calendar events will refresh from the saved connection.");
      try { await publishBackupRestored(); }
      catch { setStatus("Data restored. Restart Attention Hub to refresh every open view."); }
    } catch (cause) {
      if (transactionId) {
        try {
          if (commitRequested) {
            const decision = await invoke<string>("get_app_backup_restore_status", { transactionId });
            if (decision === "committed") {
              await invoke("ack_app_backup_restore", { transactionId }).catch(() => undefined);
              setPreview(null);
              setStatus("Selected data restored. A recovery copy of your previous data was saved locally.");
              await publishBackupRestored();
              return;
            }
            if (decision !== "pending") throw new Error("Restore outcome needs recovery.");
          }
          replaceBackupPreferences(original!);
          await invoke("finish_app_backup_restore", { transactionId, commit: false });
        } catch {
          holdRecovery = true;
          setRecoveryPending(true);
          setPreview(null);
          setError("Restore recovery is pending. Restart Attention Hub to recover your previous settings and data before continuing.");
          return;
        }
      }
      setPreview(null);
      setError(String(cause));
    } finally {
      document.getElementById("root")!.inert = holdRecovery;
      if (!holdRecovery) await emit("backup-restore-busy", false).catch(() => undefined);
      setBusy(false);
    }
  };

  return <div className="backup-restore">
    <section aria-labelledby="backup-heading" className="workspace-data-card">
      <h2 id="backup-heading">Full backup</h2>
      <p>Keep settings, projects, personal lists, notes, links, to-dos, Medicine, dose history, your sticky note and calendar choices in one versioned file.</p>
      <p><strong>Backups are unencrypted.</strong> They include private notes and health information. Save them somewhere you trust.</p>
      <label className="backup-restore__choice"><input type="checkbox" checked={includeConnection} disabled={busy || recoveryPending} onChange={event => setIncludeConnection(event.target.checked)} /> Include saved calendar connection</label>
      {includeConnection && <p className="workspace-setting-hint">The file will contain your private calendar publication link. Anyone with this file may be able to read that calendar.</p>}
      <p className="workspace-setting-hint">Downloaded events and temporary meeting tokens are excluded. A running focus timer is saved paused. Windows startup registration is managed separately on each PC.</p>
      <div className="actions"><button disabled={busy || recoveryPending} type="button" onClick={() => void exportEverything()}>Export everything…</button><button disabled={busy || recoveryPending} type="button" onClick={() => void chooseBackup()}>Restore backup…</button></div>
      {preview && <div className="workspace-import-confirm" role="group" aria-label="Preview backup restore">
        <strong>Choose what to replace</strong>
        <span>Exported {new Date(preview.value.exportedAt).toLocaleString()}</span>
        <span>{Object.entries(preview.value.counts).map(([label, count]) => `${count} ${label}`).join(" · ")}</span>
        {!!preview.value.unmatchedCalendarBindings && !selection.calendarConnection && <small>{preview.value.unmatchedCalendarBindings} calendar bindings belong to a different calendar connection and will remain inactive.</small>}
        <div className="backup-restore__choices">{(Object.keys(selectionLabels) as (keyof Selection)[]).map(key => <label className="backup-restore__choice" key={key}><input type="checkbox" disabled={busy || (key === "calendarConnection" && !preview.value.hasCalendarConnection)} checked={selection[key]} onChange={event => setSelection(current => ({ ...current, [key]: event.target.checked }))} />{selectionLabels[key]}{key === "calendarConnection" && !preview.value.hasCalendarConnection ? " (not included)" : ""}</label>)}</div>
        <small>Selected sections replace current data rather than merging. A recovery copy is saved first. Calendar bindings and skipped events stay tied to their original calendar; they are not reassigned to another connection.</small>
        <div className="actions"><button disabled={busy || !Object.values(selection).some(Boolean)} type="button" onClick={() => void restore()}>{busy ? "Restoring…" : "Replace selected data"}</button><button disabled={busy} type="button" onClick={() => setPreview(null)}>Cancel</button></div>
      </div>}
      {busy && <p role="status">Working…</p>}
      {status && <p role="status">{status}</p>}
      {recoveryPath && <p className="workspace-setting-hint">Previous data backup: <code>{recoveryPath}</code>. Restore this file to recover the previous data. It excludes the private calendar connection.</p>}
      {error && <p className="error" role="alert">{error}</p>}
    </section>
    {!recoveryPending && !busy && <section aria-labelledby="individual-transfers-heading"><h2 id="individual-transfers-heading">Individual transfers</h2><p>Existing workspace and Medicine JSON files remain supported.</p><WorkspaceDataPanel transfers /><MedicineDataPanel transfers /></section>}
  </div>;
}
