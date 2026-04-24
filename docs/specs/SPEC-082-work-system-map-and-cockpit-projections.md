# SPEC-082: Work System Map and Cockpit Projections

> Define the first top-down Cats Work UI framework around one Work Graph
> projection layer, a System Map view for model validation, and a Cockpit view
> for the production owner surface.

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

- **System Map** first, to validate ADR-081 slots and prove Chat / Code outputs
  can land in the right places.
- **Cockpit** second, to become the production-facing owner command center.

Tables and Task Hub remain later projections over the same graph.

## Goals

- Build Work from the documented mental model instead of from existing Work UI
  prototypes.
- Define one Work Graph view-model contract that all Work views consume.
- Ship System Map first as a structural validation and inspection surface.
- Define Cockpit as the production-facing projection over the same graph.
- Separate platform shell chrome from Work view-owned navigation.
- Keep shared object identity stable across view modes through one detail
  drawer / inspector model.
- Give Chat and Code explicit slots for conversations, tasks, runs, artifacts,
  activities, and approvals.
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

- As the owner, I want Work to show whether the system's project, work item,
  task, run, artifact, conversation, and approval records are connected
  correctly before I rely on automation.
- As the owner, I want a production Cockpit that tells me what needs my
  decision, what is active, what is blocked, and what shipped.
- As a Chat implementer, I want to know exactly where a conversation-generated
  task, work item, or artifact appears in Work.
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
4. Every graph object shall expose a structural layer:
   - `interaction`
   - `planning`
   - `execution`
   - `evidence`
   - `gate`
5. Every graph object shall expose operational classification sufficient for
   Cockpit grouping:
   - attention state
   - blocked / failed / ready state
   - owner role or team lane when known
   - next action summary when known
   - linked project / work item / task / conversation ids when applicable
6. System Map shall be the first required view mode.
7. System Map shall group graph objects into at least these panes:
   - `Interaction`
   - `Planning`
   - `Execution`
   - `Evidence`
   - `Gates`
8. The Interaction pane shall include interaction records and references such as
   Agent, Participant, Container, Conversation, Turn, Lane, Segment, Session,
   and TransportBinding when they are available in the projection.
9. The Planning pane shall include Project and WorkItem records.
10. The Execution pane shall include Task, Mission, and Run records.
11. The Evidence pane shall include Artifact, Outcome, Checkpoint, Trace, and
    Activity records.
12. The Gates pane shall include approval state and approval bindings as
    cross-cutting gates rather than treating Approval as a Planning entity.
13. System Map shall surface orphan and broken-link diagnostics, including:
    - WorkItem without expected Project when project linkage is required by the
      current view
    - Task without expected WorkItem when the task claims Work ownership
    - Run without task or mission lineage when lineage is expected
    - Artifact or Activity missing all useful anchors
    - Conversation-linked work with no visible Planning / Execution bridge
14. System Map shall allow selecting any graph object and opening a shared
    detail drawer / inspector.
15. Cockpit shall be the second required view mode.
16. Cockpit shall group graph objects by owner-operational questions:
    - `Needs Decision`
    - `Active`
    - `Blocked`
    - `Recently Shipped`
    - `Teams / Roles`
17. Cockpit shall use the same graph object identities as System Map.
18. Cockpit shall not read from System Map UI state. It shall read from
    `WorkGraphProjection` directly.
19. Work shall expose a view mode switch for at least:
    - `System Map`
    - `Cockpit`
20. Changing view mode shall change the Work-owned sidebar entries, main
    content grouping, sorting, empty states, and primary CTAs.
21. Changing view mode shall not change the selected object's canonical
    identity or detail drawer behavior.
22. Platform shell chrome shall stay outside Work view mode ownership.
23. Work view-owned sidebar entries shall be generated from projection metadata,
    not hard-coded as one static list for all modes.
24. The first System Map sidebar shall include at least:
    - Interaction
    - Planning
    - Execution
    - Evidence
    - Gates
    - Broken Links
25. The first Cockpit sidebar shall include at least:
    - Command Center
    - Needs Decision
    - Active Work
    - Blocked
    - Shipped
    - Teams
