# SPEC-094: Schedule Rules and Mission Triggers

> Define schedule rules as generic time/event launch conditions that create or
> activate missions and runs through supervised platform execution.

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Implemented |
| **Owner** | Codex |
| **Reviewer** | User |
| **Related ADR** | [ADR-090](../decisions/090-adopt-generic-schedule-rules-for-mission-triggers.md) |
| **Related Plan** | [PLAN-083](../plans/PLAN-083-schedule-rules-and-mission-trigger-rollout.md) |

## Summary

Cats needs a scheduler that can launch agent work at future or recurring times.
The scheduler should not encode product-specific behavior such as "send this
morning image." Instead, a schedule rule fires a trigger, the trigger admits a
mission/run through the platform execution path, and the target Cat/agent uses
bounded tools and resources to decide what to do.

The first motivating scenario is:

> Every day at 08:00, a companion Cat greets the owner through Telegram. The
> Cat chooses a suitable image from its resources, may post or process it if
> tools allow, and then sends media or a link through Telegram.

This spec defines the schedule-rule contract needed for that scenario without
creating a companion-specific mission class.

## Goals

- Define one generic `ScheduleRule` contract for timed agent work.
- Connect schedule firing to Mission/Run admission instead of direct runtime
  calls.
- Let the target agent choose content/actions inside declared tool, resource,
  transport, and policy bounds.
- Preserve supervision evidence and transport-binding identity.
- Support local-first desktop scheduling while Cats is running.
- Handle idempotency, concurrency, missed fires, retries, and observability.

## Non-Goals

- Building a full visual workflow builder.
- Creating companion-specific classes such as `ScheduledCompanionMission`;
  ADR-090 owns the architectural rationale.
- Guaranteeing execution while the desktop app is fully closed.
- Defining public cloud scheduling or multi-device fanout.
- Replacing OS-level notification/task schedulers.
- Letting scheduler code bypass runtime supervision or transport delivery
  boundaries.
- Automatically materializing every scheduled mission into a Work task.

## User Stories

- As an owner, I want a Cat to greet me on Telegram every morning using content
  it chooses from its resources.
- As an owner, I want to pause or inspect scheduled automations without losing
  their history.
- As an agent implementer, I want scheduled work to enter the same mission/run
  infrastructure as interactive work.
- As a transport implementer, I want scheduled outbound messages to use
  transport bindings and delivery policies rather than direct bot calls.
- As a reviewer, I want to see why a scheduled run fired, skipped, retried, or
  failed.

## Requirements

### Functional Requirements

#### Schedule rule model

1. The platform shall define `ScheduleRule` as a generic persisted
   configuration object.
2. A `ScheduleRule` shall not be a `Task`, `Mission`, `Run`, or product-specific
   mission class.
3. A `ScheduleRule` shall include at minimum:
   - `id`
   - `title`
   - `enabled`
   - `revision`
   - `timezone`
   - `schedule`
   - `missionTemplate`
   - `executionPolicy`
   - `createdAt`
   - `updatedAt`
   - `createdByActorId`

   `revision` starts at `1` and increments when the schedule definition,
   mission template, execution policy, or other admission-affecting fields
   change. Cosmetic edits such as title copy do not need to create a new
   idempotency revision.
4. The first supported schedule kinds shall be:
   - `once`: one future fire time
   - `daily`: local civil time in a timezone

   Cron-like recurrence is a v2 follow-up until the accepted expression subset
   is specified. V1 schedulers shall reject cron rules instead of silently
   approximating them.
5. The schedule contract shall preserve timezone explicitly. A daily 08:00 rule
   means 08:00 in that configured timezone, not "24 hours after the last fire."
6. The product may expose user-friendly controls such as "daily at 08:00" while
   normalizing storage into the schedule contract.
7. A disabled rule shall not fire, but its history and next-fire diagnostics
   remain readable.

#### Mission template

