# SPEC-060: Guide Cat Optional Surface-Assist Capability

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Draft |
| **Owner** | Codex |
| **Reviewer** | User |
| **Related ADR** | [ADR-061](../decisions/061-treat-guide-cat-as-an-optional-surface-assist-capability.md) |

## Summary

Guide Cat should become the platform's optional assist capability for soft
guidance and low-risk helper behaviors across setup, lobby, chat entry, and
future Work/Code surfaces.

It should not be modeled as a mandatory participant, a special chat mode, or a
critical-path routing authority.

This spec defines Guide Cat as:

- optional
- surface-scoped
- runtime-backed when useful
- deterministic when necessary
- low-privilege by default

## Goals

- unify Guide Cat behavior across setup, lobby, composer, Chat, Work, and Code
- let surfaces use generated or runtime-backed guidance without hard-coding all
  helper copy forever
- keep critical-path product correctness independent from Guide Cat presence
- define one fallback model for when Guide Cat is absent or unavailable

## Non-Goals

- making Guide Cat a required participant in all transcripts
- delegating routing, approval, or repair semantics to Guide Cat
- replacing Boss Cat with Guide Cat
- requiring every surface to become runtime-backed in the first rollout

## User Stories

- As a new user, I want setup and lobby help that feels contextual rather than
  static and generic.
- As a returning user, I want composer and entry surfaces to suggest useful
  starting actions without needing a dedicated conversation every time.
- As a product team, I want to reuse one assist capability across surfaces
  rather than building custom hard-coded helper widgets for each one.
- As a maintainer, I want the product to remain usable even when Guide Cat is
  absent or runtime-backed assistance is unavailable.

## Requirements

### Functional Requirements

1. The platform shall model Guide Cat as an optional surface-assist capability,
   not as a mandatory participant or chat mode.
2. The capability shall be independently enableable per surface.
3. The first-class Guide Cat assist surfaces shall include:
   - setup
   - lobby
   - chat-entry surfaces such as `+New chat`
   - composer-adjacent suggestion surfaces
4. The architecture shall allow later Guide Cat adoption in:
   - `+Group chat`
   - Chat empty states
   - Work surfaces
   - Code surfaces
5. A surface shall be able to consume Guide Cat in one of these modes:
   - deterministic-only
   - cached assist
   - runtime-backed assist
6. Runtime-backed Guide Cat assistance shall degrade to deterministic behavior
   when runtime or cached output is unavailable.
7. Guide Cat output shall support at least:
   - greeting copy
   - starter suggestion chips
   - contextual helper copy
   - lightweight "what should I do next?" prompts
   - explicit handoff affordances into product-native work
8. Guide Cat output shall be able to consume surface context such as:
   - active route or product
   - recent surface actions
   - whether the user is new or returning
   - whether a runtime-backed conversation already exists
9. Guide Cat suggestions shall be cacheable local product data.
10. A surface shall be able to choose cached Guide Cat output immediately and
    refresh it lazily later.
11. Guide Cat shall not be required to preserve:
    - routing correctness
    - transcript identity
    - approval correctness
    - repair/replay correctness
12. When Guide Cat wants to trigger a real product action such as opening a
    conversation or creating a work item, that action shall happen through an
    explicit product handoff.
13. The platform shall support Guide Cat visibility both inside a sidecar-style
    surface and in lighter inline assist surfaces.
14. Sidecar behavior defined in [SPEC-051](./SPEC-051-guide-cat-sidecar-and-day-0-assist-surfaces.md)
    shall become one projection of this broader capability, not the only Guide
    Cat form.
15. The platform shall retain deterministic starter/help content for surfaces
    that do not yet adopt runtime-backed Guide Cat behavior.
16. Guide Cat capability usage shall be traceable enough to understand which
    assist surface showed which suggestion set and whether it came from cache,
    runtime, or deterministic fallback.

### Non-Functional Requirements

- **Optionality**: any surface must remain usable when Guide Cat is absent
- **Low privilege**: Guide Cat must not become the owner of critical-path
  correctness
- **Composability**: surfaces should adopt Guide Cat through shared hooks or
  policies rather than bespoke one-off logic
- **Consistency**: similar surfaces should follow the same fallback model
- **Extensibility**: future Work/Code assist features should fit the same
  capability seam

## Design Overview

```text
surface context
  -> Guide Cat policy
  -> deterministic fallback and/or cached assist
  -> optional runtime-backed assist refresh
  -> rendered greeting / suggestion / helper affordance
  -> explicit product handoff when deeper work is chosen
```

### Capability Layers

- `GuideCatPolicy`
  - whether the surface uses Guide Cat
  - whether runtime-backed assist is allowed
  - whether cache is accepted
- `GuideCatProvider`
  - runtime-backed provider or null provider
- `GuideCatFallback`
  - deterministic surface-specific help

### Surface Projections

Examples of Guide Cat projections include:

- lobby sidecar
- inline prompt chips above/below composer
- empty-state suggestion cards
- post-setup welcome guidance

## Dependencies

- [ADR-054](../decisions/054-use-a-platform-level-guide-sidecar-for-day-0-assist.md)
- [ADR-061](../decisions/061-treat-guide-cat-as-an-optional-surface-assist-capability.md)
- [SPEC-049](./SPEC-049-guide-cat-setup-and-generalized-participant-entry.md)
- [SPEC-051](./SPEC-051-guide-cat-sidecar-and-day-0-assist-surfaces.md)

## Open Questions

- [ ] Which exact surface contexts should be part of the first cached-assist
      key.
- [ ] Whether some surfaces should allow Guide Cat to stay purely deterministic
      for the first rollout.
- [ ] How visible Guide Cat provenance should be in the UI when suggestions are
      cached versus freshly generated.

## References

- [ADR-061](../decisions/061-treat-guide-cat-as-an-optional-surface-assist-capability.md)
- [SPEC-051](./SPEC-051-guide-cat-sidecar-and-day-0-assist-surfaces.md)

---

*Created: 2026-04-14*
*Author: Codex*
*Related Plan: [PLAN-052](../plans/PLAN-052-guide-cat-optional-surface-assist-capability.md)*
