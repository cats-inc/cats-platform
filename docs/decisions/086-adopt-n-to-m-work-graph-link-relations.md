# ADR-086: Adopt N:M Work Graph Link Relations for Cross-Tier Item Linkage

> Add a typed N:M link relation primitive (`blocks`, `blocked_by`, `related_to`,
> `duplicate_of`, `follows`) between Work Graph objects, anchored on canonical
> Core record identity. Linkage is *lateral* — orthogonal to the ADR-081
> three-tier hierarchy and to the existing Core single-parent FKs (including
> `WorkItem.parentWorkItemId`, which already exists in Core and is not changed
> here).

## Status

Draft

## Context

ADR-081 fixed Cats Core on a three-tier canonical taxonomy (Interaction,
Planning, Execution) plus cross-cutting Evidence and Approval Gates.
ADR-083 then anchored Cats Work on a single Work Graph projection over
those records, with System Map as the production default and Cockpit as
the opt-in operational view.

That structure is strict by design: every object sits in exactly one
tier, and every parent relation goes through frozen Core foreign keys
listed in ADR-081 §4 — `WorkItem.projectId`, `WorkItem.taskId` (the
Planning → Execution bridge), `WorkItem.parentWorkItemId` (Work Item
self-nest already in Core), `Task.parentTaskId`, `Run.taskId`,
`Run.parentRunId`, etc. The fields on `WorkGraphObjectSummary`
(`linkedConversationId / linkedProjectId / linkedWorkItemId /
linkedTaskId / linkedRunId`) are the *projection* surface over those
Core FKs and reverse lookups, not separate truth.

Real Cats Work usage already shows two structural needs that this
single-parent model does not cover:

1. **Lateral dependencies between sibling objects.** Two Work Items can
   block each other ("retention email needs landing-page deploy first"),
   two Tasks can be duplicates of one piece of work tracked in two
   places, a Task can supersede ("follows") an earlier deprecated Task,
   and two Projects can be marked related when they share supporting
   evidence but neither contains the other. None of these relations are
   parent-child, and forcing them into `linkedXxxId` either overloads
   the field semantically or requires another single-parent slot per
   relation type.
2. **Decision triage and Cockpit clustering across siblings.** Cockpit
   needs to surface "what blocks the items the owner already cares
   about" and "what is duplicate of what" without scanning the full
   graph each render. Without typed links, every triage view has to
   re-derive these relations from scratch.

The Paperclip control-plane research, including the
`2026-04-15-paperclip-killer-feature-gap-analysis.md`, calls out that
Paperclip's `Sub-issue / Parent / Blocked by / Blocking / Related work`
relations cover the same two needs above through two distinct
mechanisms: a recursive parent pointer for the structural decomposition
side, and a typed relation table for the lateral side.

The recursive-parent half of that mechanism (Sub-Work-Item nesting
via `WorkItem.parentWorkItemId`) is **already part of the frozen Core
contract** — ADR-081 §4 lists `WorkItem.parentWorkItemId → WorkItem`,
and `CoreWorkItemRecord.parentWorkItemId` is present in
`src/core/types.ts`. ADR-086 does **not** introduce, change, or
remove that FK, and does not take a position on whether Work UI v1
exposes a Sub-Work-Item creation surface. (As of this writing, Work
v1 does not — see SPEC-083 — but that is a UI scope decision, not a
schema rejection.)

The lateral half is the actual gap: typed N:M relations are not
represented anywhere in the current Core schema.

## Decision

### 1. Add `WorkGraphLink` as a typed N:M relation primitive

Cats Core gains one additive record family, `WorkGraphLink`, with the
following minimum shape (Core identity, not projection identity):

- `id` — stable identity for the link itself.
- `kind` — canonical relation kind stored in Core. The canonical set
  is:
  - `blocks` (directed, asymmetric)
  - `related_to` (symmetric)
  - `duplicate_of` (directed; the source is the duplicate, the target
    is the canonical)
  - `follows` (directed; the source supersedes the target)
  - `blocked_by` is **not** stored — it is a projection-derived
    inverse of `blocks`. See §3 for canonicalization rules.
- `sourceRecordFamily` / `sourceRecordId` — the Core record family and
  id this relation originates from. At v1, `sourceRecordFamily` is
  restricted to `project | work_item | task`. (This is the endpoint
  family restriction, not the relation `kind` enum above.)
- `targetRecordFamily` / `targetRecordId` — same shape; `targetRecordFamily`
  is restricted to the same set.
- `createdAt`, optional `createdByActorId`, optional `note`.

`WorkGraphLink` is a Core record family, not a renderer-only construct.
Producers (chat, code, runtime) write Core identity; the Work Graph
projection layer maps `(recordFamily, recordId)` to graph object id at
read time. This means renaming or rebuilding the projection cannot
orphan a link, and links written by one producer are immediately
visible to any other.

### 2. Allowed record families at both ends of a link

- Both ends MUST be a Core record whose family is `project`,
  `work_item`, or `task`.
- Cross-tier links across those families are allowed (e.g. a Task can
  block a Work Item).
- Conversation, Turn, Lane, Run, Artifact, Activity, Outcome,
  ApprovalBinding, Agent, and Container records are **out of scope**
  at v1; they continue to participate in the graph via existing Core
  single-parent FKs and the evidence-attachment mechanism.
- Self-links (same family AND same id at both ends) are rejected at
  write time.

### 3. Canonicalization rules

