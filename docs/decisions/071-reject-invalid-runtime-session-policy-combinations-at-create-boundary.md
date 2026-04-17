# ADR-071: Reject Invalid Runtime Session Policy Combinations at the Create Boundary

## Status

Accepted

## Context

`cats-platform` now models runtime session policy as a discriminated union:

- `read_only -> default`
- `read_write -> skip | whitelist`

That narrowing landed inside `src/shared/runtimeSessionPolicy.ts`, but the
public create contracts still exposed `runtimeWorkspaceAccess` and
`runtimePermissionMode` as independent optional fields.

This created a bad boundary condition:

- typed callers could appear to send `read_write + default`
- raw HTTP callers could also send that same combination
- create-time helpers would then silently coerce it into `read_write + skip`

That meant the contract, the stored channel state, and the caller's intent
could disagree without any explicit error.

Because `src/products/chat/api/contracts.ts` is part of the frozen shared
contract set, this change needs an explicit recorded decision rather than an
ad hoc type tweak.

## Decision

The platform will treat runtime session policy as a **coupled create-time
contract**, not as three unrelated optional fields.

This decision includes:

1. Product-facing create contracts may accept either:
   - no explicit runtime policy fields, letting defaults apply; or
   - a valid access/permission combination
2. Valid create-time combinations are:
   - `read_only + default`
   - `read_write + skip`
   - `read_write + whitelist`
3. Raw HTTP create requests that provide invalid literals or invalid
   access/permission combinations must fail fast with `400`, rather than being
   silently rewritten.
4. Create-time policy completion may still infer `workspaceKind` defaults (for
   example `repoPath -> source`) when the caller omits policy fields.
5. Read-time compatibility normalization for persisted legacy snapshots may
   continue, but that compatibility seam must not be used as justification for
   accepting invalid create-time inputs.

## Consequences

### Positive

- the frozen create contract now matches the actual runtime-policy invariant
- callers get explicit feedback instead of silent coercion
- model, route, and runtime-client boundaries share one validation rule

### Negative

- some older ad hoc callers that relied on permissive create semantics must now
  fix their payloads
- the boundary contract is slightly more complex than three flat optional
  fields

### Neutral

- this ADR does not remove read-time compatibility normalization for legacy
  persisted data
- this ADR does not yet make persisted runtime policy fields themselves a
  discriminated union everywhere in read models

## Alternatives Considered

### Alternative 1: Keep Flat Optional Fields and Continue Coercing

- **Pros**: smallest code diff
- **Cons**: preserves contract drift and hides caller bugs
- **Why rejected**: silent coercion at a public boundary is the exact failure
  mode this slice is fixing

### Alternative 2: Only Narrow the TypeScript Types

- **Pros**: improves typed callers quickly
- **Cons**: raw HTTP clients could still submit invalid combinations and be
  silently rewritten
- **Why rejected**: the create boundary must fail explicitly for invalid input,
  not only rely on TS call sites

### Alternative 3: Make All Runtime Policy Fields Required Immediately

- **Pros**: strongest invariant
- **Cons**: larger migration surface than this bug-fix slice needs
- **Why rejected**: first land explicit validation and coupled typing, then
  tighten omission rules in a later hardening slice

## References

- [ADR-014](./014-freeze-parallel-delivery-boundaries-for-provider-telegram-and-chat-workstreams.md)
- [SPEC-072](../specs/SPEC-072-runtime-session-policy-boundary-validation.md)
- [PLAN-062](../plans/PLAN-062-runtime-session-policy-boundary-hardening.md)

---

*Decision made: 2026-04-18*
*Decision makers: user direction captured through Codex*
