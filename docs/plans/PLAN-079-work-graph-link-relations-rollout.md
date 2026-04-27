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

The projection contract is normative in SPEC-090 §Suggested Record
Shape and §Functional Requirements §5–6. This phase implements that
contract verbatim. PLAN-079 does not invent shape — it only
sequences delivery.

**Scope.**
- Add the SPEC-090 types verbatim to
  `src/products/work/renderer/components/topdown/types.ts`:
  `WorkGraphLinkKind` (stored kinds only — `blocks`, `related_to`,
  `duplicate_of`, `follows`), `WorkGraphLinkViewKind` (includes the
  projection-derived `blocked_by`), `WorkGraphLinkEndpointKind`,
  `WorkGraphLinkEndpointRef`, `WorkGraphEndpointKey`,
  `WorkGraphLink`, and `WorkGraphLinkView`.
- Extend `WorkGraphProjection` with the two new fields per SPEC-090
  §FR6: `links: WorkGraphLink[]` and `linksByEndpoint:
  Partial<Record<WorkGraphEndpointKey, WorkGraphLinkView[]>>`. The
  map is sparse (only endpoints that have at least one view appear
  as keys). Consumers MUST treat absence of a key as `[]`; do not
  rely on every endpoint key existing.
- Confirm `WorkGraphObjectSummary` carries `sourceRecordFamily` and
  `sourceRecordId` for every Project / Work Item / Task object, per
  SPEC-083 §Suggested Work Graph Shape. The summary field type stays
  the wider `WorkGraphObjectKind` (since the same summary covers
  conversation / run / artifact / approval and other non-PWT
  objects); only the link-record field type narrows to
  `WorkGraphLinkEndpointKind`. If today's `types.ts` (which predates
  SPEC-083 §Suggested Work Graph Shape) does not yet carry those
  fields, this phase adds them — typed as the wider
  `WorkGraphObjectKind`. The renderer resolves a link endpoint
  (`recordFamily`, `recordId`) to its graph object by matching the
  link's narrow value against the summary's wider field. The
  projection MUST use the composite key form
  `${recordFamily}:${recordId}` (the `WorkGraphEndpointKey` type)
  when building `linksByEndpoint`.
- Extend `WorkGraphDiagnosticKind` with `orphan_link` and `link_cycle`.
- Update mock fixture under
  `src/products/work/renderer/components/topdown/mock.ts` to seed one
  or more rows of every **stored** kind only (`blocks`, `related_to`,
  `duplicate_of`, `follows`) — never `blocked_by`, which is
  projection-derived per SPEC-090 §FR5. Also seed one orphan-link
  example and one cycle for the diagnostics surface.
- Update `buildIndexes` / projection helpers (in
  `components/topdown/shared.ts`) to populate `linksByEndpoint` per
  SPEC-090 §FR5:
  - Every well-resolved stored row produces views on the endpoints
    SPEC-090 §FR5 enumerates (both sides of `blocks` and
    `related_to`; source-side only for `duplicate_of` / `follows` at
    v1).
  - Orphan rows (source or target endpoint does not resolve to an
    existing Core record) are EXCLUDED from `linksByEndpoint` and
    surfaced via the `orphan_link` diagnostic only. Renderers reading
    `linksByEndpoint` see resolved views only.
  - Raw `links` keeps the orphaned rows so Broken Links can iterate
    them.
- Add cycle detection for the **well-resolved** stored `blocks`
  subgraph only, per SPEC-090 §FR8. Rows whose endpoint did not
  resolve (and were therefore filtered out of `linksByEndpoint`) are
  also excluded from cycle detection — they are already represented
  as `orphan_link` diagnostics. Avoid emitting both `orphan_link`
  and `link_cycle` for the same broken row.

**Done when.**
- `tsc --noEmit` passes.
- Storage (`MOCK_WORK_GRAPH.links`) contains examples of every
  stored kind, **no `blocked_by` rows in storage**.
- A renderer-side test reads
  `MOCK_WORK_GRAPH.linksByEndpoint["work_item:<some id>"]` and finds
  a `blocked_by` view there for every seeded `blocks` row whose
  target is that id — proving derivation works without storing
  `blocked_by`.
- Diagnostics emit `orphan_link` / `link_cycle` for the seeded
  fixtures.
- Given a `WorkGraphLinkEndpointRef`, the renderer can resolve it to
  its `WorkGraphObjectSummary` by matching `sourceRecordFamily` /
  `sourceRecordId` on the summary, without assuming
  `WorkGraphObjectSummary.id` equals the Core record id.

**Risks.**
- Cycle detection has to be deterministic regardless of object
  ordering. Start with a simple Tarjan / DFS pass keyed on
  lexicographically sorted Core identity tuples; revisit if hot-path
  cost matters.
- Adding `sourceRecordFamily` / `sourceRecordId` to
  `WorkGraphObjectSummary` (if missing today) touches every existing
  consumer (System Map, Cockpit, Broken Links, Projects / Work Items
  pages). Land that as a single-commit type bump before any link-
  reading code so consumers compile under the new shape immediately.

## Phase 2 — Detail page Linkage section

**Scope.**
- Add a "Linkage" section to `ProjectDetailPage`, `WorkItemDetailPage`,
  and (later) `TaskDetailPage` that reads
  `WorkGraphProjection.linksByEndpoint[<self endpoint key>] ?? []`
  (the map is sparse per SPEC-090 §FR6 — fall back to empty array
  when the key is absent) and groups the returned
  `WorkGraphLinkView[]` by `kind` (Blocking / Blocked by / Related /
  Duplicate of / Follows). Per SPEC-090 §FR10, the renderer MUST
  consume `linksByEndpoint`, not raw `links`, so derived `blocked_by`
  and symmetric `related_to` views show up without the renderer
  re-deriving them. Orphan rows do not appear here — they are
  surfaced exclusively in Broken Links per SPEC-090 §FR5.
- Each entry renders status dot + title + relation badge using the
  graph object resolved from `view.otherEndpoint` against
  `WorkGraphObjectSummary.sourceRecordFamily` /
  `sourceRecordId`. The link target is the resolved summary's detail
  page route (`/work/projects/:id`, `/work/work-items/:id`, etc.).
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
- Consume the extended diagnostic payload from SPEC-090 §Suggested
  Record Shape (`linkId`, `sourceEndpoint`, `targetEndpoint`,
  `unresolvedSide` for `orphan_link`; `cycleEndpoints`, `cycleLinkIds`
  for `link_cycle`) so each row is independently actionable. The
  renderer MUST resolve link endpoints to graph object summaries
  (where they still exist) for display, and render an explicit
  "(deleted)" marker on the unresolved side of an `orphan_link`.
- A "Remove this link" affordance per row stays disabled until
  Phase 5 lands the producer-pipeline write path.
- No new page; reuse existing diagnostic styling.

**Done when.**
- Seeded orphan / cycle fixtures show on Broken Links with both ends
  identified (one end may show "(deleted)").
- Each row carries the `linkId` so Phase 5 can wire the
  "Remove this link" button without re-deriving from raw `links`.
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
  opens the dialog with the source record's `(recordFamily, recordId)`
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
