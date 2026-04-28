# ADR-083: Adopt Work Graph Projections for System Map and Cockpit

> Recast Cats Work around one product-owned Work Graph projection layer.
> Build System Map first and keep it as the production default / conformance
> surface. Build Cockpit second as an opt-in operational projection. Tables and
> Task Hub remain deferred projections over the same graph.

## Status

Accepted

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
   Planning / Execution. Evidence is rendered from record-specific
   anchors, and gates are rendered as cross-cutting decorators; neither
   owns a peer pane.
2. **Tables** - Airtable-like record tables for Projects, WorkItems,
   Tasks, Runs, Artifacts, Approvals, and Activities.
3. **Cockpit** - monday-style dashboard polish, without monday's
   department-lane structure, organized around operational triage,
   decision pressure, blockers, shipped evidence, and role / team load.
4. **Task Hub** - ClickUp-like work-object operation view centered on
   task queues and task detail actions.

The project needs two things first:

- an always-available default Work surface that proves Chat and Code
  outputs land in correct ADR-081 slots and exposes mistakes
  immediately; and
- a later production owner cockpit that can summarize active work
  without hiding taxonomy or anchoring errors.

## Decision

### 1. Cats Work uses one Work Graph, not separate view-specific data models

Cats Work will introduce a product-owned **Work Graph projection**
above the canonical Core records. The Work Graph is not a new
persistence model and does not add new Core record families. It is the
shared read-model layer that normalizes:

- identity and link structure across Conversation, Project, WorkItem,
  Task, Mission, Run, Artifact, Activity, Approval, and related
  records;
- structural layer classification limited to `interaction`,
  `planning`, and `execution`;
- cross-layer evidence attachments such as Artifact, Outcome,
  Checkpoint, Trace, and Activity, using their record-specific anchor
  fields;
- cross-cutting gate decorators such as ApprovalBinding, using subject
  object identity rather than a separate layer slot;
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

### 2. Build System Map first and keep it as the production default

The first top-down Work view will be **System Map**. Its job is to
validate the mental model and give Chat / Code clear slots to fill.
It is also the production default Work entry, not a dev-only or
inspection-only surface.

System Map groups the Work Graph into exactly the ADR-081 structural
panes:

- `Interaction` - Agent, Participant, Container, Conversation, Turn,
  Lane, Segment, Session, TransportBinding.
- `Planning` - Project and WorkItem.
- `Execution` - Task, Mission, Run.

Evidence is shown at its anchored object, not as a fourth pane.
Artifact and Activity can materialize from Project / WorkItem /
Conversation / Task / Run anchors as their schemas allow. Outcome,
Checkpoint, and Trace are shown only through their Conversation / Task /
Run anchors. Evidence with no useful anchor is a diagnostic, not a
separate navigation bucket.

Gates are shown as badges, overlays, or detail-drawer decorators on
their subject objects. Approval does not own a System Map pane or
structural layer slot.

System Map remains the default because it is the conformance test for
the product. If Chat or Code writes an object into the wrong place, the
owner should see the mismatch in the default Work surface immediately.

### 3. Build Cockpit second as an opt-in operational projection

The second Work view will be **Cockpit**. It uses the same Work Graph
but groups it by owner-operational questions:

- What needs my decision?
- What is active?
- What is blocked or failing?
- What shipped or produced evidence?
- Which teams, roles, or capabilities are overloaded, idle, or
  repeatedly failing?

Cockpit is production-quality when built, but it is not the default
Work entry in this ADR. It is an opt-in view mode over the same graph.
System Map remains the default until a future ADR explicitly changes
that decision.

This also clarifies the monday influence: Cockpit is not a monday clone
and does not require fake departments. It may show role-framed or
team-framed lanes when the data is real, but its first grouping is
operational triage.

### 4. Producers write canonical slots, not view-specific state

Chat, Code, Work, and runtime producers must write canonical records and
anchors that the Work Graph can project. They must not write
System-Map-specific or Cockpit-specific state.

The slot contract is:

- Interaction writes create or link Conversation-family records.
- Planning writes create or link Project and WorkItem records.
- Execution writes create or link Task, Mission, and Run records.
- Evidence writes create Artifact / Activity records with their
  allowed anchors, or Outcome / Checkpoint / Trace records with
  Conversation / Task / Run anchors.
- Gate writes create ApprovalBinding-style records with a subject kind
  and subject id.

Views can derive grouping, badges, attention states, and diagnostics
from those records. If a producer claims Work ownership but omits the
anchors required to locate the object, System Map must surface that as
a broken-slot diagnostic.

### 5. Work entry materializes all three structural layers

`Cats Work +New work` is the product-owned Work entry. It is not a
plain chat with a Work badge. It must materialize enough canonical
Core state for the Work Graph to show an Interaction anchor, Planning
anchors, and an Execution objective immediately:

- one primary `Conversation`;
- one `Project`;
- one `WorkItem`; and
- one primary `Task` linked from the `WorkItem` through the
  `WorkItem.taskId` Planning -> Execution bridge.

The product may auto-create low-friction defaults such as an inbox
project or untriaged work item, but it must still write durable Work
records. Otherwise the entry is a Chat conversation or Code task, not
a Work entry.

