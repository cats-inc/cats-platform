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
   - `sourceRecordFamily`: lowercase WorkGraph object-kind value
     identifying the source's record family. The valid value space at
     v1 is exactly `project | work_item | task` (i.e. the
     `WorkGraphLinkEndpointKind` enum). This reuses the field name
     SPEC-083 §Suggested Work Graph Shape introduced on
     `WorkGraphObjectSummary` (where the type is the wider
     `WorkGraphObjectKind`); link endpoints constrain it to the v1
     subset above. Producers MUST NOT use Core record-class names like
     `CoreWorkItemRecord` / `ManagedWorkRecord` here — only the
     lowercase WorkGraph kind values are accepted.
   - `sourceRecordId`: Core record id within that family.
   - `targetRecordFamily`: same shape, same value space.
   - `targetRecordId`: same shape, same restriction.
   - `createdAt`: ISO-8601 timestamp.
   - `createdByActorId` (optional).
   - `note` (optional, ≤ 280 chars).
2. Both `(sourceRecordFamily, sourceRecordId)` and `(targetRecordFamily,
   targetRecordId)` MUST resolve to an existing Core record at write
   time. Otherwise the producer / write API fails with a structured
   error.
3. The producer / write API MUST reject self-links — defined as
   `sourceRecordFamily == targetRecordFamily && sourceRecordId ==
   targetRecordId` — at write time. Self-link rejection is exclusively
   a write-side responsibility; the projection layer is read-only and
   does not police self-links. (If a self-link still leaks into
   storage due to a producer bug, that is a write-pipeline integrity
   issue, not a projection diagnostic.)
4. **Canonicalization at write time** (per ADR-086 §3):
   - `blocks` is the only blocker kind stored. A producer that detects
     `B blocked_by A` MUST write `A blocks B` (swap source / target).
     The write API SHOULD coerce `blocked_by` submissions by swapping
     before insert, but MUST NOT store both directions.
   - `related_to` is symmetric. Storage canonicalizes the pair by
     ordering `(sourceRecordFamily, sourceRecordId)` and
     `(targetRecordFamily, targetRecordId)` lexicographically; the
     smaller tuple is always the source. Producers MAY submit either
     order.
   - `duplicate_of` and `follows` are directional and stored as
     written.
5. The projection layer MUST derive read-time views from the stored
   rows and expose them per-endpoint. For each stored row, the
   projection first checks that BOTH endpoints resolve to an existing
   Core record. If both resolve, the row contributes the following
   entries to `WorkGraphProjection.linksByEndpoint`:
   - `A blocks B` → a `blocks` view on A and a `blocked_by` view on B.
   - canonical `related_to` between A and B → a `related_to` view on
     both A and B (each with the other as `otherEndpoint`).
   - `A duplicate_of B` → a `duplicate_of` view on A only at v1
     (the canonical / target side renders no entry; revisit if user
     demand emerges).
   - `A follows B` → a `follows` view on A only at v1 (mirror of the
     `duplicate_of` rule).
   If either endpoint does NOT resolve, the row is treated as
   orphaned: it is **excluded** from `linksByEndpoint` (so the
   detail-page Linkage section does not show broken rows), and the
   projection emits an `orphan_link` diagnostic instead. Surfacing
   broken links is the Broken Links page's job, not the per-object
   Linkage section's. (Revisit if user feedback shows the
   exclusion hides too much context — the orientation can flip to
   "include with `unresolvedEndpoint: true` flag" without breaking
   producers.)
6. `WorkGraphProjection` gains two new fields per the shape in §
   Suggested Record Shape:
   - `links: WorkGraphLink[]` — raw stored rows (includes orphaned
     rows so Broken Links can iterate them; the projection layer is
     authoritative on which subset feeds `linksByEndpoint`).
   - `linksByEndpoint: Partial<Record<WorkGraphEndpointKey,
     WorkGraphLinkView[]>>` — per-endpoint derived views, sparse map
     of well-resolved rows only. Consumers MUST treat absence of a
     key as the empty array `[]`.
7. `WorkGraphProjection.diagnostics` gains two new
   `WorkGraphDiagnosticKind` values:
   - `orphan_link`: a link whose `(sourceRecordFamily, sourceRecordId)`
     or `(targetRecordFamily, targetRecordId)` does not resolve to an
     existing Core record (e.g., the underlying record was deleted).
   - `link_cycle`: at least one cycle exists in the directed `blocks`
     subgraph. Diagnostics MUST include the participating record
     identities.
8. `duplicate_of` and `follows` cycles are not flagged at v1.
   `related_to` is symmetric and so cannot cycle.
