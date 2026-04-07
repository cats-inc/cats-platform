# PLAN-040: Simplify Setup Wizard and Decouple Runtime Bootstrap

> Remove the setup-owned runtime-readiness step, require truthful runtime-backed
> provider/model selectors, and keep post-setup runtime recovery out of
> onboarding.

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Draft |
| **Owner** | User |
| **Reviewer** | Claude |

## Related Spec / Dependencies

- [SPEC-013: Provider Catalog Consumption and UI Seam](../specs/SPEC-013-provider-catalog-consumption-and-ui-seam.md)
- [SPEC-049: Guide Cat Setup and Generalized Participant Entry](../specs/SPEC-049-guide-cat-setup-and-generalized-participant-entry.md)
- [PLAN-038: Guide Cat Setup and Participant Generalization](./PLAN-038-guide-cat-setup-and-participant-generalization.md)
- [PLAN-034: Cross-Layer Bootstrap and Onboarding Diagnostics](./PLAN-034-cross-layer-bootstrap-and-onboarding-diagnostics.md)
- [PLAN-033: Integrate Packaged Setup with Runtime Bootstrap](./PLAN-033-integrate-packaged-setup-with-runtime-bootstrap.md) — historical only
- [SPEC-044: Integrate Packaged Setup with Runtime Bootstrap](../specs/SPEC-044-integrate-packaged-setup-with-runtime-bootstrap.md) — historical only

## Overview

The current setup wizard mixes three different concerns:

1. owner/product onboarding
2. optional Guide Cat creation
3. runtime bootstrap and provider remediation

That creates two UX problems:

- the wizard spends a whole step on runtime bootstrap even though
  `cats-runtime` already owns `/setup`
- setup and product selectors can still show provider/model fallback catalogs
  that are not truly usable right now

This plan keeps onboarding focused on owner identity, optional Guide Cat, and
first product choice. Runtime setup remains runtime-owned. The Guide Cat step
may still need a usable target, but it should express that inline and
truthfully: if no usable target exists, say so and link to `cats-runtime
/setup`; do not fake dropdown options from product-side fallback catalogs.

This plan also freezes a separate rule for packaged and normal product entry:
once `cats-platform` setup is complete, later runtime failure is a recovery
problem inside the product or host recovery surface, not a reason to send the
user back through onboarding.

### New Flow

**Step 1: Welcome**
- Input owner display name
- No runtime interaction

**Step 2: Guide Cat**
- Toggle: create Guide Cat (yes / no)
- **Not checked**: show only the skip path and Next button; no runtime contact
- **Checked**: fetch a truthful runtime-backed selector read model
  - **Loading**: show spinner/skeleton
  - **Usable targets available**: show provider/instance/model controls built
    only from currently usable runtime targets
  - **Runtime reachable but no usable targets**: show inline blocking card
    explaining that Guide Cat needs a usable AI provider first, with:
    - link to `cats-runtime /setup`
    - Refresh / Recheck button
    - Skip-for-now path still available
  - **Runtime unreachable**: show inline recovery card with Retry plus runtime
    diagnostics/setup shortcut; do not show fake provider/model options
- If the runtime only has a trustworthy default model hint for a usable target,
  the UI should show that default or `Provider default`; it should not invent a
  larger curated model list just to fill the dropdown

**Step 3: Product Selection + Finish**
- Choose default product surface (`Chat` / `Work` / `Code`)
- Finish persists owner/product preferences and optional Guide Cat metadata
- After setup completes, later runtime loss is handled as recovery inside the
  product or host recovery flow, not by routing back to onboarding

### What This Removes

- The dedicated wizard step for runtime readiness
- Platform-owned runtime scan/apply UX inside the setup wizard
- Setup-time selector behavior that falls back to product static catalogs for
  provider/model execution choices
- The `runtimeReady` hard gate in `finishSetup()`

### What This Preserves

