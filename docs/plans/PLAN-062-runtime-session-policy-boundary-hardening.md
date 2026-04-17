# PLAN-062: Runtime Session Policy Boundary Hardening

## Metadata

| Field | Value |
|-------|-------|
| **Status** | In Progress (First Slice Landed) |
| **Owner** | Codex |
| **Reviewer** | User |

## Related Spec

[SPEC-072: Runtime Session Policy Boundary Validation](../specs/SPEC-072-runtime-session-policy-boundary-validation.md)

## Overview

This plan hardens the create boundary around runtime session policy so Chat /
Code create payloads can no longer claim invalid access/permission combinations
that will be silently coerced later.

The first slice is intentionally narrow:

- tighten the public create typings
- reject invalid raw HTTP payloads
- keep legacy snapshot normalization as a compatibility seam

## Implementation Phases

### Phase 1: Shared Boundary Typing and Validation

- [x] Introduce shared runtime-policy boundary input types for create payloads
- [x] Add one shared runtime-policy validation helper for boundary callers
- [x] Narrow runtime-client create-session input typing to the same policy rule

**Deliverables**: one shared definition of valid runtime policy combinations.

### Phase 2: Product Create Boundary Enforcement

- [x] Apply the narrowed runtime-policy create typing to product-facing channel
      create contracts
- [x] Reject invalid raw `/api/channels` runtime policy payloads with `400`
- [x] Keep model/runtime create paths aligned with the same validation rule

**Deliverables**: create-time invalid combinations fail explicitly instead of
silently coercing.

### Phase 3: Regression Coverage and Follow-Through

- [x] Add unit coverage for runtime-policy validation edges
- [x] Add integration coverage for invalid raw channel-create payloads
- [ ] Later hardening: decide whether partial runtime policy payloads should be
      fully disallowed instead of default-filled
- [ ] Later hardening: evaluate whether persisted/read-model runtime policy
      fields should also move to a more obviously coupled public shape

**Deliverables**: regression safety for the landed boundary behavior, plus a
tracked backlog for stricter follow-up hardening.

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `src/shared/runtimeSessionPolicy.ts` | Modify | Shared boundary types and runtime-policy validation |
| `src/products/chat/api/contracts.ts` | Modify | Narrow Chat create contract |
| `src/products/shared/api/workspaceContracts.ts` | Modify | Narrow shared workspace create contract |
| `src/products/chat/api/routeSupport.ts` | Modify | Reject invalid raw create payloads |
| `src/products/chat/state/model/index.ts` | Modify | Keep direct model create path aligned |
| `src/runtime/client.ts` | Modify | Narrow runtime client session-create input |
| `tests/runtime-session-policy.test.tsx` | Modify | Validation helper regression coverage |
| `tests/channel-cat-assignment-session-start.test.js` | Modify | Raw create boundary regression coverage |

## Technical Decisions

- Decision 1: Treat runtime access/permission as a coupled boundary contract,
  not as unrelated flat fields.
- Decision 2: Fail invalid raw create payloads explicitly instead of relying on
  later silent normalization.
- Decision 3: Keep legacy snapshot normalization as a separate compatibility
  seam for now.

## Testing Strategy

- **Unit Tests**:
  - runtime policy validation helper edge cases
- **Integration Tests**:
  - invalid `/api/channels` runtime policy payload returns `400`
  - valid read-only policy still flows through create -> persisted channel ->
    runtime session start
- **Manual Testing**:
  - create a code draft with read-only policy and confirm session creation still
    uses `read_only + default`

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Older raw clients still send invalid combinations | Medium | Return explicit `400` with structured error details |
| Boundary typing drifts from runtime create typing again | Medium | Reuse one shared runtime-policy boundary type |
| Follow-up hardening gets deferred indefinitely | Medium | Keep explicit unchecked tasks in this plan |

## Progress Log

| Date | Update |
|------|--------|
| 2026-04-18 | Plan created |
| 2026-04-18 | First slice landed: create contracts narrowed, invalid raw channel-create payloads now fail explicitly, and regression coverage was added |

---

*Created: 2026-04-18*
*Author: Codex*
