# PLAN-040: Simplify Setup Wizard and Decouple Runtime Bootstrap

> Remove the setup-owned runtime-readiness step, require truthful runtime-backed
> provider/model selectors, finish setup directly into `/lobby`, and keep post-setup runtime recovery out of
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
- [SPEC-046: Platform Product Landing and Installed Apps](../specs/SPEC-046-platform-product-landing-and-installed-apps.md)
- [PLAN-038: Guide Cat Setup and Participant Generalization](./PLAN-038-guide-cat-setup-and-participant-generalization.md)
- [PLAN-035: Platform Product Landing and Installed Apps](./PLAN-035-platform-product-landing-and-installed-apps.md)
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

This plan keeps onboarding focused on owner identity and optional Guide Cat.
Runtime setup remains runtime-owned. The Guide Cat step
may still need a usable target, but it should express that inline and
truthfully: if no usable target exists, say so and link to `cats-runtime
/setup`; do not fake dropdown options from product-side fallback catalogs.

The wizard should end immediately after the Guide Cat step and route the user
into the host-owned `/lobby` landing. Product choice becomes a post-setup host
action, not a setup step.

This plan also freezes a separate rule for packaged and normal product entry:
once `cats-platform` setup is complete, later runtime failure is a recovery
problem inside the product or host recovery surface, not a reason to send the
user back through onboarding.

The current truthful-selector slice also has a performance problem: `cats-platform`
can still make setup and in-product provider pickers feel broken if it rebuilds
selector truth through repeated provider-registry fan-out, repeated remount
fetches, or redundant truth checks ahead of every model-catalog read. This plan
therefore also freezes the rule that truthful selectors must stay operationally
fast without reviving static fallback catalogs.

### New Flow

**Step 1: Welcome**
- Input owner display name
- No runtime interaction

**Step 2: Guide Cat + Finish**
- Toggle: create Guide Cat (yes / no)
- **Not checked**: show only the skip path and Finish button; no runtime contact
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

**Finish**
- Completing Step 2 persists owner preferences and optional Guide Cat metadata
- Setup completion redirects to `/lobby`
- The first product launch happens from `/lobby`, and later runtime loss is
  handled as recovery inside the product or host recovery flow, not by routing
  back to onboarding

### What This Removes

- The dedicated wizard step for runtime readiness
- The dedicated wizard step for product selection
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
- Setup completion now lands on `/lobby` instead of selecting a product inside
  the wizard
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
- [ ] Task 2.2: Update setup flow navigation from 4 steps to 2
- [ ] Task 2.3: Remove wizard-local runtime-scan/apply state and auto-scan
      logic
- [ ] Task 2.4: Remove the runtime-ready completion gate from
      `POST /api/platform/setup/complete`
- [ ] Task 2.5: Remove platform-side runtime setup proxy routes that only
      existed to support the deleted wizard step
- [ ] Task 2.6: Remove the setup-time product-selection step and redirect
      successful completion to `/lobby`

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
- [ ] Task 3.6: After Task 3.9 lands, replace per-provider availability
      fan-out in the hot selector path with one runtime topology read plus one
      bulk runtime availability read
- [ ] Task 3.7: Add a short-lived server-side truthful selector cache with
      in-flight dedupe and bounded stale-while-revalidate behavior so repeated
      selector mounts do not refetch the same registry every time
- [ ] Task 3.8: Make `GET /api/providers/{provider}/models` and
      `GET /api/providers/{provider}/models/advanced` reuse established
      truthful selector state or the shared selector cache instead of
      rebuilding the full provider registry before every catalog read
- [ ] Task 3.9: Coordinate with `cats-runtime` on an additive
      `GET /diagnostics/providers?scope=availability` selector path that
      reuses `collectProviderDiagnostics(..., { includeArtifacts: false })`
      and keeps cheap top-level `probe` plus aggregated `summary` while
      returning only `provider`, `backend`, `instance`, `defaultTarget`, and
      `availability` at the per-target level, omitting `config`, `checks`,
      `setup`, `compatibility`, `metering`, `compatibilityEvidence`,
      `providerEvolution`, and `reprobe`
- [ ] Task 3.10: Tune selector-specific timeout budgets for the new bulk read
      path, and keep the product cache TTL intentionally short so it
      complements the runtime's existing compatibility cache instead of
      pretending a broader diagnostics cache already exists