- `cats-runtime /setup` as the runtime-owned setup/remediation experience
- `POST /api/platform/setup/complete` as the final platform setup write
- Bootstrap attempt tracking and onboarding event recording from PLAN-034
- Optional Guide Cat creation, including the ability to skip it entirely

### What This Changes

- Setup and in-product provider/model selectors must use the same truthful
  runtime-backed contract
- Product-supported provider catalogs remain valid for documentation,
  explanation, and future recommendation surfaces, but they are no longer valid
  execution pickers
- Desktop host onboarding completion is determined by `setupCompleteAt`, not by
  the current runtime health of every provider target

## Implementation Phases

### Phase 1: Freeze Direction and Update Contracts

- [ ] Task 1.1: Mark PLAN-033 and SPEC-044 as historical and record why they
      were rejected
- [ ] Task 1.2: Update SPEC-013 so setup and in-product selectors use truthful
      runtime-backed execution choices instead of catalog fallback
- [ ] Task 1.3: Update SPEC-049 and PLAN-038 so Guide Cat setup explicitly
      depends on truthful selector state when the user opts in
- [ ] Task 1.4: Document the runtime API semantics that distinguish configured
      topology, availability truth, and best-known model catalogs

**Deliverables**: one coherent docs baseline exists before code changes begin

### Phase 2: Remove the Runtime-Readiness Wizard Step

- [ ] Task 2.1: Remove the dedicated runtime-readiness step from
      `PlatformSetupWizard.tsx`
- [ ] Task 2.2: Update setup flow navigation from 4 steps to 3
- [ ] Task 2.3: Remove wizard-local runtime-scan/apply state and auto-scan
      logic
- [ ] Task 2.4: Remove the runtime-ready completion gate from
      `POST /api/platform/setup/complete`
- [ ] Task 2.5: Remove platform-side runtime setup proxy routes that only
      existed to support the deleted wizard step

**Deliverables**: setup no longer pretends to be a second runtime bootstrap UI

### Phase 3: Introduce a Truthful Selector Contract

- [ ] Task 3.1: Narrow `GET /api/providers` for selector consumers, or add a
      dedicated selector endpoint, so the response distinguishes:
      - usable targets available
      - runtime reachable but no usable targets
      - runtime unreachable
- [ ] Task 3.2: Remove static provider/model fallback from setup and in-product
      execution pickers
- [ ] Task 3.3: Ensure provider/model controls are only populated from usable
      runtime targets plus runtime-owned model/default metadata
- [ ] Task 3.4: Reuse the same selector read model and renderer seam for setup,
      cat creation, and other in-product provider/model pickers
- [ ] Task 3.5: Add refresh/recheck support when the user returns from
      `cats-runtime /setup`

**Deliverables**: setup and product selectors stop lying about what can be
executed right now

### Phase 4: Keep Post-Setup Runtime Recovery Out of Onboarding

- [ ] Task 4.1: Update desktop readiness and navigation logic so completed
      platform setup does not regress to onboarding when runtime health changes
- [ ] Task 4.2: Route runtime-down or no-provider states after setup into
      product-side or host recovery UX instead of `/setup`
- [ ] Task 4.3: Add targeted tests for post-setup runtime regression behavior

**Deliverables**: onboarding remains onboarding; runtime failure becomes
recovery

### Phase 5: Optional `Create Now` Follow-On

- [ ] Task 5.1: Define Guide Cat session ownership, persistence, cleanup, and
      reset semantics before landing any setup-time session creation
- [ ] Task 5.2: Only after that contract exists, decide whether to add a
      `Create Now` path inside the Guide Cat step

**Deliverables**: no under-specified setup-time session ownership

### Phase 6: Cleanup and Documentation

- [ ] Task 6.1: Remove orphaned runtime-setup client/types that were only used
      by the deleted wizard step
- [ ] Task 6.2: Update user-facing docs to describe truthful selector behavior
      and runtime recovery boundaries
- [ ] Task 6.3: Run full regression coverage for setup, selectors, and host
      recovery routing

