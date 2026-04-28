# SPEC-083: Work System Map and Cockpit Projections

> Define the first top-down Cats Work UI framework around one Work Graph
> projection layer, System Map as the production default / conformance surface,
> and Cockpit as an opt-in operational projection.

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Draft |
| **Owner** | Codex |
| **Reviewer** | User |
| **Related ADR** | [ADR-083](../decisions/083-adopt-work-graph-projections-for-system-map-and-cockpit.md) |
| **Related Plan** | TBD |

## Summary

Cats Work should move from the current unapproved, chat-grown prototype UI to a
top-down operating framework. The new framework uses one shared Work Graph
projection over canonical Core records and renders it through two first-class
view modes:

- **System Map** first and as the default Work entry, to validate ADR-081 slots
  and prove Chat / Code outputs can land in the right places.
- **Cockpit** second and opt-in, to provide a production-quality operational
  command center without hiding slot or anchor errors.

Tables and Task Hub remain later projections over the same graph.

## Goals

- Build Work from the documented mental model instead of from existing Work UI
  prototypes.
- Define one Work Graph view-model contract that all Work views consume.
- Ship System Map first and keep it as the production default conformance
  surface.
- Define Cockpit as an opt-in production projection over the same graph.
- Separate platform shell chrome from Work view-owned navigation.
- Keep shared object identity, selection intent, and applicable filters stable
  across view modes through one detail drawer / inspector model.
- Give Chat and Code explicit write slots for conversations, projects, work
  items, tasks, missions, runs, artifacts, activities, and approvals.
- Preserve the option to add Tables and Task Hub later without changing the
  underlying graph.

## Non-Goals

- Redesigning or polishing the existing Work renderer prototype.
- Implementing Tables or Task Hub in the first slice.
- Adding new canonical Core record families.
- Replacing Chat or Code product surfaces.
- Implementing new agent execution, scheduling, or runtime dispatch logic.
- Defining the final visual design system for all Work pages.
- Supporting backwards compatibility for unreleased Work UI layouts.

## User Stories

- As the owner, I want the default Work surface to show whether the system's
  project, work item, task, run, artifact, conversation, and approval records
  are connected correctly before I rely on automation.
- As the owner, I want an opt-in Cockpit that tells me what needs my decision,
  what is active, what is blocked, and what shipped.
- As a Chat implementer, I want to know exactly what canonical records and
  anchors I must write so conversation-generated work appears in Work.
- As a Code implementer, I want code tasks, execution runs, previews, build
  artifacts, and review evidence to land in predictable Work slots.
- As a future power user, I want the same records to be available later through
  Tables or Task Hub without another data model.

## Requirements

### Functional Requirements

1. Work shall define a `WorkGraphProjection` read model above canonical Core
   records.
2. `WorkGraphProjection` shall not add a new durable record family or require a
   Core schema migration.
3. Every graph object shall expose stable identity:
   - `id`
   - `kind`
   - `sourceRecordId`
   - `sourceRecordFamily`
   - `title`
   - `status`
4. Every structural graph object shall expose one ADR-081 layer only:
   - `interaction`
   - `planning`
   - `execution`
5. Evidence records shall not create a fourth structural pane. They shall render
   through record-specific anchors on structural objects.
6. Gate / approval records shall not create a structural pane. They shall render
   as badges, overlays, or detail-drawer decorators on subject objects.
7. The top-level `evidenceAttachments` and `gateDecorators` collections shall
   be authoritative for evidence / gate placement. Graph object summaries shall
   not duplicate reverse evidence or gate id lists.
8. Every graph object shall expose operational classification sufficient for
   Cockpit grouping:
   - attention state
   - blocked / failed / ready state
   - owner role or team lane when known
   - next action summary when known
   - linked project / work item / task / conversation ids when applicable
9. System Map shall be the first required view mode and the default Work route
   when no explicit view mode is selected.
10. System Map shall group graph objects into exactly these primary panes:
   - `Interaction`
   - `Planning`
   - `Execution`
11. The Interaction pane shall include interaction records and references such
    as Agent, Participant, Container, Conversation, Turn, Lane, Segment,
    Session, and TransportBinding when they are available in the projection.
12. The Planning pane shall include Project and WorkItem records.
13. The Execution pane shall include Task, Mission, and Run records.
14. Artifact and Activity evidence shall render under or beside their anchored
    Project, WorkItem, Conversation, Task, or Run objects when the underlying
    schema provides those anchors.
