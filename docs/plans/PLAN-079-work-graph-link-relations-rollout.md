# PLAN-079: Work Graph Link Relations Rollout

> Phased delivery plan for ADR-086 / SPEC-090: typed N:M `WorkGraphLink`
> relations between Project / Work Item / Task objects.

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Draft |
| **Owner** | Claude |
| **Reviewer** | User |
| **Related ADR** | [ADR-086](../decisions/086-adopt-n-to-m-work-graph-link-relations.md) |
| **Related Spec** | [SPEC-090](../specs/SPEC-090-work-graph-link-relations.md) |

## Goal

Land typed lateral relations between Work Graph objects (Project /
Work Item / Task) without disturbing the ADR-081 three-tier hierarchy
or the System Map structural-conformance surface. Each phase below is
shippable on its own.

## Sequencing

The phases are ordered so renderer surfaces can be exercised against
mock data **before** the producer pipeline writes real links. This
mirrors the SPEC-083 pattern that landed System Map and Cockpit on
mock fixtures first.

## Phase 1 — Type and projection contract

**Scope.**
- Add `WorkGraphLinkKind` (stored kinds only — `blocks`, `related_to`,
  `duplicate_of`, `follows`) and `WorkGraphLinkViewKind` (read-side
  view kinds, including the projection-derived `blocked_by`) to
  `src/products/work/renderer/components/topdown/types.ts`.
- Add the `WorkGraphLink` shape with Core-identity endpoints
  (`sourceRecordKind / sourceRecordId / targetRecordKind /
  targetRecordId`) per SPEC-090 §Suggested Record Shape.
- Extend `WorkGraphProjection` with `links: WorkGraphLink[]` plus
  whatever Core-identity lookup the renderer needs to resolve a link
  endpoint to a graph object. Two acceptable shapes:
  - **Option A (recommended)**: extend `WorkGraphObjectSummary` with
    explicit Core identity (`coreRecordKind: WorkGraphLinkEndpointKind;
    coreRecordId: string;`) so any consumer can look up a graph
    object by record identity directly.
  - **Option B**: keep `WorkGraphObjectSummary` as today and add a
    separate `objectsByRecord: ReadonlyMap<` `${kind}:${id}`,
    `WorkGraphObjectSummary>` to `WorkGraphProjection`.
  Either way, the renderer MUST NOT assume `WorkGraphObjectSummary.id`
  equals the Core record id; that equivalence is implementation-
  specific and may not hold once the projection covers cross-record-
  family graph objects.
- Extend `WorkGraphDiagnosticKind` with `orphan_link` and `link_cycle`.
- Update mock fixture under
  `src/products/work/renderer/components/topdown/mock.ts` to seed at
  least one example per **stored** link kind (`blocks`, `related_to`,
  `duplicate_of`, `follows`), plus one orphan-link example and one
  cycle for the diagnostics surface. Do not seed any `blocked_by`
  rows in storage — the derived `blocked_by` view is exercised in
  Phase 2 by rendering against the seeded `blocks` rows.
- Update `buildIndexes` / projection helpers (in
  `components/topdown/shared.ts`) to:
  - materialize the `blocked_by` read-side view by inverting each
    stored `blocks` row;
  - present `related_to` symmetrically (each stored row produces a
    rendered relation on both endpoints, regardless of which side is
    the canonical source);
  - detect cycles in the stored `blocks` subgraph;
  - surface the Core-identity lookup chosen above.

**Done when.**
- `tsc --noEmit` passes.
- `MOCK_WORK_GRAPH.links` contains examples of every **stored** kind,
  no `blocked_by` rows in storage, and a renderer test (or Phase 2
  smoke check) confirms `blocked_by` shows up on the inverse endpoint
  of every seeded `blocks` row.
- Diagnostics emit `orphan_link` / `link_cycle` for the seeded fixtures.
- Given a `WorkGraphLink` row, the renderer can resolve both endpoints
  to their `WorkGraphObjectSummary` through the projection without
  guessing about id equality.

**Risks.**
- Cycle detection has to be deterministic regardless of object
  ordering. Start with a simple Tarjan / DFS pass keyed on
  lexicographically sorted Core identity tuples; revisit if hot-path
  cost matters.
- If Option A is taken, the existing `WorkGraphObjectSummary`
  consumers (System Map, Cockpit, Broken Links, the new Projects /
  Work Items pages) need a coordinated schema bump; Option B avoids
  that but adds a parallel index.

## Phase 2 — Detail page Linkage section

**Scope.**
- Add a "Linkage" section to `ProjectDetailPage`, `WorkItemDetailPage`,
  and (later) `TaskDetailPage` that groups `links` by `kind`.
