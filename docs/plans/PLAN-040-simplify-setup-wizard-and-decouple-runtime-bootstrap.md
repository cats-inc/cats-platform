# PLAN-040: Simplify Setup Wizard and Decouple Runtime Bootstrap

> Remove the runtime readiness step from the platform setup wizard, make Guide
> Cat provider selection lazy-loaded on demand, and let `cats-runtime` own its
> own setup experience entirely.

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Draft |
| **Owner** | User |
| **Reviewer** | Claude |

## Related Spec / Dependencies

- [PLAN-012: First-Run Setup Wizard and Boss Cat Bootstrap](./PLAN-012-first-run-setup-wizard-and-boss-cat-bootstrap.md)
- [PLAN-033: Integrate Packaged Setup with Runtime Bootstrap](./PLAN-033-integrate-packaged-setup-with-runtime-bootstrap.md) — **superseded by this plan** (see Decision 1)
- [PLAN-038: Guide Cat Setup and Participant Generalization](./PLAN-038-guide-cat-setup-and-participant-generalization.md)
- [PLAN-034: Cross-Layer Bootstrap and Onboarding Diagnostics](./PLAN-034-cross-layer-bootstrap-and-onboarding-diagnostics.md)

## Overview

The current setup wizard is 4 steps:

1. Welcome (owner name)
2. Guide Cat (provider/model selection)
3. Runtime Readiness (scan/apply providers)
4. Product Selection

Step 3 duplicates work that `cats-runtime` already owns through its standalone
`/setup` page. The platform proxies runtime scan/apply APIs, maintains its own
runtime setup UI, and manages auto-scan state — all of which must be maintained
separately from the runtime's own setup experience.

Additionally, runtime availability is not a concern exclusive to setup. The
runtime can be killed at any time after setup completes, so products must
handle runtime unavailability regardless. Making the wizard responsible for
runtime readiness creates false confidence and redundant code.

This plan simplifies the wizard to 3 steps and makes the Guide Cat provider
fetch lazy — triggered only when the user opts in to creating a Guide Cat.

### New Flow

**Step 1: Welcome**
- Input owner display name
- No runtime interaction

**Step 2: Guide Cat**
- Toggle: create Guide Cat (yes / no)
- **Not checked** — only show Next button, no runtime contact
- **Checked** — fetch `GET /api/providers` to populate provider/model dropdowns:
  - Loading — show spinner
  - Providers available — show dropdowns + two buttons:
    - **Next** — record preference only, create Guide Cat later
    - **Create Now** — create Guide Cat session immediately, show
      side panel with the Guide Cat greeting the user
  - Runtime reachable but no providers — show message + link to
    `cats-runtime /setup` + refresh button; Next disabled
  - Runtime unreachable — show error message + refresh button; Next disabled

**Step 3: Product Selection + Finish**
- Choose default product surface (Chat / Work / Code)
- If Guide Cat was created in Step 2, it may assist with product choice
- Complete button finalizes setup

### What This Removes

- The entire Step 3 (Runtime Readiness) UI and navigation
- Platform-side runtime setup proxy endpoints (`GET/POST /api/platform/runtime-setup/*`)
- `fetchRuntimeSetup`, `scanRuntimeSetup`, `applyRuntimeSetup` client API calls
- `shouldAutoScanRuntimeSetup` logic and related state
- `runtimeSetup` state management in the wizard component
- The `runtimeReady` hard gate in `finishSetup()`

### What This Preserves

- `GET /api/providers` and `GET /api/providers/{provider}/models` — already exist, used by the new lazy fetch
- `PlatformHostEnvelope.runtime.reachable` — used to distinguish "no providers" from "runtime down"
- `POST /api/platform/setup/complete` — final write logic, minus the runtime readiness hard block
- Bootstrap attempt tracking and onboarding event recording (PLAN-034)
- `cats-runtime /setup` as the standalone runtime setup experience

## Implementation Phases