8. A `ScheduleRule` shall carry or reference a `MissionTemplate`.
9. A `MissionTemplate` shall describe the delegated work intent and bounds:
   - target agent/Cat reference
   - origin surface
   - intent prompt or structured objective
   - optional conversation target
   - optional transport target
   - resource scopes
   - tool/capability scopes
   - approval/escalation policy
   - output expectations

   A template target with `kind: 'cat'` shall be resolved to a concrete
   `AgentId` during scheduler admission, before writing
   `MissionRecord.assignedAgentId`. Unresolved or ambiguous Cat targets shall
   fail admission before Run creation. Runtime receives the resolved mission,
   while the original (pre-resolution) target reference shall be persisted on
   the admitted run as `CoreRunRecord.metadata.scheduleTrigger.originalTargetRef`
   so that diagnostics, retries, and history surfaces can recover the
   rule-declared target without re-reading the rule.
10. The mission template shall be generic. It must not encode product-specific
    subclasses such as `ScheduledCompanionMission`; ADR-090 owns the rejection
    rationale and this spec owns the concrete schedule contract.
11. On fire, the scheduler shall create a trigger event with an idempotency key
    and then create a mission instance or activate an existing mission according
    to the rule's `missionPolicy`.
12. The default mission policy for recurring user-visible automations shall be
    `per_fire`, creating one mission instance per due fire.
13. `reuse_active` is not part of the v1 admission contract. Supporting
    standing or reused missions requires a follow-up contract that reconciles
    the standing lifecycle with the current `MissionRecordStatus` values
    (`draft`, `planned`, `queued`, `running`, `completed`, `failed`,
    `cancelled`).

#### Trigger and run admission

14. A trigger event shall include:
    - rule id
    - rule revision
    - scheduled fire time
    - actual fire time
    - idempotency key
    - reason (`due`, `manual_test`, `startup_misfire`, `retry`)
15. The trigger event is not a new Core record family. The scheduler may keep a
    platform-owned trigger receipt/idempotency ledger, but the canonical query
    contract for admitted scheduled runs shall be
    `CoreRunRecord.metadata.scheduleTrigger`.
16. `CoreRunRecord.metadata.scheduleTrigger` shall mirror the trigger event
    fields enumerated in #14, plus an optional `triggerReceiptId` linking back
    to the platform-owned receipt ledger and an optional `originalTargetRef`
    capturing the rule-declared target before Cat→Agent resolution.
17. Downstream surfaces that need "all runs triggered by rule X" shall query
    the fixed `scheduleTrigger.ruleId` metadata shape rather than inferring from
    traces or activities.
18. Every admitted execution attempt shall create a `Run` through the canonical
    execution dispatcher/materialization path before runtime work starts.
19. Scheduled execution shall never call runtime send/create APIs directly from
    the scheduler loop.
20. Scheduled execution shall use the supervision runtime boundary and
    policy/tool evidence path required by ADR-082.
21. A scheduled run may produce chat messages, transport deliveries,
    activities, artifacts, checkpoints, outcomes, or approvals according to the
    mission and tools used.
22. A scheduled run shall create or update Work-facing tasks only when the
    mission outcome is operator-visible, manageable, prioritizable, or
    approvable.

#### Agent agency and bounded tools

23. The platform shall provide the target agent with the mission intent and the
    allowed resource/tool/transport scopes.
24. The scheduler shall not choose the final image, post, output, or delivery
    format for the agent.
25. For resource selection, the agent shall use a bounded resource/read tool or
    product-provided context surface rather than raw filesystem scanning.
26. For media post-processing, the agent shall use declared tools only when the
    rule/tool policy permits them.
27. For Telegram delivery, the agent shall use a supervised transport-delivery
    capability that respects bot bindings, transport bindings, and fanout rules.
28. If the required tool or resource scope is unavailable, the run shall fail or
    ask for approval according to the rule's escalation policy; the scheduler
    shall not silently substitute deterministic behavior.

#### Morning greeting example

29. The morning greeting schedule shall be representable without new model
    types:

```ts
interface MorningGreetingExample {
  title: 'Daily morning greeting';
  timezone: 'Asia/Taipei';
  schedule: {
    kind: 'daily';
    time: '08:00';
  };
  missionTemplate: {
    target: { kind: 'cat', id: 'cat-companion' };
    originSurface: 'schedule';
    intent: string;
    resourceScopes: Array<{ kind: 'companion_content'; catId: string }>;
    transportTargets: Array<{ platform: 'telegram'; bindingId: string }>;
    toolScopes: string[];
  };
}
```

30. The example intent should say that the Cat should greet the owner and choose
    suitable content from allowed resources. It should not hard-code which
    resource to use.
31. The example may deliver directly to Telegram or post/share a companion
    content link if those capabilities are available.

