import type {
  WorkAttentionState,
  WorkGraphEvidenceAttachment,
  WorkGraphGateDecorator,
  WorkGraphLayer,
  WorkGraphLink,
  WorkGraphLinkEndpointRef,
  WorkGraphObjectKind,
  WorkGraphObjectSummary,
  WorkGraphProjection,
  WorkTaskProductBinding,
} from "./types";
import type { MessageKey } from "../../../../../shared/i18n/index.js";

export {
  endpointKey,
  projectLinks,
  type LinkProjectionResult,
} from "../../../shared/workGraphProjection.js";

const WORKGRAPH_KIND_LABEL_KEY: Record<WorkGraphObjectKind, MessageKey> = {
  agent: "workObjectKindAgent",
  container: "workObjectKindContainer",
  conversation: "workObjectKindConversation",
  turn: "workObjectKindTurn",
  lane: "workObjectKindLane",
  project: "workObjectKindProject",
  work_item: "workObjectKindWorkItem",
  task: "workObjectKindTask",
  mission: "workObjectKindMission",
  run: "workObjectKindRun",
  artifact: "workObjectKindArtifact",
  activity: "workObjectKindActivity",
  outcome: "workObjectKindOutcome",
  approval_binding: "workObjectKindApprovalBinding",
};

const WORKGRAPH_ATTENTION_LABEL_KEY: Partial<
  Record<WorkAttentionState, MessageKey>
> = {
  decision_needed: "workObjectAttentionDecisionNeeded",
  blocked: "workObjectAttentionBlocked",
  failed: "workObjectAttentionFailed",
  ready_to_review: "workObjectAttentionReadyToReview",
  recently_shipped: "workObjectAttentionRecentlyShipped",
};

const WORKGRAPH_EVIDENCE_RELATION_LABEL_KEY: Record<
  WorkGraphEvidenceAttachment["relation"],
  MessageKey
> = {
  artifact: "workObjectKindArtifact",
  activity: "workObjectKindActivity",
  outcome: "workObjectKindOutcome",
};

const WORKGRAPH_LAYER_LABEL_KEY: Record<WorkGraphLayer, MessageKey> = {
  interaction: "workTopdownSystemMapLayerInteractionLabel",
  planning: "workTopdownSystemMapLayerPlanningLabel",
  execution: "workTopdownSystemMapLayerExecutionLabel",
};

const WORK_TASK_PRODUCT_BINDING_LABEL_KEY: Record<
  WorkTaskProductBinding,
  MessageKey
> = {
  work: "platformProductWorkSettingsLabel",
  code: "platformProductCodeSettingsLabel",
  chat: "platformProductChatSettingsLabel",
  unbound: "workTopdownTaskProductBindingUnbound",
};

export function getWorkGraphKindLabel(
  kind: WorkGraphObjectKind,
  t: (key: MessageKey, values?: Record<string, string | number>) => string,
): string {
  const key = WORKGRAPH_KIND_LABEL_KEY[kind];
  return key
    ? t(key)
    : t("workObjectKindUnknown", {
        kind: kind.replace(/_/g, " "),
      });
}

export function getWorkGraphAttentionLabel(
  attention: WorkAttentionState,
  t: (key: MessageKey, values?: Record<string, string | number>) => string,
): string | null {
  const key = WORKGRAPH_ATTENTION_LABEL_KEY[attention];
  return key ? t(key) : attention === "none"
    ? null
    : t("workObjectAttentionUnknown", {
        attention: attention.replace(/_/g, " "),
      });
}

export function getWorkGraphEvidenceRelationLabel(
  relation: WorkGraphEvidenceAttachment["relation"],
  t: (key: MessageKey, values?: Record<string, string | number>) => string,
): string {
  return t(WORKGRAPH_EVIDENCE_RELATION_LABEL_KEY[relation]);
}

export function getWorkGraphLayerLabel(
  layer: WorkGraphLayer,
  t: (key: MessageKey, values?: Record<string, string | number>) => string,
): string {
  return t(WORKGRAPH_LAYER_LABEL_KEY[layer]);
}

export function getWorkTaskProductBindingLabel(
  binding: WorkTaskProductBinding,
  t: (key: MessageKey, values?: Record<string, string | number>) => string,
): string {
  return t(WORK_TASK_PRODUCT_BINDING_LABEL_KEY[binding]);
}

export function getWorkGraphGateStateLabel(
  state: WorkGraphGateDecorator["state"],
  t: (key: MessageKey, values?: Record<string, string | number>) => string,
): string {
  const stateLabel = String(state).replace(/_/g, " ");
  return state === "not_requested"
    ? t("workObjectGateStateNotRequested")
    : state === "pending"
      ? t("workObjectGateStatePending")
      : state === "approved"
        ? t("workObjectGateStateApproved")
        : state === "rejected"
          ? t("workObjectGateStateRejected")
          : t("workObjectGateStateUnknown", { state: stateLabel });
}

/** Reverse-lookup indexes built from the authoritative top-level
 *  `evidenceAttachments` and `gateDecorators` collections (SPEC-083 FR7). */