### Phase 1: Freeze Direction and Update Affected Plans

- [ ] Task 1.1: Mark PLAN-033 as superseded by this plan
- [ ] Task 1.2: Update PLAN-012 status to reflect that the runtime check step
      will be removed
- [ ] Task 1.3: Note in PLAN-038 that Guide Cat setup will gain a "Create Now"
      path alongside the existing preference-only path

**Deliverables**: plan relationships are explicit and no conflicting plans
remain active

### Phase 2: Remove Runtime Readiness Step from Wizard

- [ ] Task 2.1: Remove Step 3 (Runtime Readiness) UI section from
      `PlatformSetupWizard.tsx`
- [ ] Task 2.2: Update step navigation in `flow.ts` — total steps from 4 to 3
- [ ] Task 2.3: Remove `runtimeSetup` state, auto-scan logic, and related
      refs from the wizard component
- [ ] Task 2.4: Remove `runtimeReady` hard gate from `finishSetup()`
- [ ] Task 2.5: Remove platform-side runtime setup proxy routes from
      `platformSetupRoutes.ts` (`runtime-setup`, `runtime-setup/scan`,
      `runtime-setup/apply`)
- [ ] Task 2.6: Remove `fetchRuntimeSetup`, `scanRuntimeSetup`,
      `applyRuntimeSetup` from `setup/api.ts`
- [ ] Task 2.7: Remove `shouldAutoScanRuntimeSetup` from `runtimeSetupFlow.ts`
      (or the file itself if nothing else uses it)
- [ ] Task 2.8: Update tests to reflect the 3-step flow

**Deliverables**: wizard is 3 steps, no runtime setup proxy logic in platform

### Phase 3: Make Guide Cat Provider Fetch Lazy

- [ ] Task 3.1: Refactor `GuideCatSetupFields` so provider/model fetch is
      triggered by the Guide Cat toggle, not on step entry
- [ ] Task 3.2: Add loading state (spinner) while providers are being fetched
- [ ] Task 3.3: Add "no providers" state with link to `cats-runtime /setup`
      (target: new tab/window) and a refresh button
- [ ] Task 3.4: Add "runtime unreachable" error state with refresh button
- [ ] Task 3.5: Add window focus event listener to auto-refresh provider list
      when user returns from runtime setup
- [ ] Task 3.6: Disable Next when Guide Cat is toggled on but no providers
      are available

**Deliverables**: provider fetch is demand-driven and guides user to runtime
setup when needed

### Phase 4: Add "Create Now" Guide Cat Session

- [ ] Task 4.1: Add "Create Now" button alongside Next when Guide Cat is
      toggled on and provider/model are selected
- [ ] Task 4.2: Implement Guide Cat session creation on "Create Now" click
      via runtime session API
- [ ] Task 4.3: Show Guide Cat side panel with greeting after session creation
- [ ] Task 4.4: Handle session creation failure gracefully — fall back to
      preference-only mode with a non-blocking error message
- [ ] Task 4.5: If Guide Cat is active, let it participate in Step 3 product
      selection (optional enhancement)
- [ ] Task 4.6: Persist Guide Cat session reference alongside the existing
      `GuideCatRecord` so it can be resumed after setup

**Deliverables**: users can meet their Guide Cat during setup, not just after

### Phase 5: Cleanup and Documentation

- [ ] Task 5.1: Remove any orphaned runtime setup types/contracts that are no
      longer referenced
- [ ] Task 5.2: Update `docs/setup-guide.md` to reflect the new 3-step flow
- [ ] Task 5.3: Update `docs/architecture.md` if it references the runtime
      readiness step
- [ ] Task 5.4: Run full test suite and fix any breakage

