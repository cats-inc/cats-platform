# PLAN-066: Cross-Surface Draft Dispatch and Warm Product Handoff Rollout

> Land truthful cross-surface draft submit semantics plus a reusable warm
> navigation handoff seam across the product route boundary.

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Draft |
| **Owner** | Codex |
| **Reviewer** | User |

## Related Spec / Dependencies

- [SPEC-074: Cross-Surface Draft Dispatch and Warm Product Handoff](../specs/SPEC-074-cross-surface-draft-dispatch-and-warm-product-handoff.md)
- [ADR-073: Use target-surface dispatch and warm cross-surface handoff for draft submits](../decisions/073-use-target-surface-dispatch-and-warm-cross-surface-handoff.md)
- [SPEC-070: Product-Scoped Recents and Channel Origin Surfaces](../specs/SPEC-070-product-scoped-recents-and-channel-origin-surfaces.md)
- [PLAN-060: Product-Scoped Recents and Origin-Surface Rollout](./PLAN-060-product-scoped-recents-and-origin-surface-rollout.md)
- [SPEC-042: Platform Renderer Route-Level Chunking and Lazy Entry](../specs/SPEC-042-platform-renderer-route-level-chunking-and-lazy-entry.md)

## Overview

This rollout fixes the current gap where a draft can visually switch to another
product surface but still submits through the source product's ownership and
route path.

The plan is intentionally split into:

- semantic alignment (`targetSurface` vs `originSurface`)
- platform-owned dispatch/routing
- warm navigation handoff continuity across `React.lazy` product boundaries

It should reuse the current shared create endpoints instead of introducing a
second cross-product create API unless implementation evidence proves that the
shared boundary is insufficient.

The shipping scope stays narrow: first land cross-surface draft submit/create.
But the handoff primitives should be navigation-shaped rather than
draft-submit-shaped so later conversation/artifact/task deep links can reuse
the same seam.

## Implementation Phases

### Phase 1: Vocabulary and Shared Navigation-Handoff Primitives

- [ ] Task 1.1: Introduce one shared `targetSurface` vocabulary/helper layer in
      platform/shared renderer code and stop treating local draft UI state as
      the only source of truth
- [ ] Task 1.2: Define a platform-owned cross-surface navigation handoff
      bundle type plus in-memory storage/clear semantics
- [ ] Task 1.3: Define a surface registry for:
      - route builders
      - lazy-bundle prefetch hooks
      - handoff consumption keys
      - handoff kinds / destination entity kinds

**Deliverables**: one explicit semantic contract and one platform-owned
handoff primitive instead of product-local ad hoc state, without baking draft
submit assumptions into the primitive itself.

### Phase 2: Dispatch and Route Ownership

- [ ] Task 2.1: Refactor shared composer submit helpers so new-draft submit can
      accept `targetSurface` separately from `currentSurface`
- [ ] Task 2.2: Ensure created channels/groups stamp
      `originSurface = targetSurface`
- [ ] Task 2.3: Route cross-surface create to the target surface's canonical
      active path instead of the source route prefix
- [ ] Task 2.4: Preserve managed-navigation guard behavior so user navigation
      away from the draft stops stale auto-redirects

**Deliverables**: submit now creates destination-owned records and lands on the
correct product route.

### Phase 3: Warm Navigation Handoff Optimization

- [ ] Task 3.1: Write navigation handoff bundles before cross-surface
      navigation, with draft submit/create as the first shipping caller
- [ ] Task 3.2: Prefetch the destination product chunk once target surface or
      another supported destination route is known
- [ ] Task 3.3: Teach target product bootstrap to consume a matching handoff
      bundle and render immediate optimistic continuity
- [ ] Task 3.4: Reconcile handoff-backed UI with background `/api/app-shell`
      refresh without flicker or duplicate optimistic messages

**Deliverables**: cross-product draft submit feels continuous rather than like
two unrelated product boots, and the seam remains reusable for later
cross-surface navigation flows.

### Phase 4: Product Entry Adoption

- [ ] Task 4.1: Replace the current Chat draft's local UI-only Code switch with
      the shared `targetSurface` contract
- [ ] Task 4.2: Validate Chat -> Code first-turn handoff, including current
      Pomodoro helper behavior
- [ ] Task 4.3: Decide and wire the first Work-targeting draft entry on top of
      the same seam instead of creating a second bespoke path
- [ ] Task 4.4: Extend the generic contract to group and parallel draft create
      paths so topology does not block future cross-surface entries

**Deliverables**: the current known Chat -> Code gap is closed, and the seam is
ready for later Chat -> Work or other surface entries.

### Phase 5: Hardening and Follow-Through

- [ ] Task 5.1: Add regression coverage for `targetSurface -> originSurface`
      stamping and target-route navigation
- [ ] Task 5.2: Add regression coverage for warm navigation handoff
      consumption and cold fallback behavior
