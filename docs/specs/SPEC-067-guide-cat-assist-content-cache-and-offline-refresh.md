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
- defining cross-device sync for device-local assist caches in the first slice

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
5. The first-slice cache key shall use exactly:
   - `surfaceId`
   - `surfaceMode`
   - `audienceState`
6. `surfaceMode` shall use `default` when a surface does not expose a more
   specific mode split.
7. In the first slice, richer context such as `product`, `route`,
   `workspace`, `recentActivityClass`, and `variantKey` shall remain scope
   metadata or refresh hints rather than cache-key fields.
8. The bundle model shall allow later specialization by additional context
   without redefining the base schema.
9. Each bundle shall include freshness and provenance metadata, including at
   least:
   - stable bundle id
   - content origin: `deterministic` or `runtime`
   - `generatedAt`
   - `expiresAt` or equivalent freshness policy
   - last refresh status
   - optional linked `missionId` / `runId`
10. Each cached bundle shall include a stable `refreshContextHash` or
    equivalent refresh key derived from:
    - `schemaVersion`
    - first-slice cache-key fields
    - Guide Cat identity and visible naming inputs used by the bundle
    - Guide Cat execution target inputs such as provider, instance, model, and
      `modelSelection`
    - owner-visible naming inputs when personalization depends on them
    - assist-template revision inputs
11. `refreshContextHash` shall exclude volatile values such as timestamps,
    ephemeral session ids, or transient UI state.
12. Guide Cat assist storage shall follow the structured platform layout from
   `ADR-053`.
13. The first slice shall introduce:
   - `~/.cats/platform/config/guide-cat-assist-config.json`
   - `~/.cats/platform/state/guide-cat-assist-cache.local.json`
14. Both assist files shall carry an explicit `schemaVersion`, and read paths
    shall support tolerant migration or safe fallback when older versions are
    encountered.
15. `guide-cat-assist-config.json` shall be reserved for user- or product-owned
   configuration such as:
   - disabled surfaces
   - deterministic seed choices
   - optional curated overrides
   - refresh preferences
16. `guide-cat-assist-cache.local.json` shall hold generated or cached bundles,
    provenance, freshness metadata, and refresh failures.
17. Every adopted surface shall define a deterministic baseline that remains
    usable when no valid cached bundle exists.
18. A surface shall be able to read last-good cached assist content
    synchronously and render without waiting for a live runtime round-trip.
19. The initial refresh triggers shall include:
    - one initial hydration attempt after setup completes when a Guide Cat
      exists and the relevant first-entry bundles are missing or stale
    - one initial hydration attempt when a Guide Cat is newly created,
      restored, or materially reconfigured and the relevant bundles are
      missing or stale
    - non-blocking stale check after desktop launch and runtime reachability
      is known
    - on-surface-open hydration when the relevant bundle is stale or missing
    - explicit manual refresh only if a later slice chooses to expose it
20. The first slice shall not require periodic background refresh or manual
    refresh UI for basic usability.
21. Later runtime-backed assist generation shall run through the existing
    runtime boundary and may reuse a warm leased session when available.
22. Runtime-backed refresh work, when introduced, shall be representable as
    `mission` and `run` records rather than a special Guide-Cat-only
    execution type.
23. Future periodic or delayed refresh may be layered through runtime wakeups,
    but wakeups shall remain optional for the initial slice.
24. Refresh requests for recap or guidance bundles shall accept a
    product-owned input payload or references for:
    - recent conversations or conversation summaries
    - recent managed-work references or summaries
    - recent surface-activity summaries
    - optional owner/profile personalization inputs
25. The first slice may satisfy those recap inputs with lightweight product
    summaries rather than full cross-product aggregation.
26. Recap bundles may summarize recent work, recent conversations, or recent
    product activity, but they shall remain non-authoritative projections.
27. Recap bundles shall not implicitly create or mutate managed work, routing
    policy, or transcript truth without an explicit product handoff.
28. Guide Cat assist bundles may recommend actions such as opening chat, work,
    or code surfaces, but the actual action shall happen through explicit
    product-owned handoff wiring.
29. Surface-local view state such as sidecar dismissal, chip dismissal, or
    "already seen" markers shall remain distinct from assist bundle storage.
30. When refresh fails, the platform shall retain the last-good cached bundle
    when one exists and degrade cleanly to deterministic baseline otherwise.
31. The platform shall record enough metadata to answer:
    - which bundle was shown
    - on which surface
    - whether the surface rendered deterministic baseline, cached bundle, or a
      freshly refreshed bundle
    - from which content origin
    - with which last refresh result
32. The first shipped slice may satisfy lazy refresh by non-blocking local
    hydration/rehydration of deterministic or last-good bundles.

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

