# SPEC-067: Guide Cat Assist Content Cache and Offline Refresh

> Define the shared data model, storage layout, and refresh lifecycle for
> Guide Cat greetings, chips, recap, and feature guidance so surfaces can
> render useful assist content immediately and refresh it lazily later.

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Draft |
| **Owner** | Codex |
| **Reviewer** | User |
| **Related ADR** | [ADR-066](../decisions/066-persist-guide-cat-assist-content-as-platform-owned-local-state.md) |

## Summary

`SPEC-060` established Guide Cat as an optional surface-assist capability.
That still leaves one unresolved implementation seam: where reusable assist
content lives and how it updates when the runtime is unavailable or sleeping.

This spec defines one shared substrate for Guide Cat assist content across:

- Lobby greeting copy
- `+New chat` greeting and starter chips
- composer-adjacent chips or helper copy
- recap of recent work
- feature guidance and "what should I do next?" suggestions

The result should be:

- locally persisted
- offline-renderable
- lazily refreshable
- provenance-aware
- non-authoritative by design

## Goals

- replace one-off hard-coded greeting pools with a shared Guide Cat assist
  content model
- let multiple surfaces reuse last-good content without requiring a live
  runtime session
- support recap and feature-guidance content without turning it into
  transcript/work truth
- align background refresh with the existing runtime boundary plus
  `mission`/`run` vocabulary
- preserve deterministic fallback for every adopted surface

## Non-Goals

- making Guide Cat content authoritative product state
- requiring periodic scheduling in the first slice
- designing every final prompt/chip/copy variant in this spec
- replacing sidecar shell state or route-local UI state
- requiring Work and Code surfaces to adopt the shared cache immediately

## Problem Statement

Guide Cat is moving beyond one greeting string.

The product now needs reusable assist content that may appear:

- before the user starts a chat
- between a greeting and the composer
- when the user returns after prior work
- when the platform wants to explain a feature or recommend the next step

The current implementation does not yet provide a durable product-owned source
for that content. Some entry surfaces still read from hard-coded renderer
arrays, and there is no shared provenance/freshness contract for generated
results.

Without a dedicated substrate, the platform will either:

- keep duplicating strings in UI code
- wrongly store assist content as transcript/session state
- or over-couple lightweight help surfaces to live runtime availability

## User Stories

- As a new owner, I want Lobby and `+New chat` to show useful starter content
  immediately, even if runtime-backed help is temporarily offline.
- As a returning owner, I want the product to recap my recent work and suggest
  next steps without forcing me into a dedicated Guide Cat conversation first.
- As a product team, I want greetings, chips, recap, and feature guidance to
  share one persistence and refresh model instead of bespoke per-surface logic.
- As a maintainer, I want to know whether visible assist content came from
  deterministic fallback, cache, or a runtime-backed refresh.

## Requirements

### Functional Requirements

1. The platform shall persist reusable Guide Cat assist content as
   platform-owned local data.
2. The first shared assist-content families shall support:
   - greeting copy
   - entry chips
   - composer chips
   - recap copy
   - feature-guidance cards
   - next-step recommendations
3. The platform shall group assist content into one or more
   `GuideCatAssistBundle` snapshots keyed by normalized surface scope.
4. Normalized surface scope shall identify at least:
   - surface id such as `lobby`, `chat:new`, or `chat:composer`
   - route/product context
   - coarse audience state such as `first_run`, `returning`, or
     `recap_candidate`
5. The bundle model shall allow later specialization by additional context such
   as workspace, recent activity class, or surface-local variant key without
   redefining the base schema.
6. Each bundle shall include freshness and provenance metadata, including at
   least:
   - stable bundle id
   - content origin: `deterministic` or `runtime`
   - `generatedAt`
   - `expiresAt` or equivalent freshness policy
   - last refresh status
   - optional linked `missionId` / `runId`
7. Guide Cat assist storage shall follow the structured platform layout from
   `ADR-053`.
8. The first slice shall introduce:
   - `~/.cats/platform/config/guide-cat-assist-config.json`
   - `~/.cats/platform/state/guide-cat-assist-cache.local.json`
9. `guide-cat-assist-config.json` shall be reserved for user- or product-owned
   configuration such as:
   - disabled surfaces
   - deterministic seed choices
   - optional curated overrides
   - refresh preferences
10. `guide-cat-assist-cache.local.json` shall hold generated or cached bundles,
    provenance, freshness metadata, and refresh failures.
11. Every adopted surface shall define a deterministic baseline that remains
    usable when no valid cached bundle exists.
12. A surface shall be able to read last-good cached assist content
    synchronously and render without waiting for a live runtime round-trip.
13. The initial refresh triggers shall include:
    - non-blocking stale check after desktop launch and runtime readiness
    - on-surface-open refresh when the relevant bundle is stale or missing
    - explicit manual refresh when a user requests it
14. The first slice shall not require periodic background refresh for basic
    usability.
15. Runtime-backed refresh shall run through the existing runtime boundary and
    may reuse a warm leased session when available.
16. Runtime-backed refresh work shall be representable as `mission` and `run`
    records rather than a special Guide-Cat-only execution type.
17. Future periodic or delayed refresh may be layered through runtime wakeups,
    but wakeups shall remain optional for the initial slice.
