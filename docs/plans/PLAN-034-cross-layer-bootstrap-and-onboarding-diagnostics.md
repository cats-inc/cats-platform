# PLAN-034: Cross-Layer Bootstrap and Onboarding Diagnostics

> Add product-owned onboarding history and a host-owned aggregation bundle so
> packaged recovery can summarize runtime, product, and host bootstrap truth
> without duplicating raw logs.

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Draft (Implementation Ready) |
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

## First-Slice Decisions

The first slice is now implementation-ready with these decisions frozen:

1. **Correlation strategy**
   - the host generates one `bootstrapAttemptId` per packaged bootstrap or
     recovery run
   - the host persists the active attempt id in host state
   - host-owned events always carry that attempt id
   - the host exposes the active attempt id through the packaged app-shell
     read model used by the setup renderer
   - the setup renderer sends that attempt id back in JSON request bodies for
     platform setup and runtime setup mutations in the first slice
   - product-owned onboarding events receive that attempt id from those
     request bodies
   - runtime native artifacts are correlated by host observation time plus
     native references; the first slice does not require runtime to natively
     emit the same attempt id
2. **Product-owned storage location**
   - product onboarding history lives in a dedicated `cats-platform` sidecar
     file beside `chat-state.json`, following the same persistence pattern as
     `platform-preferences.json`
   - proposed first-slice filename:
     `platform-onboarding-history.json`
   - this keeps onboarding diagnostics out of Electron host state and out of
     the chat/core snapshot schema
3. **Minimum event and bundle shape**
   - use the `BootstrapEvent`, `BootstrapEventError`,
     `BootstrapEventReference`, and `BootstrapAggregationBundle` granularity
     frozen in SPEC-045
   - the first slice must preserve `summary`, `context`, and structured
     `error.message`; otherwise the bundle is not diagnostically useful
4. **Retention**
   - retain a bounded recent window instead of an unbounded history
   - first-slice target:
     - product onboarding history: last 100 events
     - host-owned event history: last 100 events
     - aggregated chronology: last 150 merged entries
   - trim product and host event histories at write time
   - rebuild and trim aggregated chronology each time the host updates the
     persisted bundle, then normalize once more on load if needed
   - when merged chronology is truncated, preserve up to the most recent
     20 entries per available layer before filling remaining slots by global
     recency

## Implementation Phases

### Phase 1: Freeze the Three-Layer Contract

- [x] Record the ownership model in ADR-047:
      - runtime owns runtime setup diagnostics
      - product owns onboarding history
      - host owns process/helper/bootstrap diagnostics and aggregation
- [x] Define the requirements in SPEC-045
- [x] Decide the first-slice correlation strategy:
      - use a host-generated `bootstrapAttemptId`
      - propagate it into host events and product event writes
      - correlate runtime truth by host observation time plus native
        references in the first slice
- [x] Decide where product onboarding history lives:
      - use a dedicated `cats-platform` sidecar file beside `chat-state.json`
      - proposed filename: `platform-onboarding-history.json`
- [x] Freeze the first-slice minimum event set and bundle shape:
      - minimal product events
      - minimal host events
      - runtime-reference strategy without a new runtime event route
      - minimum diagnostic payload with `summary`, `context`, and
        `error.message`

**Deliverables**: one approved contract exists before implementation starts,
including the minimum event schema, correlation strategy, storage location, and
runtime-reference strategy for the first slice.

### Phase 2: Add Product-Owned Onboarding Event Persistence

- [ ] Add shared diagnostics contracts for product-owned onboarding events
      under `src/shared/`
- [ ] Implement a dedicated product-owned persistence helper for
      `platform-onboarding-history.json`
- [ ] Extend the packaged app-shell read model to expose the active
      `bootstrapAttemptId` to the setup renderer
- [ ] Keep the first slice to the minimum product event set:
      - `setup_opened`
      - `runtime_apply_requested`
      - `runtime_apply_confirmed`
      - `setup_completed`
- [ ] Allow the first slice to carry closely related defensive product events
      when they materially improve diagnosis without changing ownership:
      - `runtime_setup_blocked`
      - `runtime_apply_failed`
- [ ] Defer broader product event kinds from SPEC-045 requirement 13 until the
      minimum slice proves stable
- [ ] Instrument the packaged setup flow to append product-owned events with:
      - `timestamp`
      - `layer`
      - `kind`
      - `summary`
      - `status`
      - `context`
      - `error`
      - `attemptId`
      - `reference`
- [ ] Add `attemptId` to first-slice platform setup/runtime setup mutation inputs
      and send it through JSON request bodies from the setup renderer APIs
