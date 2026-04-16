# ADR-066: Persist Guide Cat Assist Content as Platform-Owned Local State

> Store reusable Guide Cat assist content as platform-owned local data so
> greetings, chips, recap, and feature guidance can render offline and refresh
> lazily without depending on a permanently running runtime session.

## Status

Proposed

## Context

`ADR-061` established that `Guide Cat` is an optional surface-assist
capability rather than a chat mode. That direction is now wider than the
current implementation.

Today, several Guide-Cat-adjacent surfaces still rely on renderer-local
constants or one-off UI state:

- Lobby greeting copy
- `+New chat` greeting copy
- future prompt chips between greeting and composer
- future recap of recent work
- future "what should I do next?" help
- future feature guidance across `Chat`, `Work`, and `Code`

That creates four problems:

1. reusable assist content is not yet a durable product artifact
2. surfaces cannot consistently render last-good Guide Cat output while the
   runtime is offline
3. recap and guidance content would otherwise get mixed into transcript/session
   state even though it is not canonical product truth
4. there is no stable storage split for user-owned overrides versus
   Guide-Cat-generated output

The platform already has two relevant foundations:

- `ADR-053` defines structured `~/.cats/platform/{config,state}` ownership
- `ADR-063` and `SPEC-062` define `mission` and `run` as the canonical
  vocabulary for agent work, including background or offline helper activity

Guide Cat needs a matching storage and refresh model.

## Decision

Guide Cat assist content should be persisted as platform-owned local state.

### 1. Reusable assist content is not transcript or session state

Guide Cat output such as greetings, chips, recap, and feature guidance should
be modeled as product-owned assist data.

It must not be treated as:

- canonical transcript state
- runtime session state
- authoritative managed work
- ad hoc renderer-only constants

### 2. Platform storage is split into config and generated state

Guide Cat assist storage should follow the structured platform layout:

```text
~/.cats/platform/
  config/
    platform-preferences.json
    guide-cat-assist-config.json
  state/
    chat-state.local.json
    platform-onboarding-history.json
    guide-cat-assist-cache.local.json
```

- `config/guide-cat-assist-config.json`
  - user- or product-owned policy
  - optional authorable overrides
  - disabled surfaces
  - refresh preferences and deterministic seed choices
- `state/guide-cat-assist-cache.local.json`
  - last-good generated assist bundles
  - freshness metadata
  - provenance
  - refresh failures

### 3. Assist output is grouped by surface-scoped bundles

Guide Cat output should be persisted as one or more surface-scoped bundles.

One bundle may contain:

- greeting copy
- entry chips
- composer chips
- recap copy
- feature guidance cards
- next-step suggestions

Bundle identity should be tied to normalized surface scope rather than one
specific widget instance.

### 4. Surfaces use stale-while-revalidate, not always-on sessions

Surfaces should read deterministic fallback or last-good cached assist content
immediately, then refresh lazily when needed.

The default refresh model should be:

- non-blocking stale check after desktop launch and runtime readiness
- surface-open refresh when cache is stale or missing
- explicit user-triggered refresh when requested

The first slice should not require:

- a permanent Guide Cat daemon
- cron-style background refresh just to keep the UI usable
- a live runtime session before greeting/chip surfaces can render

### 5. Runtime-backed refresh is modeled as mission/run work

When Guide Cat does background or offline assist refresh, that work should use
the shared `mission` and `run` vocabulary through the existing runtime
boundary.

Future scheduled refresh may use runtime wakeups, but wakeups are an optional
optimization layer, not the base dependency for assist rendering.

### 6. Visible shell state stays separate from assist bundles

Sidecar visibility, dismissals, impressions, and other shell-local view state
remain separate concerns from assist-content persistence.

This prevents UI chrome preferences from being conflated with reusable content
artifacts.

## Consequences

### Positive

- Lobby, `+New chat`, composer, recap, and future Work/Code helpers can share
  one persistence model.
- The product can render last-good assist content while offline.
- Guide Cat recap/guidance remains explicitly non-authoritative.
- Storage ownership becomes clear enough for migration away from hard-coded
  greeting lists.
- Future runtime-backed or scheduled refresh aligns with `mission`/`run`
  vocabulary instead of inventing a second helper-work model.

### Negative

- The product needs new storage helpers, cache schemas, and migration logic.
- Surfaces must stop assuming that helper copy only exists as local constants.
- Provenance and freshness rules add some complexity to otherwise simple UI
  affordances.

### Neutral

- Some surfaces may continue using deterministic fallback only until they adopt
  the shared cache.
- Guide Cat may still appear through different projections such as sidecar,
  inline chips, and recap cards.

## Alternatives Considered

### Alternative 1: Keep assist content as hard-coded renderer constants

- **Pros**: cheapest short-term implementation
- **Cons**: no shared persistence, no recap path, no provenance, and no
  offline-refresh model
- **Why rejected**: it does not scale past a small greeting list

### Alternative 2: Store Guide Cat assist content inside transcript/session state

- **Pros**: runtime-backed output already exists near conversations
- **Cons**: recap/guidance is not the same thing as transcript truth and should
  not require a live session
- **Why rejected**: it conflates assist artifacts with canonical interaction
  state

### Alternative 3: Require periodic scheduled refresh from day one

- **Pros**: bundles stay fresher automatically
- **Cons**: adds operational complexity and startup coupling before the base
  assist substrate exists
- **Why rejected**: stale-while-revalidate is sufficient for the first slice;
  scheduled wakeups can come later

## References

- [ADR-053](./053-use-structured-cats-home-platform-storage.md)
- [ADR-061](./061-treat-guide-cat-as-an-optional-surface-assist-capability.md)
- [ADR-063](./063-agent-missions-and-transport-bindings.md)
- [SPEC-049](../specs/SPEC-049-guide-cat-setup-and-generalized-participant-entry.md)
- [SPEC-060](../specs/SPEC-060-guide-cat-optional-surface-assist-capability.md)
- [SPEC-062](../specs/SPEC-062-agent-missions-and-transport-bindings.md)

---

*Proposed: 2026-04-17*
*Proposed by: Codex*
