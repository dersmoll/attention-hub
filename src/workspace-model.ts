export const WORKSPACE_CHANGED_EVENT = "workspace-changed";
export const WORKSPACE_SCHEMA_VERSION = 1;

export type ActionItemOwnerKind = "project" | "list";
export type ProjectLinkKind =
  | "staging" | "production" | "design" | "docs" | "board" | "repo" | "other";

export interface NoteSegment { text: string; href: string | null; }
export interface PersonalCategory { id: string; name: string; sortIndex: number; createdAt: string; updatedAt: string; }
export interface WorkspaceProject { id: string; name: string; notes: NoteSegment[]; notesRevision: number; archivedAt: string | null; sortIndex: number; createdAt: string; updatedAt: string; }
export interface WorkspaceList { id: string; categoryId: string | null; name: string; sortIndex: number; createdAt: string; updatedAt: string; }
export interface ProjectLink { id: string; projectId: string; label: string; url: string; kind: ProjectLinkKind; sortIndex: number; createdAt: string; updatedAt: string; }
export interface ActionItem { id: string; ownerKind: ActionItemOwnerKind; ownerId: string; title: string; notes: NoteSegment[]; dueOn: string | null; remindAt: string | null; notifiedRemindAt: string | null; completedAt: string | null; createdAt: string; updatedAt: string; }
export interface WorkspaceBinding { eventKey: string; projectId: string | null; listId: string | null; projectLinkId: string | null; linkUrl: string | null; createdAt: string; updatedAt: string; }
export interface WorkspaceSnapshot { schemaVersion: 1; revision: number; capturedAt: string; storagePath: string; recoveredFromBackup: boolean; categories: PersonalCategory[]; projects: WorkspaceProject[]; lists: WorkspaceList[]; links: ProjectLink[]; actionItems: ActionItem[]; bindings: WorkspaceBinding[]; }
export interface WorkspaceTransferCounts { categories: number; projects: number; lists: number; links: number; actionItems: number; bindings: number; }
export interface WorkspaceImportPreview { schemaVersion: 1; exportedAt: string; digest: string; workspaceRevision: number; counts: WorkspaceTransferCounts; }
export interface DeleteImpactCounts { categories: number | null; projects: number | null; lists: number | null; links: number | null; actionItems: number | null; bindings: number | null; }
export interface DeleteImpact { entity: string; id: string | null; name: string | null; counts: DeleteImpactCounts; workspaceRevision: number; }

export function localDateKey(value: Date) {
  const year = value.getFullYear();
  const month = `${value.getMonth() + 1}`.padStart(2, "0");
  const day = `${value.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function isOverdue(item: ActionItem, now: Date) {
  return item.completedAt === null && item.dueOn !== null && item.dueOn < localDateKey(now);
}
export function isDueToday(item: ActionItem, now: Date) {
  return item.completedAt === null && item.dueOn === localDateKey(now);
}
export function isReminderToday(item: ActionItem, now: Date) {
  if (item.completedAt !== null || item.remindAt === null) return false;
  const at = new Date(item.remindAt);
  return Number.isFinite(at.getTime()) && localDateKey(at) === localDateKey(now);
}
export function isReminderReached(item: ActionItem, now: Date) {
  return item.completedAt === null && item.remindAt !== null && Date.parse(item.remindAt) <= now.getTime();
}
export function isUnscheduled(item: ActionItem) {
  return item.completedAt === null && item.dueOn === null && item.remindAt === null;
}
export function isActionable(item: ActionItem, now: Date) {
  return isOverdue(item, now) || isDueToday(item, now) || isReminderToday(item, now) || isReminderReached(item, now);
}
function hasTodayScheduleContext(item: ActionItem, now: Date) {
  const today = localDateKey(now);
  const dueIsRelevant = item.dueOn !== null && item.dueOn <= today;
  if (item.remindAt === null) return dueIsRelevant;
  const reminder = new Date(item.remindAt);
  return dueIsRelevant || (Number.isFinite(reminder.getTime()) && (localDateKey(reminder) <= today || reminder.getTime() <= now.getTime()));
}
export function isVisibleInToday(item: ActionItem, now: Date) {
  if (!hasTodayScheduleContext(item, now)) return false;
  if (item.completedAt === null) return true;
  const completed = new Date(item.completedAt);
  return Number.isFinite(completed.getTime()) && localDateKey(completed) === localDateKey(now);
}
export function deferActionItemToTomorrow(item: ActionItem, now: Date) {
  const today = localDateKey(now);
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowKey = localDateKey(tomorrow);
  let remindAt = item.remindAt;
  if (remindAt !== null) {
    const reminder = new Date(remindAt);
    if (Number.isFinite(reminder.getTime()) && localDateKey(reminder) <= today) {
      reminder.setFullYear(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate());
      remindAt = reminder.toISOString();
    }
  }
  return {
    dueOn: item.dueOn !== null && item.dueOn <= today ? tomorrowKey : item.dueOn,
    remindAt,
  };
}
export function needsAttention(item: ActionItem, now: Date) {
  return isOverdue(item, now) || isReminderReached(item, now);
}
export function isFromActiveOwner(item: ActionItem, snapshot: WorkspaceSnapshot) {
  return item.ownerKind === "list"
    || snapshot.projects.some((project) => project.id === item.ownerId && project.archivedAt === null);
}
export function hasUnsavedNoteChanges(currentText: string, savedText: string) {
  return currentText !== savedText;
}
export function effectiveAt(item: ActionItem) {
  const dueAt = item.dueOn === null
    ? null
    : new Date(`${item.dueOn}T23:59:59.999`).getTime();
  const reminderAt = item.remindAt === null ? null : Date.parse(item.remindAt);
  const candidates = [dueAt, reminderAt].filter((value): value is number => value !== null && Number.isFinite(value));
  return candidates.length > 0 ? Math.min(...candidates) : null;
}
export function sortActionItems(items: readonly ActionItem[]) {
  return [...items].sort((first, second) => {
    if ((first.completedAt === null) !== (second.completedAt === null)) return first.completedAt === null ? -1 : 1;
    const firstAt = effectiveAt(first); const secondAt = effectiveAt(second);
    if (firstAt !== null && secondAt !== null) return firstAt - secondAt || first.createdAt.localeCompare(second.createdAt);
    if (firstAt !== null) return -1;
    if (secondAt !== null) return 1;
    return first.createdAt.localeCompare(second.createdAt);
  });
}