- [ ] Wire the first-slice product events at these points:
      - renderer/setup load enters the packaged setup flow -> `setup_opened`
      - runtime apply request is submitted -> `runtime_apply_requested`
      - runtime apply succeeds -> `runtime_apply_confirmed`
      - platform setup commit lands -> `setup_completed`
- [ ] Expose a host-consumable product diagnostics read model
      - preferred route shape: one dedicated platform diagnostics endpoint instead
        of piggybacking raw event history onto `/api/app-shell`
      - include:
        - recent bounded event list
        - latest summary/status
        - active or latest `bootstrapAttemptId`
        - native record references if present
- [ ] Add targeted tests for event persistence and recovery reads

**Deliverables**: `cats-platform` has its own onboarding history instead of
only `setupCompleteAt`.

### Phase 3: Extend Host State into an Aggregation Bundle

- [ ] Add host-side contracts for:
      - host-owned bootstrap events
      - layer summaries
      - recent chronology
      - native references
      - partial/unavailable layer status
      - active `bootstrapAttemptId`
- [ ] Keep the first slice to the minimum host event set:
      - `host_phase_changed`
      - `service_exited_before_ready`
      - `helper_run_completed`
      - `resume_action_changed`
- [ ] Derive runtime chronology in the first slice from:
      - host-observed runtime state transitions
      - retained setup-report timestamps or latest-report summaries
      - existing runtime setup/readiness reads
- [ ] Explicitly defer a runtime-owned event/history endpoint unless the
      host-derived chronology proves insufficient after the first slice
- [ ] Append host-owned events when:
      - the host creates or rotates a bootstrap attempt
      - readiness phase/status changes
      - a supervised service exits before readiness
      - a packaged helper completes, fails, or becomes resumable
      - resume action state changes
- [ ] Extend host persistence beyond the current pure snapshot plus
      `lastAction`
- [ ] Persist the active attempt id, bounded host-owned events, and one bounded
      aggregation bundle in the existing host-state artifact without breaking
      snapshot compatibility for current consumers
- [ ] Keep the current snapshot path stable or add a bounded sibling artifact
      without breaking existing smoke tooling
- [ ] Build aggregation by:
      - reading the latest product diagnostics read model
      - reading current runtime setup/readiness summaries and retained report
        references
      - merging them with host-owned events into one bounded chronology sorted
        by timestamp
      - preserving representation from each available layer before filling the
        remaining merged slots by global recency
      - preserving native references instead of copying raw runtime/product
        blobs
- [ ] Add targeted tests for host aggregation persistence and reload

**Deliverables**: the host can persist a restart-safe cross-layer bootstrap
bundle.

### Phase 4: Consume Aggregation in Recovery Surfaces

- [ ] Update the bootstrap/recovery read path to consume the host aggregation
      bundle
- [ ] Render layer-local summaries before chronology so operators can tell
      whether the failure is runtime, product, or host-owned at a glance
- [ ] Render chronology entries with their `summary`, `context`, and
      `error.message` so one screenshot or copied bundle is diagnostically
      useful
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
| `src/shared/bootstrapDiagnostics.ts` | Later | Shared first-slice event and bundle contracts for product/host diagnostics |
| `src/shared/platformOnboardingHistory.ts` | Later | Resolve the sidecar path beside `chat-state.json` and persist bounded product-owned onboarding events |
| `electron/contracts.ts` | Later | Add host event and aggregation contract types |
| `electron/hostState.ts` | Later | Persist active attempt id, bounded host events, and aggregation bundle beside the existing snapshot |
| `electron/main.ts` | Later | Publish/update host aggregation during startup and recovery |
| `electron/bootstrapPage.ts` | Later | Read aggregated recovery summary |
| `src/shared/platform-contract.ts` | Later | Extend packaged app-shell and setup contracts with first-slice diagnostics fields such as `bootstrapAttemptId` |
| `src/shared/runtimeSetup.ts` | Later | Extend runtime setup mutation inputs with first-slice diagnostics fields such as `attemptId` |
| `src/app/server/platformSetupRoutes.ts` | Later | Emit product-owned onboarding events during setup flow and expose a host-consumable diagnostics read model |
| `src/app/renderer/setup/api.ts` | Later | Send host-generated attempt id with setup/runtime bootstrap requests in first-slice JSON bodies |
| `src/app/renderer/setup/PlatformSetupWizard.tsx` | Later | Trigger first-slice product event writes at setup-open/apply/complete milestones |
| `tests/desktop-host-state.test.js` | Later | Lock host aggregation persistence/reload behavior |
| `tests/runtime-setup-flow.test.js` | Later | Lock product onboarding event recording around runtime setup |
| `tests/platform-setup-wizard.test.js` | Later | Lock setup-open and setup-complete event behavior from the packaged wizard |

