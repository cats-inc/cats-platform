# PLAN-034: Cross-Layer Bootstrap and Onboarding Diagnostics

> Add product-owned onboarding history and a host-owned aggregation bundle so
> packaged recovery can summarize runtime, product, and host bootstrap truth
> without duplicating raw logs.

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Draft |
| **Owner** | Codex |
| **Assigned To** | Codex |
| **Reviewer** | User / desktop host + runtime workstreams |

## Related Spec / Dependencies

- [SPEC-045: Cross-Layer Bootstrap and Onboarding Diagnostics](../specs/SPEC-045-cross-layer-bootstrap-and-onboarding-diagnostics.md)
- [SPEC-023: Packaged Setup Wizard and Provider Installation](../specs/SPEC-023-packaged-setup-wizard-and-provider-installation.md)
- [SPEC-044: Integrate Packaged Setup with Runtime Bootstrap](../specs/SPEC-044-integrate-packaged-setup-with-runtime-bootstrap.md)
- [ADR-021: Keep Packaged Setup and Provider Installation in the Host](../decisions/021-keep-packaged-setup-and-provider-installation-in-the-host.md)
- [ADR-046: Drive Packaged Setup through Runtime Bootstrap APIs](../decisions/046-drive-packaged-setup-through-runtime-bootstrap-apis.md)
- [ADR-047: Separate Bootstrap Diagnostics by Layer and Aggregate in the Host](../decisions/047-separate-bootstrap-diagnostics-by-layer-and-aggregate-in-the-host.md)
- [cats-runtime ADR-014](../../../cats-runtime/docs/decisions/014-keep-lightweight-provider-setup-and-diagnostics-in-cats-runtime.md)
- [cats-runtime SPEC-015](../../../cats-runtime/docs/specs/SPEC-015-runtime-setup-diagnostic-report.md)

## Overview

The project already has two partial diagnostics layers:

- `cats-runtime` retained setup reports and runtime setup/readiness summaries
- host-owned desktop bootstrap snapshots plus last helper action state

The missing middle is `cats-platform` product-owned onboarding history, and the
missing top layer is one explicit host aggregation bundle that summarizes all
three layers by reference.

This plan adds that missing product layer and the host aggregation seam without
turning the host into a second raw log store.

## Goals

1. Preserve layer-native source of truth for runtime, product, and host setup
   diagnostics.
2. Add bounded product-owned onboarding events to `cats-platform`.
3. Extend the host persistence model from pure snapshot state to
   snapshot-plus-aggregation.
4. Let the packaged recovery UI consume one truthful aggregated bundle by
   default.
5. Keep raw runtime artifacts referenced, not copied.

## Non-Goals

- replacing runtime setup reports or compatibility evidence
- introducing general app-wide telemetry or remote log shipping
- redesigning packaged setup UX in the same slice
- making the host the canonical writer for runtime or product diagnostic data

## Implementation Phases

### Phase 1: Freeze the Three-Layer Contract

- [x] Record the ownership model in ADR-047:
      - runtime owns runtime setup diagnostics
      - product owns onboarding history
      - host owns process/helper/bootstrap diagnostics and aggregation
- [x] Define the requirements in SPEC-045
- [ ] Decide the first-slice correlation strategy:
      - explicit shared attempt id
      - or host-ordered references only
- [ ] Decide whether product onboarding history should live in shared app/core
      state or a dedicated suite-host persistence surface

**Deliverables**: one approved contract exists before implementation starts.

### Phase 2: Add Product-Owned Onboarding Event Persistence

- [ ] Define a bounded product onboarding event schema
- [ ] Persist onboarding events for the setup flow:
      - setup opened or resumed
      - runtime blocked
      - runtime scan/apply requested
      - runtime apply succeeded or failed
      - product completion committed
- [ ] Add a product-owned read model that exposes recent onboarding history for
      host aggregation
- [ ] Add targeted tests for event persistence and recovery reads

**Deliverables**: `cats-platform` has its own onboarding history instead of
only `setupCompleteAt`.

### Phase 3: Extend Host State into an Aggregation Bundle

- [ ] Define host aggregation contracts for:
      - layer summaries
      - recent chronology
      - native references
      - partial/unavailable layer status
- [ ] Extend host persistence beyond the current pure snapshot plus
      `lastAction`
