/**
 * Work Graph projection types for the top-down Work surfaces (System Map,
 * Cockpit, Broken Links). Mirrors the SPEC-083 §Suggested Work Graph Shape.
 *
 * The fixture in `./mock.ts` uses these types so the three pages can render
 * meaningfully before the producer pipeline (chat / code / runtime writes
 * canonical Core records → server-side projection) is wired up.
 */

export type WorkGraphLayer = "interaction" | "planning" | "execution";

/**
 * Per-task product attribution surfaced in the projection so Work-product
 * surfaces can show the *full* Core task graph while still labelling
 * which product owns / executes each task. Computed by
 * `resolveTaskProductBinding`:
 *
 *   - 'work'    — task has a Work Item linking to it through
 *                 `WorkItem.taskId`; this structural bridge is the only
 *                 way to qualify as `work`. Code / Chat lineage on the
 *                 same task is preserved on the underlying records
 *                 across promotion: explicit `planning.productHint` /
 *                 `planning.transfer.suggestedProduct` if the origin
 *                 was a planning hint, the linked `code_thread` (or
 *                 chat-*) `Conversation.kind` if it was a conversation
 *                 fallback, and any `build` / `preview` `Artifact`
 *                 attached to the task if it was an artifact-driven
 *                 binding. None of these is rewritten by promotion;
 *                 they are NOT exposed via this projection field.
 *   - 'code'    — task has a build / preview artifact, OR explicit Code
 *                 planning provenance (`productHint = 'code'` /
 *                 `transfer.suggestedProduct = 'code'`), OR legacy
 *                 `code_thread` conversation fallback (no planning).
 *   - 'chat'    — explicit Chat planning provenance only. Chat-*
 *                 conversation kind alone does NOT qualify, per the
 *                 deliberate-only producer rule (Chat Tasks must be
 *                 explicitly materialized from an active Chat
 *                 conversation, not auto-bound by conversation kind).
 *   - 'unbound' — no usable signal; Work-flavoured hint / `work_thread`
 *                 fallback without the required `WorkItem.taskId`
 *                 bridge (incomplete Work claim, surfaces as a
 *                 diagnostic); chat-* conversation without explicit
 *                 chat provenance.
 *
 * Set only on `kind === 'task'` summaries; undefined elsewhere.
 */
export type WorkTaskProductBinding = "work" | "code" | "chat" | "unbound";

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
  | "missing_gate_subject"
  | "orphan_link"
  | "link_cycle";

/**
 * SPEC-083 base diagnostic kinds — i.e. every diagnostic kind that uses
 * the plain `WorkGraphDiagnostic` shape. SPEC-090 link diagnostics
 * (`orphan_link`, `link_cycle`) carry extra payload fields and use
 * dedicated shapes (`WorkGraphLinkOrphanDiagnostic` /
 * `WorkGraphLinkCycleDiagnostic`).
 */
export type WorkGraphBaseDiagnosticKind = Exclude<
  WorkGraphDiagnosticKind,
  "orphan_link" | "link_cycle"
>;

/**
 * SPEC-090 stored link kinds. `blocked_by` is NOT stored — it is a
 * projection-derived inverse of `blocks` (see SPEC-090 §FR5).
 */
export type WorkGraphLinkKind =
  | "blocks"
  | "related_to"
  | "duplicate_of"
  | "follows";

/**
 * Read-side view kinds the projection synthesizes per object. Includes
 * the derived `blocked_by` view that does not appear in storage.
 */
export type WorkGraphLinkViewKind = WorkGraphLinkKind | "blocked_by";

/**
 * SPEC-090 v1 limits link endpoints to Project / Work Item / Task. The
 * matching `sourceRecordFamily` field on `WorkGraphObjectSummary` is
 * typed wider (`WorkGraphObjectKind`) because a summary can also cover
 * non-PWT objects like Conversation / Run / Artifact.
 */
export type WorkGraphLinkEndpointKind = "project" | "work_item" | "task";

export interface WorkGraphLinkEndpointRef {
  recordFamily: WorkGraphLinkEndpointKind;
  recordId: string;
}

/**
 * Serializable composite key form: `${recordFamily}:${recordId}`.
 * Stable across projection rebuilds because Core identity drives it.
 */
export type WorkGraphEndpointKey = `${WorkGraphLinkEndpointKind}:${string}`;

