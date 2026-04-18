# PLAN-063: Guide Cat Renderer-Owned UI Preferences Migration

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Draft |
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

This repo ships as a packaged desktop client/server bundle, so renderer and
embedded server are expected to ship in lockstep. Even so, this plan still
keeps a bounded read-only legacy hydration window before finally removing the
old server-owned Guide Cat UI preference fields.

## Implementation Phases

### Phase 0: Release Safety and Compatibility Gate

- [ ] Task 0.1: Decide whether the renderer-owned migration lands in the next
      packaged lockstep release or whether the rollout spans multiple releases.
- [ ] Task 0.2: If the rollout spans multiple releases, land a temporary
      server-side serialization queue for the legacy Guide Cat UI preference
      writes before the migration begins so the current `bubble -> auto` race
      stops harming users during the transition window.
- [ ] Task 0.3: If the rollout lands in one packaged lockstep release, record
      that no stopgap queue will ship and that the remaining race is accepted
      only until that release lands.
- [ ] Task 0.4: Freeze the compatibility assumption as:
      - packaged desktop renderer + embedded server ship lockstep
      - mixed-version support is not the primary operating mode
      - legacy Guide Cat UI preference hydration still remains read-only for a
        bounded deprecation window

**Deliverables**: an explicit release-safety decision rather than silent
acceptance of the current race window

### Phase 1: Freeze Ownership and Migration Contract

- [ ] Task 1.1: Amend the active Guide Cat docs so the steady-state ownership
      model is renderer-owned UI preferences, not server-owned platform
      preferences.
- [ ] Task 1.2: Freeze the exact migration set as:
      - `guideCatSidecarSeen`
      - `guideCatSidecarMode`
      - `guideCatPlacement`
      - `guideCatFloatingAnchor`
- [ ] Task 1.3: Freeze the server-owned remainder so it stays out of the
      client store, especially:
      - `guideCat` record
      - dismissed/active status
      - assist content/cache data
      - owner/profile/product shell metadata
- [ ] Task 1.4: Define the client-store schema version, storage key, default
      values, and one-time migration marker.
- [ ] Task 1.5: Define the legacy hydration rule for importing old file-backed
      values without leaving a permanent envelope dependency behind.
- [ ] Task 1.6: Freeze the schema-evolution strategy for future store versions,
      including:
      - tolerant parsing of older payloads
      - unsupported/newer-version fallback behavior
      - malformed-record recovery behavior
      - when a future schema migration may overwrite or discard an older record

**Deliverables**: one explicit ownership model and one bounded migration
contract for the four Guide Cat UI fields

### Phase 2: Introduce a Renderer-Owned Guide Cat UI Preference Store

- [ ] Task 2.1: Create a dedicated Guide Cat UI preference store/hook instead
      of letting individual components read and write raw `localStorage`.
- [ ] Task 2.2: Persist the four Guide Cat UI fields as one atomic record, not
      as per-field writes.
- [ ] Task 2.3: Make the store resilient to missing storage, malformed JSON,
      and quota/storage exceptions while keeping the in-memory UI usable.
- [ ] Task 2.4: Add same-browser synchronization through one internal publish/
      subscribe seam plus `storage`-event reconciliation for multi-window or
      cross-tab cases.
- [ ] Task 2.5: Keep transient interaction state out of the durable store,
      including hover, drag-in-progress, preview, and temporary hidden-route
      overrides.
- [ ] Task 2.6: Freeze the hidden-route rule so entering Settings or any other
      hidden override route may change transient projection state only and must
      not trigger durable Guide Cat UI preference writes.

**Deliverables**: one renderer-owned state seam that can replace all Guide Cat
UI preference fetches

### Phase 3: Migrate Existing Preference Data Once

- [ ] Task 3.1: Prefer existing renderer-local Guide Cat UI prefs when a valid
      local record already exists.
- [ ] Task 3.2: When no local record exists, import the legacy server-backed
      Guide Cat UI values into memory, persist them locally, and only stamp the
      migration as completed after the local write and read-back succeed.
- [ ] Task 3.3: If local persistence fails because of quota, permissions, or
      interrupted startup, leave the migration incomplete, keep the session
      running from memory where possible, and retry migration on the next app
      startup.
