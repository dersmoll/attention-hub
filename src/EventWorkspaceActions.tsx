import type { MouseEvent } from "react";
import type { WorkCalendarEventWorkspaceSummary } from "./work-calendar-model";

interface EventWorkspaceActionsProps {
  className: string;
  subject: string;
  workspace: WorkCalendarEventWorkspaceSummary | null;
  onOpenLink: () => void;
  onOpenNotes?: () => void;
  onOpenProject?: () => void;
  onOpenTodos?: () => void;
  onOpenSettings: () => void;
  pendingTodoCount?: number;
}

export function EventWorkspaceActions({
  className,
  subject,
  workspace,
  onOpenLink,
  onOpenNotes,
  onOpenProject,
  onOpenTodos,
  onOpenSettings,
  pendingTodoCount,
}: EventWorkspaceActionsProps) {
  const run = (
    event: MouseEvent<HTMLButtonElement>,
    action: () => void,
  ) => {
    event.stopPropagation();
    action();
  };

  return (
    <span className={`event-workspace-actions ${className}`}>
      {workspace?.projectId && onOpenTodos && pendingTodoCount !== undefined && pendingTodoCount > 0 && (
        <button
          aria-label={`Open ${pendingTodoCount} pending to-do${pendingTodoCount === 1 ? "" : "s"} for ${workspace.projectName ?? "project"}`}
          className="event-workspace-actions__button event-workspace-actions__todos"
          onClick={(event) => run(event, onOpenTodos)}
          title={`${pendingTodoCount} pending to-do${pendingTodoCount === 1 ? "" : "s"}`}
          type="button"
        >
          {pendingTodoCount}
        </button>
      )}
      {workspace?.linkUrlPresent && (
        <button
          aria-label={`Open saved link for ${subject}`}
          className="event-workspace-actions__button event-workspace-actions__link"
          onClick={(event) => run(event, onOpenLink)}
          title={workspace.linkUrl ?? "Open saved event link"}
          type="button"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24">
            <path d="M14 5h5v5M19 5l-9 9M10 6H6a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1v-4" />
          </svg>
        </button>
      )}
      {workspace?.notesPresent && onOpenNotes && (
        <button
          aria-label={`Open notes for ${workspace.projectName ?? "project"}`}
          className="event-workspace-actions__button event-workspace-actions__notes"
          onClick={(event) => run(event, onOpenNotes)}
          title={`Notes for ${workspace.projectName ?? "project"}`}
          type="button"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24">
            <path d="M5 4h14v16H5zM8 8h8M8 12h8M8 16h5" />
          </svg>
        </button>
      )}
      {workspace?.projectId && onOpenProject && (
        <button
          aria-label={`Open ${workspace.projectName ?? "project"}`}
          className="event-workspace-actions__button event-workspace-actions__stash"
          onClick={(event) => run(event, onOpenProject)}
          title={`Open ${workspace.projectName ?? "project"}`}
          type="button"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24">
            <path d="M5 5h14v14H5zM8 9h8M8 13h6" />
          </svg>
        </button>
      )}
      <button
        aria-label={`Open settings for ${subject}`}
        className="event-workspace-actions__button event-workspace-actions__settings"
        onClick={(event) => run(event, onOpenSettings)}
        title="Event settings"
        type="button"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <circle cx="6" cy="12" r="1.2" fill="currentColor" stroke="none" />
          <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" />
          <circle cx="18" cy="12" r="1.2" fill="currentColor" stroke="none" />
        </svg>
      </button>
    </span>
  );
}
