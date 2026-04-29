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

- [x] Add platform-owned `ScheduleRule`, `ScheduleDefinition`,
      `MissionTemplate`, `ScheduleExecutionPolicy`, and trigger-receipt types.
- [x] Choose the first persistence location:
      - platform-owned schedule store for v1, or
      - shared Core storage if mission/run records are ready to reference it.
- [x] Implement file-backed and in-memory stores following existing local-first
      state patterns.
- [x] Add validation for:
      - timezone
      - schedule kind
      - daily time
      - explicit cron rejection until a v2 subset is specified
      - target agent/Cat reference
      - concurrency/misfire/retry policies
- [x] Add deterministic id generation and rule revision tracking. Revisions
      start at `1` and increment on admission-affecting changes to schedule,
      mission template, execution policy, or related policy bounds.
- [x] Add narrow unit tests for validation and serialization.

**Deliverables**: rules can be created, read, updated, enabled/disabled, and
stored without running them.

### Phase 2: Due-Time Evaluator and Scheduler Loop

- [x] Implement next-fire calculation for `once` and `daily`.
- [x] Keep cron out of v1 next-fire calculation and admission. Return explicit
      validation errors for cron shapes until SPEC-094 defines the v2 subset.
- [x] Add a scheduler service that:
      - loads enabled rules
      - computes due rules
      - writes trigger receipts/idempotency keys
      - updates `nextFireAt`, `lastFireAt`, and recent status
- [x] Implement startup misfire handling per rule:
      - `skip`
      - `fire_once`
      - `fire_all`
- [x] Implement concurrency policy:
      - `skip`
      - `queue`
      - explicit `replace` rejection until supervised cancellation is ready
- [ ] Implement `replace` by cancelling through the supervision runtime
      boundary rather than Core metadata only.
- [x] Add tests for restart/misfire/idempotency behavior.

**Deliverables**: scheduler can detect due rules and record admissible trigger
events without invoking runtime.

### Phase 3: Mission and Run Admission

- [x] Add an adapter that turns a trigger receipt plus `MissionTemplate` into a
      generic Mission.
- [x] Resolve `MissionTemplate.target.kind = 'cat'` to a concrete `AgentId` in
      admission before writing `MissionRecord.assignedAgentId`; unresolved Cat
      targets fail before Run creation.
- [x] Create one mission per fire by default (`missionPolicy = per_fire`).
- [x] Admit a Run through the execution dispatcher/materialization path before
      any runtime work starts.
- [x] Use the Core store atomic update seam for scheduler Mission/Run
      materialization so admission does not do a naked read-modify-write.
- [x] Write canonical trigger metadata to
      `CoreRunRecord.metadata.scheduleTrigger`:
      - rule id
      - rule revision
      - scheduled fire time
      - actual fire time
      - idempotency key
      - trigger reason
      - optional trigger receipt id
      - optional `originalTargetRef` capturing the rule-declared target before
        Cat→Agent resolution (so retries and history surfaces can recover it
        without re-reading the rule)
- [x] Route scheduled runtime work through the supervision runtime boundary.
- [x] Add tests proving scheduler code does not call runtime client APIs
      directly.
- [x] Add tests proving duplicate idempotency keys do not create duplicate
      runs.

**Deliverables**: a due schedule can create/activate Mission and Run records
through the same platform execution admission path used by other agent work.

### Phase 4: Agent Resource, Content, and Transport Capabilities

- [ ] Define the minimal tool/resource surface needed for the morning greeting:
      - [x] list/read allowed companion content resources
      - optionally create/post a companion content item
      - [x] send bounded text/link through Telegram delivery capability
      - send media through Telegram delivery capability
- [ ] Ensure these capabilities are exposed as supervised tools or bounded
      platform actions, not scheduler internals.
      - [x] Companion content list/read is exposed as
        `companion.content.list` and `companion.content.read`.
      - [x] Telegram text/link delivery is exposed as
        `transport.telegram.text.send`.
- [x] Pass rule-declared resource scopes and transport targets into the mission
      context.
- [x] Preserve transport binding identity for Telegram text/link delivery.
- [ ] Add tests for missing tool/resource behavior:
      - [x] fail visibly for undeclared companion resource scopes and
        Telegram transport targets
      - [x] request approval when Telegram delivery policy says so
      - do not silently substitute app-selected content

**Deliverables**: the scheduled agent has enough bounded capability to decide
what to send and how to send it.

### Phase 5: Minimal API and UI

