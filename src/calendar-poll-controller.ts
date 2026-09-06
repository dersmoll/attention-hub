type TimerHandle = ReturnType<typeof setTimeout>;

type CalendarPollControllerOptions<T> = {
  refresh: () => Promise<T>;
  nextDelay: (result: T) => number;
  setTimer?: (callback: () => void, delay: number) => TimerHandle;
  clearTimer?: (timer: TimerHandle) => void;
};

/**
 * Owns one polling chain. External refresh requests while a request is in
 * flight are coalesced into one follow-up request instead of starting a
 * competing timer chain.
 */
export function createCalendarPollController<T>({
  refresh,
  nextDelay,
  setTimer = (callback, delay) => setTimeout(callback, delay),
  clearTimer = (timer) => clearTimeout(timer),
}: CalendarPollControllerOptions<T>) {
  let disposed = false;
  let inFlight = false;
  let refreshQueued = false;
  let timer: TimerHandle | undefined;

  const clearScheduledPoll = () => {
    if (timer !== undefined) {
      clearTimer(timer);
      timer = undefined;
    }
  };

  const poll = async (): Promise<void> => {
    if (disposed) return;
    if (inFlight) {
      refreshQueued = true;
      return;
    }

    inFlight = true;
    let result: T;
    try {
      result = await refresh();
    } finally {
      inFlight = false;
    }

    if (disposed) return;
    if (refreshQueued) {
      refreshQueued = false;
      void poll();
      return;
    }

    timer = setTimer(() => {
      timer = undefined;
      void poll();
    }, nextDelay(result!));
  };

  return {
    start: () => void poll(),
    requestRefresh: () => {
      clearScheduledPoll();
      void poll();
    },
    dispose: () => {
      disposed = true;
      refreshQueued = false;
      clearScheduledPoll();
    },
  };
}
