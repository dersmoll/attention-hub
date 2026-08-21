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
  nextQuarterHour,
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

type ReminderWizardStep = 0 | 1 | 2;

function formatTimestamp(value: string) {
  const date = new Date(value);
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function LaterInboxView() {
  const initialFollowUpAt = useMemo(
    () => new URLSearchParams(window.location.search).get("laterFollowUp"),
    [],
  );
  const [snapshot, setSnapshot] = useState<LaterInboxSnapshot | null>(null);
  const [activeScope, setActiveScope] = useState<LaterInboxScope>("work");
  const [form, setForm] = useState(() => ({
    ...emptyForm("work"),
    followUp: toLocalDateTimeInput(initialFollowUpAt),
  }));
  const [preferences, setPreferences] = useState(readLaterInboxPreferences);
  const [captureOpen, setCaptureOpen] = useState(
    () => toLocalDateTimeInput(initialFollowUpAt) !== "",
  );
  const [wizardStep, setWizardStep] = useState<ReminderWizardStep>(0);
  const [wizardDirection, setWizardDirection] = useState<"forward" | "back">(
    "forward",
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [discardRequested, setDiscardRequested] = useState(false);
  const [deleteRequestedId, setDeleteRequestedId] = useState<string | null>(
    null,
  );
  const [now, setNow] = useState(() => new Date());
  const titleRef = useRef<HTMLInputElement>(null);
  const followUpRef = useRef<HTMLInputElement>(null);
  const notesRef = useRef<HTMLDivElement>(null);
  const addButtonRef = useRef<HTMLButtonElement>(null);
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
    void refresh();
    if (toLocalDateTimeInput(initialFollowUpAt)) {
      setAnnouncement(
        preferences.dueNotificationsEnabled
          ? "Reminder time prefilled. A notification will be requested when due while Attention Hub is running."
          : "Reminder time prefilled. Due notifications are off; enable them to receive an alert while Attention Hub is running.",
      );
    }
  }, [initialFollowUpAt, preferences.dueNotificationsEnabled, refresh]);

  useEffect(() => {
    if (!captureOpen) {
      requestAnimationFrame(() => addButtonRef.current?.focus());
      return;
    }
    requestAnimationFrame(() => {
      if (wizardStep === 0) {
        titleRef.current?.focus();
      } else if (wizardStep === 1) {
        followUpRef.current?.focus();
      } else {
        if (notesRef.current) {
          setRichNoteEditor(notesRef.current, form.notes);
        }
        notesRef.current?.focus();
      }
    });
  }, [captureOpen, wizardStep]);

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
        const followUp = toLocalDateTimeInput(
          payload.prefillFollowUpAt ?? null,
        );
        if (followUp) {
          if (dirty) {
            setCaptureOpen(true);
            setAnnouncement(
              "Existing draft kept. Its follow-up time was not replaced.",
            );
          } else {
            setEditingId(null);
            setDiscardRequested(false);
            setCaptureOpen(true);
            setWizardDirection("forward");
            setWizardStep(0);
            setForm({ ...emptyForm(activeScope), followUp });
            if (notesRef.current) {
              setRichNoteEditor(notesRef.current, []);
            }
            setAnnouncement(
              preferences.dueNotificationsEnabled
                ? "Reminder time prefilled. A notification will be requested when due while Attention Hub is running."
                : "Reminder time prefilled. Due notifications are off; enable them to receive an alert while Attention Hub is running.",
            );
          }
        }
        void refresh();
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
  }, [activeScope, dirty, preferences.dueNotificationsEnabled, refresh]);

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
    setCaptureOpen(false);
    setWizardDirection("forward");
    setWizardStep(0);
    setDiscardRequested(false);
    setError(null);
  };

  const startNewReminder = () => {
    setEditingId(null);
    setDiscardRequested(false);
    setError(null);
    setWizardDirection("forward");
    setWizardStep(0);
    setForm({
      ...emptyForm(activeScope),
      followUp: toLocalDateTimeInput(nextQuarterHour(new Date()).toISOString()),
    });
    if (notesRef.current) {
      setRichNoteEditor(notesRef.current, []);
    }
    setCaptureOpen(true);
    setAnnouncement("New reminder wizard opened.");
  };

  const moveWizard = (nextStep: ReminderWizardStep) => {
    setWizardDirection(nextStep > wizardStep ? "forward" : "back");
    setWizardStep(nextStep);
  };

  const submit = async () => {
    if (pending) {
      return;
    }
    if (!form.title.trim() || fromLocalDateTimeInput(form.followUp) === null) {
      setError("Enter what to remember and when to be reminded.");
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
      setAnnouncement(
        editingId ? "Reminder updated." : "Reminder saved.",
      );
      resetForm();
    } catch (nextError) {
      setError(String(nextError));
      requestAnimationFrame(() => titleRef.current?.focus());
    } finally {
      setPending(false);
    }
  };

  const editItem = (item: LaterInboxItem) => {
    setError(null);
    setEditingId(item.id);
    setForm({
      scope: item.scope,
      title: item.title,
      notes: item.notes,
      url: item.url ?? "",
      followUp: toLocalDateTimeInput(item.followUpAt),
    });
    setActiveScope(item.scope);
    setCaptureOpen(true);
    setWizardDirection("forward");
    setWizardStep(0);
    setDiscardRequested(false);
    setAnnouncement(`Editing ${item.title}.`);
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
      requestAnimationFrame(() => addButtonRef.current?.focus());
    } catch (nextError) {
      setError(String(nextError));
    } finally {
      setPending(false);
    }
  };

  const deleteItem = async (item: LaterInboxItem) => {
    setPending(true);
    setError(null);
    try {
      setSnapshot(
        await invoke<LaterInboxSnapshot>("delete_later_inbox_item", {
          itemId: item.id,
        }),
      );
      if (editingId === item.id) {
        resetForm();
      }
      setDeleteRequestedId(null);
      setAnnouncement(`${item.title} deleted.`);
      requestAnimationFrame(() => addButtonRef.current?.focus());
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
              disabled={captureOpen}
              key={scope}
              onClick={() => {
                setActiveScope(scope);
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

      <button
        className="later-add-reminder"
        disabled={captureOpen}
        onClick={startNewReminder}
        ref={addButtonRef}
        type="button"
      >
        {captureOpen ? "Reminder in progress" : "+ Add new reminder"}
      </button>

      {captureOpen && (
        <form
          className="later-capture later-wizard"
          onKeyDown={(event) => {
            if (event.ctrlKey && event.key === "Enter" && wizardStep === 2) {
              event.preventDefault();
              void submit();
            }
          }}
          onSubmit={(event) => {
            event.preventDefault();
            if (wizardStep === 2) {
              void submit();
            }
          }}
        >
          <ol aria-label="Reminder steps" className="later-wizard-progress">
            {["What", "When", "Details"].map((label, index) => (
              <li
                data-complete={wizardStep > index || undefined}
                key={label}
              >
                <button
                  aria-current={wizardStep === index ? "step" : undefined}
                  onClick={() => moveWizard(index as ReminderWizardStep)}
                  type="button"
                >
                  <span>{index + 1}</span>
                  <span>{label}</span>
                </button>
              </li>
            ))}
          </ol>

          <div
            className="later-wizard-step"
            data-direction={wizardDirection}
            key={wizardStep}
          >
            {wizardStep === 0 && (
              <>
                <h2>{editingId ? "What should change?" : "What to remind?"}</h2>
                <label className="sr-only" htmlFor="later-title">
                  Reminder
                </label>
                <input
                  aria-invalid={error ? true : undefined}
                  autoComplete="off"
                  id="later-title"
                  maxLength={160}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      title: event.target.value,
                    }))
                  }
                  placeholder="Short reminder"
                  ref={titleRef}
                  value={form.title}
                />
              </>
            )}

            {wizardStep === 1 && (
              <>
                <h2>When to remind?</h2>
                <label className="sr-only" htmlFor="later-follow-up">
                  Date and time
                </label>
                <input
                  id="later-follow-up"
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      followUp: event.target.value,
                    }))
                  }
                  ref={followUpRef}
                  required
                  type="datetime-local"
                  value={form.followUp}
                />
                <small>
                  {preferences.dueNotificationsEnabled
                    ? "A Windows notification will be requested at this time while Attention Hub is running."
                    : "Due notifications are off. Enable them above to receive an alert while Attention Hub is running."}
                </small>
              </>
            )}

            {wizardStep === 2 && (
              <>
                <h2>Any additional details?</h2>
                <label className="sr-only" id="later-notes-label">
                  Optional notes
                </label>
                <div
                  aria-describedby="later-context-help"
                  aria-invalid={notesOverLimit || undefined}
                  aria-labelledby="later-notes-label"
                  aria-multiline="true"
                  className="later-rich-notes"
                  contentEditable={!pending}
                  data-placeholder="Add context; linked words are preserved"
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
                {form.url && (
                  <small>
                    This existing reminder&apos;s saved link will be preserved.
                  </small>
                )}
                <div
                  aria-label="Reminder space"
                  className="later-wizard-scope"
                  role="group"
                >
                  {(["work", "private"] as const).map((scope) => (
                    <button
                      aria-pressed={form.scope === scope}
                      key={scope}
                      onClick={() =>
                        setForm((current) => ({ ...current, scope }))
                      }
                      type="button"
                    >
                      {scope === "work" ? "Work" : "Private"}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          <div className="later-wizard-actions">
            <button disabled={pending} onClick={resetForm} type="button">
              Cancel
            </button>
            {wizardStep > 0 && (
              <button
                disabled={pending}
                onClick={() =>
                  moveWizard((wizardStep - 1) as ReminderWizardStep)
                }
                type="button"
              >
                Back
              </button>
            )}
            {wizardStep < 2 ? (
              <button
                disabled={pending}
                onClick={() =>
                  moveWizard((wizardStep + 1) as ReminderWizardStep)
                }
                type="button"
              >
                Next
              </button>
            ) : (
              <button
                disabled={
                  pending ||
                  !form.title.trim() ||
                  fromLocalDateTimeInput(form.followUp) === null ||
                  notesOverLimit
                }
                type="submit"
              >
                {pending
                  ? "Saving…"
                  : editingId
                    ? "Update reminder"
                    : "Save reminder"}
              </button>
            )}
          </div>
        </form>
      )}

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
        <h2 id="later-open-heading">Reminders</h2>
        {snapshot === null && !error ? (
          <p>Loading local items…</p>
        ) : openItems.length === 0 ? (
          <p className="later-empty">No reminders are waiting.</p>
        ) : (
          <ol className="later-list">
            {openItems.map((item) => {
              const due = isLaterInboxItemDue(item, now);
              return (
                <li className="later-item" data-due={due || undefined} key={item.id}>
                  <button
                    aria-label={`Complete ${item.title}`}
                    className="later-item__complete"
                    disabled={pending}
                    onClick={() => void completeItem(item)}
                    title="Complete reminder"
                    type="button"
                  >
                    <svg aria-hidden="true" viewBox="0 0 24 24">
                      <path d="m5 12.5 4 4L19 7" />
                    </svg>
                  </button>
                  <div className="later-item__content">
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
                    {item.url && (
                      <button
                        className="later-item__link"
                        onClick={() => void openItemUrl(item)}
                        type="button"
                      >
                        Open link <span className="sr-only">in default browser</span>
                      </button>
                    )}
                  </div>
                  <div className="later-item__tools">
                    <button
                      aria-label={`Edit ${item.title}`}
                      disabled={pending}
                      onClick={() => editItem(item)}
                      title="Edit reminder"
                      type="button"
                    >
                      <svg aria-hidden="true" viewBox="0 0 24 24">
                        <path d="M4 20h4L19 9l-4-4L4 16v4ZM13.5 6.5l4 4" />
                      </svg>
                    </button>
                    <button
                      aria-label={`Delete ${item.title}`}
                      disabled={pending}
                      onClick={() => setDeleteRequestedId(item.id)}
                      title="Delete reminder"
                      type="button"
                    >
                      <svg aria-hidden="true" viewBox="0 0 24 24">
                        <path d="M4 7h16M9 7V4h6v3m-8 0 1 13h8l1-13M10 11v5m4-5v5" />
                      </svg>
                    </button>
                  </div>
                  {deleteRequestedId === item.id && (
                    <div className="later-item__delete-confirm" role="alert">
                      <span>Delete this reminder permanently?</span>
                      <button
                        disabled={pending}
                        onClick={() => void deleteItem(item)}
                        type="button"
                      >
                        Delete
                      </button>
                      <button
                        disabled={pending}
                        onClick={() => setDeleteRequestedId(null)}
                        type="button"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
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
