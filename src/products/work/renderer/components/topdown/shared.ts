import type {
  WorkAttentionState,
  WorkGraphEvidenceAttachment,
  WorkGraphGateDecorator,
  WorkGraphObjectKind,
  WorkGraphObjectSummary,
  WorkGraphProjection,
} from "./types";

export const KIND_LABEL: Record<WorkGraphObjectKind, string> = {
  agent: "Agent",
  container: "Container",
  conversation: "Conversation",
  turn: "Turn",
  lane: "Lane",
  project: "Project",
  work_item: "Work Item",
  task: "Task",
  mission: "Mission",
  run: "Run",
  artifact: "Artifact",
  activity: "Activity",
  outcome: "Outcome",
  approval_binding: "Approval",
};

export const ATTENTION_LABEL: Partial<Record<WorkAttentionState, string>> = {
  decision_needed: "Decision",
  blocked: "Blocked",
  failed: "Failed",
  ready_to_review: "Review",
  recently_shipped: "Shipped",
};

/** Reverse-lookup indexes built from the authoritative top-level
 *  `evidenceAttachments` and `gateDecorators` collections (SPEC-083 FR7). */
export interface WorkGraphIndexes {
  objectsById: Map<string, WorkGraphObjectSummary>;
  evidenceByAnchor: Map<string, WorkGraphEvidenceAttachment[]>;
  gatesBySubject: Map<string, WorkGraphGateDecorator[]>;
}

export function buildIndexes(graph: WorkGraphProjection): WorkGraphIndexes {
  const objectsById = new Map<string, WorkGraphObjectSummary>();
  for (const o of graph.objects) {
    objectsById.set(o.id, o);
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
  return { objectsById, evidenceByAnchor, gatesBySubject };
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

export function formatRelative(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  const deltaMs = Date.parse("2026-04-25T03:55:00Z") - t;
  const minutes = Math.round(deltaMs / 60_000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}
