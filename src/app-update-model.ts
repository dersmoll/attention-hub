export const APP_UPDATE_CHECK_INTERVAL_MS = 4 * 60 * 60 * 1_000;
export const APP_UPDATE_INITIAL_DELAY_MS = 15_000;
export const APP_UPDATE_PROMPT_SNOOZE_MS = 24 * 60 * 60 * 1_000;
export const APP_UPDATE_PROMPT_STORAGE_KEY = "attention-hub.update-prompt.v1";

interface UpdatePromptRecord {
  version: string;
  dismissedAt: number;
}

export function parseUpdatePromptRecord(
  serialized: string | null,
): UpdatePromptRecord | null {
  if (!serialized) {
    return null;
  }

  try {
    const value = JSON.parse(serialized) as Partial<UpdatePromptRecord>;
    if (
      typeof value.version !== "string" ||
      value.version.length === 0 ||
      typeof value.dismissedAt !== "number" ||
      !Number.isFinite(value.dismissedAt)
    ) {
      return null;
    }
    return { version: value.version, dismissedAt: value.dismissedAt };
  } catch {
    return null;
  }
}

export function shouldPromptForUpdate(
  version: string,
  serialized: string | null,
  now = Date.now(),
) {
  const record = parseUpdatePromptRecord(serialized);
  return (
    record === null ||
    record.version !== version ||
    now - record.dismissedAt >= APP_UPDATE_PROMPT_SNOOZE_MS
  );
}

export function serializeUpdatePromptDismissal(
  version: string,
  dismissedAt = Date.now(),
) {
  return JSON.stringify({ version, dismissedAt } satisfies UpdatePromptRecord);
}

export function updateProgressPercent(
  downloadedBytes: number,
  totalBytes: number | null,
) {
  if (totalBytes === null || totalBytes <= 0) {
    return null;
  }
  return Math.min(
    100,
    Math.max(0, Math.round((downloadedBytes / totalBytes) * 100)),
  );
}
