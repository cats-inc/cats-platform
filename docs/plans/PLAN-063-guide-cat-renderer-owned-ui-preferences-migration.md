# PLAN-063: Guide Cat Renderer-Owned UI Preferences Migration

## Metadata

| Field | Value |
|-------|-------|
| **Status** | In Progress (Current Renderer Baseline) |
| **Owner** | Codex |
| **Reviewer** | User |

## Related Spec

[SPEC-071: Guide Cat Placement and Shared-Chrome Docking](../specs/SPEC-071-guide-cat-placement-and-shared-chrome-docking.md)

Additional context:

- [ADR-070: Use a Surface-Safe Floating and Shared-Chrome-Docked Guide Cat Placement Model](../decisions/070-use-a-surface-safe-floating-and-shared-chrome-docked-guide-cat-placement-model.md)
- [PLAN-061: Guide Cat Placement and Shared-Chrome Docking Rollout](./PLAN-061-guide-cat-placement-and-shared-chrome-docking-rollout.md)

## Overview

Keep the Guide Cat floating/docked/shared-chrome placement behavior introduced
by `ADR-070` / `SPEC-071`, but move the persistence ownership for these four UI
fields out of server-managed `PlatformPreferences` and `PlatformHostEnvelope`:

- `guideCatSidecarSeen`
- `guideCatSidecarMode`
- `guideCatPlacement`
- `guideCatFloatingAnchor`

The end state should be a renderer-owned `GuideCatUiPrefsStore` with a
`localStorage` backend, one in-memory source of truth, and no steady-state
network writes for Guide Cat UI preference changes. The server should keep
owning real Guide Cat product/domain state such as the Guide Cat record itself
and dismissed/active lifecycle status.

This plan intentionally does not treat a server-side serialization queue as the
target architecture. A queue would reduce write races, but it would preserve
the wrong ownership boundary and unnecessary round-trips for renderer chrome.

This repo has not shipped a released install base for the old server-backed
Guide Cat UI preference format. The implementation should therefore assume a
clean/current environment rather than ship backward-compatibility code for
earlier prerelease variants. Compatibility planning starts from the current
renderer-owned store baseline forward.

## Implementation Phases

### Phase 0: Baseline Assumption Gate

- [x] Task 0.1: Freeze the assumption that the current renderer-owned Guide Cat
      UI preference store is the first supported baseline for shipped builds.
- [x] Task 0.2: Do not ship backward-compatibility code for earlier prerelease
      server-backed Guide Cat UI preference variants.
- [x] Task 0.3: Future compatibility planning begins from the current
      renderer-owned store schema and local persistence record only.

**Deliverables**: one explicit clean/current-environment baseline instead of
silent prerelease migration debt

### Phase 1: Freeze Ownership and Migration Contract

- [x] Task 1.1: Amend the active Guide Cat docs so the steady-state ownership
      model is renderer-owned UI preferences, not server-owned platform
      preferences.
- [x] Task 1.2: Freeze the exact migration set as:
      - `guideCatSidecarSeen`
      - `guideCatSidecarMode`
      - `guideCatPlacement`
      - `guideCatFloatingAnchor`
- [x] Task 1.3: Freeze the server-owned remainder so it stays out of the
      client store, especially:
      - `guideCat` record
      - dismissed/active status
      - assist content/cache data
      - owner/profile/product shell metadata
- [x] Task 1.4: Define the client-store schema version, storage key, default
      values, and one-time migration marker.
- [x] Task 1.5: Freeze the clean-start rule: do not ship a prerelease
      server-backed Guide Cat UI preference hydration seam.
- [ ] Task 1.6: Freeze the schema-evolution strategy for future store versions,
      including:
      - tolerant parsing of older payloads
      - unsupported/newer-version fallback behavior
      - malformed-record recovery behavior
      - when a future schema migration may overwrite or discard an older record

