export const ATTENTION_POLL_INTERVAL_MS = 5_000;
export const ATTENTION_STALE_AFTER_MS = ATTENTION_POLL_INTERVAL_MS * 3;

export type AttentionSourceKey = "telegram" | "outlook" | "teams";
export type AttentionSourceState =
  | "observed"
  | "notRunning"
  | "notExposed"
  | "error";

export interface AttentionSignalSnapshot {
  capturedAt: string;
  sources: AttentionSourceObservation[];
  signals: AttentionSignal[];
  diagnostics: string[];
}

export interface AttentionSourceObservation {
  sourceKey: string;
  displayName: string;
  state: AttentionSourceState;
  signals: AttentionSignal[];
  diagnostics: string[];
}

export interface AttentionSignal {
  sourceKey: string;
  displayName: string;
  kind: string;
  count: number | null;
  needsAttention: boolean | null;
  origin: string;
  rawLabel: string | null;
  confidence: string;
  inferred: boolean;
  meaning: string;
  diagnostics: string[];
}

export interface TaskbarMirrorStatus {
  sourceKey: "teams" | "telegram";
  displayName: string;
  lifecycle: string;
  enabled: boolean;
  visible: boolean;
  visualOnly: boolean;
  pollIntervalMs: number;
  taskbarCount: number;
  taskbarMonitor: string | null;
  diagnostic: string | null;
}

export type TeamsMirrorStatus = TaskbarMirrorStatus;

export type AttentionFreshness = "fresh" | "retrying" | "stale" | "failed";
export type AttentionSummaryKind =
  | "loading"
  | "needsAttention"
  | "allClear"
  | "noAttentionDetected"
  | "nothingObserved"
  | "failed";

export interface AttentionSourceView {
  key: AttentionSourceKey;
  observation: AttentionSourceObservation;
  needsAttention: boolean;
  isClear: boolean;
}

export interface AttentionPanelModel {
  kind: AttentionSummaryKind;
  freshness: AttentionFreshness;
  headline: string;
  detail: string;
  capturedAt: string | null;
  sources: AttentionSourceView[];
  observedCount: number;
}

const SOURCE_DEFINITIONS: ReadonlyArray<{
  key: AttentionSourceKey;
  displayName: string;
}> = [
  { key: "telegram", displayName: "Telegram" },
  { key: "outlook", displayName: "Microsoft Outlook" },
  { key: "teams", displayName: "Microsoft Teams" },
];

function missingObservation(
  key: AttentionSourceKey,
  displayName: string,
): AttentionSourceObservation {
  return {
    sourceKey: key,
    displayName,
    state: "error",
    signals: [],
    diagnostics: [
      "The native snapshot did not return the required structured source observation.",
    ],
  };
}

function sourceViews(
  snapshot: AttentionSignalSnapshot | null,
): AttentionSourceView[] {
  return SOURCE_DEFINITIONS.map(({ key, displayName }) => {
    const observation =
      snapshot?.sources.find((source) => source.sourceKey === key) ??
      missingObservation(key, displayName);
    const needsAttention =
      observation.state === "observed" &&
      observation.signals.some((signal) => signal.needsAttention === true);
    const isClear =
      observation.state === "observed" &&
      observation.signals.length > 0 &&
      observation.signals.every((signal) => signal.needsAttention === false);

    return { key, observation, needsAttention, isClear };
  });
}

function snapshotAge(snapshot: AttentionSignalSnapshot | null, now: number) {
  if (!snapshot) {
    return Number.POSITIVE_INFINITY;
  }

  const capturedAt = Date.parse(snapshot.capturedAt);
  return Number.isFinite(capturedAt)
    ? Math.max(0, now - capturedAt)
    : Number.POSITIVE_INFINITY;
}

export function buildAttentionPanelModel(
  snapshot: AttentionSignalSnapshot | null,
  refreshError: string | null,
  consecutiveRefreshFailures: number,
  now: number,
): AttentionPanelModel {
  const sources = sourceViews(snapshot);
  const observedCount = sources.filter(
    ({ observation }) => observation.state === "observed",
  ).length;
  const attentionSources = sources.filter(({ needsAttention }) => needsAttention);
  const failedSourceCount = sources.filter(
    ({ observation }) => observation.state === "error",
  ).length;
  const age = snapshotAge(snapshot, now);
  let freshness: AttentionFreshness = "fresh";

  if (!snapshot) {
    freshness = refreshError ? "failed" : "fresh";
  } else if (
    age > ATTENTION_STALE_AFTER_MS ||
    consecutiveRefreshFailures >= 2
  ) {
    freshness = "stale";
  } else if (refreshError) {
    freshness = "retrying";
  }

  if (!snapshot) {
    return {
      kind: refreshError ? "failed" : "loading",
      freshness,
      headline: refreshError
        ? "Attention signals unavailable"
        : "Reading attention signals",
      detail: refreshError
        ? "No usable attention snapshot is available. See technical diagnostics."
        : "Checking Telegram, Outlook, and Teams.",
      capturedAt: null,
      sources,
      observedCount,
    };
  }

  const freshnessDetail =
    freshness === "stale"
      ? "Data is stale."
      : freshness === "retrying"
        ? "Refresh failed once; retrying with the last result visible."
        : "Data is current.";
  const coverageDetail = `${observedCount}/3 sources observed.`;

  if (attentionSources.length > 0) {
    return {
      kind: "needsAttention",
      freshness,
      headline: "Needs attention",
      detail: `${attentionSources
        .map(({ observation }) => observation.displayName)
        .join(", ")} reported attention. ${coverageDetail} ${freshnessDetail}`,
      capturedAt: snapshot.capturedAt,
      sources,
      observedCount,
    };
  }

  if (freshness === "stale" || freshness === "retrying") {
    return {
      kind: "noAttentionDetected",
      freshness,
      headline:
        freshness === "stale" ? "Attention state is stale" : "Refresh retrying",
      detail: `The last result contained no attention signal. ${coverageDetail} ${freshnessDetail}`,
      capturedAt: snapshot.capturedAt,
      sources,
      observedCount,
    };
  }

  if (observedCount === SOURCE_DEFINITIONS.length && sources.every(({ isClear }) => isClear)) {
    return {
      kind: "allClear",
      freshness,
      headline: "All clear",
      detail: `All 3 sources are observed and currently clear. ${freshnessDetail}`,
      capturedAt: snapshot.capturedAt,
      sources,
      observedCount,
    };
  }

  if (observedCount === 0) {
    return {
      kind: failedSourceCount > 0 ? "failed" : "nothingObserved",
      freshness,
      headline:
        failedSourceCount > 0 ? "Attention read failed" : "Nothing observed",
      detail:
        failedSourceCount > 0
          ? `No source returned readable attention state; ${failedSourceCount} source read${failedSourceCount === 1 ? "" : "s"} failed.`
          : `No monitored source returned a readable signal. ${freshnessDetail}`,
      capturedAt: snapshot.capturedAt,
      sources,
      observedCount,
    };
  }

  return {
    kind: "noAttentionDetected",
    freshness,
    headline: "No attention detected",
    detail: `${coverageDetail} Unavailable sources prevent an all-clear claim. ${freshnessDetail}`,
    capturedAt: snapshot.capturedAt,
    sources,
    observedCount,
  };
}

export function findSignal(
  source: AttentionSourceObservation,
  kind: string,
) {
  return source.signals.find((signal) => signal.kind === kind) ?? null;
}