9. The renderer MUST surface links in two places at v1, both reading
   from `WorkGraphProjection.linksByEndpoint` (NOT from `links`
   directly — the renderer must not re-derive `blocked_by` or
   symmetric `related_to`):
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
  sourceRecordFamily, sourceRecordId, targetRecordFamily, targetRecordId)`
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
// At v1 only Project / Work Item / Task records can be link endpoints.
export type WorkGraphLinkEndpointKind = "project" | "work_item" | "task";

// Stored row shape. Endpoints reuse SPEC-083's
// `sourceRecordFamily / sourceRecordId` naming on
// `WorkGraphObjectSummary` so the projection can resolve a link
// endpoint to a graph object by direct field match.
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

// Read-side view kinds the projection synthesizes per object. Includes
// the derived `blocked_by` view that does not appear in storage.
// Derivation rules per stored row (must match §FR5 exactly):
//   blocks       → blocks view on source endpoint, blocked_by view
//                  on target endpoint
//   related_to   → related_to view on both endpoints (canonical row
//                  is symmetric, so each side sees the other as
//                  otherEndpoint)
//   duplicate_of → duplicate_of view on source endpoint only at v1
//                  (target / canonical side gets no view)
//   follows      → follows view on source endpoint only at v1
//                  (target / superseded side gets no view)
export type WorkGraphLinkViewKind =
  | "blocks"
  | "blocked_by"
  | "related_to"
  | "duplicate_of"
  | "follows";

// Per-endpoint read-side projection of a link, oriented "from this
// endpoint's perspective". The renderer iterates `views[endpointKey]`
// and renders one row per entry under the appropriate displayed kind.
export interface WorkGraphLinkView {
  // Same id as the underlying stored WorkGraphLink, so unfollow /
  // delete can target it without an extra lookup.
  linkId: string;
  // Read-side kind, oriented from `selfEndpoint` toward
  // `otherEndpoint`. May be `blocked_by` even though no stored row
  // has that kind.
  kind: WorkGraphLinkViewKind;
  selfEndpoint: WorkGraphLinkEndpointRef;
  otherEndpoint: WorkGraphLinkEndpointRef;
  note: string | null;
  createdAt: string;
}

export interface WorkGraphLinkEndpointRef {
  recordFamily: WorkGraphLinkEndpointKind;
  recordId: string;
}

// Serializable composite key form: `${recordFamily}:${recordId}`.
// Used as the key for both `linksByEndpoint` and any object-by-record
// lookup. Stable across projection rebuilds because Core identity
// drives it.
export type WorkGraphEndpointKey = `${WorkGraphLinkEndpointKind}:${string}`;

export interface WorkGraphProjection {
  // existing fields …
  links: WorkGraphLink[];
  // Per-endpoint read-side views the renderer consumes directly.
  //
  // Sparse map: only endpoints that have at least one view appear as
  // keys; consumers MUST fall back to `[]` when a key is absent.
  // `WorkGraphEndpointKey` is a template-literal type with an
  // unbounded `${string}` half, so every concrete `Record<...>` is
  // structurally partial — `Partial<>` makes that explicit.
  //
  // Orphan links (rows where source or target does not resolve to an
  // existing Core record) are EXCLUDED from this map. They appear
  // only as `orphan_link` diagnostics — see §FR5–§FR8.
  linksByEndpoint: Partial<Record<WorkGraphEndpointKey, WorkGraphLinkView[]>>;
}
```

`WorkGraphObjectSummary` already exposes `sourceRecordFamily` /
`sourceRecordId` per SPEC-083 §Suggested Work Graph Shape, where the
field type is the wider `WorkGraphObjectKind` enum (covering
conversation / run / artifact / approval and other non-PWT objects).
SPEC-090 narrows the value space to `WorkGraphLinkEndpointKind` only
on the link record itself; on `WorkGraphObjectSummary` the field
keeps its wider type. The renderer resolves a link endpoint to its
graph object by matching the link's narrow `recordFamily` /
`recordId` against the summary's wider `sourceRecordFamily` /
`sourceRecordId`. No separate map is required as long as the
projection populates those summary fields for every Project / Work
Item / Task object.

## Producer Interface

Producers (chat, code, runtime) interact with links through a single
write API. All endpoints use canonical Core record identity — never
Work Graph projection object id:

- `createLink({
    kind,
    source: { recordFamily, recordId },
    target: { recordFamily, recordId },
    note?
  }) → WorkGraphLink`
- `removeLink(linkId) → void`
- `listLinks({ recordFamily?, recordId?, kind? }) → WorkGraphLink[]`

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

1. The Work Graph projection includes `links: WorkGraphLink[]`,
   `linksByEndpoint: Partial<Record<WorkGraphEndpointKey,
   WorkGraphLinkView[]>>` (sparse — see §FR6), and the two new
   diagnostic kinds.
2. The mock fixture under
   `src/products/work/renderer/components/topdown/mock.ts` (or the next
   producer source of truth) includes representative examples of every
   **stored** link kind (`blocks`, `related_to`, `duplicate_of`,
   `follows`). It MUST NOT seed any `blocked_by` rows in storage. A
   separate test confirms the projection emits `blocked_by` views on
   the inverse endpoint of each seeded `blocks` row, and `related_to`
   views on both endpoints of each seeded canonical `related_to` row.
3. Project / Work Item / Task detail pages render the Linkage section
   and let the user follow each link.
4. The Add-link dialog can write each of the v1 **stored** kinds
   (`blocks`, `related_to`, `duplicate_of`, `follows`) and the writes
   round-trip via the projection. A `blocked_by` submission from the
   dialog is coerced into `blocks` per §4 canonicalization and shows
   up as a `blocked_by` view on the inverse endpoint at read time.
5. Cockpit renders the Blockers rail for items in its current
   attention list.
6. Broken Links page renders `orphan_link` and `link_cycle` entries.
7. Cycle detection on `blocks` produces deterministic diagnostics
   regardless of object iteration order.
8. None of the above changes the existing System Map structural view,
   the existing `linkedXxxId` projection fields, the ADR-081 §4 Core
   FK contract (including `WorkItem.parentWorkItemId`), or the
   `sourceRecordFamily` / `sourceRecordId` fields on
   `WorkGraphObjectSummary` defined by SPEC-083.

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