**Deliverables**: one explicit ownership model and one forward-only schema
contract for the four Guide Cat UI fields

### Phase 2: Introduce a Renderer-Owned Guide Cat UI Preference Store

- [x] Task 2.1: Create a dedicated Guide Cat UI preference store/hook instead
      of letting individual components read and write raw `localStorage`.
- [x] Task 2.2: Persist the four Guide Cat UI fields as one atomic record, not
      as per-field writes.
- [x] Task 2.3: Make the store resilient to missing storage, malformed JSON,
      and quota/storage exceptions while keeping the in-memory UI usable.
- [x] Task 2.4: Add same-browser synchronization through one internal publish/
      subscribe seam plus `storage`-event reconciliation for multi-window or
      cross-tab cases.
- [x] Task 2.5: Keep transient interaction state out of the durable store,
      including hover, drag-in-progress, preview, and temporary hidden-route
      overrides.
- [x] Task 2.6: Freeze the hidden-route rule so entering Settings or any other
      hidden override route may change transient projection state only and must
      not trigger durable Guide Cat UI preference writes.

**Deliverables**: one renderer-owned state seam that can replace all Guide Cat
UI preference fetches

### Phase 3: Stabilize the Current Renderer-Owned Baseline

- [x] Task 3.1: Prefer existing renderer-local Guide Cat UI prefs when a valid
      local record already exists.
- [x] Task 3.2: When no local record exists, initialize the renderer-owned
      Guide Cat UI prefs from deterministic defaults and persist them locally.
- [ ] Task 3.3: If local persistence fails because of quota, permissions, or
      interrupted startup, keep the session running from memory where possible
      and let the next startup retry from the same renderer-owned path.
- [x] Task 3.4: Keep the fallback when no usable local values exist:
      - `guideCatSidecarSeen = false`
      - `guideCatSidecarMode = 'auto'`
      - `guideCatPlacement = 'floating'`
      - `guideCatFloatingAnchor = null`
- [x] Task 3.5: Do not ship prerelease migration heuristics or server-backed
      import seams for older unshipped Guide Cat UI preference formats.

**Deliverables**: the current renderer-owned baseline boots from local state or
deterministic defaults without server-owned fallback code

### Phase 4: Rewire Guide Cat Consumers to the Client Store

- [x] Task 4.1: Make the platform app and Guide Cat placement/presentation
      layers read the four UI fields from the renderer store, not from the app
      shell envelope.
- [x] Task 4.2: Make Settings General read and update Guide Cat mode through
      the renderer store, not through `/api/platform/preferences`.
- [x] Task 4.3: Remove Guide Cat UI preference POSTs from:
      - sidecar-seen persistence
      - placement persistence
      - undock/dock persistence
      - mode switching in Settings
- [x] Task 4.4: Ensure durable commits happen only at completed interaction
      boundaries, not at hover/preview/pointerdown time.
- [x] Task 4.5: Ensure hidden-route overrides such as Settings-hidden remain
      transient and never trigger durable store writes for remembered Guide Cat
      placement or mode.
- [x] Task 4.6: Make multi-field placement commits land atomically as one
      logical local-store update so they cannot partially land or visually jump
      between stale and fresh values.
- [x] Task 4.7: Remove the legacy `persistGuideCatPlacementPreference` export
      and any remaining fetch-based Guide Cat UI preference helper once no
      callers remain.

**Deliverables**: no steady-state Guide Cat UI preference network traffic and
no split undock persistence path

### Phase 5: Remove the Server-Owned Preference Seam

- [x] Task 5.1: Remove the four Guide Cat UI fields from
      `PlatformPreferences`.
- [x] Task 5.2: Remove the four fields from `PlatformHostEnvelope` and product
      app-shell payload projections.
- [x] Task 5.3: Remove preference-route parsing, validation, and write support
      for those four fields from `/api/platform/preferences`.
- [x] Task 5.4: Remove reset/bootstrap code paths that still initialize or
      rewrite those four fields on the server.