15. Outcome, Checkpoint, and Trace evidence shall render only under or beside
    their anchored Conversation, Task, or Run objects.
16. Approval state, whether embedded on a Task (`CoreTaskRecord.approval`) or
    carried by a standalone `CoreApprovalBindingRecord`, shall render as badges,
    overlays, or detail-drawer decorators on the subject object. It shall not
    occupy a structural layer slot or a peer pane.
17. Standalone `CoreApprovalBindingRecord` instances may exist as
    `approval_binding`-kind graph objects for stable drawer identity and detail
    inspection. Embedded `CoreTaskRecord.approval` state does not become a
    standalone graph object; it surfaces through the owning Task's drawer and
    as a gate badge on the Task. Neither renders as a primary card in any
    System Map pane.
18. System Map shall surface orphan and broken-link diagnostics, including:
    - WorkItem without expected Project when project linkage is required by the
      current selection or filter
    - Task without expected WorkItem when the task claims Work ownership
    - Run without task, parent-run, or conversation lineage when lineage is
      expected
    - Artifact or Activity missing all useful anchors
    - Outcome, Checkpoint, or Trace missing required execution / conversation
      anchors
    - Conversation-linked work with no visible Planning / Execution bridge
19. System Map shall allow selecting any graph object and opening a shared
    detail drawer / inspector.
20. Cockpit shall be the second required view mode.
21. Cockpit shall group graph objects by operational triage, not by fake
    department structure:
    - `Needs Decision`
    - `Active`
    - `Blocked`
    - `Recently Shipped`
    - `Teams / Roles`
22. Cockpit may show monday-like role or team lanes only when real owner, role,
    team, or capability metadata exists in the graph. V1 shall derive role lanes
    from `CoreActorRecord.roles` through resolved owner, assignee,
    orchestrator, or activity actor ids. If no actor roles resolve, the
    `Teams / Roles` section shall render an empty state. Graph objects whose
    anchoring actors resolve to no roles shall still appear in `Needs Decision`
    / `Active` / `Blocked` / `Recently Shipped` based on their attention state.
23. Cockpit shall use the same graph object identities as System Map.
24. Cockpit shall not read from System Map UI state. It shall read from
    `WorkGraphProjection` directly.
25. Work shall expose a view mode switch for at least:
    - `System Map`
    - `Cockpit`
26. Work view mode shall be represented as bookmarkable route/query state on
    the Work surface, with `/work` defaulting to System Map when the mode is
    absent.
27. Changing view mode shall change the Work-owned sidebar entries, main
    content grouping, sorting, empty states, and primary CTAs.
28. Changing view mode shall preserve canonical selected-object identity when
    the object exists in both projections.
29. Changing view mode shall preserve applicable filters such as project,
    work item, task, status, owner role, and attention state. A projection may
    ignore filters it cannot express, but it must not silently discard them from
    route / selection state.
30. Platform shell chrome shall stay outside Work view mode ownership.
31. Work view-owned sidebar entries shall be generated from projection metadata,
    not hard-coded as one static list for all modes.
32. The first System Map sidebar shall include at least:
    - Interaction
    - Planning
    - Execution
    - Broken Links / Diagnostics
33. The first Cockpit sidebar shall include at least:
    - Command Center
    - Needs Decision
    - Active Work
    - Blocked
    - Shipped
    - Teams / Roles
34. The shared detail drawer shall support at least these object kinds:
    - Project
    - WorkItem
    - Task
    - Mission
    - Run
    - Conversation
    - Artifact
    - Activity
    - ApprovalBinding
35. Detail drawer content shall show both structural links and operational
    next actions when available.
36. Chat-created or Chat-linked records shall be visible through the same graph
    slots rather than through Chat-specific Work UI branches.
37. Code-created or Code-linked records shall be visible through the same graph
    slots rather than through Code-specific Work UI branches.
38. Existing Work renderer routes and UI components shall be isolated or
    disabled before new Work shell implementation starts. The new shell shall
    not keep a hybrid fallback to the rejected prototype.
39. `+New work` shall materialize enough canonical state for all three primary
    System Map panes at entry creation time:
    - one primary `Conversation` in Interaction
    - one `Project` in Planning
    - one `WorkItem` in Planning
    - one primary `Task` in Execution, linked from the `WorkItem` via
      `WorkItem.taskId`
40. `+New work` shall not create a `Run` merely because the entry exists. The
    first `Run` shall appear only when a supervised execution attempt, tool
    batch, continuation, or delegated operation actually starts.
