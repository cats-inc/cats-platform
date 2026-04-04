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
   - in the first slice, runtime-layer chronology may be derived from
     host-observed runtime state transitions plus retained setup-report
     timestamps or summaries
   - the first slice does not require a new runtime-owned event/history route
8. A dedicated runtime event/history route may be added later if host-derived
   runtime chronology proves insufficient, but it is not required for the
   first implementation slice.
9. The first slice may keep chronology bounded to recent bootstrap/onboarding
   entries rather than an unbounded lifetime log.
10. The packaged bootstrap page shall be allowed to consume only the host bundle
   for its default recovery summary.
11. Advanced recovery entry points may still open the native runtime diagnostics
    or setup surfaces directly.
12. If one layer is unavailable, the aggregated host bundle shall still render
    partial truth and explicitly mark that layer as unavailable or stale.
13. The packaged setup flow shall record product-owned events for at least:
    - setup opened or resumed
    - owner/Boss Cat input staged or committed
    - runtime setup blocked
    - runtime scan requested
    - runtime apply requested
    - runtime apply confirmed or failed
    - packaged setup completion committed
14. The host-owned diagnostics slice shall record or summarize at least:
    - service start and readiness failures
    - helper execution and interruption outcomes
    - relaunch/restart/elevation resume state
    - host snapshot phase/status transitions
15. The aggregation contract shall support correlation metadata so operators can
    tell which entries belong to the same packaged bootstrap or recovery run.
16. Each persisted or aggregated bootstrap/onboarding event shall carry enough
    diagnostic payload for operator-driven troubleshooting:
    - one timestamp
    - one layer discriminator
    - one stable event kind
    - one human-readable summary
    - one bounded context payload with the event's key parameters, such as
      provider names, file paths, scan counts, or phase transitions
    - one structured error payload when the event represents a failure or
      degraded condition; if present, the error payload shall include a
      human-readable message rather than only a code
17. Each persisted or aggregated bootstrap/onboarding event shall carry an
    explicit status classification:
    - `ok`
    - `degraded`
    - `unavailable`
    - `info`
    - if no stronger status applies, the first slice shall persist `info`
      rather than omitting the field
18. When the host trims merged chronology to a bounded size, it shall preserve
    recent representation from each available layer so one noisy layer does not
    crowd out the others entirely.

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

## First-Slice Contract Sketch

The first slice should freeze a minimal shared shape before implementation:

```ts
interface BootstrapEventReference {
  artifactId?: string;
  artifactPath?: string;
  recordId?: string;
  route?: string;
}

interface BootstrapEventError {
  message: string;
  code?: string;
  cause?: string;
  stack?: string;
}

interface BootstrapEvent {
  layer: 'runtime' | 'product' | 'host';
  kind: string;
  timestamp: string;
  attemptId?: string;
  summary: string;
  status: 'ok' | 'degraded' | 'unavailable' | 'info';
  context?: Record<string, unknown>;
  error?: BootstrapEventError;
  reference?: BootstrapEventReference;
}

interface BootstrapAggregationBundle {
  generatedAt: string;
  attemptId?: string;
  layers: {
    runtime: { summary: string; status: string; latestReference?: BootstrapEventReference };
    product: { summary: string; status: string; latestReference?: BootstrapEventReference };
    host: { summary: string; status: string; latestReference?: BootstrapEventReference };
  };
  chronology: BootstrapEvent[];
}
```

The exact field names may change during implementation, but the first slice
should keep this granularity:

- one layer discriminator
- one stable event kind
- one human-readable summary
- one timestamp
- one explicit status classification
- optional correlation metadata
- one bounded context payload carrying the event's key parameters
- one structured error payload when a failure or degraded condition occurred
- one native reference instead of raw-log duplication

With this minimum shape, an operator should be able to hand the latest
bootstrap/onboarding bundle to another maintainer or agent and get a concrete
answer about which layer failed, which step failed, and usually why. Without
the `context` and `error` payloads, the aggregation contract would only locate
the failing phase rather than support actual diagnosis.

## Detailed Scope

### Phase A: Freeze Ownership and Aggregation Contract

- document the three-layer ownership split
- define what counts as source of truth versus aggregation
- define the first host bundle shape for recent chronology plus references

### Phase B: Add Product-Owned Onboarding History

- persist bounded onboarding events in `cats-platform`
- expose a product-owned read model the host can consume
- keep those events distinct from runtime setup reports and host helper events
- the first product-owned event set may stay minimal:
  - `setup_opened`
  - `runtime_apply_requested`
  - `runtime_apply_confirmed`
  - `setup_completed`
- the broader requirement list remains the target contract, but not every event
  kind must ship in the first implementation slice

### Phase C: Extend Host Persistence from Snapshot to Aggregation

- keep the current host snapshot
- add recent host lifecycle entries plus references to runtime/product records
- preserve restart-safe recovery inspection without scraping multiple surfaces
- the first host-owned event set may stay minimal:
  - `host_phase_changed`
  - `service_exited_before_ready`
  - `helper_run_completed`
  - `resume_action_changed`
- runtime chronology in this phase is derived from existing runtime state/report
  truth unless a later follow-through explicitly adds a runtime event route

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

## Resolved First-Slice Questions

- The first slice uses a host-issued `bootstrapAttemptId` for host-owned and
  product-owned events.
  - runtime native artifacts remain correlated by host observation time plus
    native references in the first slice rather than a runtime-native attempt
    id
- Product-owned onboarding history lives in a dedicated
  `platform-onboarding-history.json` sidecar beside `chat-state.json`.
- The first slice keeps bounded host aggregation in the existing
  `desktop-host/state.json` artifact rather than adding a sibling host-history
  file immediately.
  - revisit a sibling host-history artifact only if compatibility or file-size
    evidence later shows the existing state artifact is insufficient

## References

- [PLAN-030](../plans/PLAN-030-packaged-setup-wizard-and-provider-installation.md)
- [PLAN-033](../plans/PLAN-033-integrate-packaged-setup-with-runtime-bootstrap.md)
- [PLAN-034](../plans/PLAN-034-cross-layer-bootstrap-and-onboarding-diagnostics.md)

---

*Created: 2026-03-30*  
*Author: Codex*  
*Related Plan: [PLAN-034](../plans/PLAN-034-cross-layer-bootstrap-and-onboarding-diagnostics.md)*
