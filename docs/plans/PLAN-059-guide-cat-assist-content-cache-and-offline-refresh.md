# PLAN-059: Guide Cat Assist Content Cache and Offline Refresh

> Roll out the first executable slice of Guide Cat assist-content persistence so
> Lobby and `+New chat` can render immediately from deterministic baseline or
> last-good local cache, then rehydrate lazily without blocking entry while
> runtime-backed content generation remains deferred.

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Draft |
| **Owner** | Codex |
| **Reviewer** | User |

## Related Spec

- [SPEC-067: Guide Cat Assist Content Cache and Offline Refresh](../specs/SPEC-067-guide-cat-assist-content-cache-and-offline-refresh.md)
- [SPEC-060: Guide Cat Optional Surface-Assist Capability](../specs/SPEC-060-guide-cat-optional-surface-assist-capability.md)
- [ADR-066: Persist Guide Cat Assist Content as Platform-Owned Local State](../decisions/066-persist-guide-cat-assist-content-as-platform-owned-local-state.md)

## Overview

This plan narrows `SPEC-067` into a first production slice that can land
without waiting on recap, feature guidance, Work/Code adoption, or scheduled
refresh.

V1 only covers:

- one shared local storage substrate for Guide Cat assist content
- deterministic baseline plus cache resolution for adopted entry surfaces
- one minimal stale-while-revalidate local hydration path
- one explicit last-good fallback rule when refresh fails or runtime is offline

The first adopted surfaces are:

- Lobby greeting
- `+New chat` greeting
- `+New chat` starter chips for `solo`, `participant`, `direct`, `group`, and
  `parallel`

## V1 Scope Freeze

### In Scope

- `config/guide-cat-assist-config.json`
- `state/guide-cat-assist-cache.local.json`
- one shared `GuideCatAssistBundle` v1 model for:
  - greeting copy
  - entry chips
- the first cache key shape:
  - `surfaceId`
  - `surfaceMode`
  - `audienceState`
- deterministic baseline mapping from today's hard-coded Lobby and
  `+New chat` sources into frozen v1 scope keys
- non-blocking refresh after runtime readiness and on adopted-surface open
- last-good cache retention on refresh failure

### Explicitly Out of Scope for V1

- recap bundles
- feature-guidance cards
- composer-adjacent chips or helper copy
- Work or Code surface adoption
- manual refresh UI
- periodic or wakeup-scheduled refresh
- cross-device sync
- aggressive in-session hot-swapping of already visible content

Later slices can extend the same storage and bundle contract, but they are not
part of this plan's implementation scope.

## V1 Acceptance Criteria

- Lobby can render a deterministic greeting with no Guide Cat, no cache, and no
  runtime.
- Lobby can render last-good cached assist content when cache exists and runtime
  is offline.
- `+New chat` can render greeting plus starter chips for `solo`, `participant`,
  `direct`, `group`, and `parallel` using the same baseline-or-cache
  resolution.
- Adopted surfaces do not read local files from the renderer directly; the
  product resolves assist state through existing product/server boundaries.
- V1 lazy hydration never blocks initial render for Lobby or `+New chat`.
- Refresh failure preserves the last-good cached bundle when one exists and
  degrades to deterministic baseline otherwise.
- V1 ships without recap, feature-guidance, composer-assist, or scheduled
  refresh behavior, and without runtime-backed assist generation.

## Implementation Phases

### Phase 1: Freeze the V1 Contract

- [ ] Task 1.1: Add canonical path helpers for:
      - `config/guide-cat-assist-config.json`
      - `state/guide-cat-assist-cache.local.json`
- [ ] Task 1.2: Define the v1 file envelopes for assist-config and assist-cache,
      including `schemaVersion`.
- [ ] Task 1.3: Define the v1 `GuideCatAssistBundle` shape for greeting plus
      entry chips only.
- [ ] Task 1.4: Freeze the first cache-key fields and exact adopted keys:
      - `lobby:default:default`
      - `chat:new:solo:default`
      - `chat:new:participant:default`
      - `chat:new:direct:default`
      - `chat:new:group:default`
      - `chat:new:parallel:default`
- [ ] Task 1.5: Publish the deterministic baseline mapping from current
      renderer constants/functions into those keys.