/** SPEC-090 stored link row. Endpoints reference canonical Core identity. */
export interface WorkGraphLink {
  id: string;
  kind: WorkGraphLinkKind;
  sourceRecordFamily: WorkGraphLinkEndpointKind;
  sourceRecordId: string;
  targetRecordFamily: WorkGraphLinkEndpointKind;
  targetRecordId: string;
  createdAt: string;
  createdByActorId: string | null;
  note: string | null;
}

/**
 * Per-endpoint read-side projection of a link, oriented "from this
 * endpoint's perspective". `kind` may be `blocked_by` even though no
 * stored row has that kind — see SPEC-090 §FR5.
 */
export interface WorkGraphLinkView {
  linkId: string;
  kind: WorkGraphLinkViewKind;
  selfEndpoint: WorkGraphLinkEndpointRef;
  otherEndpoint: WorkGraphLinkEndpointRef;
  note: string | null;
  createdAt: string;
}

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
  /**
   * Pass-through of the Core record's metadata bag. Renderer-only
   * extras (e.g. tasks' `workRenderer.priority` / `assigneeName` /
   * `acceptanceCriteria`) ride through here so they survive a refresh.
   * Optional: omitted for record families without a metadata field.
   */
  metadata?: Record<string, unknown> | null;
  /**
   * Task-only: which product owns / executes this task. See
   * `WorkTaskProductBinding`. Set on `kind === 'task'` summaries;
   * undefined for projects, work items, runs, agents, etc. Lets
   * UI surfaces (System Map, Tasks list, Cockpit) display the
   * full Core task graph and still label each task by product
   * — a graph-projection-level alternative to filtering tasks
   * out at the API boundary.
   */
  productBinding?: WorkTaskProductBinding;
  /**
   * Run-only: lifecycle timestamps. Set on `kind === 'run'` summaries;
   * undefined elsewhere. `startedAt` is null while queued, set when
   * the run picks up. `completedAt` is null while running / blocked,
   * set when the run reaches a terminal status (completed / failed /
   * cancelled). Lets Run drill-downs render duration without a
   * second fetch.
   */
  startedAt?: string | null;
  completedAt?: string | null;
  /**
   * Denormalized title of `linkedTaskId` (when present and resolvable
   * in the same projection). Set on `kind === 'task'` (parent of a
   * sub-task) and `kind === 'run'` (the task that owns this run);
   * undefined for other kinds. Lets Cockpit / System Map / list cards
   * render a "belongs to" chip without each consumer building its own
   * task lookup map.
   */
  linkedTaskTitle?: string | null;
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
  kind: WorkGraphBaseDiagnosticKind;
  objectId: string | null;
  message: string;
}

export interface WorkGraphLinkOrphanDiagnostic {
  id: string;
  severity: WorkGraphDiagnosticSeverity;
  category: WorkGraphDiagnosticCategory;
  kind: "orphan_link";
  objectId: string | null;
  message: string;
  linkId: string;
  sourceEndpoint: WorkGraphLinkEndpointRef;
  targetEndpoint: WorkGraphLinkEndpointRef;
  unresolvedSide: "source" | "target" | "both";
}

export interface WorkGraphLinkCycleDiagnostic {
  id: string;
  severity: WorkGraphDiagnosticSeverity;
  category: WorkGraphDiagnosticCategory;
  kind: "link_cycle";
  objectId: string | null;
  message: string;
  cycleEndpoints: WorkGraphLinkEndpointRef[];
  /**
   * Stored `blocks` rows that participate in the cycle, in cycle
   * traversal order. Lets Broken Links offer a one-click
   * "remove this link" affordance per row.
   */
  cycleLinkIds: string[];
}

export type WorkGraphLinkDiagnostic =
  | WorkGraphLinkOrphanDiagnostic
  | WorkGraphLinkCycleDiagnostic;

export interface WorkGraphProjection {
  objects: WorkGraphObjectSummary[];
  evidenceAttachments: WorkGraphEvidenceAttachment[];
  gateDecorators: WorkGraphGateDecorator[];
  /** Raw stored link rows, including orphans (so Broken Links can iterate them). */
  links: WorkGraphLink[];
  /**
   * Per-endpoint derived link views (sparse map). Orphan rows are
   * EXCLUDED — they appear only as `orphan_link` diagnostics. Consumers
   * MUST treat absence of a key as `[]`.
   */
  linksByEndpoint: Partial<Record<WorkGraphEndpointKey, WorkGraphLinkView[]>>;
  diagnostics: Array<WorkGraphDiagnostic | WorkGraphLinkDiagnostic>;
}