18. Recap bundles may summarize recent work, recent conversations, or recent
    product activity, but they shall remain non-authoritative projections.
19. Recap bundles shall not implicitly create or mutate managed work, routing
    policy, or transcript truth without an explicit product handoff.
20. Guide Cat assist bundles may recommend actions such as opening chat, work,
    or code surfaces, but the actual action shall happen through explicit
    product-owned handoff wiring.
21. Surface-local view state such as sidecar dismissal, chip dismissal, or
    "already seen" markers shall remain distinct from assist bundle storage.
22. When refresh fails, the platform shall retain the last-good cached bundle
    when one exists and degrade cleanly to deterministic baseline otherwise.
23. The platform shall record enough metadata to answer:
    - which bundle was shown
    - on which surface
    - whether the surface rendered deterministic baseline, cached bundle, or a
      freshly refreshed bundle
    - from which content origin
    - with which last refresh result

### Non-Functional Requirements

- **Offline usability**: adopted surfaces must remain useful without live
  runtime access
- **Low privilege**: Guide Cat assist content must not become authoritative
  product state
- **Storage clarity**: user-owned config and generated cache must remain
  separate
- **Freshness safety**: stale-while-revalidate must not block startup or route
  entry
- **Composability**: multiple surfaces should consume the same bundle contract
  without bespoke schemas
- **Traceability**: maintainers must be able to inspect provenance and refresh
  failures

## Design Overview

### Model Split

```text
surface context
  -> deterministic baseline
  -> cached assist bundle lookup
  -> optional lazy refresh
  -> rendered greeting / chips / recap / feature guidance
  -> explicit product handoff if the user wants deeper work
```

### Storage Layout

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

### Bundle Shape

Each `GuideCatAssistBundle` should contain these logical sections:

- `scope`
  - normalized surface identity and variant context
- `content`
  - greeting copy
  - chips
  - recap blocks
  - guidance cards
- `provenance`
  - content origin
  - optional source mission/run references
  - context hash or refresh key
- `freshness`
  - generated timestamp
  - expiry/staleness metadata
  - last refresh outcome

Illustrative example:

```json
{
  "bundleId": "chat:new:returning:default",
  "scope": {
    "surfaceId": "chat:new",
    "product": "chat",
    "audienceState": "returning"
  },
  "content": {
    "greeting": "Pick up where you left off.",
    "entryChips": [
      { "id": "recap", "label": "Recap yesterday" },
      { "id": "next", "label": "What should I do next?" }
    ],
    "recap": {
      "title": "Recent momentum",
      "body": "You were iterating on onboarding and packaging fixes."
    }
  },
  "provenance": {
    "originMode": "runtime",
    "missionId": "mission-123",
    "runId": "run-456"
  },
  "freshness": {
    "generatedAt": "2026-04-17T10:00:00.000Z",
    "expiresAt": "2026-04-18T10:00:00.000Z",
    "lastRefreshStatus": "ok"
  }
}
```

### Refresh Lifecycle

The default lifecycle should be:

1. route/app entry reads deterministic baseline plus any last-good cached
   bundle immediately
2. once app/runtime readiness is known, the product evaluates whether the
   bundle is stale or missing
3. if refresh is allowed, the product launches a non-blocking refresh through
   the runtime boundary
4. when refresh succeeds, the cache updates and the current surface may choose
   a non-disruptive re-render policy
5. when refresh fails, the product keeps last-good output or baseline fallback

### Initial Surface Adoption

The first bundle consumers should be:

- Lobby greeting and entry suggestions
- `+New chat` greeting and starter chips
- composer-adjacent assist chips or helper copy
- returning-user recap card on selected entry surfaces

Future consumers may include:

- Work empty states
- Code empty states
- sidecar projections of the same bundle data

## Dependencies

- [ADR-053](../decisions/053-use-structured-cats-home-platform-storage.md)
- [ADR-061](../decisions/061-treat-guide-cat-as-an-optional-surface-assist-capability.md)
- [ADR-063](../decisions/063-agent-missions-and-transport-bindings.md)
- [ADR-066](../decisions/066-persist-guide-cat-assist-content-as-platform-owned-local-state.md)
- [SPEC-049](./SPEC-049-guide-cat-setup-and-generalized-participant-entry.md)
- [SPEC-060](./SPEC-060-guide-cat-optional-surface-assist-capability.md)
- [SPEC-062](./SPEC-062-agent-missions-and-transport-bindings.md)

## Open Questions

- [ ] Which exact surface-scope fields should participate in the first cache
      key versus stay outside the key as soft hints?
- [ ] Whether recap should initially live on Lobby only, `+New chat` only, or
      both.
- [ ] Whether manual refresh should be exposed in the first UI slice or only as
      internal invalidation.
- [ ] How aggressively surfaces should live-update visible chips when a fresher
      bundle arrives during the same session.

## References

- [ADR-066](../decisions/066-persist-guide-cat-assist-content-as-platform-owned-local-state.md)
- [SPEC-060](./SPEC-060-guide-cat-optional-surface-assist-capability.md)
- [SPEC-062](./SPEC-062-agent-missions-and-transport-bindings.md)

---

*Created: 2026-04-17*
*Author: Codex*
*Related Plan: [PLAN-059](../plans/PLAN-059-guide-cat-assist-content-cache-and-offline-refresh.md)*