**Deliverables**: clean codebase with aligned documentation

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `src/app/renderer/setup/PlatformSetupWizard.tsx` | Modify | Remove Step 3, remove runtimeSetup state, remove runtimeReady gate |
| `src/app/renderer/setup/flow.ts` | Modify | TOTAL_SETUP_STEPS from 4 to 3, update step navigation |
| `src/app/renderer/setup/api.ts` | Modify | Remove runtime setup proxy calls, keep provider/model fetch |
| `src/app/renderer/setup/plugins.tsx` | Modify | Lazy provider fetch on Guide Cat toggle, add Create Now button |
| `src/app/server/platformSetupRoutes.ts` | Modify | Remove runtime setup proxy endpoints, relax runtimeReady gate in completion |
| `src/shared/runtimeSetupFlow.ts` | Delete or gut | shouldAutoScanRuntimeSetup no longer needed |
| `src/shared/runtimeSetup.ts` | Review | May still be needed by non-wizard consumers; remove wizard-specific parts |
| `docs/plans/PLAN-033-*.md` | Modify | Mark as superseded |
| `docs/setup-guide.md` | Modify | Reflect 3-step flow |
| `tests/*` | Modify | Update setup wizard tests for new flow |

## Technical Decisions

- Decision 1: **Supersede PLAN-033** — that plan wanted to tighten the
  integration between platform setup and runtime bootstrap. This plan goes the
  opposite direction: decouple them entirely. The runtime owns its own setup;
  the platform just consumes the result. Rationale: runtime can die at any
  time, so products must handle unavailability regardless, making a setup-time
  runtime gate redundant.
- Decision 2: **Provider fetch is lazy, not eager** — only triggered when the
  user toggles Guide Cat on. Users who skip Guide Cat never touch the runtime
  during setup. Rationale: keeps Step 2 instant for the skip path, and avoids
  premature coupling in case Step 1 later becomes OAuth or another auth flow.
- Decision 3: **"Create Now" is optional, not required** — users can record
  the preference and meet Guide Cat later. Rationale: respects user pace and
  avoids blocking setup on session creation.
- Decision 4: **Runtime unavailability during setup is not the wizard's
  problem** — the wizard only cares about provider availability when the user
  asks for Guide Cat. Product-level runtime detection and recovery is a
  separate concern that must exist regardless. Rationale: the runtime can be
  killed at any time after setup, so a one-time wizard check gives false
  confidence.

## Testing Strategy

- **Unit Tests**:
  - Step navigation produces correct sequence (1 → 2 → 3, back works)
  - Guide Cat toggle triggers provider fetch only when checked
  - Next is disabled when Guide Cat is on but no providers available
  - finishSetup succeeds without runtime readiness gate
- **Integration Tests**:
  - Setup completion without Guide Cat skips all runtime interaction
  - Setup completion with Guide Cat preference records provider/model
  - "Create Now" creates session and returns usable session reference
  - "Create Now" failure falls back to preference-only gracefully
- **Manual Testing**:
  - Fresh install with no runtime → toggle Guide Cat → see link to runtime setup
  - Fresh install with runtime → toggle Guide Cat → see providers → Create Now → Guide Cat greets
  - Fresh install → skip Guide Cat → reach product selection without ever touching runtime

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Users who skip Guide Cat enter a product with no working runtime | Medium | Product surfaces must handle runtime unavailability with their own detection and recovery — this is required regardless of setup wizard behavior |
| "Create Now" session creation adds complexity to the wizard | Low | Failure falls back to preference-only mode; session creation is a single API call |
| Removing the runtime gate from finishSetup allows "incomplete" setups | Low | The wizard never guaranteed persistent runtime availability; removing the false gate is more honest |
| PLAN-033/034 consumers expect runtime setup proxy routes to exist | Medium | Audit all consumers before removing proxy routes; keep runtime client direct-fetch paths available |

## Progress Log

| Date | Update |
|------|--------|
| 2026-04-07 | Plan created based on design discussion: simplify wizard from 4 to 3 steps, decouple runtime bootstrap, make Guide Cat provider fetch lazy, add optional "Create Now" session creation |

---

*Created: 2026-04-07*
*Author: Claude (from user design discussion)*