- [ ] Keep the current snapshot path stable or add a bounded sibling artifact
      without breaking existing smoke tooling
- [ ] Add targeted tests for host aggregation persistence and reload

**Deliverables**: the host can persist a restart-safe cross-layer bootstrap
bundle.

### Phase 4: Consume Aggregation in Recovery Surfaces

- [ ] Update the bootstrap/recovery read path to consume the host aggregation
      bundle
- [ ] Keep explicit drill-down actions to runtime diagnostics/setup where
      deeper investigation is needed
- [ ] Ensure partial-layer failures still show a coherent host-facing summary
- [ ] Add integration tests for packaged startup and recovery rendering

**Deliverables**: packaged recovery can explain cross-layer state without
manually stitching multiple diagnostics surfaces together.

### Phase 5: Follow-Through and Retention Hardening

- [ ] Reconcile retention and cleanup rules across:
      - runtime retained setup reports
      - product onboarding history
      - host aggregated chronology
- [ ] Decide whether explicit export/share actions are needed for support
      bundles
- [ ] Document the final packaged recovery artifact model in `api.md`,
      `setup-guide.md`, and `deployment.md`

**Deliverables**: the cross-layer diagnostics model stays bounded,
documented, and operable after the first slice lands.

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `docs/decisions/047-separate-bootstrap-diagnostics-by-layer-and-aggregate-in-the-host.md` | Created | Freeze the three-layer diagnostics ownership model |
| `docs/specs/SPEC-045-cross-layer-bootstrap-and-onboarding-diagnostics.md` | Created | Define requirements for product-owned onboarding history and host aggregation |
| `docs/plans/PLAN-034-cross-layer-bootstrap-and-onboarding-diagnostics.md` | Created | Implementation plan for the diagnostics split |
| `electron/contracts.ts` | Later | Add host aggregation contract types |
| `electron/hostState.ts` | Later | Persist aggregated bundle beside or within host state |
| `electron/main.ts` | Later | Publish/update host aggregation during startup and recovery |
| `electron/bootstrapPage.ts` | Later | Read aggregated recovery summary |
| `src/app/server/suiteSetupRoutes.ts` | Later | Emit product-owned onboarding events during setup flow |
| `src/shared/*` suite setup contracts | Later | Add product-owned onboarding diagnostics read model |
| `tests/desktop-host-state.test.js` | Later | Lock host aggregation persistence/reload behavior |
| `tests/runtime-setup-flow.test.js` | Later | Lock product onboarding event recording around runtime setup |

## Technical Decisions

- Decision 1: keep native bootstrap/onboarding truth in the layer that owns the
  work rather than copying raw logs upward.
- Decision 2: make the host the packaged aggregation surface because it already
  owns persisted bootstrap state and the default recovery UI.
- Decision 3: treat product onboarding history as a first-class missing layer,
  not as an incidental detail hidden behind `setupCompleteAt`.

## Testing Strategy

- **Unit Tests**:
  - product onboarding event append/retention behavior
  - host aggregation normalization and partial-layer fallback handling
- **Integration Tests**:
  - packaged setup records product events around runtime scan/apply
  - host snapshot/aggregation reload survives restart
  - bootstrap page can render partial and complete aggregation bundles
- **Manual Testing**:
  - fail runtime bootstrap and confirm aggregated recovery surfaces runtime,
    product, and host context together
  - interrupt a packaged helper and confirm host chronology plus resume
    references remain truthful after relaunch

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Host aggregation duplicates too much native data | High | Keep aggregation summary-and-reference only, per ADR-047 |
| Product onboarding events get mixed into runtime or host ownership | High | Freeze explicit three-layer boundaries in SPEC-045 before coding |
| Existing host smoke tests break if `state.json` shape changes abruptly | Medium | Preserve current snapshot contract or add a bounded sibling structure with compatibility tests |
| Correlation across layers stays ambiguous | Medium | Resolve attempt-id strategy early in Phase 1 or keep host-ordered references explicit |

## Progress Log

| Date | Update |
|------|--------|
| 2026-03-30 | Plan created to add product-owned onboarding history and a host-owned cross-layer aggregation bundle above existing runtime reports and host snapshots |

---

*Created: 2026-03-30*  
*Author: Codex*  
*Related Spec: [SPEC-045](../specs/SPEC-045-cross-layer-bootstrap-and-onboarding-diagnostics.md)*