26. The shared detail drawer shall support at least these object kinds:
    - Project
    - WorkItem
    - Task
    - Run
    - Conversation
    - Artifact
    - Activity
    - Approval / approval binding
27. Detail drawer content shall show both structural links and operational
    next actions when available.
28. Chat-created or Chat-linked records shall be visible through the same graph
    slots rather than through Chat-specific Work UI branches.
29. Code-created or Code-linked records shall be visible through the same graph
    slots rather than through Code-specific Work UI branches.
30. Existing Work renderer prototypes may be removed once replacement views
    cover their required routes or their functionality is explicitly deferred.

### Non-Functional Requirements

- **Model clarity**: UI grouping must not contradict ADR-081. If a surface wants
  a friendly label, it must still map back to the canonical layer and record.
- **Projection integrity**: System Map and Cockpit must consume the same graph
  projection.
- **Testability**: System Map slot assignment and broken-link diagnostics must
  be testable without browser-only visual assertions.
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
type WorkGraphLayer =
  | 'interaction'
  | 'planning'
  | 'execution'
  | 'evidence'
  | 'gate';

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
  | 'approval';

type WorkAttentionState =
  | 'none'
  | 'decision_needed'
  | 'blocked'
  | 'failed'
  | 'ready_to_review'
  | 'recently_shipped';

interface WorkGraphObjectSummary {
  id: string;
  kind: WorkGraphObjectKind;
  layer: WorkGraphLayer;
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

interface WorkGraphProjection {
  objects: WorkGraphObjectSummary[];
  links: Array<{
    fromId: string;
    toId: string;
    relation: string;
  }>;
  diagnostics: Array<{
    id: string;
    severity: 'info' | 'warning' | 'error';
    objectId: string | null;
    message: string;
  }>;
}
```

This is a specification shape, not a required final TypeScript file layout.
Implementation may split summaries, links, and diagnostics if needed, but the
semantic fields must remain available to both System Map and Cockpit.

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

## Dependencies

- [ADR-081](../decisions/081-canonicalize-three-tier-core-record-taxonomy.md)
- [ADR-082](../decisions/082-recast-orchestrator-as-capability-shell-with-policy-dial-supervision.md)
- [ADR-083](../decisions/083-adopt-work-graph-projections-for-system-map-and-cockpit.md)
- [SPEC-058](./SPEC-058-interaction-core-and-domain-materialization.md)
- [SPEC-062](./SPEC-062-agent-missions-and-transport-bindings.md)
- [SPEC-040](./SPEC-040-cats-work-team-templates-and-work-intake.md)
- [2026-04-25 AOS reference system deep-research update](../research/2026-04-25-deep-research-report.md)

## Open Questions

- [ ] Should the first implementation use a new `/work/map` route family or a
      persisted `?view=system-map` mode on `/work`?
- [ ] Which detail drawer fields are mandatory for each object kind in the
      first implementation?
- [ ] Should Cockpit become the default route immediately after it lands, or
      only after System Map diagnostics are clean for Chat / Code writes?
- [ ] Which broken-link diagnostics should block handoff versus remain warnings?
- [ ] How much role / team inference should be deterministic in the first slice
      versus stored as metadata on tasks and work items?

## References

- [ADR-083: Adopt Work Graph Projections for System Map and Cockpit](../decisions/083-adopt-work-graph-projections-for-system-map-and-cockpit.md)
- [ADR-081: Canonicalize the Core record taxonomy as Interaction / Planning / Execution](../decisions/081-canonicalize-three-tier-core-record-taxonomy.md)
- [ADR-082: Recast the orchestrator as a capability shell with policy-dial supervision](../decisions/082-recast-orchestrator-as-capability-shell-with-policy-dial-supervision.md)
- [SPEC-040: Cats Work Team Templates and Work Intake](./SPEC-040-cats-work-team-templates-and-work-intake.md)
- [AOS reference system deep-research update](../research/2026-04-25-deep-research-report.md)

---

*Created: 2026-04-25*
*Author: Codex*
*Related Plan: TBD*