#### Concurrency, idempotency, and missed fires

32. A `ScheduleRule` shall have a `concurrencyPolicy`:
    - `skip`: do not start a new run while a previous run for the same rule is
      active
    - `queue`: queue one or more due fires behind the active run
    - `replace`: cancel or supersede the active run before starting the new one

    V1 accepts `skip`, `queue`, and `replace` only when the implementation can
    cancel the active scheduled run through the supervision runtime boundary.
    `replace` shall fail admission if the active run cannot be cancelled; it
    shall not mark Core metadata as cancelled while the runtime continues
    executing.
33. The first implementation should default to `skip` for chat/transport
    greetings to avoid duplicate messages.
34. A `ScheduleRule` shall have a `misfirePolicy`:
    - `skip`: ignore fires missed while Cats was not running
    - `fire_once`: fire once on startup for the most recent missed occurrence
    - `fire_all`: attempt every missed occurrence
35. The first implementation should default to `skip` for greetings and
    `fire_once` for operational reviews where one catch-up run is useful.
36. Each trigger shall have a deterministic idempotency key derived from:
    - rule id
    - rule revision
    - scheduled fire time
    - retry attempt number for retry triggers
37. The scheduler shall not admit the same idempotency key twice.
38. Manual test fires shall use a separate idempotency namespace and shall be
    visibly marked as test runs.

#### Retry and failure handling

39. A `ScheduleRule` shall define a bounded retry policy:
    - max attempts
    - backoff strategy
    - pause-after-consecutive-failures threshold
40. Scheduler-owned retry attempts shall remain linked to the same scheduled
    fire through retry trigger receipts and `metadata.scheduleTrigger`.
    Runtime-level retries after a mission/run has already started remain owned
    by the supervision runtime boundary.
41. Transport delivery failures shall be visible as run failures or partial
    failures, not swallowed by the scheduler.
42. A rule may pause itself after repeated failures if configured.

#### Observability and UI

43. The platform shall expose schedule rule status:
    - enabled/disabled
    - next fire time
    - last fire time
    - last run status
    - recent failures
44. The first UI may be minimal but must allow:
    - list rules
    - create/edit rule
    - enable/disable rule
    - run a manual test fire
    - inspect recent trigger/run history
45. Product-specific entry surfaces may deep-link into rule creation with a
    prefilled template. For example, a companion profile can offer "Add morning
    greeting" while still creating a generic `ScheduleRule`.
46. Rule history shall make clear whether a run was skipped because:
    - Cats was not running
    - concurrency policy skipped it
    - the rule was disabled
    - missing tools/resources prevented execution
    - transport delivery failed

### Non-Functional Requirements

- **Local-first**: the first scheduler runs inside the local Cats platform
  process and uses local persisted rules.
- **Supervision**: scheduled execution must preserve ADR-082 supervision,
  evidence, and policy-dial behavior.
- **Idempotency**: a crash/restart must not duplicate a scheduled delivery for
  the same due fire.
- **Timezone correctness**: recurring local civil times must behave correctly
  across restarts and daylight-saving changes.
- **Bounded execution**: concurrency, retries, and failure thresholds must keep
  scheduled automations from flooding Chat, Work, transports, or runtime.
- **Product neutrality**: the schedule contract must not depend on Companion,
  Telegram, Code, or Work-specific subclasses.

## Design Overview

```text
Persisted ScheduleRule
  -> Scheduler due-time evaluator
  -> TriggerEvent / idempotency admission
  -> MissionTemplate materialization
  -> Mission
  -> Run admitted by execution dispatcher
  -> supervised runtime/tool execution
  -> chat / transport / artifact / activity / approval outcomes
```

Suggested shape:

