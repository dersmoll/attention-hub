import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { emit, emitTo, listen } from "@tauri-apps/api/event";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  LATER_INBOX_CHANGED_EVENT,
  LATER_INBOX_FOCUS_EVENT,
  LATER_INBOX_OPEN_EVENT,
  fromLocalDateTimeInput,
  isLaterInboxItemDue,
  sortCompletedLaterInboxItems,
  sortOpenLaterInboxItems,
  toLocalDateTimeInput,
  type LaterInboxInput,
  type LaterInboxItem,
  type LaterInboxNoteSegment,
  type LaterInboxOpenPayload,
  type LaterInboxReturnWindow,
  type LaterInboxScope,
  type LaterInboxSnapshot,
} from "./later-inbox-model";
import {
  LATER_INBOX_PREFERENCES_CHANGED_EVENT,
  readLaterInboxPreferences,
  writeLaterInboxPreferences,
} from "./later-inbox-preferences";
import {
  MAX_LATER_NOTE_CHARACTERS,
  insertRichNoteAtSelection,
  noteCharacterCount,
  readRichNoteEditor,
  richNoteSegmentsFromClipboard,
  setRichNoteEditor,
} from "./later-inbox-rich-notes";

const emptyForm = (scope: LaterInboxScope) => ({
  scope,
  title: "",
  notes: [] as LaterInboxNoteSegment[],
  url: "",
  followUp: "",
});