- [x] Task 5.5: Do not ship any temporary legacy hydration seam for older
      prerelease Guide Cat UI preference formats.

**Deliverables**: server-managed preferences and app-shell contracts no longer
carry Guide Cat UI prefs in steady state

### Exit Criteria

- [x] Changing Guide Cat mode in Settings no longer sends a network request.
- [x] Dock, undock, and floating-anchor updates no longer send a network
      request.
- [x] Repeated undock attempts cannot partially land `placement` and
      `floatingAnchor` as separate writes.
- [x] Opening two renderer windows and changing Guide Cat UI prefs in one
      window reconciles cleanly in the other.
- [ ] If local persistence is unavailable during startup, the app retries on a
      future startup instead of permanently losing the current renderer-owned
      value.
- [x] The current version boots from renderer-owned local state or
      deterministic defaults without any server-owned Guide Cat UI preference
      seam.
- [x] `PlatformPreferences` and `PlatformHostEnvelope` no longer own the four
      Guide Cat UI fields in the end state.

**Deliverables**: Guide Cat UI preferences are fully renderer-owned without
regressing placement continuity or Settings behavior

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `docs/plans/PLAN-063-guide-cat-renderer-owned-ui-preferences-migration.md` | Create | Rollout plan for moving Guide Cat UI prefs to renderer ownership |
| `docs/specs/SPEC-071-guide-cat-placement-and-shared-chrome-docking.md` | Modify | Align persistence ownership with the renderer-owned end state |
| `docs/decisions/070-use-a-surface-safe-floating-and-shared-chrome-docked-guide-cat-placement-model.md` | Modify | Align placement decision with renderer-owned UI preference persistence |
| `docs/plans/README.md` | Modify | Add PLAN-063 to the plans index |
| `docs/README.md` | Modify | Add PLAN-063 to recent documentation additions |
| `src/app/renderer/guideCatUiPrefsStore.ts` | Create | Single renderer-owned Guide Cat UI preference store |
| `src/app/renderer/App.tsx` | Modify | Hydrate Guide Cat UI prefs from the renderer store |
| `src/app/renderer/useGuideCatSidecarState.ts` | Modify | Replace server-backed sidecar-seen writes with client-store writes |
| `src/app/renderer/GuideCatPlacementProvider.tsx` | Modify | Replace placement fetches with atomic local store updates and remove the legacy `persistGuideCatPlacementPreference` export |
| `src/app/renderer/settings/PlatformSettingsGeneral.tsx` | Modify | Replace Guide Cat mode POSTs with renderer-store updates |
| `src/shared/platform-contract.ts` | Modify | Remove Guide Cat UI preference fields from `PlatformHostEnvelope` |
| `src/shared/platformPreferences.ts` | Modify | Remove server ownership for the four Guide Cat UI fields |
| `src/app/server/platformSetupRouteSupport.ts` | Modify | Remove Guide Cat UI preference parsing from platform preference updates |
| `src/app/server/platformSetupPreferenceRoutes.ts` | Modify | Stop treating the four Guide Cat UI fields as writable platform preferences |
| `src/products/chat/api/routeSupport.ts` | Modify | Stop projecting Guide Cat UI prefs into the app shell payload |
| `src/products/chat/state/shell.ts` | Modify | Stop normalizing Guide Cat UI prefs from app-shell setup payloads |
| `tests/guide-cat-ui-prefs-store.test.ts` | Create | Validate parsing, defaults, schema handling, and atomic persistence |
| `tests/guide-cat-sidecar-state.test.tsx` | Modify | Cover renderer-store-backed sidecar state transitions |
| `tests/guide-cat-placement.test.tsx` | Modify | Cover atomic undock persistence and no-network placement updates |
| `tests/platform-settings-general.test.tsx` | Modify | Cover Settings mode changes through the renderer store |

## Technical Decisions

