# PLAN-083: Schedule Rules and Mission Trigger Rollout

> Phased implementation plan for ADR-090 / SPEC-094. The rollout connects
> persisted schedule rules to generic mission/run execution without introducing
> companion-specific mission classes.

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Draft |
| **Owner** | Codex |
| **Assigned To** | Unassigned |
| **Reviewer** | User |
| **Related ADR** | [ADR-090](../decisions/090-adopt-generic-schedule-rules-for-mission-triggers.md) |
| **Related Spec** | [SPEC-094](../specs/SPEC-094-schedule-rules-and-mission-triggers.md) |

## Related Spec

[SPEC-094: Schedule Rules and Mission Triggers](../specs/SPEC-094-schedule-rules-and-mission-triggers.md)

## Overview

The implementation goal is to let time or a manual test fire admit a normal
mission/run through the platform execution path.

The first production-like story is the companion morning greeting:

```text
daily 08:00
  -> schedule trigger
  -> generic mission for the selected Cat
  -> run admitted through supervised execution
  -> Cat chooses content/resources
  -> Cat sends media or link through Telegram transport capability
```

The scheduler is responsible for due-time evaluation, idempotency, concurrency,
misfire handling, retry policy, and dispatch admission. It is not responsible
for choosing content, editing images, posting, or delivering directly to
Telegram.

## Implementation Phases

### Phase 1: Contract and Store Skeleton

- [ ] Add platform-owned `ScheduleRule`, `ScheduleDefinition`,
      `MissionTemplate`, `ScheduleExecutionPolicy`, and trigger-receipt types.
- [ ] Choose the first persistence location:
      - platform-owned schedule store for v1, or
      - shared Core storage if mission/run records are ready to reference it.
- [ ] Implement file-backed and in-memory stores following existing local-first
      state patterns.
- [ ] Add validation for:
      - timezone
      - schedule kind
      - daily time
      - cron subset if enabled
      - target agent/Cat reference
      - concurrency/misfire/retry policies
- [ ] Add deterministic id generation and rule revision tracking.
- [ ] Add narrow unit tests for validation and serialization.

**Deliverables**: rules can be created, read, updated, enabled/disabled, and
stored without running them.

### Phase 2: Due-Time Evaluator and Scheduler Loop

- [ ] Implement next-fire calculation for `once` and `daily`.
- [ ] Decide whether `cron` lands now or remains a stored/API-only future
      shape.
- [ ] Add a scheduler service that:
      - loads enabled rules
      - computes due rules
      - writes trigger receipts/idempotency keys
      - updates `nextFireAt`, `lastFireAt`, and recent status
- [ ] Implement startup misfire handling per rule:
      - `skip`
      - `fire_once`
      - `fire_all`
- [ ] Implement concurrency policy:
      - `skip`
      - `queue`
      - `replace` as a later phase if cancellation is not ready
- [ ] Add tests for restart/misfire/idempotency behavior.

**Deliverables**: scheduler can detect due rules and record admissible trigger
events without invoking runtime.

### Phase 3: Mission and Run Admission

- [ ] Add an adapter that turns a trigger receipt plus `MissionTemplate` into a
      generic Mission.
- [ ] Create one mission per fire by default (`missionPolicy = per_fire`).
- [ ] Admit a Run through the execution dispatcher/materialization path before
      any runtime work starts.
- [ ] Attach trigger metadata to the Mission/Run:
      - rule id
      - rule revision
      - scheduled fire time
      - actual fire time
      - idempotency key
      - trigger reason
- [ ] Route scheduled runtime work through the supervision runtime boundary.
- [ ] Add tests proving scheduler code does not call runtime client APIs
      directly.
- [ ] Add tests proving duplicate idempotency keys do not create duplicate
      runs.

**Deliverables**: a due schedule can create/activate Mission and Run records
through the same platform execution admission path used by other agent work.

### Phase 4: Agent Resource, Content, and Transport Capabilities

- [ ] Define the minimal tool/resource surface needed for the morning greeting:
      - list/read allowed companion content resources
      - optionally create/post a companion content item
      - send media or text/link through Telegram delivery capability
- [ ] Ensure these capabilities are exposed as supervised tools or bounded
      platform actions, not scheduler internals.
- [ ] Pass rule-declared resource scopes and transport targets into the mission
      context.
- [ ] Preserve transport binding identity for Telegram delivery.
- [ ] Add tests for missing tool/resource behavior:
      - fail visibly
      - request approval when policy says so
      - do not silently substitute app-selected content

