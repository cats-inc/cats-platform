# SPEC-045: Cross-Layer Bootstrap and Onboarding Diagnostics

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Approved |
| **Owner** | Codex |
| **Reviewer** | User / desktop host + runtime workstreams |

## Summary

Packaged Cats setup and recovery now span three layers: `cats-runtime`,
`cats-platform`, and the Cats Electron host. The project already has
runtime-owned retained setup reports and host-owned bootstrap snapshots, but it
still lacks a product-owned onboarding history and a truthful cross-layer
aggregation contract.

This spec defines that contract. Each layer must record its own bootstrap or
onboarding truth, and the Cats Electron host must aggregate bounded summaries
and references so packaged recovery can explain what happened without
duplicating every raw log.

## Goals

- keep each bootstrap/onboarding signal owned by the layer that generates it
- give packaged operators one host-facing recovery summary across runtime,
  product, and host state
- add product-owned onboarding history instead of relying only on
  `setupCompleteAt`
- avoid duplicating full raw runtime or product logs into host storage
- make packaged recovery and restart-resume diagnosis survive app relaunch

## Non-Goals

- introducing a general-purpose logging or telemetry platform
- replacing `cats-runtime` retained setup reports or diagnostics routes
- forcing the packaged host to store verbatim copies of runtime artifacts
- redesigning the existing runtime setup-report format
- shipping the full UI in the same slice as the data contract

## User Stories

- As a packaged desktop user, I want setup and recovery failures to tell one
  coherent story even when the issue crossed runtime, product, and host
  boundaries.
- As an operator, I want to see the latest runtime report, product onboarding
  state, and host helper status in one place without manually stitching files
  together.
- As a maintainer, I want each layer to keep its own source of truth so fixes
  do not create a second hidden log system.

## Requirements

### Functional Requirements

1. `cats-runtime` shall remain the source of truth for runtime-owned setup
   diagnostics and retained setup reports.
2. `cats-platform` shall persist a product-owned onboarding event history for
   packaged setup and recovery.
3. The Cats Electron host shall persist host-owned bootstrap, supervision, and
   packaged-helper lifecycle diagnostics.
4. The Cats Electron host shall expose an aggregated packaged recovery bundle
   above those three sources.
5. The aggregated host bundle shall summarize each layer separately rather than
   flattening them into one undifferentiated log.
6. The aggregated host bundle shall include stable references back to native
   layer truth where available:
   - runtime artifact ids and paths
   - product onboarding event ids or persisted records
   - host helper/action ids and host-state references
7. The aggregated host bundle shall preserve recent cross-layer chronology in a
   machine-readable way suitable for packaged recovery UI.
8. The first slice may keep chronology bounded to recent bootstrap/onboarding
   entries rather than an unbounded lifetime log.
9. The packaged bootstrap page shall be allowed to consume only the host bundle
   for its default recovery summary.
10. Advanced recovery entry points may still open the native runtime diagnostics
    or setup surfaces directly.
11. If one layer is unavailable, the aggregated host bundle shall still render
    partial truth and explicitly mark that layer as unavailable or stale.
12. The packaged setup flow shall record product-owned events for at least:
    - setup opened or resumed
    - owner/Boss Cat input staged or committed
    - runtime setup blocked
    - runtime scan requested
    - runtime apply requested
    - runtime apply confirmed or failed
    - packaged setup completion committed
13. The host-owned diagnostics slice shall record or summarize at least:
    - service start and readiness failures
    - helper execution and interruption outcomes
    - relaunch/restart/elevation resume state
    - host snapshot phase/status transitions
14. The aggregation contract shall support correlation metadata so operators can
    tell which entries belong to the same packaged bootstrap or recovery run.

### Non-Functional Requirements

- **Ownership clarity**: source-of-truth boundaries must remain obvious
- **Storage discipline**: host aggregation should retain bounded summaries and
  references instead of duplicating large raw artifacts
- **Redaction**: each layer remains responsible for redacting its own sensitive
  data before exposing it upward