```ts
type ScheduleKind = 'once' | 'daily';

type ScheduleTriggerReason = 'due' | 'manual_test' | 'startup_misfire' | 'retry';

interface ScheduleRule {
  id: string;
  title: string;
  enabled: boolean;
  revision: number;
  timezone: string;
  schedule: ScheduleDefinition;
  missionTemplate: MissionTemplate;
  executionPolicy: ScheduleExecutionPolicy;
  createdAt: string;
  updatedAt: string;
  createdByActorId: string;
  nextFireAt?: string | null;
  lastFireAt?: string | null;
  lastRunId?: string | null;
  lastFailure?: string | null;
  consecutiveFailures?: number;
  retryState?: ScheduleRetryState | null;
  pausedAt?: string | null;
  pauseReason?: string | null;
}

type ScheduleDefinition =
  | { kind: 'once'; fireAt: string }
  | { kind: 'daily'; time: string };
// `cron` is a v2 extension after the accepted expression subset is specified.

interface MissionTemplate {
  target: { kind: 'cat' | 'agent'; id: string };
  // V1 only emits schedule-originated MissionTemplates. Widen this union
  // when a concrete second origin surface (Chat/Work/Code/transport) needs
  // to share the shape — pre-emptive widening to `string` would lose the
  // type guard without a real caller.
  originSurface: 'schedule';
  intent: string;
  conversationTarget?: { conversationId: string } | null;
  transportTargets?: Array<{ platform: string; bindingId: string }>;
  resourceScopes?: Array<Record<string, unknown>>;
  toolScopes?: string[];
  approvalPolicy?: Record<string, unknown>;
  outputPolicy?: Record<string, unknown>;
}

interface ScheduleExecutionPolicy {
  missionPolicy: 'per_fire';
  // `replace` must cancel active scheduled runs through the supervision
  // runtime boundary before admitting the replacement.
  concurrencyPolicy: 'skip' | 'queue' | 'replace';
  misfirePolicy: 'skip' | 'fire_once' | 'fire_all';
  retryPolicy: {
    maxAttempts: number;
    backoff: 'none' | 'fixed' | 'exponential';
    pauseAfterConsecutiveFailures: number | null;
  };
}

interface ScheduleRetryState {
  attempt: number;
  maxAttempts: number;
  nextRetryAt: string;
  originalScheduledFireAt: string;
  lastError: string;
  failedReceiptId: string;
}

// Stored under CoreRunRecord.metadata.scheduleTrigger for admitted scheduled
// runs. The dedicated `scheduleTrigger` key on `metadata` already disambiguates
// schedule provenance from other metadata blocks, so no `kind` discriminant
// is carried here.
interface ScheduleTriggerMetadata {
  ruleId: string;
  ruleRevision: number;
  scheduledFireAt: string;
  actualFireAt: string;
  idempotencyKey: string;
  reason: ScheduleTriggerReason;
  triggerReceiptId?: string;
  originalTargetRef?: { kind: 'cat'; id: string };
}
```

The actual implementation may narrow the TypeScript types as the Mission/Run
contracts land. The spec-level requirement is the architecture: schedule rules
launch generic missions/runs, write scheduled run provenance to
`CoreRunRecord.metadata.scheduleTrigger`, and do not own product behavior.

## Dependencies

- [ADR-063](../decisions/063-agent-missions-and-transport-bindings.md)
- [ADR-082](../decisions/082-recast-orchestrator-as-capability-shell-with-policy-dial-supervision.md)
- [ADR-090](../decisions/090-adopt-generic-schedule-rules-for-mission-triggers.md)
- [SPEC-062](./SPEC-062-agent-missions-and-transport-bindings.md)
- [SPEC-081](./SPEC-081-transport-fanout-for-web-originated-messages.md)
- [SPEC-086](./SPEC-086-shareable-companion-content-links-and-chat-previews.md)

## Open Questions

- [ ] Should schedule rules live in shared Core storage, platform-owned
      configuration storage, or a dedicated scheduler store for the first
      implementation?
- [ ] Which cron expression subset should be accepted in v2?
- [ ] Which tool surface should expose companion resource selection to the
      agent?
- [ ] Should a scheduled Telegram message create a hidden/visible Chat
      transcript turn before delivery, after delivery, or both?
- [ ] When Cats is closed, should a future desktop build register an OS-level
      wake helper?

## References

- [ADR-090: Adopt Generic Schedule Rules for Mission Triggers](../decisions/090-adopt-generic-schedule-rules-for-mission-triggers.md)
- [PLAN-083: Schedule Rules and Mission Trigger Rollout](../plans/PLAN-083-schedule-rules-and-mission-trigger-rollout.md)
- [terminology.md](../terminology.md)

---

*Created: 2026-04-29*
*Author: Codex*
*Related Plan: [PLAN-083](../plans/PLAN-083-schedule-rules-and-mission-trigger-rollout.md)*
