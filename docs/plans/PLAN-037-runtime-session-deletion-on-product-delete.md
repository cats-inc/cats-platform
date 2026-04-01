# PLAN-037: Runtime Session Deletion on Product Delete

Status: Draft

## Scope

Implement the delete-policy change defined in
[SPEC-048](../specs/SPEC-048-runtime-session-deletion-on-product-delete.md)
and
[ADR-049](../decisions/049-cascade-product-deletes-into-runtime-session-deletion.md).

This plan covers:

- destructive delete flows for chat channels, parallel groups, and Cats
- the new debug environment flag and config plumbing
- API/runtime-boundary handling for runtime session delete vs close-only fallback
- error handling and feedback when runtime cleanup is retained or fails
- documentation and regression coverage

This plan does not cover:

- changing `Stop` / `Cancel`
- changing `Deactivate` / `Sleep`
- turning `Archive` into a hard delete
- broad runtime-dashboard product work

## Hard Constraints

- Keep `cats-runtime` as the only runtime boundary.
- Do not silently downgrade destructive delete into close-only behavior unless
  the explicit debug flag is enabled.
- Keep the existing `cancel` and `close` semantics intact for non-destructive
  lifecycle actions.
- Do not delete runtime sessions for actions that are intentionally reversible.
- Keep `.env.example` and config parsing truthful to the final behavior.
- Treat parallel-group delete as the current `Delete All` behavior that removes
  member chats; do not conflate it with `Ungroup`.
- In the first slice, prefer `fail-and-keep` over partial delete whenever
  runtime deletion is retained or fails.

## Phases

### Phase 1: Policy and Config Wiring

- [ ] Add config support for
      `CATS_DEBUG_KEEP_RUNTIME_SESSIONS_ON_PRODUCT_DELETE`
- [ ] Set the default to `false`
- [ ] Document the flag in `.env.example`
- [ ] Expose the policy to product API route helpers without leaking env lookups
      across unrelated modules

**Deliverables**: one canonical runtime-delete policy flag available to the
chat product API layer.

### Phase 2: Runtime-Delete Helper Path

- [ ] Extend the `RuntimeClient` contract with permanent session delete support
- [ ] Add a product-side helper that performs runtime delete for a list of
      session ids
- [ ] Preserve the current best-effort `flush + close` helper for debug-retain
      mode and other non-destructive flows
- [ ] Normalize idempotent "session already gone" behavior

**Deliverables**: route helpers can choose between hard delete and close-only
cleanup.

### Phase 3: Destructive Product Deletes

- [ ] Update single-channel delete to use runtime delete by default
- [ ] Update parallel-group delete to use runtime delete by default
- [ ] Update Cat delete to use runtime delete by default
- [ ] Ensure product state deletion happens only after runtime cleanup is
      accepted as successful for the default mode
- [ ] Treat already-missing runtime sessions as idempotent success

**Deliverables**: destructive product deletes and runtime deletes are aligned.

### Phase 4: Failure and Feedback Semantics

- [ ] Translate runtime retained/409/error cases into explicit product errors
- [ ] Keep the first slice on `fail-and-keep` semantics instead of partial
      delete
- [ ] Decide the first payload shape for retained/delete-failed details
- [ ] Surface clear renderer feedback for failed destructive deletes
- [ ] Keep debug-retain mode behavior understandable when the product deletes
      but runtime sessions are intentionally preserved

**Deliverables**: no silent divergence between product deletion and runtime
state.

### Phase 5: Tests and Documentation Sync

- [ ] Add integration tests for channel delete -> runtime delete
- [ ] Add integration tests for parallel group delete -> runtime delete
- [ ] Add integration tests for Cat delete -> runtime delete
- [ ] Add tests for the debug-retain flag path
- [ ] Update docs/API notes if response contracts change

**Deliverables**: verified behavior plus synchronized documentation.

## Candidate Code Areas

| Area | Action | Why |
|------|--------|-----|
| `.env.example` | Modify | Document the debug override flag |
| `src/config.ts` | Modify | Parse and expose the new environment flag |
| `src/runtime/client.ts` | Extend | Support runtime `DELETE /sessions/:id` |
| `src/products/chat/api/routeSupport.ts` | Refactor | Add hard-delete helper and policy switch |
| `src/products/chat/api/resources/channelRoutes.ts` | Modify | Align single-channel delete behavior |
| `src/products/chat/api/resources/concurrentGroupRoutes.ts` | Modify | Align parallel-group delete behavior |
| `src/products/chat/api/canonicalCatRoutes.ts` | Modify if needed | Preserve delete semantics and feedback shape |
| `tests/` | Expand | Cover default delete and debug-retain paths |
| `docs/` | Update | Keep policy, spec, and plan aligned |

## Validation

- Deleting a chat removes its linked runtime sessions by default.
- Deleting a parallel group removes linked runtime sessions for all member
  chats by default.
- Deleting a Cat removes linked runtime sessions owned by that Cat by default.
- Enabling the debug flag preserves the current close-only retention behavior.
- Failed runtime delete does not silently return a normal product success in the
  default mode.
- `Stop`, `Deactivate`, `Archive`, `Ungroup`, and `Remove cat from channel`
  still avoid hard delete.

## Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Runtime delete takes longer than close and makes delete UX feel heavier | Medium | Keep feedback explicit and test latency-sensitive flows |
| Product delete becomes blocked by runtime retained sessions | High | Define clear retained/failure UX and keep debug override available |
| Engineers accidentally enable the debug flag in routine local usage | Medium | Use an explicit debug-prefixed name and default it to false |
| Existing tests assume close-only cleanup | Medium | Add focused regression tests and update stubs deliberately |

## Suggested Handoff Instruction

> Implement SPEC-048 / PLAN-037. Default destructive product deletes to
> permanent runtime session deletion, keep non-destructive lifecycle actions on
> their current cancel/close paths, and add
> `CATS_DEBUG_KEEP_RUNTIME_SESSIONS_ON_PRODUCT_DELETE` as an explicit opt-in
> debug override.

---

*Last updated: 2026-04-02*
