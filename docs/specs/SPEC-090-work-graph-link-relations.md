# SPEC-090: Work Graph Link Relations

> Define the data model, projection contract, producer interface, and renderer
> surfaces for typed N:M relations between Work Graph objects (Project / Work
> Item / Task). Implements ADR-086.

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Draft |
| **Owner** | Claude |
| **Reviewer** | User |
| **Related ADR** | [ADR-086](../decisions/086-adopt-n-to-m-work-graph-link-relations.md) |
| **Related Plan** | [PLAN-079](../plans/PLAN-079-work-graph-link-relations-rollout.md) |

## Summary

Cats Work needs to express lateral relations between Work Graph objects
that are not single-parent containment: `blocks` / `blocked_by`,
`related_to`, `duplicate_of`, `follows`. ADR-086 adopts a typed N:M
`WorkGraphLink` record family for this purpose. This spec defines the
record shape, the projection contract that exposes it to renderers, the
producer write API, the diagnostics added, and the UI surfaces that
read or write links at v1.

## Goals

- Define one durable record shape (`WorkGraphLink`) that all Work Graph
  link relations reuse.
- Keep linkage strictly orthogonal to the ADR-081 hierarchy: containment
  is unchanged, links are additive.
- Give producers (chat, code, runtime) one predictable write contract
  per relation kind.
- Expose links in System Map, Cockpit, and the per-object detail pages
  through one shared rendering contract.
- Provide cycle detection for `blocks` chains so the projection can
  flag impossible plans before users hit them.
- Keep v1 surface scope small enough to ship incrementally per
  PLAN-079.

## Non-Goals

- Adding recursive Sub-Work-Item parenting. ADR-086 explicitly rejects
  this.
- Linking Conversation, Turn, Lane, Run, Artifact, Activity, Outcome,
  Approval Binding, Agent, or Container objects in v1. Existing
  single-parent and evidence-attachment mechanisms continue to cover
  those.
- Cross-record-family graph edges that mix linkage with evidence; those
  remain separate concepts.
- Defining a full graph-visualization mode in System Map at v1. v1 only
  surfaces links inline next to the related objects.
- Adding write or query support for new link kinds beyond the v1 set.

## User Stories

- As the owner, I want to see, on a Work Item detail page, every other
  Work Item or Task that is currently blocking it, so that I can decide
  whether to push, swap, or ignore the blocker.
- As the owner, I want Cockpit to surface the blockers of items I
  already care about, so that I see "the chain holding this up" instead
  of one isolated row.
- As the owner, I want to mark two Tasks as duplicates so future triage
  consolidates their Run history under the canonical one and I stop
  double-counting work.
- As a Chat implementer, I want one well-defined producer call to write
  a `blocks` relation when a conversation reveals a dependency, so I
  don't invent an ad-hoc field.
- As a Code implementer, I want a `follows` link to point a new task at
  the deprecated task it supersedes, so the run ledger of the old one
  remains discoverable.
- As a future power user, I want the projection's diagnostics to flag
  cycles in `blocks` so that I can repair them before automation walks
  into a deadlock.

## Requirements

### Functional Requirements

1. Cats Core gains a new record family `WorkGraphLink` with the
   following minimum durable fields:
   - `id`: stable identity for the link.
   - `kind`: one of `blocks`, `blocked_by`, `related_to`,
     `duplicate_of`, `follows`.
   - `sourceObjectId`: object the relation originates from.
   - `targetObjectId`: object the relation points to.
   - `createdAt`: ISO-8601 timestamp.
   - `createdByCatId` (optional).
   - `note` (optional, ≤ 280 chars).
2. Both `sourceObjectId` and `targetObjectId` MUST resolve to a Work
   Graph object whose `kind` is `project`, `work_item`, or `task`.
3. The projection layer MUST reject self-links (source equals target)
   at write time with a structured error.
4. The projection layer MUST materialize the inverse for
   `blocks` / `blocked_by`. Producers MAY write either side; readers
   see both sides.
5. `WorkGraphProjection` (see ADR-083 §2 / SPEC-083 §Suggested Work
   Graph Shape) gains a new field `links: WorkGraphLink[]`.
6. `WorkGraphProjection.diagnostics` gains two new
   `WorkGraphDiagnosticKind` values:
   - `orphan_link`: a link whose `sourceObjectId` or `targetObjectId`
     does not resolve to a known graph object.
   - `link_cycle`: at least one cycle exists in the directed `blocks`
     subgraph. Diagnostics MUST include the participating object ids.
7. `duplicate_of` and `follows` cycles are not flagged at v1.
   `related_to` is symmetric and so cannot cycle.
8. The renderer MUST surface links in two places at v1:
   - **Per-object detail pages** (Project, Work Item, Task) gain a
     "Linkage" section listing each relation grouped by `kind`, with a
     click target navigating to the linked object's detail page.
   - **Cockpit** gains a derived "Blockers" projection that, for items
     in the operator's current attention set, lists the upstream
     `blocks` chain.
9. The renderer MUST NOT surface links inside System Map's structural
   tier-nesting view at v1. System Map remains the structural-anchor
   conformance surface; linkage is layered on per-object detail pages
   only.
10. The "+ New work item" / "+ New project" / "+ New task" dialogs MAY
    accept an optional initial linkage (e.g. "blocks: <existing object>")
    at v1 but are not required to.

