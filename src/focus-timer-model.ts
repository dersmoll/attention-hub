export const FOCUS_TIMER_STORAGE_KEY = "attention-hub.focus-timer.v1";
const MAX_FOCUS_TIMER_MS = 365 * 24 * 60 * 60 * 1_000;

export interface FocusTimerState {
  elapsedMs: number;
  startedAtUnixMs: number | null;
}

export const EMPTY_FOCUS_TIMER: FocusTimerState = {
  elapsedMs: 0,
  startedAtUnixMs: null,
};

function boundedMilliseconds(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.min(MAX_FOCUS_TIMER_MS, Math.max(0, Math.trunc(value)));
}

export function normalizeFocusTimerState(
  value: Partial<FocusTimerState> | null | undefined,
  now = Date.now(),
): FocusTimerState {
  const startedAtUnixMs =
    typeof value?.startedAtUnixMs === "number" &&
    Number.isFinite(value.startedAtUnixMs) &&
    value.startedAtUnixMs >= 0
      ? Math.min(Math.trunc(value.startedAtUnixMs), now)
      : null;
  return {
    elapsedMs: boundedMilliseconds(value?.elapsedMs),
    startedAtUnixMs,
  };
}

export function focusTimerElapsedMs(state: FocusTimerState, now = Date.now()) {
  const runningMs =
    state.startedAtUnixMs === null ? 0 : Math.max(0, now - state.startedAtUnixMs);
  return boundedMilliseconds(state.elapsedMs + runningMs);
}

export function startFocusTimer(
  state: FocusTimerState,
  now = Date.now(),
): FocusTimerState {
  if (state.startedAtUnixMs !== null) return state;
  return { ...state, startedAtUnixMs: now };
}

export function pauseFocusTimer(
  state: FocusTimerState,
  now = Date.now(),
): FocusTimerState {
  if (state.startedAtUnixMs === null) return state;
  return {
    elapsedMs: focusTimerElapsedMs(state, now),
    startedAtUnixMs: null,
  };
}

export function resetFocusTimer(): FocusTimerState {
  return { ...EMPTY_FOCUS_TIMER };
}

export function formatFocusTimer(elapsedMs: number) {
  const totalSeconds = Math.floor(boundedMilliseconds(elapsedMs) / 1_000);
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds]
    .map((part) => String(part).padStart(2, "0"))
    .join(":");
}

export function readFocusTimerState(
  storage: Pick<Storage, "getItem"> = localStorage,
  now = Date.now(),
) {
  try {
    const value = JSON.parse(
      storage.getItem(FOCUS_TIMER_STORAGE_KEY) ?? "null",
    ) as Partial<FocusTimerState> | null;
    return normalizeFocusTimerState(value, now);
  } catch {
    return resetFocusTimer();
  }
}

export function writeFocusTimerState(
  state: FocusTimerState,
  storage: Pick<Storage, "setItem"> = localStorage,
) {
  const normalized = normalizeFocusTimerState(state);
  try {
    storage.setItem(FOCUS_TIMER_STORAGE_KEY, JSON.stringify(normalized));
  } catch {
    // The in-memory stopwatch remains usable when browser storage is unavailable.
  }
  return normalized;
}