**Deliverables**: codebase and docs tell the same story

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `src/app/renderer/setup/PlatformSetupWizard.tsx` | Modify | Remove runtime-readiness step and inline truthful Guide Cat selector states |
| `src/app/renderer/setup/flow.ts` | Modify | Update step count and navigation |
| `src/app/renderer/setup/api.ts` | Modify | Remove runtime-setup proxy calls and add truthful selector reads |
| `src/app/renderer/setup/plugins.tsx` | Modify | Reuse shared truthful selector UI state for Guide Cat |
| `src/app/server/platformSetupRoutes.ts` | Modify | Remove runtime-ready completion gate |
| `src/server/routes/providers.ts` | Modify | Stop returning static fallback catalogs for execution-selector routes |
| `desktop/host/readiness.ts` | Modify | Keep runtime regressions in recovery, not onboarding |
| `desktop/host/bootstrapNavigation.ts` | Modify | Align post-setup routing with recovery semantics |
| `docs/specs/SPEC-013-*.md` | Modify | Freeze truthful selector contract |
| `docs/specs/SPEC-049-*.md` | Modify | Freeze Guide Cat setup behavior around usable targets |
| `cats-runtime/docs/api.md` | Modify | Clarify configured-topology vs availability vs catalog semantics |

## Technical Decisions

- Decision 1: **Supersede the packaged runtime-gate direction**. Setup
  completion is no longer blocked on runtime bootstrap/apply. That older
  direction remains historical only.
- Decision 2: **Execution selectors must be truthful**. Setup and in-product
  provider/model pickers only show currently usable runtime targets plus
  runtime-owned model/default metadata for those targets.
- Decision 3: **Guide Cat owns conditional runtime preflight inline**. The
  wizard does not need a separate runtime step; the Guide Cat step only checks
  runtime when the user actually opts in.
- Decision 4: **Post-setup runtime failure is recovery, not onboarding**.
  Once `setupCompleteAt` exists, the user stays out of onboarding unless setup
  is explicitly reset.
- Decision 5: **Do not ship setup-time session creation without an ownership
  contract**. `Create Now` is follow-on work, not implicit in this cleanup.

## Testing Strategy

- **Unit Tests**:
  - Guide Cat toggle only fetches selector state when enabled
  - selector states distinguish `ready`, `no_usable_targets`, and
    `runtime_unreachable`
  - Next is blocked only when the user opted into Guide Cat but no usable
    target exists
- **Integration Tests**:
  - setup completion without Guide Cat skips runtime selector work
  - setup completion with Guide Cat stores only a usable runtime target
  - selector routes no longer fall back to static catalogs on runtime failure
  - completed setup plus later runtime failure stays in recovery, not onboarding
- **Manual Tests**:
  - runtime unavailable -> toggle Guide Cat -> inline recovery card, no fake
    dropdowns
  - runtime reachable with no usable targets -> inline link to
    `cats-runtime /setup`
  - runtime reachable with one usable target -> truthful provider/model choice
  - post-setup runtime regression -> product or host recovery, not `/setup`

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Some product surfaces still depend on catalog fallback | High | Audit selector consumers and move them onto the shared truthful selector contract before deleting fallback behavior |
| Setup becomes blocked for Guide Cat users when runtime has no usable target | Medium | Keep `Skip for now` available; show inline explanation and deep-link to runtime setup |
| Desktop host still routes completed users back to onboarding | High | Land readiness/navigation updates together with the setup contract change |
| `Create Now` scope expands unexpectedly | Medium | Keep it explicitly deferred until session ownership and cleanup are specified |

## Progress Log

| Date | Update |
|------|--------|
| 2026-04-07 | Plan created to simplify the wizard and decouple runtime bootstrap from setup completion |
| 2026-04-07 | Direction tightened: setup and in-product selectors must only show truthful usable targets, and post-setup runtime failure must stay in recovery instead of bouncing the user back into onboarding |

---

*Created: 2026-04-07*
*Author: Claude (from user design discussion, revised by Codex)*