**Deliverables**: setup and product selectors stop lying about what can be
executed right now, and they do so without minute-scale hot-path latency

### Phase 4: Finish Setup Into `/lobby` and Keep Recovery Out of Onboarding

- [ ] Task 4.1: Update setup completion handling so the first post-setup route
      is `/lobby`
- [ ] Task 4.2: Remove the requirement that setup completion persist a selected
      product surface
- [ ] Task 4.3: Update root-entry rules so `/` resolves to the last-used
      product when known and `/lobby` otherwise
- [ ] Task 4.4: Update desktop readiness and navigation logic so completed
      platform setup does not regress to onboarding when runtime health changes
- [ ] Task 4.5: Route runtime-down or no-provider states after setup into
      product-side or host recovery UX instead of `/setup`
- [ ] Task 4.6: Add targeted tests for post-setup runtime regression behavior

**Deliverables**: setup lands on `/lobby`; onboarding remains onboarding; runtime failure becomes
recovery

### Phase 5: Cleanup and Documentation

- [ ] Task 5.1: Remove orphaned runtime-setup client/types that were only used
      by the deleted wizard step
- [ ] Task 5.2: Update user-facing docs to describe truthful selector behavior
      and runtime recovery boundaries
- [ ] Task 5.3: Update landing/setup docs to describe `/lobby` as the first
      post-setup destination
- [ ] Task 5.4: Run full regression coverage for setup, selectors, and host
      recovery routing

**Deliverables**: codebase and docs tell the same story

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `src/app/renderer/setup/PlatformSetupWizard.tsx` | Modify | Remove runtime-readiness step and inline truthful Guide Cat selector states |
| `src/app/renderer/setup/flow.ts` | Modify | Update step count and navigation |
| `src/app/renderer/setup/api.ts` | Modify | Remove runtime-setup proxy calls and add truthful selector reads |
| `src/app/renderer/setup/plugins.tsx` | Modify | Reuse shared truthful selector UI state for Guide Cat |
| `src/app/server/platformSetupRoutes.ts` | Modify | Remove runtime-ready completion gate and selected-product requirement |
| `src/app/renderer/App.tsx` | Modify | Route setup completion to `/lobby` and make `/` fall back to `/lobby` when no last-used surface exists |
| `src/server/routes/providers.ts` | Modify | Stop returning static fallback catalogs for execution-selector routes and replace slow provider fan-out with bounded truthful reads plus caching |
| `src/runtime/client.ts` | Modify | Prefer the runtime's bulk availability truth seam for selector reads instead of per-provider hot-path probing, including `RuntimeProviderDiagnosticsQuery.scope?: 'full' | 'availability'` |
| `../cats-runtime/src/http/routes/diagnostics.ts` | External follow-up | Add additive `scope=availability` support on `GET /diagnostics/providers` by reusing the existing `includeArtifacts: false` collection seam |
| `../cats-runtime/docs/api.md` | External follow-up | Document the selector-oriented `scope=availability` diagnostics contract once the runtime workstream lands it |
| `desktop/host/readiness.ts` | Modify | Keep runtime regressions in recovery, not onboarding |
| `desktop/host/bootstrapNavigation.ts` | Modify | Align post-setup routing with recovery semantics |
| `docs/specs/SPEC-046-*.md` | Modify | Freeze `/lobby` as the first post-setup destination |
| `docs/specs/SPEC-013-*.md` | Modify | Freeze truthful selector contract |
| `docs/specs/SPEC-049-*.md` | Modify | Freeze Guide Cat setup behavior around usable targets |

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
- Decision 4: **Setup completes into `/lobby`**. The wizard does not ask the
  user to choose a product; the first product launch happens from the host
  landing after setup completes.
- Decision 5: **Post-setup runtime failure is recovery, not onboarding**.
  Once `setupCompleteAt` exists, the user stays out of onboarding unless setup
  is explicitly reset.
- Decision 6: **Do not add `Create Now` in this slice**. Guide Cat setup stays
  preference-only; setup-time session creation is intentionally out of scope.
- Decision 7: **Truthful selector performance is part of the contract**.
  Runtime-backed selectors may use short-lived runtime-truth caches and bulk
  availability reads, but they must not regress to static fallback catalogs or
  minute-scale sequential probe fan-out.
