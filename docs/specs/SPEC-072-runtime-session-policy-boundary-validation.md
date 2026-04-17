# SPEC-072: Runtime Session Policy Boundary Validation

## Metadata

| Field | Value |
|-------|-------|
| **Status** | In Progress (First Slice Landed) |
| **Owner** | Codex |
| **Reviewer** | User |
| **Related ADR** | [ADR-071](../decisions/071-reject-invalid-runtime-session-policy-combinations-at-create-boundary.md) |

## Summary

`cats-platform` already knows that runtime session policy is not a flat bag of
three unrelated values. Read-only sessions must use the default permission
gate, while read-write sessions may use skip or whitelist.

This spec hardens the create boundary so public channel-create payloads and
runtime-session create payloads stop pretending every combination is valid.
Invalid raw inputs must fail explicitly instead of being silently rewritten into
another stored/runtime policy.

## Goals

- align public create contracts with the internal runtime-policy invariant
- reject invalid raw create payloads at the boundary
- keep create-time defaulting and legacy snapshot normalization separate

## Non-Goals

- removing legacy snapshot normalization
- forcing all runtime policy fields to be present on every create request
- redesigning the code-draft UI or runtime policy chips

## Requirements

### Functional Requirements

1. Product-facing channel-create contracts shall model runtime workspace access
   and runtime permission mode as a coupled input shape, not as two unrelated
   flat fields.
2. The create boundary shall accept these explicit runtime policy combinations:
   - `read_only + default`
   - `read_write + skip`
   - `read_write + whitelist`
3. The create boundary shall continue to accept omitted runtime policy fields,
   allowing create-time defaults to fill them in.
4. Raw HTTP create requests shall return `400` for:
   - invalid runtime workspace kind literals
   - invalid runtime workspace access literals
   - invalid runtime permission mode literals
   - invalid runtime access/permission combinations
5. Runtime-client session creation inputs shall enforce the same access /
   permission pairing as the product create contracts.
6. Legacy snapshot loading may continue to normalize missing runtime policy
   fields for backward compatibility.

### Non-Functional Requirements

- **Boundary truthfulness**: public contracts must not advertise combinations
  that the implementation immediately rewrites.
- **Compatibility**: omitted runtime policy fields may still use existing
  create-time defaults.
- **Focused rollout**: this slice should tighten the boundary without requiring
  a broad persistence migration.

## Design Overview

```text
Draft / Product create input
  -> coupled runtime-policy create contract
  -> explicit validation at create boundary
  -> create-time completion/defaults
  -> persisted channel runtime policy
  -> session-start trusts stored policy

Legacy snapshot load
  -> compatibility normalization only
```

## Dependencies

- [ADR-014](../decisions/014-freeze-parallel-delivery-boundaries-for-provider-telegram-and-chat-workstreams.md)
- [ADR-071](../decisions/071-reject-invalid-runtime-session-policy-combinations-at-create-boundary.md)

## Open Questions

- [ ] Should a later hardening slice make access/permission required whenever a
      caller sets any runtime policy field at all?
- [ ] Should persisted channel/read-model runtime policy fields also move to a
      more obviously coupled public type later?

## References

- [PLAN-062](../plans/PLAN-062-runtime-session-policy-boundary-hardening.md)
- [product-integration-guide.md](../product-integration-guide.md)

---

*Created: 2026-04-18*
*Author: Codex*
*Related Plan: [PLAN-062](../plans/PLAN-062-runtime-session-policy-boundary-hardening.md)*
