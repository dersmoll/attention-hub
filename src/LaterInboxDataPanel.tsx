import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  LATER_INBOX_CHANGED_EVENT,
  LATER_INBOX_FOCUS_EVENT,
  sortCompletedLaterInboxItems,
  sortOpenLaterInboxItems,
  type LaterInboxSnapshot,
} from "./later-inbox-model";
import { openLaterInboxWindow } from "./later-inbox-window";

export function LaterInboxDataPanel() {
  const [snapshot, setSnapshot] = useState<LaterInboxSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);
  const openButtonRef = useRef<HTMLButtonElement>(null);
  const openCount = useMemo(
    () => sortOpenLaterInboxItems(snapshot?.items ?? [], new Date()).length,
    [snapshot?.items],
  );
  const completedCount = useMemo(
    () => sortCompletedLaterInboxItems(snapshot?.items ?? []).length,
    [snapshot?.items],
  );

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

  useEffect(() => {
    void refresh();
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
    let disposed = false;
    let stopListening: (() => void) | undefined;
    void listen(LATER_INBOX_FOCUS_EVENT, () => {
      if (!disposed) {
        requestAnimationFrame(() => openButtonRef.current?.focus());
      }
    }).then((unlisten) => {
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
  }, []);

  const mutate = async (command: string) => {
    setPending(true);
    setError(null);
    try {
      setSnapshot(await invoke<LaterInboxSnapshot>(command));
      setConfirmDeleteAll(false);
    } catch (nextError) {
      setError(String(nextError));
    } finally {
      setPending(false);
    }
  };

  return (
    <section aria-labelledby="later-data-heading" className="later-data-panel">
      <p className="eyebrow">Personal local queue</p>
      <h2 id="later-data-heading">Later Inbox data</h2>
      <p>
        {openCount} open and {completedCount} completed. These user-owned items
        are separate from source attention coverage and never affect All clear.
      </p>
      <div className="later-data-card">
        <p>
          Stored as schema-v2 JSON for this Windows user, with automatic v1
          migration and one previous valid local backup. No cloud sync or
          Windows reminder is created.
        </p>
        {snapshot?.storagePath && (
          <p>
            Data file: <code>{snapshot.storagePath}</code>
          </p>
        )}
        {snapshot?.recoveredFromBackup && (
          <p className="later-recovery" role="status">
            The previous valid backup is currently being shown.
          </p>
        )}
        <div className="actions">
          <button
            onClick={() =>
              void openLaterInboxWindow(
                (message) => setError(message),
                "advanced",
              )
            }
            ref={openButtonRef}
            type="button"
          >
            Open Later Inbox
          </button>
          <button
            disabled={pending || completedCount === 0}
            onClick={() => void mutate("delete_completed_later_inbox_items")}
            type="button"
          >
            Delete completed items
          </button>
          {!confirmDeleteAll ? (
            <button
              disabled={pending || (openCount === 0 && completedCount === 0)}
              onClick={() => setConfirmDeleteAll(true)}
              type="button"
            >
              Delete all Later Inbox data…
            </button>
          ) : (
            <span className="later-delete-confirm" role="group" aria-label="Confirm deletion">
              <button
                disabled={pending}
                onClick={() => void mutate("delete_all_later_inbox_items")}
                type="button"
              >
                Permanently delete all
              </button>
              <button onClick={() => setConfirmDeleteAll(false)} type="button">
                Cancel
              </button>
            </span>
          )}
        </div>
      </div>
      {error && <p className="error" role="alert">Later Inbox: {error}</p>}
    </section>
  );
}
