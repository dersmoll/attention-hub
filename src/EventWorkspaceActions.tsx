import type { MouseEvent } from "react";
import type { WorkCalendarEventWorkspaceSummary } from "./work-calendar-model";

interface EventWorkspaceActionsProps {
  className: string;
  subject: string;
  workspace: WorkCalendarEventWorkspaceSummary | null;
  onOpenLink: () => void;
  onOpenStash: () => void;
  onOpenSettings: () => void;
}

export function EventWorkspaceActions({
  className,
  subject,
  workspace,
  onOpenLink,
  onOpenStash,
  onOpenSettings,
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
      {workspace?.projectId && (
        <button
          aria-label={`Open ${workspace.projectName ?? "project"} stash`}
          className="event-workspace-actions__button event-workspace-actions__stash"
          onClick={(event) => run(event, onOpenStash)}
          title={`Open ${workspace.projectName ?? "project"} stash`}
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
