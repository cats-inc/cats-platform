import type {
  WorkAttentionState,
  WorkGraphEndpointKey,
  WorkGraphEvidenceAttachment,
  WorkGraphGateDecorator,
  WorkGraphLink,
  WorkGraphLinkCycleDiagnostic,
  WorkGraphLinkDiagnostic,
  WorkGraphLinkEndpointRef,
  WorkGraphLinkOrphanDiagnostic,
  WorkGraphLinkView,
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

/** Composite endpoint key, the form used everywhere SPEC-090 indexes by Core identity. */
export function endpointKey(ref: WorkGraphLinkEndpointRef): WorkGraphEndpointKey {
  return `${ref.recordFamily}:${ref.recordId}`;
}

export interface LinkProjectionResult {
  linksByEndpoint: Partial<Record<WorkGraphEndpointKey, WorkGraphLinkView[]>>;
  diagnostics: WorkGraphLinkDiagnostic[];
}

/**
 * Derive SPEC-090 read-side link views, orphan diagnostics, and cycle
 * diagnostics from the raw stored `links`. Mirrors §FR5 / §FR7 / §FR8
 * exactly:
 *
 * - Both endpoints must resolve via `objectsByCoreRef`. Otherwise the row
 *   is excluded from `linksByEndpoint` and surfaced as `orphan_link` only.
 * - Per-row view emission:
 *     blocks       → blocks view on source, blocked_by view on target
 *     related_to   → related_to views on both endpoints
 *     duplicate_of → duplicate_of view on source only
 *     follows      → follows view on source only
 * - Cycle detection runs on the well-resolved `blocks` subgraph only.
 */
export function projectLinks(
  links: readonly WorkGraphLink[],
  objectsByCoreRef: ReadonlyMap<string, WorkGraphObjectSummary>,
): LinkProjectionResult {
  const linksByEndpoint: Partial<Record<WorkGraphEndpointKey, WorkGraphLinkView[]>> =
    {};
  const diagnostics: WorkGraphLinkDiagnostic[] = [];

  function pushView(key: WorkGraphEndpointKey, view: WorkGraphLinkView): void {
    const list = linksByEndpoint[key] ?? [];
    list.push(view);
    linksByEndpoint[key] = list;
  }

  const resolvedRows: Array<{
    link: WorkGraphLink;
    sourceRef: WorkGraphLinkEndpointRef;
    targetRef: WorkGraphLinkEndpointRef;
  }> = [];

  for (const link of links) {
    const sourceRef: WorkGraphLinkEndpointRef = {
      recordFamily: link.sourceRecordFamily,
      recordId: link.sourceRecordId,
    };
    const targetRef: WorkGraphLinkEndpointRef = {
      recordFamily: link.targetRecordFamily,
      recordId: link.targetRecordId,
    };
    const sourceKey = endpointKey(sourceRef);
    const targetKey = endpointKey(targetRef);
    const sourceResolved = objectsByCoreRef.has(sourceKey);
    const targetResolved = objectsByCoreRef.has(targetKey);

    if (!sourceResolved || !targetResolved) {
      const unresolvedSide: WorkGraphLinkOrphanDiagnostic["unresolvedSide"] =
        !sourceResolved && !targetResolved
          ? "both"
          : !sourceResolved
            ? "source"
            : "target";
      diagnostics.push({
        id: `diag-orphan-${link.id}`,
        severity: "warning",
        category: "lineage",
        kind: "orphan_link",
        objectId: null,
        message: `Link ${link.id} (${link.kind}) references a record that does not resolve.`,
        linkId: link.id,
        sourceEndpoint: sourceRef,
        targetEndpoint: targetRef,
        unresolvedSide,
      });
      continue;
    }

    resolvedRows.push({ link, sourceRef, targetRef });

    const baseView = {
      linkId: link.id,
      note: link.note,
      createdAt: link.createdAt,
    };

    switch (link.kind) {
      case "blocks":
        pushView(sourceKey, {
          ...baseView,
          kind: "blocks",
          selfEndpoint: sourceRef,
          otherEndpoint: targetRef,
        });
        pushView(targetKey, {
          ...baseView,
          kind: "blocked_by",
          selfEndpoint: targetRef,
          otherEndpoint: sourceRef,
        });
        break;
      case "related_to":
        pushView(sourceKey, {
          ...baseView,
          kind: "related_to",
          selfEndpoint: sourceRef,
          otherEndpoint: targetRef,
        });
        pushView(targetKey, {
          ...baseView,
          kind: "related_to",
          selfEndpoint: targetRef,
          otherEndpoint: sourceRef,
        });
        break;
      case "duplicate_of":
        pushView(sourceKey, {
          ...baseView,
          kind: "duplicate_of",
          selfEndpoint: sourceRef,
          otherEndpoint: targetRef,
        });
        break;
      case "follows":
        pushView(sourceKey, {
          ...baseView,
          kind: "follows",
          selfEndpoint: sourceRef,
          otherEndpoint: targetRef,
        });
        break;
    }
  }

  const cycleDiagnostics = detectBlocksCycles(
    resolvedRows.filter((r) => r.link.kind === "blocks"),
  );
  diagnostics.push(...cycleDiagnostics);

  return { linksByEndpoint, diagnostics };
}

interface ResolvedRow {
  link: WorkGraphLink;
  sourceRef: WorkGraphLinkEndpointRef;
  targetRef: WorkGraphLinkEndpointRef;
}

function detectBlocksCycles(
  rows: ResolvedRow[],
): WorkGraphLinkCycleDiagnostic[] {
  const sortedRows = [...rows].sort((a, b) => a.link.id.localeCompare(b.link.id));
  const adj = new Map<string, Array<{ to: string; toRef: WorkGraphLinkEndpointRef; linkId: string }>>();
  const refByKey = new Map<string, WorkGraphLinkEndpointRef>();
  const allKeys = new Set<string>();

  for (const row of sortedRows) {
    const fromKey = endpointKey(row.sourceRef);
    const toKey = endpointKey(row.targetRef);
    refByKey.set(fromKey, row.sourceRef);
    refByKey.set(toKey, row.targetRef);
    allKeys.add(fromKey);
    allKeys.add(toKey);
    const edges = adj.get(fromKey) ?? [];
    edges.push({ to: toKey, toRef: row.targetRef, linkId: row.link.id });
    adj.set(fromKey, edges);
  }
  for (const edges of adj.values()) {
    edges.sort((a, b) => a.to.localeCompare(b.to));
  }
  const nodes = Array.from(allKeys).sort();

  const color = new Map<string, "white" | "gray" | "black">();
  for (const n of nodes) color.set(n, "white");

  const pathKeys: string[] = [];
  const pathLinkIds: string[] = [];
  const cycles: WorkGraphLinkCycleDiagnostic[] = [];
  const seen = new Set<string>();

  function dfs(node: string): void {
    color.set(node, "gray");
    pathKeys.push(node);
    const edges = adj.get(node) ?? [];
    for (const { to, linkId } of edges) {
      const c = color.get(to);
      if (c === "gray") {
        const idx = pathKeys.indexOf(to);
        const cycleNodes = pathKeys.slice(idx);
        const cycleLinkIds = pathLinkIds.slice(idx).concat(linkId);
        const dedupKey = [...cycleNodes].sort().join("|");
        if (!seen.has(dedupKey)) {
          seen.add(dedupKey);
          const cycleEndpoints = cycleNodes
            .map((k) => refByKey.get(k))
            .filter((r): r is WorkGraphLinkEndpointRef => r !== undefined);
          cycles.push({
            id: `diag-cycle-${cycleLinkIds.join("-")}`,
            severity: "error",
            category: "policy",
            kind: "link_cycle",
            objectId: null,
            message: `blocks cycle through ${cycleNodes.length} endpoint(s).`,
            cycleEndpoints,
            cycleLinkIds,
          });
        }
      } else if (c === "white") {
        pathLinkIds.push(linkId);
        dfs(to);
        pathLinkIds.pop();
      }
    }
    pathKeys.pop();
    color.set(node, "black");
  }

  for (const node of nodes) {
    if (color.get(node) === "white") {
      dfs(node);
    }
  }

  return cycles;
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