To keep the link table free of duplicate-but-equivalent rows:

- `blocks` is the only directional-blocker kind that is stored.
  Producers that detect a `B blocked_by A` relation MUST write it as
  `A blocks B` (i.e. swap source and target). The projection derives
  `blocked_by` for read.
- `related_to` is symmetric. Storage canonicalizes the pair by sorting
  `(sourceRecordFamily, sourceRecordId)` and `(targetRecordFamily,
  targetRecordId)` lexicographically; the smaller tuple is always the
  source. Producers MAY submit either order; the canonicalization
  happens at the write API boundary. The projection presents the
  relation on both ends.
- `duplicate_of` and `follows` are directional and stored as written
  (no canonicalization).

Idempotency is on the canonical form: writing the same
`(kind, sourceRecordFamily, sourceRecordId, targetRecordFamily,
targetRecordId)` after canonicalization is a no-op.

### 4. Linkage is orthogonal to hierarchy, not a replacement

`WorkGraphLink` does not subsume or replace any existing Core single-
parent FK or Work Graph projection field. Containment FKs
(`WorkItem.projectId`, `WorkItem.taskId`, `WorkItem.parentWorkItemId`,
`Task.parentTaskId`, `Run.taskId`, etc.) keep their meaning unchanged.
`WorkGraphLink` only carries relations that are **not** single-parent
containment.

The Work Graph projection layer renders both, but it MUST NOT collapse
them into one structure: hierarchy is rendered as containment in
System Map / Cockpit; linkage is rendered as side-pane or chip-level
annotations on the relevant object.

### 5. We reject the alternatives

- **Re-purposing `WorkItem.parentWorkItemId` (or any other Core
  containment FK) for lateral relations**: rejected. The FK already
  exists in Core for hierarchical Sub-Work-Item nesting; reusing it
  for `blocks` / `related_to` would conflate containment with lateral
  relations and break ADR-081 §4. ADR-086 leaves that FK alone.
- **Adding more single-parent fields per relation kind** (e.g. a
  `blockedByWorkItemId` column on `CoreWorkItemRecord`): rejected.
  Linear scaling per relation kind, no support for N:M (multiple
  blockers), conflates relation semantics with parent containment, and
  cannot represent cross-family relations (e.g. Task blocks Project).
- **Folding linkage into existing evidence attachments**: rejected.
  Evidence attachments already mean "this object is supporting material
  for that anchor object." Repurposing them for `blocks` / `related_to`
  loses that semantic and breaks the System Map evidence-rendering
  contract.
- **Writing links keyed on Work Graph projection object id**:
  rejected. Graph object id is a projection identity that may change
  with renderer or projection refactors; durable records must key on
  Core identity.

### 6. Diagnostics responsibilities

The Work Graph projection diagnostics layer already enumerates classes
like `broken_fk`, `unanchored_run`, etc.. Linkage adds two new
diagnostic kinds at v1:

- `orphan_link` — `(sourceRecordFamily, sourceRecordId)` or
  `(targetRecordFamily, targetRecordId)` does not resolve to a known
  Core record.
- `link_cycle` — a chain of `blocks` links forms a cycle.

`duplicate_of` cycles, `follows` cycles, and `related_to` are not
flagged at v1.

## Consequences

### Positive

- Real-world dependency, duplicate, and supersession relations get a
  durable home without requiring schema changes per relation type.
- Cockpit and System Map can offer "what blocks the things I care
  about", "duplicates of this", and "this used to be that" as
  first-class projections rather than ad-hoc filters.
- Producers (chat / code / runtime) get one explicit shape to write
  when they detect a relation; readers get one explicit shape to query.
- The ADR-081 three-tier hierarchy and frozen Core FK contract stay
  intact — nothing about `WorkItem.projectId`, `WorkItem.taskId`,
  `WorkItem.parentWorkItemId`, `Task.parentTaskId`, `Run.taskId`, or
  any other ADR-081 §4 FK changes.
- Anchoring on Core record identity (`recordFamily`, `recordId`)
  instead of Work Graph projection object id keeps the link table
  durable across renderer or projection refactors.

### Negative

- One additional Core record family to seed, project, and document. The
  cost is small (single shape, additive) but non-zero.
- UI must teach two different relation modes: containment (rendered
  via tier nesting and breadcrumbs) and link (rendered as chips, side-
  pane, or graph edges). If we explain this poorly, users may try to
  use `blocks` to mean "is part of."
- Cycle detection for `blocks` requires the projection layer to walk
  the link graph; cost grows with link count. Acceptable at expected
  scale for v1.

### Neutral

- Paperclip remains a useful comparison point, but Cats Work is no
  longer attempting to mimic Paperclip feature-for-feature. We adopt
  the lateral-relation half of their model. Sub-Work-Item nesting is
  already covered by `WorkItem.parentWorkItemId` in Core; whether and
  when Work UI v1 surfaces a Sub-Work-Item create affordance is a
  separate UI scope decision, out of scope for this ADR.

## Related Documents

- [ADR-081 — Canonicalize three-tier Core record taxonomy](./081-canonicalize-three-tier-core-record-taxonomy.md)
- [ADR-083 — Adopt Work Graph projections for System Map and Cockpit](./083-adopt-work-graph-projections-for-system-map-and-cockpit.md)
- SPEC-090 — Work Graph link relations (data model and UI surfaces)
- PLAN-079 — Work Graph link relations rollout