`Run` remains lazy. A Work entry does not create a `Run` until a
supervised execution attempt, tool batch, continuation, or delegated
operation actually starts. This keeps System Map honest: Planning
shows the durable work to be done; Execution shows the primary task
immediately and the attempt ledger only after work starts.

### 6. Defer Tables and Task Hub

Tables and Task Hub are useful but not on the first production path.

- **Tables** is the future Airtable-like power-user view over the same
  graph. It extends System Map with sortable / filterable record
  tables.
- **Task Hub** is the future ClickUp-like high-frequency operation
  view. It extends Cockpit and the shared detail drawer with richer
  task queues and bulk actions.

Neither should block System Map or Cockpit.

### 7. Work view mode owns Work navigation

Work has two navigation layers:

- **Platform shell chrome** - global product and account navigation
  such as Chat, Work, Code, Settings, global search, account, and
  setup status. This does not depend on Work view mode.
- **Work view-owned sidebar** - Work-local navigation generated by
  the selected projection.

Changing from System Map to Cockpit changes the Work-local sidebar,
main content layout, grouping, sorting, empty states, and CTAs. It
does not change the underlying object identities, selection intent,
filters that still apply, or the shared detail drawer.

### 8. Old Work renderer UI must be isolated before the new shell starts

The existing Work renderer components may be mined for useful API
clients, projection helpers, or tests, but they do not define the new
information architecture, layout, visual style, or component contract.

Before implementation starts on the new Work shell, the old Work UI
routes and renderer components must be isolated or retired so the new
shell is not co-resident with the rejected prototype. Non-UI helpers
may be moved behind the new boundaries when they still fit. Hybrid
fallbacks and compatibility shims for the old Work renderer are
explicitly rejected.

This follows the repository pre-release policy: unreleased prototypes
are implementation history, not compatibility targets.

## Consequences

### Positive

- Work can move top-down without waiting for Chat-mode UI cleanup.
- System Map stays visible enough to prevent taxonomy drift and bad
  Chat / Code writes from hiding behind friendly dashboards.
- Chat and Code get explicit Work slots to target when they produce
  conversations, work items, tasks, runs, artifacts, and activities.
- System Map provides a testable first slice for link integrity,
  orphan detection, missing anchors, and status consistency.
- Cockpit can later become a production owner surface without
  creating a second data model.
- Tables and Task Hub remain available expansion paths without
  blocking the main Work rollout.
- Existing unapproved Work UI can be retired cleanly before it
  influences the new shell.

### Negative

- The default Work entry will initially be more structural than a
  polished owner cockpit.
- A Work Graph projection layer adds an explicit read-model seam that
  must be kept honest with tests.
- Two view modes require Work-local navigation to be generated from
  projection metadata instead of hard-coded as one static sidebar.
- Producers must satisfy the slot contract rather than relying on a
  forgiving dashboard to mask missing anchors.

### Neutral

- No Core schema change is required by this decision.
- Existing API projections may be reused where they fit, but they are
  not treated as UI contracts.
- SPEC-040 / PLAN-028 remain historical input for Work intake, but the
  new Work shell is not required to preserve their renderer structure.

## Alternatives Considered

### Alternative 1: Make Cockpit first or make it the default

- **Pros**: fastest path to a human-facing owner dashboard.
- **Cons**: risks hiding model errors behind friendly groupings before
  Chat and Code prove they can write into the right slots.
- **Why rejected**: the current blocker is model / slot confidence.
  System Map proves that first and remains the production conformance
  surface. Cockpit follows as an opt-in projection.

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
  Project / WorkItem / Interaction slots and cross-layer evidence
  anchors are proven.
- **Why rejected**: Task Hub is valuable after the graph and shared
  detail drawer exist, but premature as the primary top-down frame.

### Alternative 4: Preserve and incrementally polish the existing Work UI

- **Pros**: lower immediate diff; reuses current components.
- **Cons**: keeps the product anchored to unapproved bottom-up
  prototypes and preserves information architecture that the owner has
  explicitly rejected.
- **Why rejected**: the old Work UI has no design authority and must
  be isolated before the new shell starts.

## References

- [ADR-081: Canonicalize the Core record taxonomy as Interaction / Planning / Execution](./081-canonicalize-three-tier-core-record-taxonomy.md)
- [ADR-082: Recast the orchestrator as a capability shell with policy-dial supervision](./082-recast-orchestrator-as-capability-shell-with-policy-dial-supervision.md)
- [SPEC-040: Cats Work Team Templates and Work Intake](../specs/SPEC-040-cats-work-team-templates-and-work-intake.md)
- [2026-04-25 AOS reference system deep-research update](../research/2026-04-25-deep-research-report.md)
- [2026-04-23 Codex Cats Work Agent Supervision Model](../research/2026-04-23-codex-cats-work-agent-supervision-model.md)
- [2026-04-23 Claude Orchestrator as Capability Shell](../research/2026-04-23-claude-orchestrator-as-capability-shell.md)

---

*Decision made: 2026-04-25*
*Decision revised: 2026-04-28*
*Decision makers: User + Codex*
