# ADR-049: Cascade Product Deletes into Runtime Session Deletion

> Default destructive product deletes to permanent `cats-runtime` session
> deletion, while keeping an explicit debug-only escape hatch.

## Status

Accepted

## Context

`cats-platform` currently distinguishes clearly between:

- `cancel`: stop the active turn
- `close` / `deactivate` / `sleep`: detach the live runtime worker but keep the
  session record

However, the product still uses `close` semantics for destructive delete flows
such as:

- deleting a chat from `RECENTS`
- deleting all child chats in a parallel group
- deleting a Cat from `MY CATS`

That means the visible product object is gone, but the linked `cats-runtime`
session may still remain in the runtime registry together with managed
transcripts, provider-discovery state, and in some cases provider-native
session continuity.

For normal product users, that retained runtime state has little value:

- `Cats Chat` does not expose a first-class session-inspection or session-resume
  surface in the delete flow
- after the chat or Cat is deleted, the retained runtime session becomes orphan
  operational state rather than a meaningful product feature
- retained sessions increase confusion during debugging because the product
  appears deleted while the runtime still shows live historical state

There is still one legitimate reason to preserve runtime sessions: targeted
debugging and forensics. During those cases, developers may want the product
object removed while leaving runtime evidence intact for inspection.

We need one clear rule that separates:

- destructive product delete
- reversible sleep/close lifecycle actions
- optional developer/debug retention behavior

## Decision

`cats-platform` will treat destructive product deletes as runtime-session
deletes by default.

1. The following product actions must permanently delete linked
   `cats-runtime` sessions instead of only closing them:
   - deleting a chat channel from `RECENTS`
   - deleting all chats in a parallel group
   - deleting a Cat from `MY CATS`

   For parallel chat, this means the current `Delete All` action, which deletes
   the member chat channels. It does not mean `Ungroup`, which remains
   non-destructive.

2. The following actions remain non-destructive lifecycle actions and must not
   become runtime-session deletes:
   - `Stop`
   - `Sleep` / `Deactivate`
   - `Archive cat`
   - `Ungroup parallel chat`
   - `Remove cat from channel`

3. The product will add a debug-oriented environment override:
   - `CATS_DEBUG_KEEP_RUNTIME_SESSIONS_ON_PRODUCT_DELETE=false` by default
   - when set to `true`, destructive product deletes fall back to the current
     `flush + close` behavior instead of permanent runtime deletion

4. In the default mode, `cats-platform` must not silently report a successful
   product delete if linked runtime session deletion failed or was retained by
   `cats-runtime`.
   - destructive delete should either complete end-to-end
   - or fail with a visible error/partial-delete explanation

   In the first implementation slice, the product should prefer
   `fail-and-keep` semantics:
   - if runtime delete is retained or fails, keep the product object intact
   - reserve partial-delete recovery UX for a later explicit design slice

5. Idempotent missing-session cases should still be treated as successful
   cleanup.
   - if the linked runtime session no longer exists, the product delete may
     continue

## Consequences

### Positive

- Product delete semantics become honest: deleting the visible object also
  removes the linked runtime continuation by default.
- Orphaned runtime sessions become much less common.
- The distinction between `delete`, `close`, and `cancel` becomes clearer and
  easier to explain.
- Debug retention remains possible without weakening the normal product
  behavior.

### Negative

- Product delete flows now depend on the stronger `cats-runtime` delete
  contract, including retained/409/error cases.
- Some deletions may take longer because runtime cleanup is more expensive than
  a soft close.
- The renderer and API layers need clearer failure UX for partial cleanup
  scenarios.

### Neutral

- This ADR does not require changing the existing `sleep/wake` product language.
- This ADR does not change `cats-runtime` ownership of session/workspace cleanup
  internals.
- This ADR does not expand the product into a general runtime-dashboard surface.

## Alternatives Considered

### Alternative 1: Keep `close` as the default delete behavior

- **Pros**: Reuses the current implementation and avoids stronger runtime-delete
  failure handling
- **Cons**: Leaves orphaned runtime state after the visible product object is
  deleted
- **Why rejected**: This is operationally misleading for normal product usage

### Alternative 2: Always hard-delete runtime sessions with no override

- **Pros**: Simplest product rule; no hidden retention
- **Cons**: Removes a practical debugging/forensics escape hatch
- **Why rejected**: The user explicitly wants a flag for exceptional debug cases

### Alternative 3: Preserve runtime sessions only for Cat delete, but not chat
delete

- **Pros**: Might preserve more provider continuity for reusable Cats
- **Cons**: Creates inconsistent delete semantics across visible product
  surfaces
- **Why rejected**: The product should not force users to reason about internal
  session retention policies

## References

- [ADR-001](./001-use-cats-runtime-boundary.md)
- [ADR-015](./015-adopt-cat-sleep-wake-lifecycle-for-chat-sessions.md)
- [SPEC-016](../specs/SPEC-016-chat-session-sleep-wake-lifecycle.md)
- [SPEC-048](../specs/SPEC-048-runtime-session-deletion-on-product-delete.md)
- [PLAN-037](../plans/PLAN-037-runtime-session-deletion-on-product-delete.md)

---

*Accepted: 2026-04-02*
*Accepted by: user direction captured through Codex*