41. `+New chat` and `+New code` remain different producer contracts:
    `+New chat` may produce only Interaction records, while `+New code`
    produces Interaction plus a Code-owned `Task` without forcing Work
    `Project` / `WorkItem` anchors.

### Producer Slot Contract

1. Producers shall write canonical Core records and anchors, not
   view-specific System Map or Cockpit state.
2. A Conversation-family write shall project into the Interaction pane.
3. A Project write shall project into the Planning pane.
4. A WorkItem write shall project into the Planning pane. It may be standalone,
   but a project-owned work item must carry `projectId`.
5. A Task write shall project into the Execution pane. Task does not own a
   WorkItem foreign key; Planning ownership is represented by `WorkItem.taskId`
   or planning metadata outside the task record.
6. A Mission write shall project into the Execution pane. Mission shall remain
   distinct from Task and may have nullable managed-work anchors when it
   represents coordination that is not yet bound to a work item.
7. A Run write shall project into the Execution pane and shall use only the
   frozen ADR-081 Run anchors: `taskId`, `parentRunId`, and `conversationId`.
   `traceId` and `orchestratorActorId` may provide runtime context, but they are
   not structural Work anchors. Run must not name or imply a Mission FK unless a
   future ADR-081 amendment and Core schema change add an explicit field.
8. Artifact and Activity writes shall project as anchored evidence on the
   structural objects allowed by their record schemas.
9. Outcome, Checkpoint, and Trace writes shall project as anchored evidence only
   on Conversation, Task, or Run lineage.
10. An `ApprovalBinding` write shall project as a gate decorator with the
    binding's `subjectKind` and `subjectId`; it shall not claim a structural
    layer slot. Updates to embedded `CoreTaskRecord.approval` state are part of
    the owning Task write and surface as badges on the Task, not as separate
    graph objects.
11. A producer that creates Work-owned data without the required anchors below,
    or with present anchors that do not resolve, shall cause a deterministic
    System Map diagnostic.
12. A Work entry producer shall write the `+New work` entry set as one
    coherent materialization: `Conversation + Project + WorkItem + primary
    Task`, with the `WorkItem.taskId` bridge pointing at the primary task. If
    any one of those records or that Planning -> Execution bridge is absent
    after creation, System Map shall classify the entry as incomplete Work
    materialization rather than hiding it behind Cockpit grouping.
13. Code entry producers may write Code-owned tasks without Work Planning
    anchors. Such records still project through Work Graph when queried, but
    they must not be diagnosed as malformed Work entries unless they explicitly
    claim Work ownership.

#### Minimum Anchor Sets

- **Conversation-family / Interaction**
  - Slot minimum: record id.
  - Diagnostic minimum: present structural FKs must resolve, such as
    `Conversation.containerId`.
  - Optional context: participant, lane, session, transport binding links.
- **Project / Planning**
  - Slot minimum: record id.
  - Diagnostic minimum: none beyond record identity.
  - Optional context: `primaryConversationId`, `ownerActorId`.
- **WorkItem / Planning**
  - Slot minimum: record id.
  - Diagnostic minimum: `projectId` when the work item claims project
    ownership; present `parentWorkItemId`, `conversationId`, or `taskId` must
    resolve.
  - Optional context: `ownerActorId`, `assignedActorIds`.
- **Task / Execution**
  - Slot minimum: record id.
  - Diagnostic minimum: present `parentTaskId` and `conversationId` must
    resolve. If a WorkItem points at this task, that `WorkItem.taskId` must
    resolve back to this task.
  - Optional context: `ownerActorId`, `assignedActorIds`,
    `orchestratorActorId`, planning metadata.
- **Mission / Execution**
  - Slot minimum: record id.
  - Diagnostic minimum: present `managedWorkId`, `conversationId`,
    `sourceTurnId`, `sourceLaneId`, or `assignedAgentId` must resolve.
  - Optional context: nullable anchors are valid; no task/run anchor is
    required.
- **Run / Execution**
  - Slot minimum: record id.
  - Diagnostic minimum: at least one of `taskId`, `parentRunId`, or
    `conversationId` must resolve to avoid `unanchored_run`; present values
    must resolve.
  - Optional context: `traceId`, `orchestratorActorId`; no `missionId`.
- **Artifact / evidence**
  - Slot minimum: record id.
  - Diagnostic minimum: at least one of `projectId`, `workItemId`,
    `conversationId`, `taskId`, or `runId` must resolve.
  - Optional context: path, mime type, size.