**Deliverables**: the scheduled agent has enough bounded capability to decide
what to send and how to send it.

### Phase 5: Minimal API and UI

- [ ] Add schedule API endpoints for:
      - list rules
      - create rule
      - update rule
      - enable/disable rule
      - manual test fire
      - recent trigger/run history
- [ ] Add a minimal schedule-management UI in the most appropriate surface:
      - platform Settings / Automations if available, or
      - a simple My Cats / Cat detail action for the first companion use case.
- [ ] Add product-specific creation shortcuts that still create generic rules:
      - "Daily morning greeting" prefilled template from a Cat/companion view
      - future Work/Code templates later
- [ ] Show diagnostics:
      - next fire
      - last run
      - last failure
      - skipped because app was closed/concurrency/rule disabled
- [ ] Keep UI copy clear that scheduled execution only fires while Cats is
      running in v1.

**Deliverables**: the owner can create and inspect the morning-greeting rule
without hand-editing state.

### Phase 6: Hardening and Follow-Ons

- [ ] Add bounded retries and pause-after-repeated-failures.
- [ ] Add audit/export view for recent trigger receipts and runs.
- [ ] Decide whether OS-level scheduled wake is needed for closed-app
      execution.
- [ ] Decide whether heartbeat/liveness monitoring is needed for scheduler
      health. Do not block Phase 1-5 on heartbeat.
- [ ] Expand rule templates for Work reviews, Code checks, memory flushes, and
      transport digests.
- [ ] Revisit whether schedule rules should move from platform-owned config to
      shared Core once the mission/run storage model is stable.

**Deliverables**: scheduled automation becomes observable and extensible beyond
the first companion/Telegram scenario.

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `src/platform/scheduler/**` | Create | Schedule rule store, evaluator, scheduler service, trigger receipts |
| `src/core/**` | Modify | Mission/run admission hooks or metadata once implementation lands |
| `src/platform/supervision/**` | Modify | Scheduled execution adapter into supervised runtime/tool boundary |
| `src/platform/transports/telegram/**` | Modify | Bounded scheduled delivery capability if not already exposed |
| `src/products/chat/**` | Modify | Chat/companion creation shortcut and transcript projection if needed |
| `src/products/work/**` | Modify | Future Work-facing schedule views and mission/run projections |
| `tests/**` | Create/Modify | Store, evaluator, idempotency, supervision-boundary, transport tests |
| `docs/**` | Modify | Keep ADR/SPEC/PLAN and terminology aligned as implementation lands |

## Technical Decisions

- Schedule rules are launch configuration, not mission subclasses.
- Default recurring user-visible rules use one mission per fire.
- The first local scheduler only runs while Cats is running.
- Heartbeat/liveness is a hardening follow-on, not a prerequisite.
- Scheduler code never chooses content or calls runtime/transport APIs
  directly.

## Testing Strategy

- **Unit Tests**
  - schedule validation
  - next-fire calculation
  - timezone handling
  - idempotency key generation
  - concurrency and misfire policy
- **Integration Tests**
  - due rule creates one trigger and one mission/run
  - restart does not duplicate already-admitted fires
  - scheduled execution enters supervision boundary
  - Telegram target uses transport binding identity
- **Static Boundary Tests**
  - scheduler modules do not import runtime client send/create APIs directly
  - scheduler modules do not import Telegram delivery clients directly
  - product-specific schedule shortcuts create generic rules
- **Manual Validation**
  - create a daily morning greeting rule
  - run manual test fire
  - verify the Cat chooses content and sends through Telegram
  - inspect run/trigger history and failure diagnostics

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Scheduler becomes product logic | High | Keep scheduler limited to rule firing and dispatch admission; enforce static boundary tests |
| Duplicate Telegram sends after restart | High | Deterministic idempotency keys plus trigger receipts |
| Work backlog gets noisy | Medium | Only materialize Work tasks when operator-visible/actionable |
| App-closed schedules surprise users | Medium | v1 UI states "runs while Cats is running"; OS wake is a future decision |
| Missing resource/transport tools cause silent fallback | High | Fail visibly or request approval; no deterministic scheduler substitute |
| Timezone bugs | Medium | Store timezone explicitly and test local civil recurrence |

## Progress Log

| Date | Update |
|------|--------|
| 2026-04-29 | Plan created for generic schedule rules and mission-trigger rollout |

---

*Created: 2026-04-29*
*Author: Codex*