- [ ] Task 3.4: Ensure the migration path is read-only from the server side and
      cannot continue to act as a steady-state source of truth.
- [ ] Task 3.5: Keep legacy hydration available for at least one packaged
      release window after the renderer store first ships; Phase 5 removal may
      not start before that deprecation window closes.
- [ ] Task 3.6: Repair likely race-polluted legacy `guideCatSidecarSeen=false`
      values during migration; at minimum, coerce `seen=true` when other legacy
      Guide Cat UI prefs already prove post-onboarding interaction, such as:
      - `guideCatSidecarMode !== 'auto'`
      - `guideCatPlacement !== 'floating'`
      - `guideCatFloatingAnchor != null`
- [ ] Task 3.7: Define the fallback when no usable legacy values exist:
      - `guideCatSidecarSeen = false`
      - `guideCatSidecarMode = 'auto'`
      - `guideCatPlacement = 'floating'`
      - `guideCatFloatingAnchor = null`
- [ ] Task 3.8: Ensure migration preserves previously selected `bubble` /
      `drawer` mode and remembered floating placement when legacy values are
      present.

**Deliverables**: existing users keep their stored Guide Cat UI preferences
without leaving steady-state ownership on the server

### Phase 4: Rewire Guide Cat Consumers to the Client Store

- [ ] Task 4.1: Make the platform app and Guide Cat placement/presentation
      layers read the four UI fields from the renderer store, not from the app
      shell envelope.
- [ ] Task 4.2: Make Settings General read and update Guide Cat mode through
      the renderer store, not through `/api/platform/preferences`.
- [ ] Task 4.3: Remove Guide Cat UI preference POSTs from:
      - sidecar-seen persistence
      - placement persistence
      - undock/dock persistence
      - mode switching in Settings
- [ ] Task 4.4: Ensure durable commits happen only at completed interaction
      boundaries, not at hover/preview/pointerdown time.
- [ ] Task 4.5: Ensure hidden-route overrides such as Settings-hidden remain
      transient and never trigger durable store writes for remembered Guide Cat
      placement or mode.
- [ ] Task 4.6: Make multi-field placement commits land atomically as one
      logical local-store update so they cannot partially land or visually jump
      between stale and fresh values.
- [ ] Task 4.7: Remove the legacy `persistGuideCatPlacementPreference` export
      and any remaining fetch-based Guide Cat UI preference helper once no
      callers remain.

**Deliverables**: no steady-state Guide Cat UI preference network traffic and
no split undock persistence path

### Phase 5: Remove the Server-Owned Preference Seam

- [ ] Task 5.1: Do not remove the legacy server-owned fields until the packaged
      deprecation window from Phase 3 has closed and the retryable migration
      path has already shipped.
- [ ] Task 5.2: Remove the four Guide Cat UI fields from
      `PlatformPreferences`.
- [ ] Task 5.3: Remove the four fields from `PlatformHostEnvelope` and product
      app-shell payload projections.
- [ ] Task 5.4: Remove preference-route parsing, validation, and write support
      for those four fields from `/api/platform/preferences`.
- [ ] Task 5.5: Remove reset/bootstrap code paths that still initialize or
      rewrite those four fields on the server.
- [ ] Task 5.6: Remove any temporary legacy hydration seam once the renderer
      migration path is proven and no longer needed for steady-state boot.

**Deliverables**: server-managed preferences and app-shell contracts no longer
carry Guide Cat UI prefs in steady state

### Exit Criteria

- [ ] Changing Guide Cat mode in Settings no longer sends a network request.
- [ ] Dock, undock, and floating-anchor updates no longer send a network
      request.
- [ ] Repeated undock attempts cannot partially land `placement` and
      `floatingAnchor` as separate writes.
- [ ] Opening two renderer windows and changing Guide Cat UI prefs in one
      window reconciles cleanly in the other.
- [ ] If local persistence is unavailable during migration, the app retries on
      a future startup instead of permanently losing the old value.
- [ ] Existing users with stored Guide Cat mode/placement keep those values
      after migration.
