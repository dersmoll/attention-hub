import {
  buildAttentionPanelModel,
  findSignal,
  type AttentionSignal,
  type AttentionSignalSnapshot,
  type AttentionSourceView,
  type TeamsMirrorStatus,
} from "./attention-model";

interface AttentionPanelProps {
  snapshot: AttentionSignalSnapshot | null;
  refreshError: string | null;
  consecutiveRefreshFailures: number;
  now: number;
  refreshing: boolean;
  onRefresh: () => void;
  teamsMirror: TeamsMirrorStatus | null;
  teamsMirrorPending: boolean;
  teamsMirrorError: string | null;
  onTeamsMirrorToggle: () => void;
}

function formatCapturedAt(value: string | null) {
  if (!value) {
    return "Not captured yet";
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Capture time unavailable"
    : `Updated ${date.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })}`;
}

function formatCount(signal: AttentionSignal | null) {
  if (signal?.count === null || signal === null) {
    return "Not exposed";
  }

  return signal.inferred ? `${signal.count} (inferred)` : String(signal.count);
}

function sourceStateLabel(source: AttentionSourceView) {
  if (source.observation.state === "observed") {
    if (source.needsAttention) {
      return "Needs attention";
    }
    return source.isClear ? "Clear" : "Not exposed";
  }

  const labels = {
    notRunning: "Not running",
    notExposed: "Not exposed",
    error: "Read failed",
  } as const;
  return labels[source.observation.state];
}

function SourceHeader({ source }: { source: AttentionSourceView }) {
  return (
    <header className="source-card__header">
      <h3>{source.observation.displayName}</h3>
      <span
        className="source-state"
        data-source-state={
          source.needsAttention
            ? "needsAttention"
            : source.isClear
              ? "observed"
              : source.observation.state === "observed"
                ? "notExposed"
                : source.observation.state
        }
      >
        {sourceStateLabel(source)}
      </span>
    </header>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="attention-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function TelegramCard({ source }: { source: AttentionSourceView }) {
  const applicationCounter = findSignal(
    source.observation,
    "applicationCounter",
  );
  const unreadChats = findSignal(source.observation, "unreadChats");

  return (
    <article className="source-card">
      <SourceHeader source={source} />
      <div className="attention-metrics">
        <Metric
          label="Application counter"
          value={formatCount(applicationCounter)}
        />
        <Metric label="Unread chats" value={formatCount(unreadChats)} />
      </div>
      <p className="source-card__meaning">
        Separate Telegram-owned measures; they are never added together.
      </p>
    </article>
  );
}

function OutlookCard({ source }: { source: AttentionSourceView }) {
  const inboxUnread = findSignal(source.observation, "inboxUnread");

  return (
    <article className="source-card">
      <SourceHeader source={source} />
      <div className="attention-metrics">
        <Metric label="Inbox unread" value={formatCount(inboxUnread)} />
      </div>
      <p className="source-card__meaning">
        Aggregate from explicit English Inbox accessibility labels.
      </p>
    </article>
  );
}

function mirrorStatus(status: TeamsMirrorStatus | null) {
  if (!status) {
    return "Reading mirror status";
  }
  if (status.lifecycle === "running" && status.visible) {
    return "Visual mirror is visible";
  }
  if (status.lifecycle === "hidden") {
    return "Mirror is waiting for an unambiguous Teams taskbar button";
  }
  if (status.lifecycle === "starting") {
    return "Starting visual mirror";
  }
  if (status.lifecycle === "error") {
    return status.diagnostic ?? "Visual mirror stopped with an error";
  }
  return "Visual mirror is stopped";
}

function TeamsCard({
  source,
  teamsMirror,
  teamsMirrorPending,
  teamsMirrorError,
  onTeamsMirrorToggle,
}: {
  source: AttentionSourceView;
  teamsMirror: TeamsMirrorStatus | null;
  teamsMirrorPending: boolean;
  teamsMirrorError: string | null;
  onTeamsMirrorToggle: () => void;
}) {
  const activity = findSignal(source.observation, "activityStatus");
  const activityLabel =
    activity?.needsAttention === true
      ? "New activity"
      : activity?.needsAttention === false
        ? "No new activity"
        : "Not exposed";

  return (
    <article className="source-card source-card--teams">
      <SourceHeader source={source} />
      <div className="attention-metrics">
        <Metric label="Activity" value={activityLabel} />
      </div>
      <p className="source-card__meaning">
        Qualitative Teams activity only; an exact count is not exposed.
      </p>
      <div className="mirror-control">
        <div>
          <strong>Taskbar visual mirror</strong>
          <small>{mirrorStatus(teamsMirror)}</small>
          <small>Visual only, primary taskbar, session only.</small>
        </div>
        <button
          disabled={teamsMirrorPending || teamsMirror === null}
          onClick={onTeamsMirrorToggle}
          type="button"
        >
          {teamsMirrorPending
            ? "Updating…"
            : teamsMirror?.enabled
              ? "Stop mirror"
              : "Show Teams visual"}
        </button>
      </div>
      {teamsMirrorError && (
        <p className="source-card__error">Mirror error: {teamsMirrorError}</p>
      )}
    </article>
  );
}

export function AttentionPanel({
  snapshot,
  refreshError,
  consecutiveRefreshFailures,
  now,
  refreshing,
  onRefresh,
  teamsMirror,
  teamsMirrorPending,
  teamsMirrorError,
  onTeamsMirrorToggle,
}: AttentionPanelProps) {
  const model = buildAttentionPanelModel(
    snapshot,
    refreshError,
    consecutiveRefreshFailures,
    now,
  );
  const [telegram, outlook, teams] = model.sources;

  return (
    <section className="attention-panel" aria-labelledby="attention-panel-title">
      <div
        className="attention-summary"
        data-summary-kind={model.kind}
        data-freshness={model.freshness}
        aria-live="polite"
      >
        <div>
          <p className="eyebrow" id="attention-panel-title">
            Current attention
          </p>
          <h2>{model.headline}</h2>
          <p>{model.detail}</p>
          <time dateTime={model.capturedAt ?? undefined}>
            {formatCapturedAt(model.capturedAt)}
          </time>
        </div>
        <button disabled={refreshing} onClick={onRefresh} type="button">
          {refreshing ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      <div className="source-grid">
        <TelegramCard source={telegram} />
        <OutlookCard source={outlook} />
        <TeamsCard
          source={teams}
          teamsMirror={teamsMirror}
          teamsMirrorPending={teamsMirrorPending}
          teamsMirrorError={teamsMirrorError}
          onTeamsMirrorToggle={onTeamsMirrorToggle}
        />
      </div>
    </section>
  );
}
