import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect, useMemo, useRef, useState } from "react";
import { HubCloseIcon } from "./HubCloseIcon";
import { writeStoredFloatingGeometry } from "./event-workspace-window";
import { linkifyPlainText } from "./rich-notes";
import {
  STICKY_NOTE_GEOMETRY_LABEL,
  STICKY_NOTE_MAX_CHARACTERS,
  type StickyNoteSnapshot,
} from "./sticky-note-model";
import { useWidgetPanelStyle } from "./use-widget-panel-style";

type SaveState = "loading" | "saved" | "saving" | "error";

export function StickyNoteView() {
  const panelStyle = useWidgetPanelStyle();
  const noteWindow = useMemo(getCurrentWindow, []);
  const [text, setText] = useState("");
  const [saveState, setSaveState] = useState<SaveState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [recovered, setRecovered] = useState(false);
  const [closing, setClosing] = useState(false);
  const textRef = useRef("");
  const savedTextRef = useRef("");
  const revisionRef = useRef(0);
  const saveChainRef = useRef<Promise<boolean>>(Promise.resolve(true));
  const editorRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    let disposed = false;
    void invoke<StickyNoteSnapshot>("get_sticky_note")
      .then((snapshot) => {
        if (disposed) return;
        textRef.current = snapshot.text;
        savedTextRef.current = snapshot.text;
        revisionRef.current = snapshot.revision;
        setText(snapshot.text);
        setRecovered(snapshot.recoveredFromBackup);
        setSaveState("saved");
        window.requestAnimationFrame(() => editorRef.current?.focus());
      })
      .catch((cause) => {
        if (disposed) return;
        setSaveState("error");
        setError(String(cause));
      });
    return () => { disposed = true; };
  }, []);

  useEffect(() => {
    let disposed = false;
    let stopMoved: (() => void) | undefined;
    let stopResized: (() => void) | undefined;
    void noteWindow.onMoved(({ payload }) => {
      writeStoredFloatingGeometry(STICKY_NOTE_GEOMETRY_LABEL, payload);
    }).then((unlisten) => {
      if (disposed) unlisten(); else stopMoved = unlisten;
    });
    void noteWindow.scaleFactor().then((scaleFactor) => noteWindow.onResized(({ payload }) => {
      const logical = payload.toLogical(scaleFactor);
      writeStoredFloatingGeometry(STICKY_NOTE_GEOMETRY_LABEL, {
        width: logical.width,
        height: logical.height,
      });
    })).then((unlisten) => {
      if (disposed) unlisten(); else stopResized = unlisten;
    });
    return () => {
      disposed = true;
      stopMoved?.();
      stopResized?.();
    };
  }, [noteWindow]);

  const saveLatest = () => {
    saveChainRef.current = saveChainRef.current
      .catch(() => false)
      .then(async () => {
        const sentText = textRef.current;
        if (sentText === savedTextRef.current) {
          setSaveState("saved");
          return true;
        }
        setSaveState("saving");
        try {
          const snapshot = await invoke<StickyNoteSnapshot>("save_sticky_note", {
            text: sentText,
            expectedRevision: revisionRef.current,
          });
          revisionRef.current = snapshot.revision;
          savedTextRef.current = snapshot.text;
          setRecovered(snapshot.recoveredFromBackup);
          setError(null);
          setSaveState(textRef.current === snapshot.text ? "saved" : "saving");
          return true;
        } catch (cause) {
          setSaveState("error");
          setError(String(cause));
          return false;
        }
      });
    return saveChainRef.current;
  };

  useEffect(() => {
    if (saveState === "loading" || textRef.current === savedTextRef.current) return;
    const timer = window.setTimeout(() => { void saveLatest(); }, 550);
    return () => window.clearTimeout(timer);
  }, [text, saveState]);

  const links = useMemo(() => {
    const unique = new Map<string, string>();
    for (const segment of linkifyPlainText(text)) {
      if (segment.href && !unique.has(segment.href)) {
        try {
          unique.set(segment.href, new URL(segment.href).hostname);
        } catch {
          unique.set(segment.href, segment.text);
        }
      }
    }
    return [...unique.entries()].map(([href, label]) => ({ href, label }));
  }, [text]);

  const close = async () => {
    setClosing(true);
    const saved = await saveLatest();
    if (!saved) {
      setClosing(false);
      return;
    }
    const [position, size, scaleFactor] = await Promise.all([
      noteWindow.outerPosition().catch(() => null),
      noteWindow.outerSize().catch(() => null),
      noteWindow.scaleFactor().catch(() => 1),
    ]);
    if (position) writeStoredFloatingGeometry(STICKY_NOTE_GEOMETRY_LABEL, position);
    if (size) {
      const logical = size.toLogical(scaleFactor);
      writeStoredFloatingGeometry(STICKY_NOTE_GEOMETRY_LABEL, {
        width: logical.width,
        height: logical.height,
      });
    }
    await noteWindow.close();
  };

  const openLink = async (url: string) => {
    if (textRef.current !== savedTextRef.current && !(await saveLatest())) return;
    try {
      await invoke("open_sticky_note_url", { url });
      setError(null);
    } catch (cause) {
      setError(String(cause));
    }
  };

  const status = saveState === "loading"
    ? "Loading…"
    : saveState === "saving"
      ? "Saving…"
      : saveState === "error"
        ? "Not saved"
        : "Saved";

  return <main className="sticky-note" style={panelStyle}>
    <header onPointerDown={(event) => {
      if (!(event.target as HTMLElement).closest("button")) void noteWindow.startDragging();
    }}>
      <strong>Sticky note</strong>
      <span aria-live="polite" data-state={saveState}>{status}</span>
      <button aria-label="Close sticky note" className="hub-close-button" disabled={closing} onClick={() => void close()} title="Close" type="button"><HubCloseIcon /></button>
    </header>
    <textarea
      aria-label="Sticky note text"
      autoFocus
      disabled={saveState === "loading" || closing}
      maxLength={STICKY_NOTE_MAX_CHARACTERS}
      onChange={(event) => {
        textRef.current = event.target.value;
        setText(event.target.value);
        setSaveState("saving");
      }}
      placeholder="Write a quick note or paste a link…"
      ref={editorRef}
      spellCheck
      value={text}
    />
    {(links.length > 0 || recovered || error) && <footer>
      {links.length > 0 && <div aria-label="Links in this note" className="sticky-note__links">{links.map(({ href, label }) => <button key={href} onClick={() => void openLink(href)} title={href} type="button"><span aria-hidden="true">↗</span>{label}</button>)}</div>}
      {recovered && <p role="status">Recovered from the previous local backup.</p>}
      {error && <p role="alert">{error}</p>}
    </footer>}
  </main>;
}