- Decision 8: **Selector hot paths should consume a lighter runtime scope when
  available**. Product selectors do not need retained artifact summaries or
  full operator diagnostics payloads just to classify targets as selectable.
- Decision 9: **Platform cache and timeout tuning must complement runtime
  caching**. Product-side selector caches should stay short-lived and aimed at
  repeated UI mounts, while the runtime's existing compatibility cache and any
  future selector-oriented runtime cache remain runtime-owned.

## Testing Strategy

- **Unit Tests**:
  - Guide Cat toggle only fetches selector state when enabled
  - selector states distinguish `ready`, `no_usable_targets`, and
    `runtime_unreachable`
  - Finish is blocked only when the user opted into Guide Cat but no usable
    target exists
  - setup completion routes to `/lobby`
  - selector cache-hit reads do not refetch runtime truth on every mount
  - model and advanced-model routes do not rebuild the full truthful registry
    for every request
  - selector client/runtime timeout tuning uses the bulk-read contract rather
    than inheriting an N-target probe budget by accident
- **Integration Tests**:
  - setup completion without Guide Cat skips runtime selector work
  - setup completion with Guide Cat stores only a usable runtime target
  - selector routes no longer fall back to static catalogs on runtime failure
  - setup completion does not require a selected product surface
  - completed setup plus later runtime failure stays in recovery, not onboarding
  - repeated setup/product selector opens reuse one truthful selector snapshot
    instead of stampeding the runtime
  - bulk truthful selector reads use the availability-only runtime scope
    instead of paying for operator-grade diagnostics assembly
- **Manual Tests**:
  - runtime unavailable -> toggle Guide Cat -> inline recovery card, no fake
    dropdowns
  - runtime reachable with no usable targets -> inline link to
      `cats-runtime /setup`
  - runtime reachable with one usable target -> truthful provider/model choice
  - cold selector open returns after one topology read plus one bulk
    availability read rather than N sequential provider checks
  - bulk selector read stays acceptably fast even when runtime has retained
    compatibility/evolution artifacts on disk
  - warm selector reopen feels instant enough for setup step 2 and composer use
  - finish setup -> land on `/lobby`
  - post-setup runtime regression -> product or host recovery, not `/setup`

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Some product surfaces still depend on catalog fallback | High | Audit selector consumers and move them onto the shared truthful selector contract before deleting fallback behavior |
| Setup becomes blocked for Guide Cat users when runtime has no usable target | Medium | Keep `Skip for now` available; show inline explanation and deep-link to runtime setup |
| Removing setup-time product choice leaves the first entry ambiguous | Low | Make `/lobby` the deterministic first post-setup route and let the first launched product establish `lastProductSurface` |
| Desktop host still routes completed users back to onboarding | High | Land readiness/navigation updates together with the setup contract change |
| Setup keeps growing side features again | Medium | Keep Guide Cat setup preference-only and keep `Create Now` out of scope |
| Truthful selectors remain technically correct but too slow to use | High | Replace hot-path fan-out with bulk runtime truth, add short TTL cache plus in-flight dedupe, and reuse selector truth for model routes |
| Bulk selector reads still inherit too much runtime diagnostics cost | High | Make Task 3.9 a hard prerequisite for Task 3.6 so selector traffic does not force retained-artifact I/O and operator-grade payload assembly |

## Progress Log

| Date | Update |
|------|--------|
| 2026-04-07 | Plan created to simplify the wizard and decouple runtime bootstrap from setup completion |
| 2026-04-07 | Direction tightened: setup and in-product selectors must only show truthful usable targets, and post-setup runtime failure must stay in recovery instead of bouncing the user back into onboarding |
| 2026-04-07 | Direction tightened again: remove setup Step 3 entirely, finish setup directly into `/lobby`, and drop any `Create Now` setup-time session path |
| 2026-04-08 | Performance follow-through added: truthful selectors must stop rebuilding provider truth through minute-scale per-provider fan-out, and may instead use bulk runtime truth plus short-lived runtime-backed caching |
| 2026-04-08 | Runtime follow-through added: platform docs now explicitly depend on a lighter runtime availability-only selector scope plus complementary timeout/cache tuning instead of assuming product-side caching alone fixes cold-start latency |

---

*Created: 2026-04-07*
*Author: Claude (from user design discussion, revised by Codex)*