### Non-Functional Requirements

- The link write API MUST be idempotent on `(kind, sourceObjectId,
  targetObjectId)` triples. Re-writing the same triple does not
  duplicate.
- The projection MUST keep cycle-detection cost bounded by the count of
  `blocks` links, not the count of all graph objects.
- All link reads MUST be available through the same `WorkGraphProjection`
  read model that today drives System Map and Cockpit, so the renderer
  does not open a second data path.

## Suggested Record Shape

The implementation hint below mirrors the existing `types.ts` style in
`src/products/work/renderer/components/topdown/types.ts`. The actual
Core record shape is the producer pipeline's responsibility; this spec
defines the projection contract and renderer expectations.

```ts
export type WorkGraphLinkKind =
  | "blocks"
  | "blocked_by"
  | "related_to"
  | "duplicate_of"
  | "follows";

export interface WorkGraphLink {
  id: string;
  kind: WorkGraphLinkKind;
  sourceObjectId: string;
  targetObjectId: string;
  createdAt: string;
  createdByCatId: string | null;
  note: string | null;
}

export interface WorkGraphProjection {
  // existing fields …
  links: WorkGraphLink[];
}
```

## Producer Interface

Producers (chat, code, runtime) interact with links through a single
write API:

- `createLink(kind, sourceObjectId, targetObjectId, note?) → WorkGraphLink`
- `removeLink(linkId) → void`
- `listLinks({ objectId? , kind? }) → WorkGraphLink[]`

The transport binding (REST endpoint, RPC method, in-process call) is
out of scope for this spec; it follows the existing producer-pipeline
conventions established by SPEC-006 and SPEC-083.

## UI Surfaces

### Per-Object Detail Pages

For Project / Work Item / Task detail pages:

- Add a `Linkage` section after the existing structural sections
  (Overview / Tasks / Activity).
- Group by `kind`: Blockers (incoming `blocks`), Blocking (outgoing
  `blocks`), Related, Duplicate of, Follows.
- Each entry renders title + status dot + a link to the related
  object's detail page.
- An "Add link" affordance opens a small dialog: pick relation kind,
  pick target object (search across projects / work items / tasks),
  optional note. Submission goes through `createLink`.

### Cockpit

- Cockpit's existing operator-attention list gains a "Blockers"
  side-rail. For each row in the attention list, the rail lists the
  transitive upstream `blocks` chain (max depth 3 at v1) with status
  dot + title + tier label.
- The Blockers rail does not navigate; it is read-only. Clicking a
  blocker opens its detail page through the same drawer pattern as the
  existing list.

### Diagnostics Surface

- The existing Broken Links page (ADR-083 §Diagnostics) gains two new
  diagnostic kinds (`orphan_link`, `link_cycle`) under its existing
  rendering contract. No new page is added.

## Out of Scope for v1

- Bulk link import / export.
- Visual graph view of all links.
- Link permissions per relation kind.
- Link expiration or auto-archival when one end is deleted (delete
  cascading is the producer pipeline's responsibility; the projection
  simply surfaces `orphan_link` until the producer cleans up).
- Linkage between Conversations, Runs, Artifacts, or other non-PWT
  objects.

## Acceptance Criteria

A v1 slice is acceptable when:

1. The Work Graph projection includes `links: WorkGraphLink[]` and the
   two new diagnostic kinds.
2. The mock fixture under
   `src/products/work/renderer/components/topdown/mock.ts` (or the next
   producer source of truth) includes representative examples of every
   v1 link kind.
3. Project / Work Item / Task detail pages render the Linkage section
   and let the user follow each link.
4. The Add-link dialog can write each of the v1 kinds and the writes
   round-trip via the projection.
5. Cockpit renders the Blockers rail for items in its current
   attention list.
6. Broken Links page renders `orphan_link` and `link_cycle` entries.
7. Cycle detection on `blocks` produces deterministic diagnostics
   regardless of object iteration order.
8. None of the above changes the existing System Map structural view,
   the existing `linkedXxxId` parent fields, or the ADR-081 tier
   contract.

## Open Questions

- Whether `related_to` should be presented to the user as a single
  symmetric edge or as a pair of inverse rows (one per side). v1 picks
  symmetric single-edge for simplicity; revisit if it becomes a
  navigation friction point.
- Whether Cockpit's Blockers rail should expand transitive blockers
  past depth 3. Defer until we have real usage data on chain length.
- Whether the producer pipeline should auto-create `blocks` links from
  natural-language cues in chat ("blocked by X"). Out of scope for this
  spec; tracked as a future producer-side enhancement.

## Related Documents

- [ADR-081 — Canonicalize three-tier Core record taxonomy](../decisions/081-canonicalize-three-tier-core-record-taxonomy.md)
- [ADR-083 — Adopt Work Graph projections for System Map and Cockpit](../decisions/083-adopt-work-graph-projections-for-system-map-and-cockpit.md)
- [ADR-086 — Adopt N:M Work Graph link relations](../decisions/086-adopt-n-to-m-work-graph-link-relations.md)
- [SPEC-083 — Work System Map and Cockpit Projections](./SPEC-083-work-system-map-and-cockpit-projections.md)
- [PLAN-079 — Work Graph link relations rollout](../plans/PLAN-079-work-graph-link-relations-rollout.md)
