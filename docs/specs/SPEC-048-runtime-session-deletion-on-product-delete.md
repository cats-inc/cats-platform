# SPEC-048: Runtime Session Deletion on Product Delete

Status: Approved

## Summary

`cats-platform` currently deletes product objects such as chats and Cats while
only soft-closing the linked `cats-runtime` sessions. That leaves hidden runtime
state behind even though the visible product object is gone.

This spec changes destructive delete semantics so that product-owned deletes
also delete the linked `cats-runtime` sessions by default. At the same time, the
product keeps a debug-only environment flag that can preserve runtime sessions
for investigation by falling back to the current close-only behavior.

The main affected flows are:

- deleting a chat from `RECENTS`
- deleting all chats in a parallel group
- deleting a Cat from `MY CATS`

## Goals

- Make destructive delete semantics honest across the product/runtime boundary.
- Prevent routine product deletes from leaving orphaned runtime sessions behind.
- Keep `cancel`, `close`, `sleep`, and `delete` as distinct lifecycle actions.
- Preserve a controlled debug escape hatch for session forensics.
- Define clear failure behavior when runtime deletion cannot complete cleanly.

## Non-Goals

- Replacing the existing `Stop` / `Cancel` flow
- Replacing the existing `Sleep` / `Deactivate` flow
- Turning `Cats Chat` into a full runtime session dashboard
- Changing `Archive cat` into a destructive action
- Expanding this slice to every relationship mutation such as `remove cat from
  channel`

## User Stories

- As a user, when I delete a chat, I want the linked runtime session gone too,
  so delete means delete.
- As a user, when I delete a Cat, I do not want hidden runtime sessions for that
  Cat left behind without any product entrypoint.
- As a developer, I want a flag that preserves runtime sessions when I am
  debugging cleanup or provider behavior.

## Requirements

### Functional Requirements

1. Deleting a single chat channel shall permanently delete all runtime sessions
   currently owned by that channel unless debug retention mode is enabled.
2. Deleting a parallel group shall permanently delete all runtime sessions
   currently owned by the member channels unless debug retention mode is
   enabled.
3. Deleting a Cat shall permanently delete all runtime sessions currently owned
   by that Cat across chats unless debug retention mode is enabled.
4. The product shall add a new environment flag:
   - `CATS_DEBUG_KEEP_RUNTIME_SESSIONS_ON_PRODUCT_DELETE`
5. The default value of
   `CATS_DEBUG_KEEP_RUNTIME_SESSIONS_ON_PRODUCT_DELETE` shall be `false`.
6. When the debug flag is `true`, destructive product deletes shall use
   best-effort `flush + close` behavior instead of permanent runtime deletion.
7. The following actions shall remain non-destructive and shall not use runtime
   delete:
   - `Stop`
   - `Deactivate`
   - `Archive cat`
   - `Ungroup parallel chat`
   - `Remove cat from channel`
8. `cats-platform` shall expose the new flag in `.env.example` with wording that
   makes its debug-only intent explicit.
9. If `cats-runtime` reports that a linked session cannot be deleted cleanly,
   `cats-platform` shall not silently return a normal success payload for the
   product delete.
10. If a linked runtime session is already missing, the product delete may treat
    that runtime cleanup item as already complete.
11. Product delete responses and UI feedback shall distinguish between:
    - successful delete
    - retained runtime session / partial cleanup
    - hard failure

### Non-Functional Requirements

- **Correctness**: Delete semantics must stay consistent across renderer, API,
  and runtime-boundary layers.
- **Observability**: Failures in runtime cleanup should produce visible product
  feedback instead of silent divergence.
- **Safety**: The debug override must be opt-in and clearly named so it is not
  mistaken for normal production behavior.
- **Compatibility**: The implementation must continue to use `cats-runtime` as
  the only runtime boundary.

## Design Overview

```text
Delete chat / group / cat
  -> collect linked runtime session ids
  -> read env policy
     -> debug flag false:
        -> ask cats-runtime to permanently delete sessions
        -> if all succeed: delete product object
        -> if any retained/fail: surface error and keep product object
     -> debug flag true:
        -> best-effort flush + close sessions
        -> delete product object
```

### Lifecycle Separation Rule

- `cancel` = stop the active turn, keep the session
- `close` / `deactivate` / `sleep` = detach the session, keep continuity
- `delete` = remove the visible product object and also remove linked runtime
  session continuity by default

### Debug Override Rule

The environment flag is explicitly for exceptional debugging and investigation.
It is not a second first-class user-facing delete mode.

## Dependencies

- [ADR-001](../decisions/001-use-cats-runtime-boundary.md)
- [ADR-015](../decisions/015-adopt-cat-sleep-wake-lifecycle-for-chat-sessions.md)
- [ADR-049](../decisions/049-cascade-product-deletes-into-runtime-session-deletion.md)
- `cats-runtime` `DELETE /sessions/:id`

## Open Questions

- Should the first UX surface a single generic error, or list which runtime
  sessions were retained/deleted per product delete?
- In debug-retention mode, should the product emit a visible transcript/system
  note that runtime sessions were intentionally preserved?
- Should `remove cat from channel` eventually gain its own optional hard-delete
  policy, or remain permanently in the close-only lifecycle bucket?

## References

- [PLAN-037](../plans/PLAN-037-runtime-session-deletion-on-product-delete.md)
- [SPEC-016](./SPEC-016-chat-session-sleep-wake-lifecycle.md)
- [API](../api.md)

---

*Last updated: 2026-04-02*
