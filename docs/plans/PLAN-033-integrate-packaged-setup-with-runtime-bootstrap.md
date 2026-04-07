# PLAN-033: Integrate Packaged Setup with Runtime Bootstrap

> Close the packaged setup gap by making `cats-platform` drive
> `cats-runtime` bootstrap/config apply before product setup is allowed to
> complete.

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Superseded by [PLAN-040](./PLAN-040-simplify-setup-wizard-and-decouple-runtime-bootstrap.md) |
| **Owner** | Codex |
| **Assigned To** | Codex |
| **Reviewer** | User / packaging + runtime workstreams |

## Related Spec / Dependencies

- [SPEC-044: Integrate Packaged Setup with Runtime Bootstrap](../specs/SPEC-044-integrate-packaged-setup-with-runtime-bootstrap.md)
- [SPEC-023: Packaged Setup Wizard and Provider Installation](../specs/SPEC-023-packaged-setup-wizard-and-provider-installation.md)
- [SPEC-012: First-Run Setup Wizard and Boss Cat Bootstrap](../specs/SPEC-012-first-run-setup-wizard-and-boss-cat-bootstrap.md)
- [ADR-021: Keep Packaged Setup and Provider Installation in the Host](../decisions/021-keep-packaged-setup-and-provider-installation-in-the-host.md)
- [ADR-046: Drive Packaged Setup through Runtime Bootstrap APIs](../decisions/046-drive-packaged-setup-through-runtime-bootstrap-apis.md)
- [cats-runtime ADR-014](../../../cats-runtime/docs/decisions/014-keep-lightweight-provider-setup-and-diagnostics-in-cats-runtime.md)

## Overview

The current packaged setup stack already has the host bootstrap page, the
product setup wizard, runtime readiness/diagnostics, and runtime bootstrap
apply. What it does not yet have is a single orchestrated chain that requires
runtime-owned config apply before `setupCompleteAt` is persisted.

This plan introduces that missing chain while keeping boundaries intact:

- Electron host remains the owner of packaged helper execution and resume
- `cats-platform` remains the only packaged setup UI
- `cats-runtime` remains the owner of bootstrap read/write and runtime config
  materialization

## Goals

1. Ensure packaged setup writes runtime-owned config before setup completion.
2. Make `setupCompleteAt` depend on runtime bootstrap/apply success.
3. Keep one packaged setup UI while preserving standalone runtime setup as a
   recovery/operator path.
4. Reuse runtime bootstrap read models and apply routes instead of duplicating
   provider config logic in `cats-platform`.
5. Align host readiness phases with the new setup-completion contract.

## Non-Goals

- Replacing the runtime's standalone `/setup` page
- Embedding raw runtime setup HTML into the packaged product UI
- Letting `cats-platform` generate `providers.yaml` directly
- Solving every future provider family in the same slice before the integration
  seam itself lands

## Implementation Phases

### Phase 1: Freeze the Cross-Layer Contract

- [x] Record the packaged setup completion contract:
      - owner/product onboarding is not sufficient on its own
      - runtime-owned config apply is required before completion
- [x] Define the exact packaged-to-runtime bootstrap API calls used by the
      setup flow:
      - `GET /setup-state`
      - `POST /setup-scan`
      - `POST /setup-apply`
- [x] Freeze the host/product/runtime responsibility matrix:
      - host installs/checks/resumes
      - product renders setup UX and chooses when to advance
      - runtime reads/writes runtime config and owns bootstrap exit
- [ ] Decide the first-slice coverage boundary for API-backed provider setup:
      - either block first slice to already-representable runtime apply paths
      - or extend runtime apply in the same slice
      - this is the current Phase 2 scope blocker and must be resolved before
        implementation begins

**Deliverables**: one explicit packaged setup contract exists before code
changes begin.

### Phase 2: Add Product-Side Runtime Bootstrap Client Paths

- [ ] Add `cats-platform` client/server helpers for runtime bootstrap state,
      scan, and apply
- [ ] Normalize runtime bootstrap responses into a product-owned read model
      suitable for setup UI state
- [ ] Reuse the same read model for setup, remediation, and post-install
      refresh rather than introducing parallel state shapes
- [ ] Add targeted tests for runtime bootstrap client behavior and failure
      handling

**Deliverables**: `cats-platform` can programmatically inspect and apply runtime
bootstrap instead of only reading generic provider diagnostics.

### Phase 3: Reshape the Setup Wizard Completion Gate

- [ ] Extend the packaged setup wizard to include an explicit runtime/provider
      readiness step
- [ ] Prevent `Finish setup` from writing `setupCompleteAt` until runtime apply
      succeeds
- [ ] Keep owner/Boss Cat inputs staged until runtime-ready completion, or
      persist them in an explicit pre-completion state that does not claim full
      setup completion
