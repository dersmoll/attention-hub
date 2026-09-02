import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { emit } from "@tauri-apps/api/event";
import { open, save } from "@tauri-apps/plugin-dialog";
import { useCallback, useEffect, useMemo, useState } from "react";
import { openManagerWindow } from "./manager-window";
import { type DeleteImpact, type WorkspaceImportPreview, type WorkspaceSnapshot, WORKSPACE_CHANGED_EVENT } from "./workspace-model";
import { TODO_PREFERENCES_CHANGED_EVENT, readTodoPreferences, writeTodoPreferences } from "./todo-preferences";

export function WorkspaceDataPanel() {
  const [snapshot, setSnapshot] = useState<WorkspaceSnapshot | null>(null);
  const [impact, setImpact] = useState<DeleteImpact | null>(null);
  const [pending, setPending] = useState(false);
  const [transferPending, setTransferPending] = useState<"export" | "preview" | "import" | null>(null);
  const [importSelection, setImportSelection] = useState<{ path: string; preview: WorkspaceImportPreview } | null>(null);
  const [transferStatus, setTransferStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notificationsEnabled, setNotificationsEnabled] = useState(() => readTodoPreferences().dueNotificationsEnabled);
  const openCount = useMemo(() => snapshot?.actionItems.filter((item) => item.completedAt === null).length ?? 0, [snapshot]);
  const completedCount = useMemo(() => snapshot?.actionItems.filter((item) => item.completedAt !== null).length ?? 0, [snapshot]);

  const refresh = useCallback(async () => {
    try { setSnapshot(await invoke<WorkspaceSnapshot>("get_workspace_snapshot")); setError(null); }
    catch (cause) { setError(String(cause)); }
  }, []);

  useEffect(() => {
    void refresh();
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void listen(WORKSPACE_CHANGED_EVENT, () => void refresh()).then((next) => { if (disposed) next(); else unlisten = next; });
    return () => { disposed = true; unlisten?.(); };
  }, [refresh]);

  const deleteCompleted = async () => {
    setPending(true);
    try { setSnapshot(await invoke<WorkspaceSnapshot>("delete_completed_action_items", { ownerKind: null, ownerId: null })); setError(null); }
    catch (cause) { setError(String(cause)); }
    finally { setPending(false); }
  };

  const prepareDeleteAll = async () => {
    try { setImpact(await invoke<DeleteImpact>("get_delete_impact", { entity: "workspace", id: null })); setError(null); }
    catch (cause) { setError(String(cause)); }
  };

  const deleteAll = async () => {
    if (!impact) return;
    setPending(true);
    try { setSnapshot(await invoke<WorkspaceSnapshot>("delete_all_workspace_data", { expectedRevision: impact.workspaceRevision })); setImpact(null); setError(null); }
    catch (cause) { await prepareDeleteAll(); setError(String(cause)); }
    finally { setPending(false); }
  };

  const exportWorkspace = async () => {
    const destination = await save({
      defaultPath: `attention-hub-workspace-${new Date().toISOString().slice(0, 10)}.json`,
      filters: [{ name: "Attention Hub workspace", extensions: ["json"] }],
    });
    if (!destination) return;
    setTransferPending("export");
    try {
      const exportedPath = await invoke<string>("export_workspace_data", { destinationPath: destination });
      setTransferStatus(`Workspace exported to ${exportedPath}`);
      setError(null);
    } catch (cause) {
      setTransferStatus(null);
      setError(String(cause));
    } finally {
      setTransferPending(null);
    }
  };

  const chooseWorkspaceImport = async () => {
    const source = await open({
      directory: false,
      multiple: false,
      filters: [{ name: "Attention Hub workspace", extensions: ["json"] }],
    });
    if (!source) return;
    setTransferPending("preview");
    try {
      const preview = await invoke<WorkspaceImportPreview>("preview_workspace_import", { sourcePath: source });
      setImportSelection({ path: source, preview });
      setTransferStatus(null);
      setError(null);
    } catch (cause) {
      setImportSelection(null);
      setError(String(cause));
    } finally {
      setTransferPending(null);
    }
  };

  const importWorkspace = async () => {
    if (!importSelection) return;
    setTransferPending("import");
    try {
      const next = await invoke<WorkspaceSnapshot>("import_workspace_data", {
        sourcePath: importSelection.path,
        expectedRevision: importSelection.preview.workspaceRevision,
        expectedDigest: importSelection.preview.digest,
      });
      setSnapshot(next);
      setImportSelection(null);
      setTransferStatus("Workspace imported. A previous valid local workspace remains available as the bounded backup.");
      setError(null);
    } catch (cause) {
      setImportSelection(null);
      setTransferStatus(null);
      setError(String(cause));
    } finally {
      setTransferPending(null);
    }
  };

  const totalOwned = impact
    ? (impact.counts.categories ?? 0) + (impact.counts.projects ?? 0) + (impact.counts.lists ?? 0) + (impact.counts.links ?? 0) + (impact.counts.actionItems ?? 0) + (impact.counts.bindings ?? 0)
    : (snapshot?.categories.length ?? 0) + (snapshot?.projects.length ?? 0) + (snapshot?.lists.length ?? 0) + (snapshot?.links.length ?? 0) + (snapshot?.actionItems.length ?? 0) + (snapshot?.bindings.length ?? 0);
  const impactParts = impact ? ([
    [impact.counts.categories, "categories"],
    [impact.counts.projects, "projects"],
    [impact.counts.lists, "lists"],
    [impact.counts.links, "links"],
    [impact.counts.actionItems, "to-dos"],
    [impact.counts.bindings, "calendar bindings"],
  ] as const).filter(([count]) => count !== null).map(([count, label]) => `${count} ${label}`) : [];

  return <section aria-labelledby="workspace-data-heading" className="workspace-data-panel">
    <h2 id="workspace-data-heading">Workspace storage and data</h2>
    <p>{openCount} open and {completedCount} completed to-dos across Projects and Personal lists.</p>
    <div className="workspace-data-card">
      <p>Projects, notes, links, to-dos, personal lists, and calendar bindings share one local versioned store with one previous valid backup. No cloud sync is used.</p>
      {snapshot?.storagePath && <p>Data file: <code>{snapshot.storagePath}</code></p>}
      {snapshot?.recoveredFromBackup && <p className="workspace-recovery" role="status">The previous valid backup is currently being shown.</p>}
      <label className="workspace-notification-setting"><input checked={notificationsEnabled} onChange={(event) => { const next = writeTodoPreferences({ dueNotificationsEnabled: event.target.checked }); setNotificationsEnabled(next.dueNotificationsEnabled); void emit(TODO_PREFERENCES_CHANGED_EVENT, next); }} type="checkbox"/> Show Windows notifications when a to-do reminder is reached</label>
      <div className="actions">
        <button onClick={() => void openManagerWindow("todos")} type="button">Open To-dos</button>
        <button disabled={transferPending !== null} onClick={() => void exportWorkspace()} type="button">{transferPending === "export" ? "Exporting…" : "Export workspace…"}</button>
        <button disabled={transferPending !== null} onClick={() => void chooseWorkspaceImport()} type="button">{transferPending === "preview" ? "Reading…" : "Import workspace…"}</button>
        <button disabled={pending || completedCount === 0} onClick={() => void deleteCompleted()} type="button">Delete completed to-dos</button>
        {!impact ? <button disabled={pending || !snapshot || totalOwned === 0} onClick={() => void prepareDeleteAll()} type="button">Delete all workspace data…</button> : <span className="workspace-delete-confirm" role="group" aria-label="Confirm deletion"><span>{impactParts.join(", ")} will be removed.</span><button autoFocus disabled={pending} onClick={() => void deleteAll()} type="button">Permanently delete all</button><button onClick={() => setImpact(null)} type="button">Cancel</button></span>}
      </div>
      {importSelection && <div aria-label="Confirm workspace import" className="workspace-import-confirm" role="group">
        <strong>Replace the current workspace?</strong>
        <span>{[
          `${importSelection.preview.counts.projects} projects`,
          `${importSelection.preview.counts.categories} categories`,
          `${importSelection.preview.counts.lists} lists`,
          `${importSelection.preview.counts.actionItems} to-dos`,
          `${importSelection.preview.counts.links} links`,
          `${importSelection.preview.counts.bindings} calendar bindings`,
        ].join(", ")}</span>
        <small>Exported {new Date(importSelection.preview.exportedAt).toLocaleString()}. Your current workspace will become the local backup.</small>
        <div>
          <button autoFocus disabled={transferPending !== null} onClick={() => void importWorkspace()} type="button">{transferPending === "import" ? "Importing…" : "Replace and import"}</button>
          <button disabled={transferPending !== null} onClick={() => setImportSelection(null)} type="button">Cancel</button>
        </div>
      </div>}
      {transferStatus && <p className="workspace-transfer-status" role="status">{transferStatus}</p>}
    </div>
    {error && <p className="error" role="alert">Workspace: {error}</p>}
  </section>;
}
