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

- Introducing or surfacing recursive Sub-Work-Item parenting. The
  underlying FK (`WorkItem.parentWorkItemId`) is already part of the
  frozen ADR-081 §4 Core contract; ADR-086 neither adds it nor rejects
  it, and SPEC-090 leaves it untouched. Whether Work UI v1 ever
  surfaces a Sub-Work-Item create affordance is a separate UI-scope
  decision tracked elsewhere.
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
   - `id`: stable identity for the link itself.
   - `kind`: canonical relation kind stored in Core. The canonical
     set is `blocks`, `related_to`, `duplicate_of`, `follows`.
     `blocked_by` is **not** stored — it is a projection-derived
     inverse of `blocks` (see §4 below).
   - `sourceRecordKind`: Core record family of the source. Restricted
     to `project | work_item | task` at v1.
   - `sourceRecordId`: Core record id within that family.
   - `targetRecordKind`: same shape, same restriction.
   - `targetRecordId`: same shape, same restriction.
   - `createdAt`: ISO-8601 timestamp.
   - `createdByActorId` (optional).
   - `note` (optional, ≤ 280 chars).
2. Both `(sourceRecordKind, sourceRecordId)` and `(targetRecordKind,
   targetRecordId)` MUST resolve to an existing Core record at write
   time. Otherwise the producer / write API fails with a structured
   error.
3. The producer / write API MUST reject self-links — defined as
   `sourceRecordKind == targetRecordKind && sourceRecordId ==
   targetRecordId` — at write time. Self-link rejection is a write-side
   responsibility; the projection layer is read-only and only emits an
   `orphan_link` diagnostic if a self-link somehow appears in storage
   (defensive, not authoritative).
4. **Canonicalization at write time** (per ADR-086 §3):
   - `blocks` is the only blocker kind stored. A producer that detects
     `B blocked_by A` MUST write `A blocks B` (swap source / target).
     The write API SHOULD coerce `blocked_by` submissions by swapping
     before insert, but MUST NOT store both directions.
   - `related_to` is symmetric. Storage canonicalizes the pair by
     ordering `(sourceRecordKind, sourceRecordId)` and
     `(targetRecordKind, targetRecordId)` lexicographically; the
     smaller tuple is always the source. Producers MAY submit either
     order.
   - `duplicate_of` and `follows` are directional and stored as
     written.
5. The projection layer MUST derive read-time views for the operator:
   - For each `A blocks B` row, render `A blocks B` on A's detail
     page and `B blocked_by A` on B's detail page.
   - For each canonical `related_to` row, render the relation on both
     ends.
6. `WorkGraphProjection` (see ADR-083 §2 / SPEC-083 §Suggested Work
   Graph Shape) gains a new field `links: WorkGraphLink[]`.
7. `WorkGraphProjection.diagnostics` gains two new
   `WorkGraphDiagnosticKind` values:
   - `orphan_link`: a link whose `(sourceRecordKind, sourceRecordId)`
     or `(targetRecordKind, targetRecordId)` does not resolve to an
     existing Core record (e.g., the underlying record was deleted).
   - `link_cycle`: at least one cycle exists in the directed `blocks`
     subgraph. Diagnostics MUST include the participating record
     identities.
8. `duplicate_of` and `follows` cycles are not flagged at v1.
   `related_to` is symmetric and so cannot cycle.
9. The renderer MUST surface links in two places at v1:
   - **Per-object detail pages** (Project, Work Item, Task) gain a
     "Linkage" section listing each relation grouped by displayed
     kind (Blocking / Blocked by / Related / Duplicate of / Follows),
     with a click target navigating to the linked record's detail
     page.
   - **Cockpit** gains a derived "Blockers" projection that, for
     items in the operator's current attention set, lists the
     upstream `blocks` chain.
10. The renderer MUST NOT surface links inside System Map's structural
    tier-nesting view at v1. System Map remains the structural-anchor
    conformance surface; linkage is layered on per-object detail pages
    only.
11. The "+ New work item" / "+ New project" / "+ New task" dialogs MAY
    accept an optional initial linkage (e.g. "blocks: <existing
    record>") at v1 but are not required to.

### Non-Functional Requirements

- The link write API MUST be idempotent on the canonical form. After
  applying §4 canonicalization, writing the same `(kind,
  sourceRecordKind, sourceRecordId, targetRecordKind, targetRecordId)`
  is a no-op (no duplicate row, same `id` returned).
- The projection MUST keep cycle-detection cost bounded by the count of
  `blocks` rows, not the count of all graph objects.
- All link reads MUST be available through the same `WorkGraphProjection`
  read model that today drives System Map and Cockpit, so the renderer
  does not open a second data path.
- Writes MUST go through the canonical Core record family; no surface
  (renderer or producer) is permitted to maintain a separate
  client-side or projection-only writable link store. This is the
  ADR-086 single-source-of-truth requirement; PLAN-079 sequences
  delivery so no phase ever ships a producer-invisible writable store.

## Suggested Record Shape

The implementation hint below mirrors the existing `types.ts` style in
`src/products/work/renderer/components/topdown/types.ts`. The actual
Core record shape is the producer pipeline's responsibility; this spec
defines the projection contract and renderer expectations.

```ts
// Stored kinds (Core). `blocked_by` is NOT a stored kind — it is a
// projection-derived view of `blocks`.
export type WorkGraphLinkKind =
  | "blocks"
  | "related_to"
  | "duplicate_of"
  | "follows";

// Endpoint identity is canonical Core identity, NOT projection object id.
export type WorkGraphLinkEndpointKind = "project" | "work_item" | "task";

export interface WorkGraphLink {
  id: string;
  kind: WorkGraphLinkKind;
  sourceRecordKind: WorkGraphLinkEndpointKind;
  sourceRecordId: string;
  targetRecordKind: WorkGraphLinkEndpointKind;
  targetRecordId: string;
  createdAt: string;
  createdByActorId: string | null;
  note: string | null;
}

// Read-side view kinds the projection synthesizes per object — includes
// the derived `blocked_by` view that does not appear in storage.
export type WorkGraphLinkViewKind =
  | "blocks"
  | "blocked_by"
  | "related_to"
  | "duplicate_of"
  | "follows";

export interface WorkGraphProjection {
  // existing fields …
  links: WorkGraphLink[];
}
```

## Producer Interface

Producers (chat, code, runtime) interact with links through a single
write API. All endpoints use canonical Core record identity — never
Work Graph projection object id:

- `createLink({
    kind,
    source: { recordKind, recordId },
    target: { recordKind, recordId },
    note?
  }) → WorkGraphLink`
- `removeLink(linkId) → void`
- `listLinks({ recordKind?, recordId?, kind? }) → WorkGraphLink[]`

`createLink` MUST apply §4 canonicalization before insert and MUST
behave idempotently on the canonical form. Submitting `blocked_by` is
allowed at the API surface; the implementation rewrites it as `blocks`
with source / target swapped.

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
