export const ZOOM_MEETING_POLL_INTERVAL_MS = 2_000;
export const ZOOM_MEETING_MISSES_TO_HIDE = 2;

export type ZoomMeetingSnapshot = {
  state: "inactive" | "live" | "uncertain";
  minimized: boolean;
  candidateCount: number;
};

export type ZoomMeetingPresence = {
  visible: boolean;
  minimized: boolean;
  misses: number;
};

export const INITIAL_ZOOM_MEETING_PRESENCE: ZoomMeetingPresence = {
  visible: false,
  minimized: false,
  misses: 0,
};

export function nextZoomMeetingPresence(
  current: ZoomMeetingPresence,
  snapshot: ZoomMeetingSnapshot,
): ZoomMeetingPresence {
  if (snapshot.state === "live") {
    return {
      visible: true,
      minimized: snapshot.minimized,
      misses: 0,
    };
  }
  if (!current.visible) {
    return INITIAL_ZOOM_MEETING_PRESENCE;
  }
  const misses = current.misses + 1;
  if (misses >= ZOOM_MEETING_MISSES_TO_HIDE) {
    return INITIAL_ZOOM_MEETING_PRESENCE;
  }
  return { ...current, misses };
}
