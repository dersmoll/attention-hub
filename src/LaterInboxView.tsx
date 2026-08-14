import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { emitTo, listen } from "@tauri-apps/api/event";
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
  type LaterInboxOpenPayload,
  type LaterInboxReturnWindow,
  type LaterInboxSnapshot,
} from "./later-inbox-model";

const emptyForm = {
  title: "",
  context: "",
  url: "",
  followUp: "",
};

function formatTimestamp(value: string) {
  const date = new Date(value);
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function LaterInboxView() {
  const [snapshot, setSnapshot] = useState<LaterInboxSnapshot | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [discardRequested, setDiscardRequested] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const titleRef = useRef<HTMLInputElement>(null);
  const currentWindow = useMemo(getCurrentWindow, []);
  const returnFocusWindow = useRef<LaterInboxReturnWindow>(
    new URLSearchParams(window.location.search).get("laterReturn") === "advanced"
      ? "advanced"
      : "main",
  );

  const dirty = Object.values(form).some(Boolean);
  const openItems = useMemo(
    () => sortOpenLaterInboxItems(snapshot?.items ?? [], now),
    [now, snapshot?.items],
  );
  const completedItems = useMemo(
    () => sortCompletedLaterInboxItems(snapshot?.items ?? []),
    [snapshot?.items],
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
    document.title = `Attention Hub - Later Inbox (${openItems.length} open${dueCount ? `, ${dueCount} due` : ""})`;
  }, [dueCount, openItems.length]);

  const resetForm = () => {
    setForm(emptyForm);
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
      title: form.title,
      context: form.context || null,
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
      title: item.title,
      context: item.context ?? "",
      url: item.url ?? "",
      followUp: toLocalDateTimeInput(item.followUpAt),
    });
    setDetailsOpen(true);
    setDiscardRequested(false);
    setAnnouncement(`Editing ${item.title}.`);
    requestAnimationFrame(() => titleRef.current?.focus());
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

  return (
    <main className="later-shell">
      <header className="later-header">
        <div>
          <p className="eyebrow">Personal local queue</p>
          <h1>Later Inbox</h1>
          <p>
            {openItems.length} open{dueCount ? ` · ${dueCount} due` : ""}
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
          {editingId ? "Edit item" : "What should I come back to?"}
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
          <button disabled={pending || !form.title.trim()} type="submit">
            {pending ? "Saving…" : editingId ? "Update" : "Save"}
          </button>
        </div>

        <label htmlFor="later-context">Notes / context</label>
        <textarea
          aria-describedby="later-context-help"
          id="later-context"
          maxLength={4000}
          onChange={(event) =>
            setForm((current) => ({
              ...current,
              context: event.target.value,
            }))
          }
          placeholder="Paste the relevant chat message, task details, or project context"
          rows={3}
          value={form.context}
        />
        <small id="later-context-help">
          Plain text, up to 4,000 characters. Line breaks are preserved.
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
                  {item.context && <p>{item.context}</p>}
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