- [ ] Task 5.3: Remove or resolve the temporary TODO markers once the real
      dispatcher/handoff path lands
- [ ] Task 5.4: Revisit whether a later persisted `sourceSurface` or analytics
      marker is needed after the shipping path is stable
- [ ] Task 5.5: Identify the first non-draft consumer of the same warm
      navigation seam without expanding the initial shipping slice

**Deliverables**: enforceable behavior, fewer known TODO seams, and a bounded
follow-up list instead of open-ended drift.

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `src/app/renderer/App.tsx` | Modify | Add target-surface bundle prefetch and/or platform-owned warm-navigation-handoff consumption seam |
| `src/core/platformSurface.ts` | Modify | Extend surface helpers if needed for route/prefetch registry |
| `src/products/shared/renderer/hooks/useWorkspaceComposerSubmit.ts` | Modify | Thread `targetSurface` through shared draft submit flow |
| `src/products/shared/renderer/composerDispatch.ts` | Modify | Split current route surface from submit destination surface |
| `src/products/shared/renderer/composerNavigation.ts` | Modify | Preserve managed navigation behavior during cross-surface redirects |
| `src/products/shared/renderer/crossSurfaceNavigationHandoff.ts` | Create | Platform-owned in-memory navigation handoff bundle store/helpers |
| `src/products/chat/renderer/hooks/useComposerSubmit.ts` | Modify | Stop hardcoding Chat ownership for cross-surface draft submits |
| `src/products/chat/renderer/components/NewChatDraft.tsx` | Modify | Replace local UI-only surface switch with the shared destination contract |
| `src/products/code/renderer/**` | Modify | Consume warm navigation handoff bundles on destination boot |
| `src/products/work/renderer/**` | Modify | Consume the same seam when Work becomes a target surface |
| `tests/composer-navigation.test.js` | Modify | Cover cross-surface managed-navigation behavior |
| `tests/channel-paths.test.js` | Modify | Cover target-route builders or route registry behavior |
| `tests/chat-cross-surface-navigation-handoff.test.tsx` | Create | Cover Chat -> Code ownership, route, and warm-navigation-handoff behavior |
| `tests/code-routing.test.tsx` | Modify | Cover Code-side destination boot from a handoff bundle |
| `docs/**` | Modify | Keep ADR/SPEC/PLAN/ROADMAP/indexes aligned |

## Technical Decisions

- `targetSurface` is the submit destination; `originSurface` remains the
  persisted ownership field.
- The shared create endpoints should stay the primary create boundary unless
  implementation evidence proves they cannot express cross-surface handoff
  correctly.
- Warm navigation handoff is renderer-memory only and must not become fake
  durable state.
- The first shipping caller is draft submit/create, but the primitives should
  not hardcode create-only entity assumptions.
- Background app-shell refresh remains authoritative after the warm navigation
  handoff.

## Testing Strategy

- **Unit Tests**:
  - surface registry resolves the correct route builder/prefetch hook
  - handoff bundle store writes, reads, and clears correctly
  - handoff kind / destination entity typing stays navigation-shaped rather
    than create-only
  - create-input builders stamp `originSurface = targetSurface`
- **Integration Tests**:
  - Chat draft switched to Code creates a Code-owned conversation and routes to
    the Code active path
  - destination product consumes handoff bundle before background refresh
  - missing/invalid handoff bundle falls back to cold boot without corrupting
    state
- **Manual Testing**:
  - from `+New chat`, trigger the Code-targeting helper and send a prompt;
    confirm direct arrival on the Code active conversation
  - verify first optimistic user turn and busy state survive the product switch
  - repeat after intentionally navigating away mid-submit to confirm stale
    auto-redirect is suppressed

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| `originSurface` and `targetSurface` semantics drift again | High | Keep one shared vocabulary helper and explicit regression tests |
| Warm handoff duplicates optimistic messages after refresh | High | Reconcile handoff bundle against created ids and authoritative app-shell refresh |
| Warm seam becomes over-generalized before the first ship | Medium | Keep the first consumer limited to draft submit while shaping types around navigation target + optional snapshot data |
| Product boundaries get muddied by direct imports | Medium | Keep registry and handoff store in platform/shared renderer space |
| Lazy chunk prefetch adds hidden coupling to route code | Medium | Centralize prefetch through one platform registry instead of scattered product calls |
| Parallel/group flows lag behind default cross-surface support | Medium | Make topology support explicit in Phase 4 instead of assuming the seam is default-only |

## Progress Log

| Date | Update |
|------|--------|
| 2026-04-20 | Plan created to turn the current UI-only Chat -> Code surface switch into a real destination-owned cross-product handoff with warm navigation continuity while keeping the first shipping scope narrow |

---

*Created: 2026-04-20*
*Author: Codex*
