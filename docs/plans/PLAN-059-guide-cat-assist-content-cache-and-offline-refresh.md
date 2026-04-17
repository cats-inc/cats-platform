# PLAN-059: Guide Cat Assist Content Cache and Offline Refresh

> Roll out one shared storage and refresh substrate for Guide Cat greetings,
> chips, recap, and feature guidance so entry surfaces can render immediately
> and refresh lazily without depending on always-on runtime sessions.

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Draft |
| **Owner** | Codex |
| **Reviewer** | User |

## Related Spec

- [SPEC-067: Guide Cat Assist Content Cache and Offline Refresh](../specs/SPEC-067-guide-cat-assist-content-cache-and-offline-refresh.md)
- [SPEC-060: Guide Cat Optional Surface-Assist Capability](../specs/SPEC-060-guide-cat-optional-surface-assist-capability.md)
- [SPEC-062: Agent Missions, Managed Work, and Transport Bindings](../specs/SPEC-062-agent-missions-and-transport-bindings.md)
- [ADR-066: Persist Guide Cat Assist Content as Platform-Owned Local State](../decisions/066-persist-guide-cat-assist-content-as-platform-owned-local-state.md)

## Overview

The rollout has three linked goals:

- move Guide-Cat-adjacent assist content out of hard-coded renderer arrays
- establish one `config` plus `state` storage contract for reusable bundles
- introduce lazy refresh that stays compatible with runtime outages and future
  mission/run/wakeup expansion

The first adopted surfaces are:

- Lobby greeting and entry suggestions
- `+New chat` greeting and starter chips
- composer-adjacent assist chips/helper copy
- first returning-user recap surface

## Implementation Phases

### Phase 1: Freeze Storage and Bundle Contracts

- [ ] Task 1.1: Add path helpers for:
      - `config/guide-cat-assist-config.json`
      - `state/guide-cat-assist-cache.local.json`
- [ ] Task 1.2: Define the `GuideCatAssistBundle` read/write schema.
- [ ] Task 1.3: Freeze the first-slice cache-key fields:
      - `surfaceId`
      - `surfaceMode`
      - `audienceState`
- [ ] Task 1.4: Publish a v1 legacy mapping table from current deterministic
      sources into the new scope keys for:
      - Lobby greeting
      - `+New chat` greeting
      - `solo` / `cat_led` / `direct` / `group` / `parallel` starter chips
- [ ] Task 1.5: Define deterministic baseline provider contracts per surface.
- [ ] Task 1.6: Define `refreshContextHash` inputs and invalidation rules.
- [ ] Task 1.7: Add `schemaVersion` plus tolerant migration/fallback rules for
      assist-config and assist-cache file envelopes.
- [ ] Task 1.8: Define provenance and freshness fields, including optional
      `missionId` / `runId`.

**Deliverables**: one stable persistence contract plus one shared bundle model

### Phase 2: Build Local Cache Read Path

- [ ] Task 2.1: Implement assist-config loading with sane defaults.
- [ ] Task 2.2: Implement assist-cache loading, normalization, and atomic
      writes.
- [ ] Task 2.3: Add selectors/hooks so surfaces can resolve:
      - deterministic baseline
      - last-good cached bundle
      - refresh eligibility
- [ ] Task 2.4: Keep surface-local chrome state separate from bundle storage.

**Deliverables**: surfaces can consume cacheable assist data without yet doing
runtime refresh

### Phase 3: Migrate Current Entry Surfaces

- [ ] Task 3.1: Replace Lobby hard-coded greeting selection with a deterministic
      baseline provider plus bundle lookup.
- [ ] Task 3.2: Replace `+New chat` hard-coded greeting selection with the same
      baseline-plus-bundle pattern.
- [ ] Task 3.3: Add the first shared starter-chip slot between greeting and
      composer on adopted chat-entry surfaces.
- [ ] Task 3.4: Ensure all migrated surfaces still work with no Guide Cat and
      with runtime offline.

**Deliverables**: current greeting surfaces stop depending on local constant
pools as the only source of truth

### Phase 4: Add Lazy Refresh Orchestration

- [ ] Task 4.1: Add one initial generation hook after setup completion when a
      Guide Cat exists and first-entry bundles are missing or stale.
- [ ] Task 4.2: Add one initial generation hook when a Guide Cat is newly
      created, restored, or materially reconfigured and relevant bundles are
      missing or stale.
- [ ] Task 4.3: Add non-blocking stale check after desktop launch and runtime
      readiness.
- [ ] Task 4.4: Add on-surface-open stale/missing refresh for adopted scopes.
- [ ] Task 4.5: Define manual invalidation or refresh entry points for future
      UI use.