- Each entry renders status dot + title + relation badge and links to
  the target object's detail page through the existing route map
  (`/work/projects/:id`, `/work/work-items/:id`, etc.).
- Pure read-only at this phase. No writes yet.
- Empty-state copy per relation kind is defined and matches the warm /
  light visual identity already used by Projects / Work Items.

**Done when.**
- Detail pages for the seeded mock objects render their incoming and
  outgoing links and let the user navigate to each related object.
- No regressions on the existing Overview / Tasks / Activity sections.

## Phase 3 — Cockpit Blockers rail

**Scope.**
- Add a "Blockers" rail to `CockpitPage` that, for each row in the
  current attention list, walks the transitive `blocks` upstream chain
  (max depth 3) and renders dot + title + tier label.
- Read-only at this phase.

**Done when.**
- Cockpit shows the upstream blockers for the items it already
  surfaces.
- The rail honors the existing System Map / Cockpit shared
  detail-drawer click pattern.

## Phase 4 — Diagnostics in Broken Links page

**Scope.**
- Extend the existing Broken Links page renderer to display
  `orphan_link` and `link_cycle` rows under its existing list contract.
- No new page; reuse existing diagnostic styling.

**Done when.**
- Seeded orphan / cycle fixtures show on Broken Links.
- Resolving the underlying issue (i.e. removing the offending link
  once Phase 5 ships writes) clears the diagnostic on next projection
  rebuild.

## Phase 5 — Producer pipeline wiring + Add-link affordance

This is the **first** phase that introduces user-writable links. Per
ADR-086 and SPEC-090, no earlier phase ships a renderer-side or
projection-only writable store; user-visible link creation is gated on
producer-pipeline support so that writes always land in the canonical
Core record family from day one.

**Scope.**
- Producer pipeline gains read / write support for the canonical
  `WorkGraphLink` record family per SPEC-090's producer interface
  (`createLink` / `removeLink` / `listLinks` keyed on canonical Core
  record identity).
- The producer pipeline owns canonicalization (`blocks` swap when a
  caller submits `blocked_by`; lexicographic sort for `related_to`)
  and idempotency on the canonical form.
- A new shared dialog `NewLinkDialog` (parallel to `NewProjectDialog` /
  `NewWorkItemDialog`) exposes: kind picker, target picker (typeahead
  across Projects / Work Items / Tasks, filtered to non-deleted),
  optional note. Submission calls the producer-pipeline `createLink`
  endpoint; there is **no** renderer-side persistence layer.
- Each detail page's Linkage section gains an "Add link" button that
  opens the dialog with the source record's `(recordKind, recordId)`
  already filled.

**Done when.**
- Chat / code / runtime / the renderer can all write links and the
  result is visible to the others through the projection without any
  renderer-side caching.
- The dialog can write each canonical kind (`blocks`, `related_to`,
  `duplicate_of`, `follows`) and `blocked_by` submissions are coerced
  into `blocks` per SPEC-090 §4.
- Self-link attempts are rejected at the dialog and again at the
  producer API.
- The orphan / cycle diagnostics from Phase 4 clear when the user
  removes the offending link.
- SPEC-090's acceptance criteria pass end-to-end.

## Cross-cutting

- All phases are gated by ADR-086 staying Accepted; if the ADR is
  revised away from N:M lateral linkage, this plan is superseded.
- Each phase ships in its own commit and is independently revertible.
- No phase changes the existing Core single-parent FKs from ADR-081 §4
  (`WorkItem.projectId`, `WorkItem.taskId`, `WorkItem.parentWorkItemId`,
  `Task.parentTaskId`, `Run.taskId`, etc.).
- No phase ships a renderer-side or projection-only writable link
  store. User-visible link creation is gated on Phase 5 producer-
  pipeline support so links always live in the canonical Core record
  family.

## Open Items

- Whether to expose linkage-aware filters in System Map or keep them
  Cockpit-only is a Phase 6 question; deferred.

## Related Documents

- [ADR-086 — Adopt N:M Work Graph link relations](../decisions/086-adopt-n-to-m-work-graph-link-relations.md)
- [SPEC-090 — Work Graph link relations](../specs/SPEC-090-work-graph-link-relations.md)
- [ADR-083 — Adopt Work Graph projections for System Map and Cockpit](../decisions/083-adopt-work-graph-projections-for-system-map-and-cockpit.md)
- [SPEC-083 — Work System Map and Cockpit Projections](../specs/SPEC-083-work-system-map-and-cockpit-projections.md)