- [ ] `PlatformPreferences` and `PlatformHostEnvelope` no longer own the four
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
| `src/app/renderer/App.tsx` | Modify | Hydrate Guide Cat UI prefs from the renderer store instead of the envelope |
| `src/app/renderer/useGuideCatSidecarState.ts` | Modify | Replace server-backed sidecar-seen writes with client-store writes |
| `src/app/renderer/GuideCatPlacementProvider.tsx` | Modify | Replace placement fetches with atomic local store updates and remove the legacy `persistGuideCatPlacementPreference` export |
| `src/app/renderer/settings/PlatformSettingsGeneral.tsx` | Modify | Replace Guide Cat mode POSTs with renderer-store updates |
| `src/shared/platform-contract.ts` | Modify | Remove Guide Cat UI preference fields from `PlatformHostEnvelope` |
| `src/shared/platformPreferences.ts` | Modify | Remove server persistence for the four Guide Cat UI fields |
| `src/app/server/platformSetupRouteSupport.ts` | Modify | Remove Guide Cat UI preference parsing from platform preference updates |
| `src/app/server/platformSetupPreferenceRoutes.ts` | Modify | Stop treating the four Guide Cat UI fields as writable platform preferences |
| `src/products/chat/api/routeSupport.ts` | Modify | Stop projecting Guide Cat UI prefs into the app shell payload |
| `src/products/chat/state/shell.ts` | Modify | Stop normalizing Guide Cat UI prefs from app-shell setup payloads |
| `tests/guide-cat-ui-prefs-store.test.ts` | Create | Validate parsing, defaults, migration, and atomic persistence |
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
- Decision 6: any migration seam that still reads legacy server-backed values
  must be explicitly read-only and temporary.
- Decision 7: because this ships as a packaged desktop bundle, renderer and
  embedded server are expected to ship lockstep, but one packaged release of
  read-only legacy hydration still remains the minimum deprecation window.
- Decision 8: migration completion must be gated by successful local write +
  read-back, not by a best-effort write attempt alone.

## Testing Strategy

- **Unit Tests**: Guide Cat UI store parse/default behavior, migration marker
  behavior, malformed-storage fallback, atomic write behavior, and cross-window
  reconciliation behavior
- **Integration Tests**: Settings `bubble/drawer/auto` changes without network
  writes, dock/undock continuity using the client store, repeated undock
  attempts without split persistence, migration from legacy values, and hidden
  Settings override without mutating stored placement/mode
- **Manual Testing**:
  - set Guide Cat to `Speech bubble` in Settings, navigate away and back, and
    verify the setting persists without being reset to `auto`
  - dock Guide Cat, undock it repeatedly, and verify the floating position
    remains stable with no failed half-undock behavior
  - open two renderer windows, change Guide Cat mode or placement in one, and
    verify the other reconciles through the shared store contract
  - quit and relaunch the app and verify the last renderer-owned Guide Cat UI
    prefs are restored
  - simulate a failed migration or blocked local persistence path, relaunch,
    and verify the app retries migration instead of permanently dropping the
    old value
  - verify dismiss/restore still works through the server-owned Guide Cat
    status path
  - verify no Guide Cat UI preference changes appear in `/api/platform/preferences`
    traffic during normal Guide Cat interactions

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Migration drops an existing user’s stored `bubble` or floating placement | High | Import legacy values exactly once before deleting the old server-owned seam |
| Migration fails locally and the server-owned fields disappear too early | High | Keep a retryable migration path plus one packaged release of read-only legacy hydration before Phase 5 removal |
| `sidecarSeen=false` was already polluted by the legacy race and replays the welcome-peek incorrectly | Medium | Repair suspicious legacy `seen` values during migration when other stored UI prefs prove prior interaction |
| Multiple renderer windows diverge on Guide Cat UI state | Medium | Use one store contract plus `storage`-event reconciliation |
| Components bypass the store and reintroduce raw `localStorage` coupling | Medium | Centralize read/write APIs in one store module and update tests to enforce behavior |
| Server and client ownership overlap for too long | Medium | Make the legacy hydration path read-only and explicitly remove it after migration |
| Settings-hidden route override accidentally becomes a persisted preference mutation | Medium | Keep hidden-route behavior transient and separate from durable store writes |

## Progress Log

| Date | Update |
|------|--------|
| 2026-04-18 | Plan created for moving Guide Cat UI preferences from server-owned platform preferences into a renderer-owned local store |

---

*Created: 2026-04-18*
*Author: Codex*
