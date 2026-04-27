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
- Add `WorkGraphLinkKind` and `WorkGraphLink` to
  `src/products/work/renderer/components/topdown/types.ts`.
- Extend `WorkGraphProjection` with `links: WorkGraphLink[]`.
- Extend `WorkGraphDiagnosticKind` with `orphan_link` and `link_cycle`.
- Update mock fixture under
  `src/products/work/renderer/components/topdown/mock.ts` to seed at
  least one example per v1 link kind (`blocks`, `blocked_by`,
  `related_to`, `duplicate_of`, `follows`), plus one orphan-link
  example and one cycle for the diagnostics surface.
- Update `buildIndexes` / projection helpers (in
  `components/topdown/shared.ts`) to materialize `blocks ↔ blocked_by`
  inverses and to detect cycles in the `blocks` subgraph.

**Done when.**
- `tsc --noEmit` passes.
- `MOCK_WORK_GRAPH.links` is iterable and includes the v1 examples.
- Diagnostics emit `orphan_link` / `link_cycle` for the seeded fixtures.

**Risks.**
- Cycle detection has to be deterministic regardless of object
  ordering. Start with a simple Tarjan / DFS pass keyed on
  lexicographically sorted ids; revisit if hot-path cost matters.

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

## Phase 3 — Add-link affordance and dialog

**Scope.**
- A new shared dialog `NewLinkDialog` (parallel to `NewProjectDialog` /
  `NewWorkItemDialog`).
- The dialog exposes: kind picker, target picker (typeahead across
  Projects / Work Items / Tasks, filtered to non-deleted), optional
  note.
- Each detail page's Linkage section gains an "Add link" button that
  opens the dialog with `sourceObjectId` already filled.
- Wires through to a renderer-side store (`workLinksStore`) that
  mirrors the `pinnedProjectsStore` / `workItemsStore` patterns:
  in-memory `createdLinks[]`, localStorage-backed, exposes
  `useWorkLinks()` and `createLink` / `removeLink`.

**Done when.**
- The user can add a link of every v1 kind from any of the three
  detail pages.
- Self-link attempts are rejected before submission.
- Created links survive page refresh through localStorage and
  immediately appear in the Linkage section.

## Phase 4 — Cockpit Blockers rail

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

## Phase 5 — Diagnostics in Broken Links page

**Scope.**
- Extend the existing Broken Links page renderer to display
  `orphan_link` and `link_cycle` rows under its existing list contract.
- No new page; reuse existing diagnostic styling.

**Done when.**
- Seeded orphan / cycle fixtures show on Broken Links.
- Resolving the underlying issue (e.g. removing the offending link via
  Phase 3 affordance, once that lands) clears the diagnostic on next
  projection rebuild.

## Phase 6 — Producer pipeline wiring (server-side)

**Scope.**
- Replace the renderer-side `workLinksStore` with reads / writes
  against the canonical producer pipeline (chat, code, runtime).
- Idempotency on `(kind, sourceObjectId, targetObjectId)` is enforced
  server-side.
- Inverse materialization (`blocks ↔ blocked_by`) happens server-side;
  the renderer drops its client-side mirroring helper.

**Done when.**
- Chat / code / runtime can write links and they appear in the
  projection without renderer-side caching.
- localStorage fallback is removed.
- SPEC-090 producer-interface acceptance criteria pass.

## Cross-cutting

- All phases are gated by ADR-086 staying Accepted; if the ADR is
  revised back to recursive Sub-WI, this plan is superseded.
- Each phase ships in its own commit and is independently revertible.
- No phase changes the existing `linkedXxxId` parent fields or the
  ADR-081 tier contract.

## Open Items

- Phase 6's producer-side schema (Core record family vs derived
  projection) is the producer pipeline owner's call. SPEC-090 only
  defines the read shape and the renderer-facing write API; the actual
  storage is producer-pipeline territory.
- Whether to expose linkage-aware filters in System Map or keep them
  Cockpit-only is a Phase 7 question; deferred.

## Related Documents

- [ADR-086 — Adopt N:M Work Graph link relations](../decisions/086-adopt-n-to-m-work-graph-link-relations.md)
- [SPEC-090 — Work Graph link relations](../specs/SPEC-090-work-graph-link-relations.md)
- [ADR-083 — Adopt Work Graph projections for System Map and Cockpit](../decisions/083-adopt-work-graph-projections-for-system-map-and-cockpit.md)
- [SPEC-083 — Work System Map and Cockpit Projections](../specs/SPEC-083-work-system-map-and-cockpit-projections.md)
