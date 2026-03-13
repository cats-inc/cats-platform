# ADR-005: Use a Workspace Pal Registry with Channel Assignments

> Configure reusable pals once, then decide channel-specific execution where
> they are used.

## Status

Accepted

## Context

[ADR-004](./004-separate-pal-identity-from-provider-execution.md) separated pal
identity from provider execution, but the first implementation step still left
pal records effectively channel-local.

That left three product problems:

- the operator still had no single place to configure reusable pals
- the same pal's identity could be duplicated across multiple chats
- channel setup still mixed identity concerns with channel-specific execution
  choices

The product direction is now clearer:

- `Cats Inc` is the parent suite and `Chat` is only one module
- a `Pal` should feel like a reusable teammate across the whole workspace
- the same pal may be assigned to many chats with different providers or models
- removing a pal from one chat must not delete the pal itself
- future modules such as projects or reports should be able to reuse the same
  pal registry

## Decision

`cats-inc` will keep pals at workspace scope and keep channel usage in a
separate assignment layer.

The product model will use:

1. `workspace.pals`
   - the reusable pal registry
   - stores identity, default execution target, and long-lived memory
2. `channel.palAssignments`
   - the channel-scoped relationship between one chat and one workspace pal
   - stores active or removed state, channel roles, execution target overrides,
     and the current execution lease
3. `channel.assignedPals`
   - a hydrated view returned to the renderer for convenience

From this point on:

- the global `Pals` surface is the place to create or review pals
- channel setup may still draft pals, but creation promotes them into the
  workspace registry first
- channel-level actions operate on assignments, not on independent pal copies
- legacy `members` payloads and routes remain supported only as compatibility
  aliases during migration

## Consequences

### Positive

- Operators get one global place to manage reusable pals.
- The same pal can move across chats without losing identity or memory.
- Channel execution can vary by budget or task without redefining the pal.
- Future Cats Inc modules can reuse the same pal registry.

### Negative

- The schema and UI gain another explicit layer to manage.
- Existing local state needs migration from channel-local members.
- API and renderer code must hydrate assignments against the workspace registry.

### Neutral

- Creating a chat can still feel lightweight because draft pals are promoted
  automatically.
- Compatibility routes remain temporarily to avoid breaking older local state or
  renderer builds.

## Alternatives Considered

### Alternative 1: Keep pals fully channel-local

- **Pros**: Smallest immediate implementation; fewer joins in the UI and API.
- **Cons**: Duplicates identity, blocks reuse, and makes cross-chat memory
  harder.
- **Why rejected**: It does not match the product direction or the scheduler
  model.

### Alternative 2: Keep a global registry but copy a full pal record into each channel

- **Pros**: Easier renderer reads than a separate assignment layer.
- **Cons**: Still duplicates state and makes synchronization error-prone.
- **Why rejected**: Copying the record reintroduces drift between identity and
  channel-specific execution.

### Alternative 3: Bind each pal to one fixed default provider and reuse that everywhere

- **Pros**: Simpler operational model.
- **Cons**: Breaks the budget-aware, channel-specific provider scheduling goal.
- **Why rejected**: Provider choice belongs to assignment or lease context, not
  to the reusable pal identity.

## References

- [ADR-004](./004-separate-pal-identity-from-provider-execution.md)
- [Architecture](../architecture.md)
- [Requirements](../requirements.md)
- [API](../api.md)

---

*Decision made: 2026-03-13*
*Decision makers: Codex + user direction*