- [ ] Task 1.6: Freeze `refreshContextHash` inputs for v1:
      - `schemaVersion`
      - cache-key fields
      - Guide Cat id/name
      - Guide Cat execution target and `modelSelection`
      - assist-template revision inputs
- [ ] Task 1.7: Define tolerant migration and safe-fallback rules for unknown
      or older file versions.

**Deliverables**: one frozen v1 persistence contract with exact scope keys,
bundle fields, and invalidation inputs

### Phase 2: Build the Local Store and Resolution Layer

- [ ] Task 2.1: Implement assist-config loading with default values and no
      renderer-owned file access.
- [ ] Task 2.2: Implement assist-cache loading, normalization, and atomic
      writes.
- [ ] Task 2.3: Implement one shared resolution helper that returns:
      - deterministic baseline bundle
      - last-good cached bundle if present
      - effective render source
      - freshness / refresh eligibility
- [ ] Task 2.4: Define the server-owned read-model boundary for adopted
      surfaces so Lobby and `+New chat` can consume assist data through
      existing envelope/payload flows:
      - Lobby via the platform envelope
      - `+New chat` via the chat payload
- [ ] Task 2.5: Keep view-local shell state separate from assist bundle
      storage.

**Deliverables**: the product can resolve assist content synchronously from
baseline or cache through one shared read path

### Phase 3: Migrate the First Entry Surfaces

- [ ] Task 3.1: Replace Lobby greeting ownership with the shared
      baseline-plus-cache resolution path.
- [ ] Task 3.2: Replace `+New chat` greeting ownership with the same shared
      resolution path.
- [ ] Task 3.3: Replace direct starter-suggestion ownership for
      `solo` / `participant` / `direct` / `group` / `parallel` with shared
      bundle-backed starter chips.
- [ ] Task 3.4: Preserve today's user-visible fallback text and mode semantics
      when no cache exists.
- [ ] Task 3.5: Keep composer-adjacent assist and sidecar behavior out of this
      migration slice.

**Deliverables**: Lobby and `+New chat` stop treating local constant pools as
their only source of truth

### Phase 4: Add Minimal Lazy Hydration

- [ ] Task 4.1: Add one non-blocking hydration coordinator for adopted scopes
      after desktop launch and runtime reachability checks.
- [ ] Task 4.2: Add one non-blocking hydration check on adopted-surface open when
      the relevant bundle is missing or stale.
- [ ] Task 4.3: Add one rehydration trigger when Guide Cat is newly created,
      restored, or materially reconfigured and the adopted bundles are missing
      or stale.
- [ ] Task 4.4: Skip hydration cleanly when no Guide Cat exists or runtime is not
      ready.
- [ ] Task 4.5: Persist hydration outcome metadata and retain last-good bundles
      on failure.
- [ ] Task 4.6: Defer manual refresh UI, scheduled refresh, and recap/guidance
      generation, plus runtime-backed assist generation, to later follow-up work.

**Deliverables**: adopted surfaces use stale-while-revalidate local hydration
without blocking entry or requiring always-on runtime sessions

### Phase 5: Verification and Handoff

- [ ] Task 5.1: Add unit tests for schema normalization, cache-key mapping,
      freshness evaluation, and last-good fallback resolution.
- [ ] Task 5.2: Add integration tests for Lobby assist resolution through the
      chosen read-model boundary.
- [ ] Task 5.3: Add integration tests for `+New chat` greeting and starter-chip
      resolution across all adopted modes.
- [ ] Task 5.4: Add integration tests for runtime-offline, cache-missing,
      cache-stale, and refresh-failure scenarios.
- [ ] Task 5.5: Add manual smoke coverage for:
      - no Guide Cat configured
      - Guide Cat configured with empty cache
      - Guide Cat configured with stale cache and runtime available
      - Guide Cat configured with stale cache and runtime unavailable