- Decision 1: use a dedicated renderer-owned Guide Cat UI preference store
  rather than letting each component touch `localStorage` directly.
- Decision 2: use `localStorage`, not `IndexedDB`, because the payload is tiny,
  synchronous bootstrap is desirable, and the repo already uses local storage
  for renderer chrome preferences.
- Decision 3: persist the four Guide Cat UI fields as one record so `undock`
  and other compound operations cannot land as split writes.
- Decision 4: keep `guideCat` entity lifecycle state server-owned; only UI
  chrome preferences move client-side.
- Decision 5: a server-side serialization queue is acceptable only as an
  emergency stopgap, not as the target architecture.
- Decision 6: because this feature has not shipped a released install base in
  its old server-backed form, prerelease backward-compatibility code should
  not ship.
- Decision 7: future compatibility work should evolve from the current
  renderer-owned store schema and storage key rather than from pre-release
  server-backed Guide Cat UI preference variants.

## Testing Strategy

- **Unit Tests**: Guide Cat UI store parse/default behavior, malformed-storage
  fallback, atomic write behavior, and cross-window reconciliation behavior
- **Integration Tests**: Settings `bubble/drawer/auto` changes without network
  writes, dock/undock continuity using the client store, repeated undock
  attempts without split persistence, and hidden Settings override without
  mutating stored placement/mode
- **Manual Testing**:
  - set Guide Cat to `Speech bubble` in Settings, navigate away and back, and
    verify the setting persists without being reset to `auto`
  - dock Guide Cat, undock it repeatedly, and verify the floating position
    remains stable with no failed half-undock behavior
  - open two renderer windows, change Guide Cat mode or placement in one, and
    verify the other reconciles through the shared store contract
  - quit and relaunch the app and verify the last renderer-owned Guide Cat UI
    prefs are restored
  - simulate a blocked local persistence path, relaunch, and verify the app
    retries from the current renderer-owned path instead of mutating server
    preferences
  - verify dismiss/restore still works through the server-owned Guide Cat
    status path
  - verify no Guide Cat UI preference changes appear in `/api/platform/preferences`
    traffic during normal Guide Cat interactions

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Future store schema changes drop current renderer-owned values | High | Evolve from the current versioned local record and keep schema parsing tolerant |
| Local persistence fails and the UI falls back to defaults too often | High | Keep the in-memory store usable and tighten retry/diagnostics in follow-up slices |
| Multiple renderer windows diverge on Guide Cat UI state | Medium | Use one store contract plus `storage`-event reconciliation |
| Components bypass the store and reintroduce raw `localStorage` coupling | Medium | Centralize read/write APIs in one store module and update tests to enforce behavior |
| Server and client ownership overlap for too long | Medium | Keep Guide Cat UI prefs out of `PlatformPreferences` and `PlatformHostEnvelope` |
| Settings-hidden route override accidentally becomes a persisted preference mutation | Medium | Keep hidden-route behavior transient and separate from durable store writes |

## Progress Log

| Date | Update |
|------|--------|
| 2026-04-18 | Plan created for moving Guide Cat UI preferences from server-owned platform preferences into a renderer-owned local store |
| 2026-04-18 | Landed the renderer-owned `GuideCatUiPrefsStore`, rewired App/Settings/placement consumers off steady-state Guide Cat UI-pref fetches, and removed the four Guide Cat UI preference fields from server-owned platform preferences and app-shell contracts |
| 2026-04-18 | Added automated regression coverage for multi-window/storage-event reconciliation in the renderer-owned Guide Cat UI preference store |
| 2026-04-18 | Landed atomic undock persistence and moved Guide Cat UI-pref hydration out of the render body |
| 2026-04-18 | Removed the prerelease backward-compatibility seam for older server-backed Guide Cat UI prefs and re-froze the plan around the current renderer-owned baseline only |

---

*Created: 2026-04-18*
*Author: Codex*
