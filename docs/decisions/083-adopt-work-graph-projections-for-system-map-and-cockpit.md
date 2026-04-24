# ADR-083: Adopt Work Graph Projections for System Map and Cockpit

> Recast Cats Work around one product-owned Work Graph projection layer.
> Build the System Map view first to validate the shared mental model and
> cross-product slots, then build the Cockpit view as the production-facing
> owner surface. Tables and Task Hub remain deferred projections over the same
> graph.

## Status

Proposed

## Context

The current Cats Work renderer grew from the earlier chat-first,
bottom-up product path. That direction is no longer sufficient. The
owner has explicitly rejected the existing Work UI as an unapproved
prototype; it must not constrain the next Work information
architecture, visual design, navigation, or component contracts.

At the same time, the repository now has enough durable vocabulary to
make a top-down Work product possible:

- ADR-081 defines the canonical Core taxonomy as Interaction,
  Planning, Execution, plus cross-cutting gates and evidence /
  materialization records.
- ADR-082 narrows the orchestrator into a capability shell with
  lifecycle, tool, invariant, and evidence responsibilities.
- The AOS reference-system research recommends combining an
  Airtable-like state backbone, a monday-like owner cockpit, and a
  ClickUp-like work-object operation model.

The open product decision is how Cats Work should expose that model.
Four viable view families exist:

1. **System Map** - ADR-081-like structural view over Interaction /
   Planning / Execution / Evidence.
2. **Tables** - Airtable-like record tables for Projects, WorkItems,
   Tasks, Runs, Artifacts, Approvals, and Activities.
3. **Cockpit** - monday-like owner command center organized around
   decisions, active work, blockers, shipped outputs, and teams.
4. **Task Hub** - ClickUp-like work-object operation view centered on
   task queues and task detail actions.

The project needs two things first:

- a reliable way to prove Chat and Code outputs can land in correct
  Work slots; and
- a production-facing Work surface that a non-technical owner can use
  without reading chat transcripts or raw record tables.

## Decision

### 1. Cats Work uses one Work Graph, not separate view-specific data models

Cats Work will introduce a product-owned **Work Graph projection**
above the canonical Core records. The Work Graph is not a new
persistence model and does not add new Core record families. It is the
shared read-model layer that normalizes:

- identity and link structure across Conversation, Project, WorkItem,
  Task, Run, Artifact, Activity, Approval, and related records;
- layer classification such as `interaction`, `planning`,
  `execution`, `evidence`, and `gate`;
- operational classification such as attention state, blocked state,
  handoff state, owner role, and next action; and
- stable object identity so all views open the same shared detail
  drawer for the same underlying object.

All Work views are projections over this graph. We explicitly reject
UI-to-UI fake adapters such as "System Map UI converted into Cockpit
UI." The mapping must be:

```text
Cats Core records -> Work Graph -> View projection
```

not:

```text
View A state -> compatibility adapter -> View C state
```

### 2. Build System Map first

The first top-down Work view will be **System Map**. Its job is to
validate the mental model and give Chat / Code clear slots to fill.
It groups the Work Graph into:

- `Interaction` - Agent, Participant, Container, Conversation, Turn,
  Lane, Segment, Session, TransportBinding.
- `Planning` - Project and WorkItem.
- `Execution` - Task, Mission, Run.
- `Evidence` - Artifact, Outcome, Checkpoint, Trace, Activity.
- `Gates` - approvals and approval bindings as cross-cutting gates.

System Map is allowed to feel structural and inspection-oriented. It
is the first implementation target because it is easier to verify:
records either anchor correctly, or they are orphaned / inconsistent.

### 3. Build Cockpit second and make it the production-facing Work default

The second Work view will be **Cockpit**. It uses the same Work Graph
but groups it by owner-operational questions:

- What needs my decision?
- What is active?
- What is blocked or failing?
- What shipped or produced evidence?
- Which teams / roles / capabilities are overloaded, idle, or
  repeatedly failing?

Cockpit becomes the default production-facing Work entry once it is
usable. System Map remains available as an inspection / model
validation view.

### 4. Defer Tables and Task Hub

Tables and Task Hub are useful but not on the first production path.

- **Tables** is the future Airtable-like power-user view over the same
  graph. It extends System Map with sortable / filterable record
  tables.
- **Task Hub** is the future ClickUp-like high-frequency operation
  view. It extends Cockpit and the shared detail drawer with richer
  task queues and bulk actions.

