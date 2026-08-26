import { getVersion } from "@tauri-apps/api/app";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  APP_UPDATE_PROMPT_STORAGE_KEY,
  serializeUpdatePromptDismissal,
  updateProgressPercent,
} from "./app-update-model";

type UpdateState =
  | "checking"
  | "current"
  | "available"
  | "downloading"
  | "restarting"
  | "error";

interface AppUpdatePanelProps {
  variant: "dialog" | "settings";
}

export function AppUpdatePanel({ variant }: AppUpdatePanelProps) {
  const [state, setState] = useState<UpdateState>("checking");
  const [currentVersion, setCurrentVersion] = useState<string | null>(null);
  const [availableVersion, setAvailableVersion] = useState<string | null>(null);
  const [releaseNotes, setReleaseNotes] = useState<string | null>(null);
  const [downloadedBytes, setDownloadedBytes] = useState(0);
  const [totalBytes, setTotalBytes] = useState<number | null>(null);
  const updateRef = useRef<Update | null>(null);
  const installingRef = useRef(false);

  const releaseUpdate = useCallback(async () => {
    const update = updateRef.current;
    updateRef.current = null;
    if (update) {
      await update.close().catch(() => undefined);
    }
  }, []);

  const checkNow = useCallback(async () => {
    setState("checking");
    setDownloadedBytes(0);
    setTotalBytes(null);
    await releaseUpdate();

    try {
      const [version, update] = await Promise.all([
        getVersion(),
        check({ timeout: 30_000 }),
      ]);
      setCurrentVersion(version);
      updateRef.current = update;
      if (!update) {
        setAvailableVersion(null);
        setReleaseNotes(null);
        setState("current");
        return;
      }
      setAvailableVersion(update.version);
      setReleaseNotes(update.body?.trim() || null);
      setState("available");
    } catch {
      setState("error");
    }
  }, [releaseUpdate]);

  useEffect(() => {
    void checkNow();
    return () => {
      if (!installingRef.current) {
        void releaseUpdate();
      }
    };
  }, [checkNow, releaseUpdate]);

  useEffect(() => {
    if (variant !== "dialog") {
      return;
    }
    let unlisten: (() => void) | undefined;
    void getCurrentWindow()
      .onCloseRequested((event) => {
        if (installingRef.current) {
          event.preventDefault();
        }
      })
      .then((nextUnlisten) => {
        unlisten = nextUnlisten;
      });
    return () => unlisten?.();
  }, [variant]);

  const installUpdate = async () => {
    const update = updateRef.current;
    if (!update || installingRef.current) {
      return;
    }

    installingRef.current = true;
    setState("downloading");
    setDownloadedBytes(0);
    setTotalBytes(null);
    try {
      await update.downloadAndInstall((event) => {
        if (event.event === "Started") {
          setTotalBytes(event.data.contentLength ?? null);
        } else if (event.event === "Progress") {
          setDownloadedBytes((value) => value + event.data.chunkLength);
        }
      });
      setState("restarting");
    } catch {
      installingRef.current = false;
      setState("error");
    }
  };

  const dismiss = async () => {
    if (availableVersion) {
      window.localStorage.setItem(
        APP_UPDATE_PROMPT_STORAGE_KEY,
        serializeUpdatePromptDismissal(availableVersion),
      );
    }
    await releaseUpdate();
    await getCurrentWindow().close();
  };

  const progress = updateProgressPercent(downloadedBytes, totalBytes);
  const title =
    state === "available" || state === "downloading" || state === "restarting"
      ? `Attention Hub ${availableVersion ?? "update"} is available`
      : state === "current"
        ? "Attention Hub is up to date"
        : state === "error"
          ? "Update check unavailable"
          : "Checking for updates";

  return (
    <section
      aria-busy={state === "checking" || state === "downloading"}
      className={`app-update-panel app-update-panel--${variant}`}
    >
      <div className="app-update-mark" aria-hidden="true">
        ↑
      </div>
      <div className="app-update-content">
        <h2>{title}</h2>
        {state === "checking" && <p>Contacting the signed beta update feed…</p>}
        {state === "current" && (
          <p>
            You are running the newest available beta
            {currentVersion ? `, v${currentVersion}` : ""}.
          </p>
        )}
        {state === "available" && (
          <>
            <p>
              Installed: v{currentVersion ?? "unknown"}. The update is downloaded
              only after you choose <strong>Update now</strong>.
            </p>
            {releaseNotes && <p className="app-update-notes">{releaseNotes}</p>}
          </>
        )}
        {state === "downloading" && (
          <div aria-live="polite" className="app-update-progress">
            <progress max={100} value={progress ?? undefined} />
            <span>
              {progress === null
                ? "Downloading update…"
                : `Downloading… ${progress}%`}
            </span>
          </div>
        )}
        {state === "restarting" && (
          <p>Update downloaded. Attention Hub is restarting…</p>
        )}
        {state === "error" && (
          <p>
            The signed update feed could not be checked or installed. Your
            current version was not changed.
          </p>
        )}
        <div className="app-update-actions">
          {state === "available" && (
            <button onClick={() => void installUpdate()} type="button">
              Update now
            </button>
          )}
          {(state === "current" || state === "error") && (
            <button onClick={() => void checkNow()} type="button">
              Check again
            </button>
          )}
          {variant === "dialog" &&
            state !== "downloading" &&
            state !== "restarting" && (
              <button
                className="app-update-secondary"
                onClick={() => void dismiss()}
                type="button"
              >
                {state === "available" ? "Later" : "Close"}
              </button>
            )}
        </div>
      </div>
    </section>
  );
}
