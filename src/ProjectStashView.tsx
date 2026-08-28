import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  insertRichNoteAtSelection,
  noteCharacterCount,
  readRichNoteEditor,
  richNoteSegmentsFromClipboard,
  setRichNoteEditor,
} from "./later-inbox-rich-notes";
import {
  MAX_PROJECT_NOTE_CHARACTERS,
  PROJECT_STASH_OPEN_EVENT,
  PROJECT_STASH_WINDOW_LABEL,
  type ProjectNoteSegment,
  type ProjectStashOpenPayload,
  type ProjectStashSnapshot,
} from "./event-workspace-model";
import {
  writeStoredFloatingGeometry,
} from "./event-workspace-window";
import { useWidgetPanelStyle } from "./use-widget-panel-style";
import { HubCloseIcon } from "./HubCloseIcon";

function initialProjectId() {
  return new URLSearchParams(window.location.search).get("projectId");
}

export function ProjectStashView() {
  const panelStyle = useWidgetPanelStyle();
  const requestRef = useRef<string | null>(initialProjectId());
  const notesRef = useRef<HTMLDivElement>(null);
  const hydrationRef = useRef<ProjectNoteSegment[] | null>(null);
  const [snapshot, setSnapshot] = useState<ProjectStashSnapshot | null>(null);
  const [notes, setNotes] = useState<ProjectNoteSegment[]>([]);
  const [dirty, setDirty] = useState(false);
  const [pending, setPending] = useState<"load" | "save" | "open" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const characters = noteCharacterCount(notes);
  const overLimit = characters > MAX_PROJECT_NOTE_CHARACTERS;

  const applySnapshot = useCallback((next: ProjectStashSnapshot) => {
    setSnapshot(next);
    setNotes(next.project.notes);
    setDirty(false);
    hydrationRef.current = next.project.notes;
  }, []);

  const load = useCallback(async (projectId: string) => {
    requestRef.current = projectId;
    setPending("load");
    setError(null);
    try {
      const next = await invoke<ProjectStashSnapshot>("get_project_stash", { projectId });
      applySnapshot(next);
      setStatus("Stored locally.");
    } catch (cause) {
      setError(String(cause));
    } finally {
      setPending(null);
    }
  }, [applySnapshot]);

  useEffect(() => {
    const projectId = requestRef.current;
    if (projectId) void load(projectId); else setError("No project stash was selected. Reopen Today and try again.");
  }, [load]);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void listen<ProjectStashOpenPayload>(PROJECT_STASH_OPEN_EVENT, ({ payload }) => {
      void load(payload.projectId);
    }).then((stop) => {
      if (disposed) stop(); else unlisten = stop;
    });
    return () => { disposed = true; unlisten?.(); };
  }, [load]);

  useEffect(() => {
    if (!notesRef.current || hydrationRef.current === null) return;
    setRichNoteEditor(notesRef.current, hydrationRef.current);
    hydrationRef.current = null;
  }, [pending, snapshot?.project.id]);

  useEffect(() => {
    if (snapshot) document.title = `Attention Hub - ${snapshot.project.name} stash`;
  }, [snapshot]);

  useEffect(() => {
    let unlistenMoved: (() => void) | undefined;
    let unlistenResized: (() => void) | undefined;
    let disposed = false;
    const currentWindow = getCurrentWindow();
    void (async () => {
      unlistenMoved = await currentWindow.onMoved(({ payload }) => {
        writeStoredFloatingGeometry(PROJECT_STASH_WINDOW_LABEL, payload);
      });
      unlistenResized = await currentWindow.onResized(async ({ payload }) => {
        const scaleFactor = await currentWindow.scaleFactor();
        writeStoredFloatingGeometry(
          PROJECT_STASH_WINDOW_LABEL,
          payload.toLogical(scaleFactor),
        );
      });
    })().catch(() => {
      if (!disposed) setError("Window geometry could not be saved.");
    });
    return () => {
      disposed = true;
      unlistenMoved?.();
      unlistenResized?.();
    };
  }, []);

  useEffect(() => {
    if (!snapshot || !dirty || pending !== null || overLimit) return;
    const timer = window.setTimeout(() => {
      setPending("save");
      void invoke<ProjectStashSnapshot>("save_project_stash", {
        projectId: snapshot.project.id,
        input: { notes },
      }).then((next) => {
        applySnapshot(next);
        setDirty(false);
        setStatus("Saved locally.");
        setError(null);
      }).catch((cause) => setError(String(cause))).finally(() => setPending(null));
    }, 850);
    return () => window.clearTimeout(timer);
  }, [applySnapshot, dirty, notes, overLimit, pending, snapshot]);

  const updateNotes = (editor: HTMLElement) => {
    setNotes(readRichNoteEditor(editor) as ProjectNoteSegment[]);
    setDirty(true);
    setStatus("Saving locally…");
  };

  const insertBullet = () => {
    const editor = notesRef.current;
    if (!editor) return;
    editor.focus();
    insertRichNoteAtSelection(editor, [{ text: "• ", href: null }]);
    updateNotes(editor);
  };

  const openNoteLink = async (url: string) => {
    if (!snapshot) return;
    setPending("open");
    try {
      await invoke("open_project_stash_note_url", { projectId: snapshot.project.id, url });
      setStatus("Opened the saved note link.");
    } catch (cause) {
      setError(String(cause));
    } finally {
      setPending(null);
    }
  };

  return (
    <main className="project-stash-shell" style={panelStyle}>
      <header
        onPointerDown={(event) => {
          if ((event.target as HTMLElement).closest("button, input, select, a")) return;
          void getCurrentWindow().startDragging();
        }}
      >
        <div>
          <span>Project stash</span>
          <h1>{snapshot?.project.name ?? "Project notes"}</h1>
        </div>
        <button aria-label="Close project stash" className="hub-close-button" onClick={() => void getCurrentWindow().close()} type="button"><HubCloseIcon /></button>
      </header>
      {pending === "load" && !snapshot ? <p className="project-stash-loading">Loading local stash…</p> : <>
        <div className="project-stash-toolbar" role="toolbar" aria-label="Note formatting">
          <button disabled={pending !== null} onClick={insertBullet} title="Insert bullet" type="button">• List</button>
        </div>
        <div
          aria-describedby="project-stash-help"
          aria-invalid={overLimit || undefined}
          aria-label="Project stash notes"
          aria-multiline="true"
          className="project-stash-notes"
          contentEditable={pending === null}
          data-placeholder="Shared notes for this project"
          onClick={(event) => {
            const link = (event.target as HTMLElement).closest("a");
            if (!link) return;
            event.preventDefault();
            if (event.ctrlKey || event.metaKey) void openNoteLink(link.href);
          }}
          onDrop={(event) => event.preventDefault()}
          onInput={(event) => updateNotes(event.currentTarget)}
          onPaste={(event) => {
            event.preventDefault();
            insertRichNoteAtSelection(event.currentTarget, richNoteSegmentsFromClipboard(event.clipboardData));
            updateNotes(event.currentTarget);
          }}
          ref={notesRef}
          role="textbox"
          spellCheck
          suppressContentEditableWarning
        />
        <p className="project-stash-help" id="project-stash-help">
          {overLimit ? `Reduce notes by ${characters - MAX_PROJECT_NOTE_CHARACTERS} characters.` : `Text, bullets, and links stay local · ${characters}/${MAX_PROJECT_NOTE_CHARACTERS}`}
        </p>
      </>}
      {snapshot?.recoveredFromBackup && <p className="project-stash-recovery">Showing the previous valid local backup.</p>}
      {error && <p className="project-stash-error" role="alert">{error}</p>}
      <p aria-live="polite" className="project-stash-status">{status}</p>
    </main>
  );
}
