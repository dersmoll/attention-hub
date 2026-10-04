export const AUXILIARY_WINDOW_READY_EVENT = "auxiliary-window-ready";
export const AUXILIARY_WINDOW_FAILURE_EVENT = "auxiliary-window-failed";
export const AUXILIARY_WINDOW_DEADLINE_MS = 10_000;

export class AuxiliaryWindowDeadlineError extends Error {}

export interface AuxiliaryWindowReady {
  label: string;
  requestId: string;
}

export async function withWindowDeadline<T>(
  operation: () => Promise<T>,
  timeoutMs = AUXILIARY_WINDOW_DEADLINE_MS,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new AuxiliaryWindowDeadlineError()), timeoutMs);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/** Dispatch success is insufficient: the new React surface must announce its
 * own request id. Install the listener first, and dispose it even if listener
 * registration itself finishes after the deadline. */
export async function createReadyAuxiliaryWindow<T>(ports: {
  label: string;
  requestId: string;
  subscribe: (ready: (payload: AuxiliaryWindowReady) => void) => Promise<() => void>;
  create: () => Promise<void>;
  resolveWindow: () => Promise<T>;
  timeoutMs?: number;
}): Promise<T> {
  let active = true;
  let announce: () => void = () => undefined;
  const ready = new Promise<void>((resolve) => { announce = resolve; });
  const registration = ports.subscribe((payload) => {
    if (active && payload.label === ports.label && payload.requestId === ports.requestId) announce();
  });
  try {
    return await withWindowDeadline(async () => {
      await registration;
      if (!active) throw new AuxiliaryWindowDeadlineError();
      await ports.create();
      if (!active) throw new AuxiliaryWindowDeadlineError();
      await ready;
      if (!active) throw new AuxiliaryWindowDeadlineError();
      return ports.resolveWindow();
    }, ports.timeoutMs);
  } finally {
    active = false;
    void registration.then((stop) => stop()).catch(() => undefined);
  }
}

const WINDOW_NAMES: Record<string, string> = {
  "todo-popup": "To-dos", today: "Today", "medicine-panel": "Medicine", medicine: "Medicine manager",
  advanced: "Settings", manager: "Project Hub", "sticky-note": "Sticky note",
  "event-settings": "Event settings", "project-panel": "Project details", update: "Update window",
};

export function auxiliaryWindowFailureMessage(label: string) {
  return `${WINDOW_NAMES[label] ?? "The window"} could not be opened. If this continues, close and reopen Attention Hub, then try again.`;
}
