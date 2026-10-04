import { invoke } from "@tauri-apps/api/core";
import { useState } from "react";
import type { ActionItem } from "./workspace-model";

/** Task context is readable without entering the editor. Links still use the
 * native command that checks them against this item's saved notes. */
export function TodoContent({ item, expanded, onToggle, showSchedule = false }: {
  item: ActionItem;
  expanded: boolean;
  onToggle: () => void;
  showSchedule?: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const firstLink = item.notes.find((segment) => segment.href);
  const preview = item.notes.filter((segment) => !segment.href).map((segment) => segment.text).join(" ").replace(/\s+/g, " ").trim();
  let linkLabel = "Open link";
  if (firstLink?.href) {
    try { linkLabel = new URL(firstLink.href).hostname; } catch { /* Saved URL validation owns the failure. */ }
  }
  const openLink = async (url: string) => {
    try { await invoke("open_action_item_note_url", { itemId: item.id, url }); setError(null); }
    catch { setError("The saved link could not be opened. Try again."); }
  };
  const notesId = `todo-notes-${item.id}`;
  return <div className="todo-content" data-completed={item.completedAt !== null || undefined}>
    <div className="todo-content__heading">
      <button aria-controls={notesId} aria-expanded={expanded} className="todo-content__title" onClick={onToggle} type="button">{item.title}</button>
      {firstLink?.href && <button aria-label={`Open saved link for ${item.title}: ${firstLink.href}`} className="todo-content__link" onClick={() => void openLink(firstLink.href!)} title={firstLink.href} type="button">{linkLabel} ↗</button>}
    </div>
    {!expanded && preview && <button aria-controls={notesId} aria-expanded={false} className="todo-content__preview" onClick={onToggle} type="button">{preview}</button>}
    <div className="todo-content__details" hidden={!expanded} id={notesId}>
      <p className="todo-content__notes">{item.notes.length ? item.notes.map((segment, index) => segment.href
        ? <button key={index} onClick={() => void openLink(segment.href!)} type="button">{segment.text}</button>
        : <span key={index}>{segment.text}</span>) : "No notes yet."}</p>
      {showSchedule && (item.dueOn || item.remindAt) && <p className="todo-content__schedule">{[
        item.dueOn ? `Due ${new Date(`${item.dueOn}T12:00:00`).toLocaleDateString([], { dateStyle: "medium" })}` : null,
        item.remindAt ? `Reminder ${new Date(item.remindAt).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}` : null,
      ].filter(Boolean).join(" · ")}</p>}
    </div>
    {error && <p className="todo-content__error" role="status">{error}</p>}
  </div>;
}