- [ ] Task 4.6: Persist last refresh status and retain last-good bundles on
      failure.
- [ ] Task 4.7: Map runtime refresh attempts onto `mission` / `run` provenance
      where available.

**Deliverables**: stale-while-revalidate behavior with provenance-aware cache
updates

### Phase 5: Add Recap and Feature-Guidance Bundles

- [ ] Task 5.1: Define the first recap refresh-input payload placeholder from:
      - recent conversation summaries
      - recent managed-work references or summaries
      - recent surface-activity summaries
      - optional owner/profile personalization inputs
- [ ] Task 5.2: Define the first recap content shape for returning-user entry
      surfaces.
- [ ] Task 5.3: Define feature-guidance card content and explicit handoff
      actions.
- [ ] Task 5.4: Ensure recap/guidance remains non-authoritative and does not
      mutate work/chat truth implicitly.
- [ ] Task 5.5: Decide which adopted surface shows recap first.

**Deliverables**: shared bundles cover more than greetings and chips

### Phase 6: Optional Scheduled Refresh Follow-Up

- [ ] Task 6.1: Evaluate whether runtime wakeups should schedule selected
      bundle refreshes.
- [ ] Task 6.2: If needed, define coalescing keys and refresh cadence by
      surface scope.
- [ ] Task 6.3: Keep scheduled refresh optional and additive rather than a
      requirement for baseline UX.

**Deliverables**: future-ready scheduling path without blocking the first slice

### Phase 7: Verification

- [ ] Task 7.1: Add unit tests for schema normalization, freshness evaluation,
      and fallback resolution.
- [ ] Task 7.2: Add integration tests for Lobby and `+New chat` bundle
      consumption.
- [ ] Task 7.3: Add integration tests for runtime-offline, cache-missing, and
      last-good-cache scenarios.
- [ ] Task 7.4: Add manual smoke tests for:
      - first run with Guide Cat
      - returning user with recap candidate state
      - runtime unavailable during refresh
      - cache refresh after desktop launch

**Deliverables**: stable offline-renderable assist surfaces with predictable
refresh behavior

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `src/shared/platformPaths.ts` | Modify | Add canonical assist-config and assist-cache path helpers |
| `src/shared/**` | Create/Modify | Bundle schema, cache store, refresh policy, and baseline provider contracts |
| `src/app/renderer/PlatformLobby.tsx` | Modify | Consume deterministic baseline plus assist bundle |
| `src/app/renderer/lobbyModel.ts` | Modify | Convert hard-coded greeting pool into deterministic baseline provider input |
| `src/products/chat/renderer/chatUtils.tsx` | Modify | Replace direct greeting-pool ownership with shared assist baseline inputs |
| `src/products/shared/renderer/**` | Modify | Integrate entry and composer assist bundle consumers |
| `src/app/renderer/useGuideCatSidecarState.ts` | Modify | Keep shell state separate from assist content persistence where needed |
| `tests/**` | Create/Modify | Coverage for schema, cache behavior, refresh policy, and adopted surfaces |

## Technical Decisions

- Decision 1: assist content is a product-owned bundle cache, not transcript
  state.
- Decision 2: `config` and generated `state` stay separate from day one.
- Decision 3: stale-while-revalidate is the default lifecycle; periodic
  scheduling is optional follow-up work.
- Decision 4: recap and guidance must remain non-authoritative and act only
  through explicit product handoff.

## Testing Strategy

- **Unit Tests**: bundle schema normalization, freshness checks, baseline
  selection, cache retention on refresh failure
- **Integration Tests**: Lobby, `+New chat`, composer-adjacent chips, recap
  entry surface, runtime-off fallback
- **Manual Testing**:
  - no Guide Cat configured
  - Guide Cat configured with empty cache
  - Guide Cat configured with stale cache and runtime available
  - Guide Cat configured with stale cache and runtime unavailable

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Assist bundles become another ad hoc per-surface schema | High | Freeze one bundle contract before migrating surfaces |
| Runtime refresh blocks startup or route entry | High | Keep launch and surface refresh non-blocking; always render baseline/cache first |
| Recap starts mutating product truth implicitly | High | Require explicit product handoff for any real action or state mutation |
| UI chrome state gets mixed into bundle cache | Medium | Keep sidecar/chip visibility and "seen" state in separate preferences or view state |
| Scheduled refresh adds complexity too early | Medium | Keep wakeups as a later additive phase only |

## Progress Log

| Date | Update |
|------|--------|
| 2026-04-17 | Plan created for Guide Cat assist-content cache, recap, and offline refresh rollout |

---

*Created: 2026-04-17*
*Author: Codex*