Neither should block System Map or Cockpit.

### 5. Work view mode owns Work navigation

Work has two navigation layers:

- **Platform shell chrome** - global product and account navigation
  such as Chat, Work, Code, Settings, global search, account, and
  setup status. This does not depend on Work view mode.
- **Work view-owned sidebar** - Work-local navigation generated by
  the selected projection.

Changing from System Map to Cockpit changes the Work-local sidebar,
main content layout, grouping, sorting, empty states, and CTAs. It
does not change the underlying object identities or the shared detail
drawer.

### 6. Old Work renderer UI is not a design constraint

The existing Work renderer components may be mined for useful API
clients, projection helpers, or tests, but they do not define the new
information architecture, layout, visual style, or component contract.
When the new Work shell is ready, obsolete Work renderer prototypes
should be deleted rather than preserved through compatibility shims.

This follows the repository pre-release policy: unreleased prototypes
are implementation history, not compatibility targets.

## Consequences

### Positive

- Work can move top-down without waiting for Chat-mode UI cleanup.
- Chat and Code get explicit Work slots to target when they produce
  conversations, work items, tasks, runs, artifacts, and activities.
- System Map provides a testable first slice for link integrity,
  orphan detection, missing anchors, and status consistency.
- Cockpit can later become a production owner surface without
  creating a second data model.
- Tables and Task Hub remain available expansion paths without
  blocking the main Work rollout.
- Existing unapproved Work UI can be retired cleanly.

### Negative

- The first System Map slice may look more structural than
  production-polished, which requires discipline not to mistake it for
  the final owner experience.
- A Work Graph projection layer adds an explicit read-model seam that
  must be kept honest with tests.
- Two view modes require Work-local navigation to be generated from
  projection metadata instead of hard-coded as one static sidebar.

### Neutral

- No Core schema change is required by this decision.
- Existing API projections may be reused where they fit, but they are
  not treated as UI contracts.
- SPEC-040 / PLAN-028 remain historical input for Work intake, but the
  new Work shell is not required to preserve their renderer structure.

## Alternatives Considered

### Alternative 1: Make Cockpit first

- **Pros**: fastest path to a human-facing owner dashboard.
- **Cons**: risks hiding model errors behind friendly groupings before
  Chat and Code prove they can write into the right slots.
- **Why rejected**: the current blocker is model / slot confidence.
  System Map proves that first; Cockpit follows as a projection.

### Alternative 2: Make Tables first

- **Pros**: strong Airtable-like state inspection; easy to implement
  with record lists.
- **Cons**: too close to System Map structurally, but less useful for
  validating cross-layer mental-model slots. It also invites
  database-admin UX as the first Work impression.
- **Why rejected**: Tables is a power-user extension, not the first
  Work shell.

### Alternative 3: Make Task Hub first

- **Pros**: aligns with day-to-day work-object operations and agent
  task handling.
- **Cons**: collapses Work back toward task-centric execution before
  Project / WorkItem / Interaction / Evidence slots are proven.
- **Why rejected**: Task Hub is valuable after the graph and shared
  detail drawer exist, but premature as the primary top-down frame.

### Alternative 4: Preserve and incrementally polish the existing Work UI

- **Pros**: lower immediate diff; reuses current components.
- **Cons**: keeps the product anchored to unapproved bottom-up
  prototypes and preserves information architecture that the owner has
  explicitly rejected.
- **Why rejected**: the old Work UI has no design authority.

## References

- [ADR-081: Canonicalize the Core record taxonomy as Interaction / Planning / Execution](./081-canonicalize-three-tier-core-record-taxonomy.md)
- [ADR-082: Recast the orchestrator as a capability shell with policy-dial supervision](./082-recast-orchestrator-as-capability-shell-with-policy-dial-supervision.md)
- [SPEC-040: Cats Work Team Templates and Work Intake](../specs/SPEC-040-cats-work-team-templates-and-work-intake.md)
- [2026-04-25 AOS reference system deep-research update](../research/2026-04-25-deep-research-report.md)
- [2026-04-23 Codex Cats Work Agent Supervision Model](../research/2026-04-23-codex-cats-work-agent-supervision-model.md)
- [2026-04-23 Claude Orchestrator as Capability Shell](../research/2026-04-23-claude-orchestrator-as-capability-shell.md)

---

*Decision made: 2026-04-25*
*Decision makers: User + Codex*