**Deliverables**: v1 ships with predictable offline behavior and narrow but
proven refresh semantics

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `src/shared/platformPaths.ts` | Modify | Add canonical assist-config and assist-cache path helpers |
| `src/shared/**` | Create/Modify | Define assist bundle schema, file envelopes, local store, and refresh/freshness helpers |
| `src/shared/platform-contract.ts` | Modify | Add any platform-envelope assist read-model fields needed for Lobby consumption |
| `src/products/chat/api/contracts.ts` | Modify | Add any chat-payload assist read-model fields needed for `+New chat` consumption |
| `src/products/chat/api/**` | Modify | Resolve and expose assist bundles through existing product/server boundaries |
| `src/app/renderer/lobbyModel.ts` | Modify | Convert Lobby greeting ownership into deterministic baseline inputs for the shared assist resolver |
| `src/app/renderer/PlatformLobby.tsx` | Modify | Consume resolved Lobby assist content instead of direct local greeting picks |
| `src/products/shared/renderer/draftChatUtils.tsx` | Modify | Convert draft greeting ownership into shared assist baseline inputs |
| `src/shared/guideCatAssistBaselines.ts` | Modify | Own starter-suggestion baseline content (`resolveDraftStarterSuggestionsBaseline`); the former renderer-side `resolveDraftStarterSuggestions` fallback has been removed in favor of runtime-origin bundles |
| `src/products/shared/renderer/draftStarterSuggestions.ts` | Modify | Thin renderer helper that only sanitizes explicitly supplied starter chips; no static fallback, since chip visibility is gated on runtime-origin payload bundles (see `chatNewChatDraftSupport.ts`) |
| `src/products/shared/renderer/**` | Modify | Consume resolved `+New chat` assist bundles without changing mode-specific semantics |
| `tests/**` | Create/Modify | Cover schema, mapping, cache behavior, refresh policy, and adopted surfaces |

## Technical Decisions

- Decision 1: V1 is a narrow execution slice of `SPEC-067`, not the full
  long-term assist-content roadmap.
- Decision 2: The first shipped bundle families are greeting copy and entry
  chips only; recap, guidance, and composer-assist remain deferred.
- Decision 3: Existing deterministic Lobby and `+New chat` copy stays intact as
  the v1 baseline provider before any prompt/generation tuning.
- Decision 4: Adopted surfaces resolve assist content through server/product
  payloads rather than renderer-direct file reads.
- Decision 5: V1 hydration is stale-while-revalidate and non-blocking by
  default.
- Decision 6: V1 does not require visible mid-session content replacement when
  a fresher bundle arrives; safe next-open or envelope-refresh adoption is
  acceptable for the first slice.
- Decision 7: If adopted-surface contracts need new fields, v1 should add them
  additively without rewriting existing shared envelope/payload shapes.
- Decision 8: The v1 coordinator only rehydrates deterministic or last-good
  local bundles; it does not yet dispatch runtime-backed assist generation.
- Decision 9: Mission/run provenance alignment remains a follow-up after the
  v1 storage/read-path slice; v1 may persist hydration metadata first and add
  richer runtime provenance once the shared execution shape is ready.

## Testing Strategy

- **Unit Tests**: schema normalization, key mapping, `refreshContextHash`
  derivation, freshness checks, last-good retention, deterministic baseline
  fallback
- **Integration Tests**: adopted-surface payload resolution for Lobby and
  `+New chat`, including mode-specific starter-chip coverage
- **Manual Testing**:
  - start with no Guide Cat and verify Lobby and `+New chat` still render
  - seed cache, disable runtime, and verify last-good assist content appears
  - clear cache, keep runtime offline, and verify deterministic baseline is used
  - restore runtime and verify stale bundles can rehydrate without blocking entry

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| V1 scope expands back into recap, feature guidance, or composer-assist | High | Freeze greeting plus entry chips as the only shipped bundle families in this plan |
| Assist read path leaks into renderer-owned file access | High | Resolve assist data through existing server/product payload seams only |
| Cache-key churn invalidates too much content during the first rollout | Medium | Freeze exact v1 scope keys before surface migration |
| Refresh wiring slows startup or route entry | High | Require baseline/cache render first and keep refresh fully non-blocking |
| `+New chat` mode semantics regress during migration | Medium | Preserve today's deterministic fallback text/chips per mode until after v1 lands |

## Progress Log

| Date | Update |
|------|--------|
| 2026-04-17 | Plan created for Guide Cat assist-content cache, recap, and offline refresh rollout |
| 2026-04-17 | Narrowed the plan into an executable v1 slice focused on Lobby and `+New chat` greeting/chip persistence plus minimal lazy refresh |
| 2026-04-17 | Clarified that the shipped v1 lazy-refresh slice performs local hydration/rehydration only, because the landed v1 implementation kept offline-first entry behavior while deferring runtime-backed assist generation and mission/run provenance |

---

*Created: 2026-04-17*
*Author: Codex*