- **Restart safety**: packaged recovery truth must survive host relaunch
- **Machine readability**: the aggregation contract must stay usable by the
  bootstrap page, smoke tooling, and later operator surfaces

## Design Overview

```text
cats-runtime
  retained setup reports
  setup/readiness diagnostics
          |
          | summary + references
          v
cats Electron host aggregation bundle
          ^
          | summary + references
          |
cats-platform
  onboarding event history
  setup completion / recovery events

Cats Electron host
  process/bootstrap/helper events
  persisted host snapshot
          |
          v
default packaged recovery UI
```

The intended ownership model is:

- runtime layer
  - runtime setup scans, apply outcomes, retained setup reports, runtime
    readiness
- product layer
  - onboarding decisions and product setup milestones
- host layer
  - process supervision, helper execution, and packaged recovery summary

The host aggregation surface is not a replacement log store. It is a bounded
summary and reference layer above the native records.

## Detailed Scope

### Phase A: Freeze Ownership and Aggregation Contract

- document the three-layer ownership split
- define what counts as source of truth versus aggregation
- define the first host bundle shape for recent chronology plus references

### Phase B: Add Product-Owned Onboarding History

- persist bounded onboarding events in `cats-platform`
- expose a product-owned read model the host can consume
- keep those events distinct from runtime setup reports and host helper events

### Phase C: Extend Host Persistence from Snapshot to Aggregation

- keep the current host snapshot
- add recent host lifecycle entries plus references to runtime/product records
- preserve restart-safe recovery inspection without scraping multiple surfaces

### Phase D: Use Aggregation in Recovery UI

- let the bootstrap/recovery UI consume the host bundle for its default story
- keep drill-down links/actions into runtime diagnostics or product setup when
  deeper investigation is needed

## Current Gap Being Closed

Today the project already has:

- runtime-owned retained setup-report artifacts
- runtime-owned setup/readiness summaries
- a host-owned persisted bootstrap snapshot
- host-owned last packaged setup helper state

But it still lacks:

- product-owned onboarding event history
- one explicit host aggregation bundle that ties the three layers together
- a documented rule that aggregation should happen by summary and reference,
  not by duplicating raw logs

## Dependencies

- [ADR-021](../decisions/021-keep-packaged-setup-and-provider-installation-in-the-host.md)
- [ADR-046](../decisions/046-drive-packaged-setup-through-runtime-bootstrap-apis.md)
- [ADR-047](../decisions/047-separate-bootstrap-diagnostics-by-layer-and-aggregate-in-the-host.md)
- [SPEC-023](./SPEC-023-packaged-setup-wizard-and-provider-installation.md)
- [SPEC-044](./SPEC-044-integrate-packaged-setup-with-runtime-bootstrap.md)
- [cats-runtime ADR-014](../../../cats-runtime/docs/decisions/014-keep-lightweight-provider-setup-and-diagnostics-in-cats-runtime.md)
- [cats-runtime SPEC-015](../../../cats-runtime/docs/specs/SPEC-015-runtime-setup-diagnostic-report.md)

## Open Questions

- [ ] Should the first slice introduce an explicit host-issued
      `bootstrapAttemptId` propagated into product/runtime events, or is
      timestamp ordering plus host references sufficient at first?
- [ ] Should the product-owned onboarding history live in shared chat/core
      state, or behind a separate file/read model owned by the suite host?
- [ ] How much of the aggregated chronology should be kept in `state.json`
      versus a sibling bounded history file?

## References

- [PLAN-030](../plans/PLAN-030-packaged-setup-wizard-and-provider-installation.md)
- [PLAN-033](../plans/PLAN-033-integrate-packaged-setup-with-runtime-bootstrap.md)
- [PLAN-034](../plans/PLAN-034-cross-layer-bootstrap-and-onboarding-diagnostics.md)

---

*Created: 2026-03-30*  
*Author: Codex*  
*Related Plan: [PLAN-034](../plans/PLAN-034-cross-layer-bootstrap-and-onboarding-diagnostics.md)*
