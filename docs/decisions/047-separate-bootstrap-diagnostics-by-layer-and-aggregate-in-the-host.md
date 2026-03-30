# ADR-047: Separate Bootstrap Diagnostics by Layer and Aggregate in the Host

> Keep bootstrap/onboarding diagnostics owned by their native layer, while the
> Cats Electron host aggregates cross-layer summaries and references for
> packaged recovery.

## Status

Accepted

## Date

2026-03-30

## Context

The packaged Cats desktop flow now spans three distinct layers:

- `cats-runtime`
  - owns provider readiness, setup scan/apply, and retained setup diagnostic
    reports
- `cats-platform`
  - owns the packaged product setup UX, owner/Boss Cat onboarding, and the
    `setupCompleteAt` gate
- Cats Electron host
  - owns local process supervision, packaged helper execution, resume, restart,
    and the persisted desktop-host bootstrap snapshot

Those layers already expose useful but uneven diagnostic truth:

- `cats-runtime` already retains setup reports and setup-state/readiness facts
- the Electron host already persists a bootstrap/remediation snapshot plus the
  last packaged setup helper action
- `cats-platform` now enforces runtime bootstrap before setup completion, but
  it still lacks a product-owned onboarding event history of its own

This leaves packaged recovery with an inspectability gap:

- operators want one place to understand what happened during startup and setup
- but duplicating all raw logs into the host would create drift, storage
  duplication, and unclear ownership
- collapsing everything into one layer would blur the existing
  host/product/runtime boundary

The project needs one explicit diagnostic ownership model for packaged
bootstrap and onboarding.

## Decision

Bootstrap/onboarding diagnostics will be split by native ownership layer and
aggregated by the Cats Electron host.

This decision includes:

1. `cats-runtime` remains the source of truth for runtime-owned setup and
   provider diagnostics:
   - setup state
   - scan/apply outcomes
   - retained setup reports
   - runtime/provider readiness summaries
2. `cats-platform` must gain a product-owned onboarding event history for the
   packaged setup flow:
   - staged owner/product input
   - runtime setup blocked/ready/apply-requested/apply-confirmed states
   - product setup completion or recovery events
3. The Cats Electron host remains the source of truth for host-owned desktop
   lifecycle diagnostics:
   - process start/stop/readiness failures
   - helper execution and interruption state
   - restart/relaunch/elevation follow-through
   - persisted bootstrap snapshot truth
4. The Cats Electron host shall also own a packaged recovery aggregation
   surface above those three sources.
5. Host aggregation must be by summary and reference, not by duplicating full
   raw logs from the runtime or product layer.
6. The aggregated host view may retain:
   - latest status per layer
   - recent cross-layer chronology entries
   - stable references to runtime reports and product/host event records
   - correlation metadata needed for packaged recovery
7. Advanced recovery surfaces may still drill into the native runtime or
   product diagnostics, but the packaged bootstrap page should not need to
   reconstruct cross-layer state on its own.
8. The first packaged aggregation slice does not require a new
   `cats-runtime` event/history route.
   - the host may derive runtime chronology from runtime state transitions and
     retained setup-report metadata
   - an explicit runtime event/history seam remains additive follow-through if
     later evidence shows the derived view is insufficient

## Consequences

### Positive

- keeps diagnostic ownership aligned with the layer that actually knows the
  truth
- gives packaged operators one host-facing recovery surface without forcing the
  host to become the canonical raw log store
- lets `cats-runtime` keep its retained setup-report direction intact
- creates an explicit place for missing product-owned onboarding history

### Negative

- the project must now define one more cross-layer contract for aggregation and
  references
- `cats-platform` needs a new persisted onboarding event surface, not only the
  current completion gate
- the host state file likely needs to evolve from a pure snapshot into a
  snapshot-plus-aggregation bundle

### Neutral

- this ADR does not require a general observability stack or streaming log
  pipeline
- this ADR does not move raw runtime setup reports into the product repo
- this ADR does not remove the standalone runtime diagnostics surfaces

## Alternatives Considered

### Alternative 1: Keep all packaged bootstrap diagnostics only in the host

- **Pros**: one obvious packaged inspection surface
- **Cons**: duplicates runtime truth, weakens boundaries, and forces the host to
  understand details that belong to the runtime or product setup flow
- **Why rejected**: the host should aggregate packaged recovery state, not
  replace native layer ownership

### Alternative 2: Keep diagnostics only in `cats-runtime`

- **Pros**: reuse the most advanced existing retained diagnostic slice
- **Cons**: cannot truthfully represent product onboarding or host-managed
  helper/restart/elevation flows
- **Why rejected**: packaged onboarding is not runtime-only work

### Alternative 3: Duplicate full raw logs from all layers into one file

- **Pros**: straightforward operator export story
- **Cons**: storage duplication, redaction drift, ambiguous source of truth, and
  high coupling between layers
- **Why rejected**: packaged recovery needs aggregation by reference, not a
  second canonical raw log store

## References

- [ADR-021](./021-keep-packaged-setup-and-provider-installation-in-the-host.md)
- [ADR-046](./046-drive-packaged-setup-through-runtime-bootstrap-apis.md)
- [SPEC-023](../specs/SPEC-023-packaged-setup-wizard-and-provider-installation.md)
- [SPEC-044](../specs/SPEC-044-integrate-packaged-setup-with-runtime-bootstrap.md)
- [SPEC-045](../specs/SPEC-045-cross-layer-bootstrap-and-onboarding-diagnostics.md)
- [PLAN-030](../plans/PLAN-030-packaged-setup-wizard-and-provider-installation.md)
- [PLAN-033](../plans/PLAN-033-integrate-packaged-setup-with-runtime-bootstrap.md)
- [PLAN-034](../plans/PLAN-034-cross-layer-bootstrap-and-onboarding-diagnostics.md)
- [cats-runtime ADR-014](../../../cats-runtime/docs/decisions/014-keep-lightweight-provider-setup-and-diagnostics-in-cats-runtime.md)
- [cats-runtime SPEC-015](../../../cats-runtime/docs/specs/SPEC-015-runtime-setup-diagnostic-report.md)

---

*Accepted: 2026-03-30*  
*Decision makers: user + Codex*
