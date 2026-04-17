# PLAN-060: Product-Scoped Recents and Origin-Surface Rollout

> Land explicit conversation-origin metadata plus default product-scoped
> `RECENTS` behavior across shared shell and product sidebars.

## Metadata

| Field | Value |
|-------|-------|
| **Status** | In Progress |
| **Owner** | Codex |
| **Reviewer** | User |

## Related Spec / Dependencies

- [SPEC-070: Product-Scoped Recents and Channel Origin Surfaces](../specs/SPEC-070-product-scoped-recents-and-channel-origin-surfaces.md)
- [ADR-069: Scope Recents to Channel Origin Surface by Default](../decisions/069-scope-recents-to-channel-origin-surface-by-default.md)
- [SPEC-061: Concurrent vs Parallel Semantics and Code Entry Presets](../specs/SPEC-061-concurrent-parallel-semantics-and-code-entry-presets.md)

## Overview

This plan introduces one explicit ownership rule for cross-product
conversations:

- channels and parallel groups record the surface that created them
- sidebar recents default to entries owned by the current surface
- legacy records without that field remain visible in Chat through a compatible
  `chat` fallback

The plan intentionally does not ship an `All recents` lens in the first slice.

## Implementation Phases

### Phase 1: Contract and Persistence

- [x] Task 1.1: Add `originSurface` to channel state, summaries, and create
      payloads
- [x] Task 1.2: Add `originSurface` to parallel-group state, summaries, and
      create payloads
- [x] Task 1.3: Normalize legacy missing values to `chat` at snapshot/read
      boundaries
- [ ] Task 1.4: Harden raw create boundaries so missing `originSurface` can be
      rejected deliberately after legacy HTTP compatibility is retired

**Deliverables**: one explicit product-origin contract for channels and
parallel groups, plus a documented path to retire raw create-time fallback.

### Phase 2: Renderer Filtering

- [x] Task 2.1: Thread `originSurface` through shared Work/Code create paths
- [x] Task 2.2: Filter shared-sidebar default recents by current surface
- [x] Task 2.3: Filter Chat's grouped parallel recents by current surface
- [x] Task 2.3a: Filter shared-sidebar grouped recent entries by current
      surface when products supply grouped recents through the shared shell
- [ ] Task 2.4: Re-enable `Cats Code` recents on top of the same product-scoped
      filter once Code wants to surface those sessions

**Deliverables**: Chat no longer shows Code/Work sessions by default, and Work
can safely use shared recents filtering.

### Phase 3: Verification and Follow-Through

- [x] Task 3.1: Add regression coverage for create-payload origin stamping
- [x] Task 3.2: Add regression coverage for Chat recents filtering
- [x] Task 3.3: Add regression coverage for shared Work sidebar filtering
- [ ] Task 3.4: Decide whether and when to add an explicit secondary
      cross-product `All` recents lens

**Deliverables**: enforced default behavior plus a documented future seam for
optional cross-product browsing.

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `src/products/chat/api/contracts.ts` | Modify | Add channel/group origin-surface fields |
| `src/products/shared/api/workspaceContracts.ts` | Modify | Mirror origin-surface fields for shared product surfaces |
| `src/products/chat/state/model/**` | Modify | Persist and summarize origin-surface metadata |
| `src/products/chat/state/chat-snapshot/**` | Modify | Normalize legacy fallback behavior |
| `src/products/shared/renderer/**` | Modify | Thread origin-surface through create helpers and shared recents filtering |
| `src/products/chat/renderer/components/Sidebar.tsx` | Modify | Filter grouped Chat recents by origin surface |
| `tests/**` | Modify | Add create/filter regression coverage |
| `docs/**` | Create/Modify | Document the product-scoped recents rule |

## Technical Decisions

- `originSurface` is product ownership metadata, not routing metadata.
- Missing historical values normalize to `chat` for compatibility.
- Default recents behavior is product-scoped; any later cross-product view must
  be explicit and secondary.

## Testing Strategy

- **Unit Tests**:
  - channel-input builders stamp `originSurface`
  - sidebar recents filtering excludes non-matching surfaces
- **Integration Tests**:
  - Chat grouped parallel recents keep only Chat-origin containers
  - Work shared sidebar fallback keeps only Work-origin channels
- **Manual Testing**:
  - create a new Code session and confirm it does not appear in Chat recents
  - create a new Work session and confirm it stays inside Work-owned recents

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Legacy channels disappear unexpectedly | High | Normalize missing `originSurface` to `chat` |
| Parallel groups and member channels drift in ownership | Medium | Stamp both the group and each child channel at create time |
| Future cross-product browsing gets blocked | Low | Keep `originSurface` as additive metadata and document `All` as a later explicit lens |

## Progress Log

| Date | Update |
|------|--------|
| 2026-04-17 | Plan created and first slice landed: channel/group origin metadata plus product-scoped recents filtering |
| 2026-04-17 | Follow-up tightened typed create payloads to require `originSurface` and extended shared recents filtering to grouped entries, not only standalone channels |
| 2026-04-17 | Follow-up clarified rollout boundaries: product-owned typed create paths now require explicit stamping, while raw legacy HTTP compatibility still defaults missing `originSurface` to `chat` until a later hardening slice retires that seam |

---

*Created: 2026-04-17*
*Author: Codex*