## Technical Decisions

- Decision 1: keep native bootstrap/onboarding truth in the layer that owns the
  work rather than copying raw logs upward.
- Decision 2: make the host the packaged aggregation surface because it already
  owns persisted bootstrap state and the default recovery UI.
- Decision 3: treat product onboarding history as a first-class missing layer,
  not as an incidental detail hidden behind `setupCompleteAt`.
- Decision 4: the first slice does not require a new `cats-runtime` event API;
  runtime chronology may be derived from existing runtime state transitions and
  retained setup-report references.
- Decision 5: the first slice should ship a minimal event set first, then grow
  toward the broader requirement list in SPEC-045.
- Decision 6: use a host-generated `bootstrapAttemptId` as the first-slice
  correlation key across host-owned and product-owned events.
- Decision 7: store product onboarding history in a dedicated
  `cats-platform` sidecar file beside `chat-state.json` rather than mixing it
  into Electron host state or the chat/core snapshot payload.
- Decision 8: a first-slice event is not considered diagnostically sufficient
  unless it carries `summary`, bounded `context`, and `error.message` when the
  event represents a failure or degraded condition.
- Decision 9: surface the active `bootstrapAttemptId` through the packaged
  app-shell read model and pass it back through first-slice JSON mutation
  bodies instead of inventing a dedicated IPC or custom-header path.
- Decision 10: trim product and host histories at write time, and keep merged
  chronology fair by preserving recent representation from each available layer
  before filling remaining slots by global recency.

## Testing Strategy

- **Unit Tests**:
  - product onboarding event append/retention behavior
  - sidecar path resolution beside `chat-state.json`
  - host aggregation normalization and partial-layer fallback handling
  - chronology merge ordering and bounded retention trimming
- **Integration Tests**:
  - packaged setup records product events around runtime scan/apply/complete
  - host snapshot/aggregation reload survives restart
  - bootstrap page can render partial and complete aggregation bundles
  - one failed runtime bootstrap produces a bundle whose chronology includes
    readable `summary`, relevant `context`, and a human-readable `error`
- **Manual Testing**:
  - fail runtime bootstrap and confirm aggregated recovery surfaces runtime,
    product, and host context together
  - interrupt a packaged helper and confirm host chronology plus resume
    references remain truthful after relaunch
  - copy one aggregated bundle out of a packaged failure and confirm another
    maintainer can identify the failing layer and likely cause without opening
    additional raw files

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Host aggregation duplicates too much native data | High | Keep aggregation summary-and-reference only, per ADR-047 |
| Product onboarding events get mixed into runtime or host ownership | High | Freeze explicit three-layer boundaries in SPEC-045 before coding |
| Existing host smoke tests break if `state.json` shape changes abruptly | Medium | Preserve current snapshot contract or add a bounded sibling structure with compatibility tests |
| Correlation across layers stays ambiguous | Medium | Resolve attempt-id strategy early in Phase 1 or keep host-ordered references explicit |
| Host-derived runtime chronology proves too lossy | Medium | Keep the first slice minimal, retain report references, and add a runtime event/history route only if later evidence shows it is needed |
| Product event payloads become too weak to diagnose real failures | Medium | Enforce `summary`, bounded `context`, and structured `error.message` as first-slice contract requirements |
| One noisy layer crowds the others out of merged chronology | Medium | Raise merged chronology capacity and preserve a per-layer minimum before filling remaining slots by recency |

## Progress Log

| Date | Update |
|------|--------|
| 2026-03-30 | Plan created to add product-owned onboarding history and a host-owned cross-layer aggregation bundle above existing runtime reports and host snapshots |
| 2026-03-31 | First-slice implementation plan tightened: host-generated `bootstrapAttemptId`, product sidecar storage beside `chat-state.json`, bounded retention targets, and diagnostic event payload requirements were frozen so implementation can begin without open blockers |
| 2026-03-31 | Minor follow-up clarifications landed: attempt-id transport now uses app-shell plus JSON mutation bodies, event `status` is treated as required, write-time trim is the first-slice retention rule, and merged chronology fairness now preserves recent representation from each layer |
| 2026-03-31 | First-slice scope note updated: the minimum product event set remains the core four milestones, but defensive failure/blocked events such as `runtime_setup_blocked` and `runtime_apply_failed` are explicitly allowed when they improve packaged diagnosis without expanding ownership |

---

*Created: 2026-03-30*  
*Author: Codex*  
*Related Spec: [SPEC-045](../specs/SPEC-045-cross-layer-bootstrap-and-onboarding-diagnostics.md)*