- **Activity / evidence**
  - Slot minimum: record id.
  - Diagnostic minimum: at least one of `projectId`, `workItemId`,
    `conversationId`, `taskId`, or `runId` must resolve, or `artifactId` must
    resolve to an Artifact with a structural anchor.
  - Optional context: `actorId`, activity kind.
- **Outcome / Checkpoint / Trace evidence**
  - Slot minimum: record id.
  - Diagnostic minimum: at least one of `conversationId`, `taskId`, or `runId`
    must resolve.
  - Optional context: trace id, source trace id, actor id.
- **ApprovalBinding / gate**
  - Slot minimum: record id.
  - Diagnostic minimum: `subjectKind` and `subjectId` must resolve to an
    allowed subject: `project`, `work_item`, `task`, `run`, `artifact`, or
    `conversation`.
  - Optional context: `projectId`, `workItemId`, `conversationId`, requested
    actor ids.

### Non-Functional Requirements

- **Model clarity**: UI grouping must not contradict ADR-081. If a surface wants
  a friendly label, it must still map back to the canonical layer and record.
- **Projection integrity**: System Map and Cockpit must consume the same graph
  projection.
- **Testability**: System Map slot assignment, anchored evidence rendering, gate
  decorators, and broken-link diagnostics must be testable without browser-only
  visual assertions.
- **Extensibility**: Tables and Task Hub must be addable as projections without
  changing the graph contract.
- **No prototype compatibility**: unreleased Work renderer components must not
  force compatibility shims.
- **Product separation**: platform shell chrome must not know Work's
  view-owned navigation items.

## Design Overview

### Projection Pipeline

```text
Cats Core records
  -> WorkGraphProjection
      -> System Map projection
      -> Cockpit projection
      -> future Tables projection
      -> future Task Hub projection
```

### Suggested Work Graph Shape

```ts
type WorkGraphLayer = 'interaction' | 'planning' | 'execution';

type WorkGraphObjectKind =
  | 'agent'
  | 'participant'
  | 'container'
  | 'conversation'
  | 'turn'
  | 'lane'
  | 'segment'
  | 'session'
  | 'transport_binding'
  | 'project'
  | 'work_item'
  | 'task'
  | 'mission'
  | 'run'
  | 'artifact'
  | 'outcome'
  | 'checkpoint'
  | 'trace'
  | 'activity'
  | 'approval_binding';

type WorkAttentionState =
  | 'none'
  | 'decision_needed'
  | 'blocked'
  | 'failed'
  | 'ready_to_review'
  | 'recently_shipped';

type WorkGraphDiagnosticCategory =
  | 'anchor'
  | 'lineage'
  | 'projection'
  | 'policy';

type WorkGraphDiagnosticKind =
  | 'broken_fk'
  | 'missing_project_anchor'
  | 'missing_planning_execution_bridge'
  | 'unanchored_run'
  | 'unanchored_evidence'
  | 'missing_gate_subject'
  | 'unsupported_view_filter';

interface WorkGraphObjectSummary {
  id: string;
  kind: WorkGraphObjectKind;
  structuralLayer: WorkGraphLayer | null;
  sourceRecordId: string;
  sourceRecordFamily: string;
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
  updatedAt: string | null;
}

interface WorkGraphEvidenceAttachment {
  evidenceObjectId: string;
  anchorObjectId: string;
  relation: 'artifact' | 'activity' | 'outcome' | 'checkpoint' | 'trace';
}

interface WorkGraphGateDecorator {
  gateObjectId: string;
  subjectObjectId: string;
  state: string;
}

interface WorkGraphProjection {
  objects: WorkGraphObjectSummary[];
  links: Array<{
    fromId: string;
    toId: string;
    relation: string;
  }>;
  evidenceAttachments: WorkGraphEvidenceAttachment[];
  gateDecorators: WorkGraphGateDecorator[];
  diagnostics: Array<{
    id: string;
    severity: 'info' | 'warning' | 'error';
    category: WorkGraphDiagnosticCategory;
    kind: WorkGraphDiagnosticKind;
    objectId: string | null;
    message: string;
  }>;
}
```

This is a specification shape, not a required final TypeScript file layout.
Implementation may split summaries, links, attachments, decorators, and
diagnostics if needed, but the semantic fields must remain available to both
System Map and Cockpit. Evidence and gate objects use `structuralLayer: null`
and are located through authoritative top-level `evidenceAttachments` or
`gateDecorators`, not by claiming a peer layer. Consumers that need reverse
lookups must build indexes from those top-level collections.

