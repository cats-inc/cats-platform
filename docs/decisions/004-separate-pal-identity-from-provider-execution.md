# ADR-004: Separate Pal Identity from Provider Execution

> Keep pal memory portable across sessions and providers.

## Status

Accepted

## Context

`cats-inc` started with a simple workspace model where each channel member
stored `provider`, `model`, and live `session` state directly on the same
record. That was sufficient for the first runtime-backed chat shell, but it
creates the wrong long-term boundary for the product.

The product direction is now clearer:

- `Cats Inc` is a suite, and `Chat` is one module inside it
- a `Pal` is a reusable teammate identity, not a runtime vendor selection
- the same pal may use different providers in different channels
- provider choice may change over time based on budget, latency, availability,
  or task type
- cross-session memory must survive provider changes

If `provider` stays attached to the pal identity itself, we get the opposite of
that design:

- pals become implicitly locked to one provider/model pair
- session continuity depends on provider-native thread/session semantics
- memory inheritance becomes provider-local instead of product-owned
- future scheduling across eight CLI providers becomes harder to implement

## Decision

`cats-inc` will treat provider execution as a replaceable channel-scoped lease,
not as part of pal identity.

The product model will move toward four distinct concepts:

1. `Pal identity`
   - stable teammate identity, roles, tone, and long-lived metadata
2. `Channel-scoped execution target`
   - the preferred provider/model for that pal in one channel
3. `Execution lease`
   - the currently active provider session, including runtime status and lease
     metadata
4. `Canonical memory`
   - product-owned summaries, facts, and open loops that survive session or
     provider changes

For the current `cats-inc` phase, this means:

- move provider/model out of the pal identity fields
- store provider/model under explicit execution settings instead
- persist execution lease metadata separately from identity metadata
- add product-owned memory checkpoint fields that are independent from any one
  provider session
- treat provider-native session state as an optimization, not the source of
  truth

This decision applies to pals first, and it also sets the direction for the
global orchestrator path.

## Consequences

### Positive

- The same pal can be scheduled differently per channel without changing who
  that pal is.
- Cross-session continuity becomes a `cats-inc` responsibility instead of a
  provider-specific feature.
- Runtime scheduling can later optimize for budget, latency, or availability
  without rewriting the pal model again.
- Exported workspace data becomes a better handoff format for future memory,
  reporting, and project-management modules.

### Negative

- The schema becomes more explicit and slightly more verbose.
- Existing local workspace state requires migration into the new shape.
- UI and API code must deal with identity data and execution data separately.

### Neutral

- Provider-native threads or conversations may still be used, but only as
  disposable execution context.
- The first implementation step may still keep pal records channel-local before
  a later workspace-wide pal registry is introduced.

## Alternatives Considered

### Alternative 1: Keep provider/model directly on the pal record

- **Pros**: Smallest immediate change; simple to reason about in a single chat.
- **Cons**: Couples identity to vendor choice; blocks provider portability;
  makes memory inheritance depend on provider-native sessions.
- **Why rejected**: It does not match the product direction or the future
  scheduler model.

### Alternative 2: Bind every pal to one permanent provider, but allow channel overrides later

- **Pros**: Keeps a "default provider" concept for fast setup.
- **Cons**: Still introduces an identity-level provider assumption that future
  code has to unwind; encourages accidental lock-in.
- **Why rejected**: The default becomes sticky in practice and keeps the wrong
  boundary in the data model.

### Alternative 3: Rely on each provider's own cross-session memory/thread model

- **Pros**: Less product-side memory work in the short term.
- **Cons**: Behavior differs by provider, portability is poor, and switching
  providers loses continuity.
- **Why rejected**: `cats-inc` needs provider-agnostic continuity and budget
  routing, not provider-local persistence.

## References

- [Architecture](../architecture.md)
- [Requirements](../requirements.md)
- [Terminology](../terminology.md)

---

*Decision made: 2026-03-13*
*Decision makers: Codex + user direction*