- [x] Add schedule API endpoints for:
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
| `src/core/**` | Modify | Mission/run admission hooks and `metadata.scheduleTrigger` convention; do not add a TriggerEvent Core record family |
| `src/platform/supervision/**` | Modify | Scheduled execution adapter into supervised runtime/tool boundary |
| `src/platform/transports/telegram/**` | Modify | Bounded scheduled delivery capability if not already exposed |
| `src/products/chat/**` | Modify | Chat/companion creation shortcut and transcript projection if needed |
| `src/products/work/**` | Modify | Future Work-facing schedule views and mission/run projections |
| `tests/**` | Create/Modify | Store, evaluator, idempotency, supervision-boundary, transport tests |
| `docs/**` | Modify | Keep ADR/SPEC/PLAN and terminology aligned as implementation lands |

## Technical Decisions

- Schedule rules are launch configuration, not mission subclasses.
- V1 supports `once` and `daily`; `cron` is deferred until SPEC-094 defines
  the accepted v2 subset.
- Default recurring user-visible rules use one mission per fire.
- `reuse_active` standing missions are deferred until a follow-up reconciles
  them with `MissionRecordStatus`.
- Scheduler admission resolves Cat targets to concrete Agent ids before
  Mission/Run creation.
- Scheduled run provenance uses `CoreRunRecord.metadata.scheduleTrigger` as the
  fixed query shape.
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
  - revision increment behavior
  - concurrency and misfire policy
- **Integration Tests**
  - due rule creates one trigger and one mission/run
  - restart does not duplicate already-admitted fires
  - scheduled execution enters supervision boundary
  - scheduled Run records include `metadata.scheduleTrigger`
  - Cat targets resolve to concrete Agent ids before Mission creation
  - `metadata.scheduleTrigger.originalTargetRef` preserves the rule-declared
    target (kind/id) for runs whose template used `kind: 'cat'`
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
| 2026-04-29 | Review follow-up: clarified v1 `once`/`daily` scope, rule revision semantics, Cat-to-Agent admission resolution, `CoreRunRecord.metadata.scheduleTrigger` provenance, and deferred `reuse_active`/cron follow-ups. |
| 2026-04-29 | Polish pass: dropped redundant `kind: 'schedule'` discriminant on `ScheduleTriggerMetadata`, narrowed `MissionTemplate.originSurface` from `string` back to literal `'schedule'` until a second origin caller exists, consolidated SPEC #14/#16 prose, pinned `originalTargetRef` storage to `CoreRunRecord.metadata.scheduleTrigger`, and removed the cron-API Open Question already answered by req #4 + Phase 2. |
| 2026-04-29 | Implementation slice: added platform scheduler contracts, in-memory/file-backed schedule store, v1 validation, timezone-aware `once`/`daily` next-fire evaluation, trigger receipt/idempotency ledger, startup misfire and concurrency handling, server scheduler loop while Cats is running, Mission/Run admission with Cat→Agent resolution and `CoreRunRecord.metadata.scheduleTrigger.originalTargetRef`, minimal `/api/work/schedules` + `/test-fire` routes, and targeted scheduler/route/static-boundary tests. Runtime/Telegram execution remains deferred to Phase 4/5 capability work. |
| 2026-04-29 | Review follow-up: scheduler admission now writes Core through an atomic update seam, v1 rejects `replace` until supervised cancellation lands, `originalTargetRef` is emitted only for Cat targets on run trigger metadata, manual test fires are visibly titled and no longer update scheduled last-run timing, scheduler store timestamps honor the injected clock, and DST gap/overlap tests cover local daily schedules. |
| 2026-04-29 | Supervision boundary slice: added a scheduled-run runtime launcher under `platform/supervision` that starts admitted scheduled Mission/Run records through `startProviderAgentRunLoop`, records runtime bridge/run-loop supervision metadata, keeps the scheduler module free of runtime imports, and wires both background ticks and Work manual test fires to launch when a runtime client is configured. Rule-declared transport/resource/tool scopes are now carried into the runtime context and prompt for the scheduled agent. |
| 2026-04-29 | Transport capability slice: added `transport.telegram.text.send` as a supervised external-visible tool that sends bounded text/link payloads through the existing Telegram relay, authorizes only rule-declared binding ids, preserves selected Telegram binding identity in relay receipts, and rejects ambiguous or undeclared delivery targets without scheduler fallback. |
| 2026-04-29 | Companion resource slice: added product-owned `companion.content.list` and `companion.content.read` supervised read tools that expose only declared `companion_content` resource scopes, bound list/read payloads, avoid raw filesystem scanning, and fail visibly when a Cat/source/kind is outside scope. |
| 2026-04-29 | Approval behavior slice: Telegram supervised delivery now returns `pending_approval` without sending when the caller's evaluated delivery policy requires approval, with regression coverage proving no transport side effect occurs before approval. |

---

*Created: 2026-04-29*
*Author: Codex*