### V1 Delivery Boundary

The first shipped read-model paths should be explicit:

- Lobby reads resolved assist content through the platform envelope contract.
- `+New chat` reads resolved assist content through the chat payload contract.

The renderer should not choose between competing local-store access paths.
Assist content should be resolved on the product/server side and delivered
through the existing envelope/payload refresh flow for each adopted surface.

### V1 Lazy Refresh Semantics

The first shipped slice is intentionally narrower than the long-term
runtime-backed model:

- stale or missing adopted bundles may be rehydrated locally from
  deterministic or last-good content
- that local hydration updates freshness and invalidation metadata without
  blocking entry
- runtime-backed assist generation and mission/run provenance remain follow-up
  work after the v1 storage/read-path slice

### V1 Scope Key

The first slice should freeze one cache-key shape:

```text
<surfaceId>:<surfaceMode>:<audienceState>
```

- `surfaceId`
  - `lobby`
  - `chat:new`
  - later `chat:composer`
- `surfaceMode`
  - `default` when the surface has no mode split
  - `solo`, `cat_led`, `direct`, `group`, or `parallel` for `chat:new`
- `audienceState`
  - `default` for current greeting/chip migration
  - later `first_run`, `returning`, or `recap_candidate` when those surfaces
    intentionally diverge

`product`, `route`, `workspace`, and other richer context remain scope metadata
and refresh inputs in the first slice, but they do not participate in the
first cache key.

### V1 Legacy Mapping

The first migration should preserve the current deterministic sources through a
stable mode-to-scope mapping:

| Current source | Current mode split | V1 scope key(s) | Notes |
|------|------|------|------|
| `LOBBY_GREETING_LINES` | none | `lobby:default:default` | Lobby greeting baseline |
| `DRAFT_GREETING_LINES` | none | `chat:new:solo:default`, `chat:new:cat_led:default`, `chat:new:direct:default`, `chat:new:group:default`, `chat:new:parallel:default` | Same greeting baseline reused across initial `+New chat` modes |
| `resolveDraftStarterSuggestions('solo')` | `solo` | `chat:new:solo:default` | Starter chips |
| `resolveDraftStarterSuggestions('cat_led')` | `cat_led` | `chat:new:cat_led:default` | Starter chips |
| `resolveDraftStarterSuggestions('direct')` | `direct` | `chat:new:direct:default` | Starter chips |
| `resolveDraftStarterSuggestions('group')` | `group` | `chat:new:group:default` | Starter chips |
| `resolveDraftStarterSuggestions('parallel')` | `parallel` | `chat:new:parallel:default` | Starter chips |

This mapping is intentionally narrower than the long-term bundle model. It
freezes the first migration target so existing greeting and starter-suggestion
behavior can move into the shared assist cache without changing user-facing
mode semantics.

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
  "bundleId": "chat:new:solo:returning",
  "scope": {
    "surfaceId": "chat:new",
    "surfaceMode": "solo",
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
    "refreshContextHash": "gca:v1:2b9a8d0f",
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

1. setup completion or Guide Cat creation/restoration may enqueue one initial
   generation for first-entry bundles when they are missing or stale
2. route/app entry reads deterministic baseline plus any last-good cached
   bundle immediately
3. once app/runtime readiness is known, the product evaluates whether the
   bundle is stale or missing
4. if refresh is allowed, the first shipped slice may perform a non-blocking
   local hydration/rehydration of deterministic or last-good content; later
   slices may replace or extend that step with runtime-backed generation
5. when hydration or a later runtime refresh succeeds, the cache updates and
   the current surface may choose a non-disruptive re-render policy; v1 does
   not require mid-session visual replacement and may adopt fresher content on
   the next surface open or the next envelope/payload refresh
6. when hydration or refresh fails, the product keeps last-good output or
   baseline fallback

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
      key versus stay outside the key as soft hints after the v1 key freeze.
- [ ] Whether recap should initially live on Lobby only, `+New chat` only, or
      both.
- [ ] Whether manual refresh should be exposed in the first UI slice or only as
      internal invalidation.
- [ ] Whether device-local assist bundles should remain unsynced across
      desktop/mobile surfaces or later gain a cross-device seed/sync model.

## References

- [ADR-066](../decisions/066-persist-guide-cat-assist-content-as-platform-owned-local-state.md)
- [SPEC-060](./SPEC-060-guide-cat-optional-surface-assist-capability.md)
- [SPEC-062](./SPEC-062-agent-missions-and-transport-bindings.md)

---

*Created: 2026-04-17*
*Author: Codex*
*Related Plan: [PLAN-059](../plans/PLAN-059-guide-cat-assist-content-cache-and-offline-refresh.md)*
