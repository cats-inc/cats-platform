/**
 * Work Graph projection types for the top-down Work surfaces (System Map,
 * Cockpit, Broken Links). Mirrors the SPEC-083 §Suggested Work Graph Shape.
 *
 * The fixture in `./mock.ts` uses these types so the three pages can render
 * meaningfully before the producer pipeline (chat / code / runtime writes
 * canonical Core records → server-side projection) is wired up.
 */

export type WorkGraphLayer = "interaction" | "planning" | "execution";

export type WorkGraphObjectKind =
  | "agent"
  | "container"
  | "conversation"
  | "turn"
  | "lane"
  | "project"
  | "work_item"
  | "task"
  | "mission"
  | "run"
  | "artifact"
  | "activity"
  | "outcome"
  | "approval_binding";

export type WorkAttentionState =
  | "none"
  | "decision_needed"
  | "blocked"
  | "failed"
  | "ready_to_review"
  | "recently_shipped";

export type WorkGraphDiagnosticSeverity = "info" | "warning" | "error";

export type WorkGraphDiagnosticCategory =
  | "anchor"
  | "lineage"
  | "projection"
  | "policy";

export type WorkGraphDiagnosticKind =
  | "broken_fk"
  | "missing_project_anchor"
  | "missing_planning_execution_bridge"
  | "unanchored_run"
  | "unanchored_evidence"
  | "missing_gate_subject";

export interface WorkGraphObjectSummary {
  id: string;
  kind: WorkGraphObjectKind;
  /** null for cross-cutting evidence and gate objects. */
  structuralLayer: WorkGraphLayer | null;
  /**
   * Canonical Core record family this summary projects from. SPEC-083 §
   * Suggested Work Graph Shape publishes this as `string` so non-PWT
   * objects can carry their own family (`conversation`, `run`, `artifact`,
   * etc.); SPEC-090 narrows the value space on link endpoints to
   * `project | work_item | task` only — the link record's
   * `sourceRecordFamily` / `targetRecordFamily` fields use the narrower
   * `WorkGraphLinkEndpointKind` enum.
   */
  sourceRecordFamily: WorkGraphObjectKind;
  /** Canonical Core record id within `sourceRecordFamily`. */
  sourceRecordId: string;
  title: string;
  status: string;
  summary: string | null;
  attention: WorkAttentionState;
  ownerRole: string | null;
  nextAction: string | null;
  linkedConversationId: string | null;
  linkedProjectId: string | null;
  linkedWorkItemId: string | null;
  linkedTaskId: string | null;
  linkedRunId: string | null;
  updatedAt: string;
}

export interface WorkGraphEvidenceAttachment {
  evidenceObjectId: string;
  anchorObjectId: string;
  relation: "artifact" | "activity" | "outcome";
}

export interface WorkGraphGateDecorator {
  gateObjectId: string;
  subjectObjectId: string;
  state: "not_requested" | "pending" | "approved" | "rejected";
}

export interface WorkGraphDiagnostic {
  id: string;
  severity: WorkGraphDiagnosticSeverity;
  category: WorkGraphDiagnosticCategory;
  kind: WorkGraphDiagnosticKind;
  objectId: string | null;
  message: string;
}

export interface WorkGraphProjection {
  objects: WorkGraphObjectSummary[];
  evidenceAttachments: WorkGraphEvidenceAttachment[];
  gateDecorators: WorkGraphGateDecorator[];
  diagnostics: WorkGraphDiagnostic[];
}