function formatTimestamp(value: string) {
  const date = new Date(value);
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function LaterInboxView() {
  const [snapshot, setSnapshot] = useState<LaterInboxSnapshot | null>(null);
  const [activeScope, setActiveScope] = useState<LaterInboxScope>("work");
  const [form, setForm] = useState(() => emptyForm("work"));
  const [preferences, setPreferences] = useState(readLaterInboxPreferences);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [discardRequested, setDiscardRequested] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const titleRef = useRef<HTMLInputElement>(null);
  const notesRef = useRef<HTMLDivElement>(null);
  const currentWindow = useMemo(getCurrentWindow, []);
  const returnFocusWindow = useRef<LaterInboxReturnWindow>(
    new URLSearchParams(window.location.search).get("laterReturn") === "advanced"
      ? "advanced"
      : "main",
  );

  const notesCharacters = noteCharacterCount(form.notes);
  const notesOverLimit = notesCharacters > MAX_LATER_NOTE_CHARACTERS;
  const dirty =
    Boolean(form.title || form.url || form.followUp) || form.notes.length > 0;
  const allOpenItems = useMemo(
    () => sortOpenLaterInboxItems(snapshot?.items ?? [], now),
    [now, snapshot?.items],
  );
  const openItems = useMemo(
    () => allOpenItems.filter((item) => item.scope === activeScope),
    [activeScope, allOpenItems],
  );
  const allCompletedItems = useMemo(
    () => sortCompletedLaterInboxItems(snapshot?.items ?? []),
    [snapshot?.items],
  );
  const completedItems = useMemo(
    () => allCompletedItems.filter((item) => item.scope === activeScope),
    [activeScope, allCompletedItems],
  );
  const dueCount = openItems.filter((item) =>
    isLaterInboxItemDue(item, now),
  ).length;

  const refresh = useCallback(async () => {
    try {
      setSnapshot(
        await invoke<LaterInboxSnapshot>("get_later_inbox_snapshot"),
      );
      setError(null);
    } catch (nextError) {
      setError(String(nextError));
    }
  }, []);

  const closeWindow = useCallback(async () => {
    const requestedLabel = returnFocusWindow.current;
    const requestedWindow = await WebviewWindow.getByLabel(requestedLabel);
    const focusLabel = requestedWindow ? requestedLabel : "main";
    const focusWindow =
      requestedWindow ?? (await WebviewWindow.getByLabel("main"));
    await currentWindow.hide();
    await focusWindow?.setFocus();
    await emitTo(focusLabel, LATER_INBOX_FOCUS_EVENT);
  }, [currentWindow]);

  useEffect(() => {
    titleRef.current?.focus();
    void refresh();
  }, [refresh]);

  useEffect(() => {
    let disposed = false;
    let stopListening: (() => void) | undefined;
    void listen<LaterInboxOpenPayload>(
      LATER_INBOX_OPEN_EVENT,
      ({ payload }) => {
        if (disposed) {
          return;
        }
        returnFocusWindow.current = payload.returnFocusWindow;
        setNow(new Date());
        void refresh();
        requestAnimationFrame(() => titleRef.current?.focus());
      },
    ).then((unlisten) => {
      if (disposed) {
        unlisten();
      } else {
        stopListening = unlisten;
      }
    });
    return () => {
      disposed = true;
      stopListening?.();
    };
  }, [refresh]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let disposed = false;
    let stopListening: (() => void) | undefined;
    void listen(LATER_INBOX_CHANGED_EVENT, () => void refresh()).then(
      (unlisten) => {
        if (disposed) {
          unlisten();
        } else {
          stopListening = unlisten;
        }
      },
    );
    return () => {
      disposed = true;
      stopListening?.();
    };
  }, [refresh]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }
      event.preventDefault();
      if (dirty) {
        setDiscardRequested(true);
        setAnnouncement(
          "Draft kept. Choose Discard draft and close if you want to leave.",
        );
      } else {
        void closeWindow();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closeWindow, dirty]);

  useEffect(() => {
    let disposed = false;
    let stopListening: (() => void) | undefined;
    void currentWindow
      .onCloseRequested((event) => {
        event.preventDefault();
        if (dirty) {
          setDiscardRequested(true);
          setAnnouncement(
            "Draft kept. Choose Discard draft and close if you want to leave.",
          );
        } else {
          void closeWindow();
        }
      })
      .then((unlisten) => {
        if (disposed) {
          unlisten();
        } else {
          stopListening = unlisten;
        }
      });
    return () => {
      disposed = true;
      stopListening?.();
    };
  }, [closeWindow, currentWindow, dirty]);

  useEffect(() => {
    document.title = `Attention Hub - Later Inbox (${allOpenItems.length} open${dueCount ? `, ${dueCount} due in ${activeScope}` : ""})`;
  }, [activeScope, allOpenItems.length, dueCount]);

  const resetForm = () => {
    setForm(emptyForm(activeScope));
    if (notesRef.current) {
      setRichNoteEditor(notesRef.current, []);
    }
    setEditingId(null);
    setDetailsOpen(false);
    setDiscardRequested(false);
    requestAnimationFrame(() => titleRef.current?.focus());
  };

  const submit = async () => {
    if (pending) {
      return;
    }
    setPending(true);
    setError(null);
    const input: LaterInboxInput = {
      scope: form.scope,
      title: form.title,
      notes: form.notes,
      url: form.url || null,
      followUpAt: fromLocalDateTimeInput(form.followUp),
    };
    try {
      const command = editingId
        ? "update_later_inbox_item"
        : "create_later_inbox_item";
      const next = await invoke<LaterInboxSnapshot>(
        command,
        editingId ? { itemId: editingId, input } : { input },
      );
      setSnapshot(next);
      setAnnouncement(editingId ? "Later item updated." : "Saved for later.");
      resetForm();
    } catch (nextError) {
      setError(String(nextError));
      requestAnimationFrame(() => titleRef.current?.focus());
    } finally {
      setPending(false);
    }
  };

  const editItem = (item: LaterInboxItem) => {
    setEditingId(item.id);
    setForm({
      scope: item.scope,
      title: item.title,
      notes: item.notes,
      url: item.url ?? "",
      followUp: toLocalDateTimeInput(item.followUpAt),
    });
    setActiveScope(item.scope);
    setDetailsOpen(true);
    setDiscardRequested(false);
    setAnnouncement(`Editing ${item.title}.`);
    requestAnimationFrame(() => {
      if (notesRef.current) {
        setRichNoteEditor(notesRef.current, item.notes);
      }
      titleRef.current?.focus();
    });
  };

  const completeItem = async (item: LaterInboxItem) => {
    setPending(true);
    setError(null);
    try {
      setSnapshot(
        await invoke<LaterInboxSnapshot>("complete_later_inbox_item", {
          itemId: item.id,
        }),
      );
      setAnnouncement(`${item.title} completed.`);
      requestAnimationFrame(() => titleRef.current?.focus());
    } catch (nextError) {
      setError(String(nextError));
    } finally {
      setPending(false);
    }
  };

  const restoreItem = async (item: LaterInboxItem) => {
    setPending(true);
    setError(null);
    try {
      setSnapshot(
        await invoke<LaterInboxSnapshot>("restore_later_inbox_item", {
          itemId: item.id,
        }),
      );
      setAnnouncement(`${item.title} restored to the open inbox.`);
    } catch (nextError) {
      setError(String(nextError));
    } finally {
      setPending(false);
    }
  };

  const openItemUrl = async (item: LaterInboxItem) => {
    try {
      await invoke("open_later_inbox_item_url", { itemId: item.id });
      setAnnouncement(`${item.title} opened in the default browser.`);
    } catch (nextError) {
      setError(String(nextError));
    }
  };

  const openNoteUrl = async (item: LaterInboxItem, url: string) => {
    try {
      await invoke("open_later_inbox_note_url", { itemId: item.id, url });
      setAnnouncement(`Linked text from ${item.title} opened in the default browser.`);
    } catch (nextError) {
      setError(String(nextError));
    }
  };

  return (
    <main className="later-shell">
      <header className="later-header">
        <div className="later-header__title">
          <h1>Later Inbox</h1>
          <p>
            {allOpenItems.length} open{dueCount ? ` · ${dueCount} due here` : ""}
          </p>
        </div>
        <button
          aria-label="Close Later Inbox"
          onClick={() => {
            if (dirty) {
              setDiscardRequested(true);
            } else {
              void closeWindow();
            }
          }}
          type="button"
        >
          Close
        </button>
      </header>

      <div
        aria-label="Later Inbox space"
        className="later-scope-tabs"
        role="group"
      >
        {(["work", "private"] as const).map((scope) => {
          const count = allOpenItems.filter(
            (item) => item.scope === scope,
          ).length;
          return (
            <button
              aria-pressed={activeScope === scope}
              key={scope}
              onClick={() => {
                setActiveScope(scope);
                setForm((current) => ({ ...current, scope }));
              }}
              type="button"
            >
              {scope === "work" ? "Work" : "Private"} ({count})
            </button>
          );
        })}
      </div>

      <label className="later-notification-toggle">
        <input
          checked={preferences.dueNotificationsEnabled}
          onChange={(event) => {
            const next = writeLaterInboxPreferences({
              dueNotificationsEnabled: event.target.checked,
            });
            setPreferences(next);
            void emit(LATER_INBOX_PREFERENCES_CHANGED_EVENT, next);
            setAnnouncement(
              next.dueNotificationsEnabled
                ? "Due notifications enabled while Attention Hub is running."
                : "Due notifications disabled.",
            );
          }}
          type="checkbox"
        />
        Notify when due (while Hub is running)
      </label>

      <form
        className="later-capture"
        onKeyDown={(event) => {
          if (event.ctrlKey && event.key === "Enter") {
            event.preventDefault();
            void submit();
          }
        }}
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <label htmlFor="later-title">
          {editingId
            ? `Edit ${form.scope} item`
            : `What ${activeScope} item should I come back to?`}
        </label>
        <div className="later-title-row">
          <input
            aria-describedby="later-capture-help"
            aria-invalid={error ? true : undefined}
            autoComplete="off"
            id="later-title"
            maxLength={160}
            onChange={(event) =>
              setForm((current) => ({ ...current, title: event.target.value }))
            }
            placeholder="Short title"
            ref={titleRef}
            value={form.title}
          />
          <button
            disabled={pending || !form.title.trim() || notesOverLimit}
            type="submit"
          >
            {pending ? "Saving…" : editingId ? "Update" : "Save"}
          </button>
        </div>

        <label id="later-notes-label">Notes / context</label>
        <div
          aria-describedby="later-context-help"
          aria-invalid={notesOverLimit || undefined}
          aria-labelledby="later-notes-label"
          aria-multiline="true"
          className="later-rich-notes"
          contentEditable={!pending}
          data-placeholder="Paste instructions here; linked words are preserved"
          id="later-context"
          onClick={(event) => {
            if ((event.target as HTMLElement).closest("a")) {
              event.preventDefault();
            }
          }}
          onInput={(event) => {
            const notes = readRichNoteEditor(event.currentTarget);
            if (notes.length === 0) {
              event.currentTarget.replaceChildren();
            }
            setForm((current) => ({ ...current, notes }));
          }}
          onDrop={(event) => event.preventDefault()}
          onPaste={(event) => {
            event.preventDefault();
            insertRichNoteAtSelection(
              event.currentTarget,
              richNoteSegmentsFromClipboard(event.clipboardData),
            );
            const notes = readRichNoteEditor(event.currentTarget);
            setForm((current) => ({ ...current, notes }));
          }}
          ref={notesRef}
          role="textbox"
          spellCheck
          suppressContentEditableWarning
        />
        <small id="later-context-help">
          {notesOverLimit ? (
            <strong role="alert">
              Reduce notes by {notesCharacters - MAX_LATER_NOTE_CHARACTERS}
              characters.
            </strong>
          ) : (
            <>
              Linked words and line breaks are preserved · {notesCharacters}/
              {MAX_LATER_NOTE_CHARACTERS}
            </>
          )}
        </small>
        <small className="sr-only" id="later-capture-help">
          Enter a short title. Press Control plus Enter anywhere in this form to
          save.
        </small>

        <details
          onToggle={(event) => setDetailsOpen(event.currentTarget.open)}
          open={detailsOpen}
        >
          <summary>More details</summary>
          <div className="later-details">
            <label htmlFor="later-url">Task URL</label>
            <input
              autoCapitalize="none"
              autoComplete="off"
              id="later-url"
              inputMode="url"
              maxLength={2048}
              onChange={(event) =>
                setForm((current) => ({ ...current, url: event.target.value }))
              }
              placeholder="https://…"
              spellCheck={false}
              type="url"
              value={form.url}
            />
            <label htmlFor="later-follow-up">Follow up</label>
            <input
              id="later-follow-up"
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  followUp: event.target.value,
                }))
              }
              type="datetime-local"
              value={form.followUp}
            />
            <small>
              Follow-up time changes sorting and due styling only. It does not
              create a Windows notification.
            </small>
          </div>
        </details>

        {editingId && (
          <button
            className="later-cancel-edit"
            disabled={pending}
            onClick={resetForm}
            type="button"
          >
            Cancel edit
          </button>
        )}
      </form>

      {discardRequested && (
        <div className="later-discard" role="alert">
          <p>Your unsaved draft is still here.</p>
          <div className="actions">
            <button
              onClick={() => {
                resetForm();
                void closeWindow();
              }}
              disabled={pending}
              type="button"
            >
              Discard draft and close
            </button>
            <button
              disabled={pending}
              onClick={() => setDiscardRequested(false)}
              type="button"
            >
              Keep editing
            </button>
          </div>
        </div>
      )}

      {error && (
        <p className="error" role="alert">
          Later Inbox: {error}
        </p>
      )}
      {snapshot?.recoveredFromBackup && (
        <p className="later-recovery" role="status">
          Showing the previous valid local backup. Saving an item will repair
          the primary file.
        </p>
      )}
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>

      <section aria-labelledby="later-open-heading" className="later-review">
        <h2 id="later-open-heading">Open items</h2>
        {snapshot === null && !error ? (
          <p>Loading local items…</p>
        ) : openItems.length === 0 ? (
          <p className="later-empty">Nothing is waiting. Capture the next request above.</p>
        ) : (
          <ol className="later-list">
            {openItems.map((item) => {
              const due = isLaterInboxItemDue(item, now);
              return (
                <li data-due={due || undefined} key={item.id}>
                  <div className="later-item-heading">
                    <strong>{item.title}</strong>
                    {due && <span>Due</span>}
                  </div>
                  {item.notes.length > 0 && (
                    <details className="later-item-notes-disclosure">
                      <summary>Notes / context</summary>
                      <div className="later-item-notes">
                        {item.notes.map((segment, index) =>
                          segment.href ? (
                            <button
                              className="later-note-link"
                              key={`${index}-${segment.href}`}
                              onClick={() =>
                                void openNoteUrl(item, segment.href ?? "")
                              }
                              role="link"
                              type="button"
                            >
                              {segment.text}
                            </button>
                          ) : (
                            <span key={index}>{segment.text}</span>
                          ),
                        )}
                      </div>
                    </details>
                  )}
                  <small>
                    Captured {formatTimestamp(item.createdAt)}
                    {item.followUpAt
                      ? ` · Follow up ${formatTimestamp(item.followUpAt)}`
                      : ""}
                  </small>
                  <div className="later-item-actions">
                    {item.url && (
                      <button onClick={() => void openItemUrl(item)} type="button">
                        Open link <span className="sr-only">in default browser</span>
                      </button>
                    )}
                    <button
                      disabled={pending}
                      onClick={() => editItem(item)}
                      type="button"
                    >
                      Edit
                    </button>
                    <button
                      disabled={pending}
                      onClick={() => void completeItem(item)}
                      type="button"
                    >
                      Complete
                    </button>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      {completedItems.length > 0 && (
        <details className="later-completed">
          <summary>Completed ({completedItems.length})</summary>
          <ul className="later-list">
            {completedItems.map((item) => (
              <li key={item.id}>
                <strong>{item.title}</strong>
                <small>
                  Completed {formatTimestamp(item.completedAt ?? item.updatedAt)}
                </small>
                <button
                  disabled={pending}
                  onClick={() => void restoreItem(item)}
                  type="button"
                >
                  Restore
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </main>
  );
}