The `status` field's runtime values are the per-kind status enums defined in
`src/core/types.ts` (`CoreProjectStatus`, `CoreWorkItemStatus`,
`CoreTaskStatus`, `CoreRunStatus`, `MissionRecordStatus`,
`CoreConversationStatus`, `CoreActorStatus`, etc.). `WorkGraphGateDecorator.state`
uses `CoreApprovalStatus`. Implementations must not introduce Work-specific
status values that shadow or extend the canonical Core enums.

### View Mode Ownership

```text
Platform Shell
  Global product chrome
    Chat / Work / Code / Settings / Search / Account

Work Product Shell
  Work header
    View mode: System Map | Cockpit

  Work-owned sidebar
    Generated from selected view mode

  Main content
    Generated from selected view mode

  Shared detail drawer
    Same object identity across view modes
```

### Routing State

The first implementation uses `/work` with query state, not separate route
families:

```text
/work
/work?view=system-map
/work?view=cockpit&projectId=proj_123
/work?view=system-map&projectId=proj_123&taskId=task_456
```

When `view` is absent or invalid, Work defaults to System Map. Switching between
System Map and Cockpit must preserve selected object and filter query state
where the target projection can express it.

## Boundaries

### What may be reused from current Work code

- API clients.
- Core projection helpers.
- Test fixtures that still describe useful Core facts.
- Product metadata or route constants if they fit the new shell.

### What must not be treated as binding

- Current Work renderer layout.
- Current Work sidebar item structure.
- Current Work component hierarchy.
- Current Work visual style.
- Current Work chat-derived route assumptions.
- Current Work route fallback behavior.

### Old UI isolation requirement

Before implementation starts on the new Work shell, existing Work renderer UI
routes/components shall be isolated, disabled, moved under a scrapped boundary,
or deleted. Reuse is limited to non-UI helpers that are deliberately moved
behind the new graph and shell contracts.

## Dependencies

- [ADR-081](../decisions/081-canonicalize-three-tier-core-record-taxonomy.md)
- [ADR-082](../decisions/082-recast-orchestrator-as-capability-shell-with-policy-dial-supervision.md)
- [ADR-083](../decisions/083-adopt-work-graph-projections-for-system-map-and-cockpit.md)
- [SPEC-058](./SPEC-058-interaction-core-and-domain-materialization.md)
- [SPEC-062](./SPEC-062-agent-missions-and-transport-bindings.md)
- [SPEC-040](./SPEC-040-cats-work-team-templates-and-work-intake.md)
- [2026-04-25 AOS reference system deep-research update](../research/2026-04-25-deep-research-report.md)

## Open Questions

- [ ] Which detail drawer fields are mandatory for each object kind in the
      first implementation?
- [x] Work view mode uses query state on `/work`; System Map is the default when
      `view` is absent.
- [x] Cockpit is opt-in in this ADR; it does not become the default route.
- [x] V1 role / team lanes use `CoreActorRecord.roles` from resolved actor ids;
      no free-text inference is required.
- [x] Severity rules: `error` for `broken_fk` and `missing_gate_subject` (object
      cannot render correctly); `warning` for `missing_project_anchor`,
      `unanchored_run`, `unanchored_evidence`, and
      `missing_planning_execution_bridge` (object visible but flagged); `info`
      for `unsupported_view_filter` (user-facing filter mismatch, not a producer
      defect). Diagnostics surface state; they do not block producer writes.

## References

- [ADR-083: Adopt Work Graph Projections for System Map and Cockpit](../decisions/083-adopt-work-graph-projections-for-system-map-and-cockpit.md)
- [ADR-081: Canonicalize the Core record taxonomy as Interaction / Planning / Execution](../decisions/081-canonicalize-three-tier-core-record-taxonomy.md)
- [ADR-082: Recast the orchestrator as a capability shell with policy-dial supervision](../decisions/082-recast-orchestrator-as-capability-shell-with-policy-dial-supervision.md)
- [SPEC-040: Cats Work Team Templates and Work Intake](./SPEC-040-cats-work-team-templates-and-work-intake.md)
- [AOS reference system deep-research update](../research/2026-04-25-deep-research-report.md)

---

*Created: 2026-04-25*
*Revised: 2026-04-28*
*Author: Codex*
*Related Plan: TBD*