- [ ] Surface at least these states in UI:
      - provider not ready
      - install/check required
      - ready to apply
      - applying
      - applied and runtime ready
      - remediation required
- [ ] Keep an explicit advanced path to open runtime diagnostics or runtime
      setup for recovery

**Deliverables**: packaged setup no longer claims completion before runtime
bootstrap apply.

### Phase 4: Align Host Readiness and Entry Phases

- [ ] Update desktop readiness phase logic so `ready_for_setup`,
      `needs_prerequisites`, and `ready_for_chat` reflect the new completion
      contract truthfully
- [ ] Ensure bootstrap page actions align with the new product/runtime setup
      chain
- [ ] Refresh the host snapshot after helper install/check work and after
      runtime apply
- [ ] Add targeted readiness tests covering:
      - runtime bootstrap required + product setup incomplete
      - product setup inputs staged but runtime apply incomplete
      - runtime apply success leading to ready chat
      - runtime regression after partial setup

**Deliverables**: host bootstrap and packaged setup phases tell the same story.

### Phase 5: Extend Runtime Apply for Remaining Provider Paths

- [ ] Evaluate whether the current runtime bootstrap/apply contract needs
      extension for API/local/agent-backed provider paths supported by the
      packaged setup roadmap
- [ ] If needed, extend `cats-runtime` bootstrap/config materialization so the
      packaged flow still converges on runtime-owned apply for those paths
- [ ] Keep the product UI and host bridge insulated from config-file shape
      details as that runtime contract evolves

**Deliverables**: follow-on provider paths still converge on runtime-owned
config materialization instead of opening a second writer.

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `docs/decisions/046-drive-packaged-setup-through-runtime-bootstrap-apis.md` | Create | Lock the ownership model for packaged setup versus runtime bootstrap |
| `docs/specs/SPEC-044-integrate-packaged-setup-with-runtime-bootstrap.md` | Created | Define packaged setup completion requirements around runtime apply |
| `docs/plans/PLAN-033-integrate-packaged-setup-with-runtime-bootstrap.md` | Created | Implementation plan for the integration slice |
| `src/app/renderer/setup/*` | Later | Product setup UI/runtime-bootstrap integration |
| `src/app/server/*` | Later | Setup-completion gate and server-side orchestration changes |
| `electron/readiness.ts` | Later | Host phase updates aligned to runtime apply truth |
| `electron/main.ts` | Later | Host refresh/resume adjustments after helper and runtime apply |
| `src/runtime/client.ts` or bridging layers | Later | Runtime bootstrap API consumption helpers |
| `cats-runtime/src/http/routes/setup.ts` | Later | Possible bootstrap apply contract expansion |
| `cats-runtime/src/core/bootstrap/*` | Later | Runtime-owned config materialization extensions if needed |

## Technical Decisions

- Decision 1: `cats-platform /setup` stays the only packaged setup UI.
- Decision 2: runtime-owned bootstrap apply remains the only canonical writer
  for runtime config artifacts.
- Decision 3: Electron host keeps packaged install/check/resume ownership and
  is not replaced by runtime setup UI.
- Decision 4: setup completion becomes a cross-layer contract, not a product UI
  local flag.

## Testing Strategy

- **Contract tests**:
  - packaged setup completion cannot succeed while runtime bootstrap remains
    unapplied
  - runtime apply success transitions the product into the ready path
- **Host readiness tests**:
  - `ready_for_setup`
  - `needs_prerequisites`
  - `ready_for_chat`
- **Runtime integration tests**:
  - setup-state fetch
  - setup-scan refresh
  - setup-apply success/failure
- **Regression checks**:
  - packaged helper resume still works
  - standalone runtime `/setup` remains reachable
  - setup completion does not regress existing Boss Cat initialization

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Product and runtime still drift into separate setup stories | High | Lock one packaged UI and one runtime config writer in ADR-046 |
| First slice overreaches into every provider path at once | High | Land the integration seam first and phase broader provider-path support later |
| `setupCompleteAt` semantics remain ambiguous | High | Treat runtime apply as a hard completion gate in both spec and implementation |
| Host phases become harder to understand | Medium | Keep readiness logic tied to explicit runtime/bootstrap truth rather than UI-only state |

## Progress Log

| Date | Update |
|------|--------|
| 2026-03-30 | Plan created to close the packaged setup gap where `cats-platform` can complete onboarding before `cats-runtime` bootstrap/config apply is finished |
| 2026-03-30 | Phase 1 decision capture completed through ADR-046 and SPEC-044; first-slice API-baseline versus local/CLI scope remains the blocker before implementation starts |

---

*Created: 2026-03-30*  
*Author: Codex*  
*Related Spec: [SPEC-044](../specs/SPEC-044-integrate-packaged-setup-with-runtime-bootstrap.md)*
