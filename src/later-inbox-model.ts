export const LATER_INBOX_CHANGED_EVENT = "later-inbox-changed";
export const LATER_INBOX_FOCUS_EVENT = "later-inbox-focus-control";
export const LATER_INBOX_OPEN_EVENT = "later-inbox-opened";

export type LaterInboxReturnWindow = "main" | "advanced";

export interface LaterInboxOpenPayload {
  returnFocusWindow: LaterInboxReturnWindow;
}

export interface LaterInboxItem {
  id: string;
  title: string;
  context: string | null;
  url: string | null;
  followUpAt: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface LaterInboxSnapshot {
  schemaVersion: 1;
  capturedAt: string;
  storagePath: string;
  recoveredFromBackup: boolean;
  items: LaterInboxItem[];
}

export interface LaterInboxInput {
  title: string;
  context: string | null;
  url: string | null;
  followUpAt: string | null;
}

export function isLaterInboxItemDue(item: LaterInboxItem, now: Date) {
  if (item.completedAt !== null || item.followUpAt === null) {
    return false;
  }
  const followUp = Date.parse(item.followUpAt);
  return Number.isFinite(followUp) && followUp <= now.getTime();
}

export function sortOpenLaterInboxItems(
  items: readonly LaterInboxItem[],
  now: Date,
) {
  return items
    .filter((item) => item.completedAt === null)
    .sort((first, second) => {
      const firstDue = isLaterInboxItemDue(first, now);
      const secondDue = isLaterInboxItemDue(second, now);
      if (firstDue !== secondDue) {
        return firstDue ? -1 : 1;
      }
      if (firstDue && secondDue) {
        return Date.parse(first.followUpAt ?? "") - Date.parse(second.followUpAt ?? "");
      }
      return Date.parse(first.createdAt) - Date.parse(second.createdAt);
    });
}

export function sortCompletedLaterInboxItems(
  items: readonly LaterInboxItem[],
) {
  return items
    .filter((item) => item.completedAt !== null)
    .sort(
      (first, second) =>
        Date.parse(second.completedAt ?? "") -
        Date.parse(first.completedAt ?? ""),
    );
}

export function toLocalDateTimeInput(value: string | null) {
  if (value === null) {
    return "";
  }
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return "";
  }
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export function fromLocalDateTimeInput(value: string) {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}