export interface WorkGraphIndexes {
  objectsById: Map<string, WorkGraphObjectSummary>;
  /**
   * Lookup by composite Core identity key `${recordFamily}:${recordId}`.
   * SPEC-090 link endpoints resolve through this map, but the map is
   * populated for every projection object regardless of family.
   */
  objectsByCoreRef: Map<string, WorkGraphObjectSummary>;
  evidenceByAnchor: Map<string, WorkGraphEvidenceAttachment[]>;
  gatesBySubject: Map<string, WorkGraphGateDecorator[]>;
}

export function buildIndexes(graph: WorkGraphProjection): WorkGraphIndexes {
  const objectsById = new Map<string, WorkGraphObjectSummary>();
  const objectsByCoreRef = new Map<string, WorkGraphObjectSummary>();
  for (const o of graph.objects) {
    objectsById.set(o.id, o);
    objectsByCoreRef.set(`${o.sourceRecordFamily}:${o.sourceRecordId}`, o);
  }
  const evidenceByAnchor = new Map<string, WorkGraphEvidenceAttachment[]>();
  for (const a of graph.evidenceAttachments) {
    const list = evidenceByAnchor.get(a.anchorObjectId) ?? [];
    list.push(a);
    evidenceByAnchor.set(a.anchorObjectId, list);
  }
  const gatesBySubject = new Map<string, WorkGraphGateDecorator[]>();
  for (const g of graph.gateDecorators) {
    const list = gatesBySubject.get(g.subjectObjectId) ?? [];
    list.push(g);
    gatesBySubject.set(g.subjectObjectId, list);
  }
  return { objectsById, objectsByCoreRef, evidenceByAnchor, gatesBySubject };
}

/**
 * Walk the transitive upstream `blocks` chain from `ref`. "Upstream"
 * means: if `A blocks B` is stored, B's upstream blocker is A. We keep
 * walking until either `maxDepth` is reached or no further incoming
 * `blocks` rows exist.
 *
 * Cycles are bounded by the `visited` set so a cycle of length N
 * contributes at most N entries (and never infinite-loops). This helper
 * does NOT report cycle diagnostics — those are surfaced through
 * `projectLinks` and Broken Links.
 *
 * Returns ordered by proximity (closest blocker first), deduplicated by
 * Core endpoint key.
 */
export function walkUpstreamBlockers(
  ref: WorkGraphLinkEndpointRef,
  links: readonly WorkGraphLink[],
  objectsByCoreRef: ReadonlyMap<string, WorkGraphObjectSummary>,
  maxDepth: number,
): WorkGraphObjectSummary[] {
  if (maxDepth <= 0) return [];
  const start = `${ref.recordFamily}:${ref.recordId}`;
  const visited = new Set<string>([start]);
  const result: WorkGraphObjectSummary[] = [];
  const queue: Array<{ key: string; depth: number }> = [{ key: start, depth: 0 }];

  const incomingByTarget = new Map<string, WorkGraphLink[]>();
  for (const link of links) {
    if (link.kind !== "blocks") continue;
    const targetKey = `${link.targetRecordFamily}:${link.targetRecordId}`;
    const list = incomingByTarget.get(targetKey) ?? [];
    list.push(link);
    incomingByTarget.set(targetKey, list);
  }

  while (queue.length > 0) {
    const { key, depth } = queue.shift()!;
    if (depth >= maxDepth) continue;
    const incoming = incomingByTarget.get(key) ?? [];
    for (const link of incoming) {
      const sourceKey = `${link.sourceRecordFamily}:${link.sourceRecordId}`;
      if (visited.has(sourceKey)) continue;
      visited.add(sourceKey);
      const summary = objectsByCoreRef.get(sourceKey);
      if (summary) {
        result.push(summary);
        queue.push({ key: sourceKey, depth: depth + 1 });
      }
    }
  }
  return result;
}

export interface EvidenceCounts {
  artifact: number;
  activity: number;
  outcome: number;
  total: number;
}

export function summarizeEvidence(
  attachments: WorkGraphEvidenceAttachment[] | undefined,
): EvidenceCounts {
  const c: EvidenceCounts = { artifact: 0, activity: 0, outcome: 0, total: 0 };
  if (!attachments) return c;
  for (const a of attachments) {
    c[a.relation] += 1;
    c.total += 1;
  }
  return c;
}

export function formatRelative(
  iso: string,
  t: (key: MessageKey, values?: Record<string, string | number>) => string,
): string {
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) return iso;
  const deltaMs = Date.now() - parsed;
  if (deltaMs < 0) return t("workTopdownRelativeJustNow");
  const minutes = Math.round(deltaMs / 60_000);
  if (minutes < 1) return t("workTopdownRelativeJustNow");
  if (minutes < 60)
    return t("workTopdownRelativeMinutesAgo", {
      count: `${minutes}`,
    });
  const hours = Math.round(minutes / 60);
  if (hours < 48)
    return t("workTopdownRelativeHoursAgo", {
      count: `${hours}`,
    });
  const days = Math.round(hours / 24);
  return t("workTopdownRelativeDaysAgo", {
    count: `${days}`,
  });
}
