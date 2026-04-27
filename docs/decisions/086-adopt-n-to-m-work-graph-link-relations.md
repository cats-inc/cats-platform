# ADR-086: Adopt N:M Work Graph Link Relations for Cross-Tier Item Linkage

> Add a typed N:M link relation primitive (`blocks`, `blocked_by`, `related_to`,
> `duplicate_of`, `follows`) between Work Graph objects. Reject recursive sub-
> Work-Item parenting and reject further expansion of single-parent
> `linkedXxxId` fields on `WorkGraphObjectSummary`. Linkage is orthogonal to the
> ADR-081 three-tier hierarchy and does not change it.

## Status

Draft

## Context

ADR-081 fixed Cats Core on a three-tier canonical taxonomy (Interaction,
Planning, Execution) plus cross-cutting Evidence and Approval Gates.
ADR-083 then anchored Cats Work on a single Work Graph projection over
those records, with System Map as the production default and Cockpit as
the opt-in operational view.

That structure is strict by design: every object sits in exactly one
tier, and every parent relation goes through the fixed
`linkedConversationId / linkedProjectId / linkedWorkItemId / linkedTaskId
/ linkedRunId` fields on `WorkGraphObjectSummary`. The fields capture
single-parent containment: a Task points to its Work Item, a Work Item
points to its Project, a Run points to its Task, etc.

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

We have already considered, and rejected in this ADR, copying the
recursive-parent half of that mechanism. Adding `parent_work_item_id`
or treating Work Items as recursive would re-introduce the same
"is this decomposition a Sub-Work-Item or a Task?" decision point that
ADR-081 explicitly closed by giving Task its own tier. Recursive Work
Items would dilute the three-tier semantic contract that System Map,
Cockpit, query layers, and producer documentation are built on.

The remaining gap is the lateral half: typed N:M relations.

## Decision

### 1. Add `WorkGraphLink` as a typed N:M relation primitive

Cats Core gains one additive record family, `WorkGraphLink`, with the
following minimum shape:

- `id` — stable identity for the link itself.
- `kind` — relation kind. The supported kinds at v1 are:
  - `blocks` (directed, asymmetric)
  - `blocked_by` (inverse of `blocks`; producers MAY write either side
    and the projection MUST materialize the inverse)
  - `related_to` (symmetric, undirected semantically)
  - `duplicate_of` (directed; the source is the duplicate, the target
    is the canonical)
  - `follows` (directed; the source supersedes the target)
- `sourceObjectId` — Work Graph object the relation originates from.
- `targetObjectId` — Work Graph object the relation points to.
- `createdAt`, optional `createdByCatId`, optional `note`.

`WorkGraphLink` is a Core record family, not a renderer-only construct,
so producers (chat, code, runtime) and projections (System Map,
Cockpit) read and write the same source of truth.

### 2. Allowed object kinds at both ends of a link

- Both `sourceObjectId` and `targetObjectId` MUST point at a
  `WorkGraphObjectKind` of `project`, `work_item`, or `task`.
- Cross-tier links between those kinds are allowed (e.g. a Task can
  block a Work Item).
- Conversation, Turn, Lane, Run, Artifact, Activity, Outcome,
  ApprovalBinding, Agent, and Container objects are **out of scope** at
  v1; they continue to be linked via existing single-parent and
  evidence-attachment mechanisms.
- Self-links (source equals target) are rejected at write time.

### 3. Linkage is orthogonal to hierarchy, not a replacement

`WorkGraphLink` does not subsume or replace any existing `linkedXxxId`
field. A Task still records its parent Work Item via `linkedWorkItemId`,
a Work Item still records its Project via `linkedProjectId`, and so on.

`WorkGraphLink` only carries relations that are **not** single-parent
containment. The Work Graph projection layer renders both, but it MUST
NOT collapse them into one structure: hierarchy is rendered as
containment in System Map / Cockpit; linkage is rendered as side-pane
or chip-level annotations on the relevant object.

### 4. We reject the alternatives

- **Recursive Work Items via `parent_work_item_id`**: rejected. Re-
  introduces "Sub-WI vs Task" decision point and weakens the ADR-081
  three-tier contract that downstream queries, projections, and
  producer documentation depend on.
- **Adding more single-parent `linkedXxxId` fields per relation type**
  (e.g. `blockedByWorkItemId`): rejected. Linear scaling per relation
  kind, no support for N:M (multiple blockers), and conflates relation
  semantics with parent containment.
- **Folding linkage into existing evidence attachments**: rejected.
  Evidence attachments already mean "this object is supporting material
  for that anchor object." Repurposing them for `blocks` / `related_to`
  loses that semantic and breaks the System Map evidence-rendering
  contract.

### 5. Diagnostics responsibilities

The Work Graph projection diagnostics layer already enumerates classes
like `broken_fk`, `unanchored_run`, etc.. Linkage adds two new
diagnostic kinds at v1:

- `orphan_link` — `sourceObjectId` or `targetObjectId` does not
  resolve to a known object.
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
- The ADR-081 three-tier hierarchy stays intact — nothing about
  Project / Work Item / Task / Run changes.
- Existing `linkedWorkItemId` field on `WorkGraphObjectSummary`, which
  was reserved for a possible future Sub-WI direction, is **not**
  repurposed here. Its presence does not become a contradiction with
  this ADR; it stays available for ADR-081's existing single-parent
  semantics if a later spec ever needs it.

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
  the lateral-relation half of their model and explicitly reject the
  recursive-parent half.

## Related Documents

- [ADR-081 — Canonicalize three-tier Core record taxonomy](./081-canonicalize-three-tier-core-record-taxonomy.md)
- [ADR-083 — Adopt Work Graph projections for System Map and Cockpit](./083-adopt-work-graph-projections-for-system-map-and-cockpit.md)
- SPEC-090 — Work Graph link relations (data model and UI surfaces)
- PLAN-079 — Work Graph link relations rollout
