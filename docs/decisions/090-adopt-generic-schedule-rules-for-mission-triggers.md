# ADR-090: Adopt Generic Schedule Rules for Mission Triggers

> Use schedule rules as generic launch conditions for missions and runs, not
> as companion-specific mission classes or deterministic app-side automations.

## Status

Proposed

## Context

Cats needs scheduled automation. A concrete motivating case is a companion Cat
that greets the owner on Telegram every morning at 08:00, chooses an image from
its resources, optionally post-processes or posts it, and then sends the result
or a link.

The important product point is that the Cat has a brain. The platform should
not hard-code "pick image X and send it" as deterministic scheduler logic. The
scheduled time should wake or invoke the bound agent, and the agent should make
the content decision inside the same mission/run and tool-supervision model as
other agent work.

Earlier discussion raised a tempting but wrong shape:

```text
ScheduledCompanionMission
```

That does not scale. There will be many scheduled missions across Chat, Work,
Code, Companion, Telegram, LINE, memory, content, and operations. Creating one
mission class per product behavior would recreate the same brittle taxonomy
problem ADR-063 avoided.

The current vocabulary already separates:

- `Schedule / Trigger`: how work starts
- `Mission`: delegated agent work
- `Run`: one execution attempt
- `Task`: execution/planning object when the work should become operator-visible
- `Transport Binding`: stable external transport identity

The missing piece is connecting scheduler rules into that mission/run
infrastructure.

## Decision

Cats will model scheduled automation as **generic schedule rules** that create
or activate generic mission/run execution. Schedule rules are launch
conditions, not product-specific mission subclasses.

### 1. A schedule rule is a launch rule, not a task or mission class

A schedule rule records when and under what constraints the platform should
launch work. It does not become a peer of `Task`, `Mission`, or `Run`.

The canonical flow is:

```text
ScheduleRule due time
  -> TriggerEvent with idempotency key
  -> Mission instance or existing mission activation
  -> Run admitted by the execution dispatcher with scheduleTrigger metadata
  -> supervised runtime/tool execution
  -> product/transport/materialization outcomes
```

The scheduler may record a platform-owned trigger receipt for audit and
idempotency, but the trigger event is not a new Core object family beside
Task/Mission/Run. The canonical Core-side provenance for an admitted scheduled
run is `CoreRunRecord.metadata.scheduleTrigger`; SPEC-094 owns the concrete
shape.

### 2. Use generic mission templates, not companion-specific mission classes

A schedule rule may reference a mission template. The template describes:

- the target agent or Cat
- the owner intent
- the product surface
- resource/tool/transport scopes
- optional conversation or transport targets
- safety, concurrency, retry, and misfire policies

The same schedule-rule mechanism must support:

- a companion morning greeting
- a Work status review
- a Code nightly dependency check
- a memory flush
- a Telegram digest
- a future LINE notification

None of those require a dedicated class such as
`ScheduledCompanionMission`, `ScheduledCodeMission`, or
`ScheduledTelegramMission`.

### 3. The agent decides content and actions inside bounded capabilities

For the morning greeting example, the schedule rule should say:

- fire daily at 08:00 in the owner's chosen timezone
- invoke a specific Cat/agent
- provide access to allowed companion resources
- provide the allowed Telegram delivery or share-link tool
- state the high-level intent: greet the owner and choose appropriate content

It should not say:

- pick the first image
- always send a direct image instead of a link
- never post first
- apply a fixed image-processing recipe

Those are agent decisions unless policy, user configuration, or missing
capabilities constrain them.

### 4. Scheduler execution stays behind supervision and transport boundaries

Scheduled runs must use the same supervised runtime/tool boundary as
interactive Chat, Work, and Code execution.

Scheduled execution must not:

- call `RuntimeClient.sendMessage` directly from a timer loop
- bypass ADR-082 policy-dial supervision
- write directly to Telegram delivery clients from scheduler code
- invent product-local resource selection logic that replaces the agent

The scheduler creates the trigger and enters the execution dispatcher. Runtime
calls, tool use, content access, posting, and transport delivery stay behind
their existing supervised platform surfaces.

### 5. Heartbeat is not a prerequisite for schedule rules

Heartbeat can be useful later for liveness monitoring, lease recovery, or
long-running scheduler diagnostics. It is not required before schedule rules
exist.

For the first implementation, the platform can run a local scheduler service
that computes due rules from persisted state while Cats is running, records
idempotency keys, and handles missed fires on startup according to each rule's
misfire policy.

Desktop-local scheduled work has one explicit limitation: if Cats is not
running, the in-process scheduler cannot fire. OS-level scheduled launch,
background service mode, and remote scheduler wakeup are separate future
decisions.

### 6. Scheduled work may materialize into Work only when operator-visible

A scheduled mission should not automatically create a Work task. Following
ADR-063, only work that is operator-visible, manageable, prioritizable, or
approvable should materialize into Work.

A companion greeting generally remains a mission/run plus chat/transport
outcome. A scheduled compliance review that requires owner approval may
materialize a Task or Approval.

## Consequences

### Positive

- Schedule support fits existing Mission/Run vocabulary instead of creating
  product-specific mission classes.
- Companions and future agents keep agency over resource selection, content
  creation, posting, and transport choices.
- Scheduler logic stays small: due-time calculation, idempotency,
  concurrency, misfire handling, and dispatch admission.
- Chat, Work, Code, Companion, and transports can share one scheduling
  contract.
- ADR-082 supervision evidence remains available for scheduled execution.

### Negative

- The first scheduled feature requires enough mission/run dispatch
  infrastructure to admit non-interactive runs.
- The agent needs explicit tool/resource surfaces for actions such as resource
  lookup, post creation, and Telegram delivery.
- Users may need schedule diagnostics because the app must distinguish "Cats
  was closed", "rule skipped by policy", "agent failed", and "transport
  delivery failed".

### Neutral

- Schedule rules may be stored as platform-owned configuration before a full
  Work-facing scheduler UI exists.
- A schedule rule can target a conversational Cat, an operational agent, or a
  hybrid agent without changing the rule model.

## Alternatives Considered

### Alternative 1: Create one class per scheduled product behavior

- **Pros**: simple for the first morning-greeting example
- **Cons**: does not scale beyond one behavior and pushes product meaning into
  code inheritance/class names
- **Why rejected**: scheduled work should compose ScheduleRule + Mission +
  Run, not a growing set of product-specific mission subclasses

### Alternative 2: Let the scheduler perform deterministic app-side actions

- **Pros**: easy to test and predictable for simple automations
- **Cons**: removes the agent's decision-making role and duplicates resource,
  content, and transport logic outside the supervised agent/tool surface
- **Why rejected**: the motivating feature explicitly expects the Cat to choose
  content and decide how to deliver it inside bounded capabilities

### Alternative 3: Require heartbeat before any scheduling

- **Pros**: can provide richer liveness and missed-fire observability
- **Cons**: delays useful scheduling behind a broader infrastructure problem
- **Why rejected**: basic schedule-rule dispatch only needs persisted rules,
  due-time calculation, idempotency, and startup misfire handling

### Alternative 4: Use external cron to call runtime directly

- **Pros**: avoids building a scheduler loop inside Cats
- **Cons**: bypasses Cats identity, mission/run provenance, supervision,
  product storage, and transport binding logic
- **Why rejected**: scheduled Cats work must remain product-owned and auditable

## References

- [ADR-063: Separate managed work, agent missions, execution runs, and transport bindings](./063-agent-missions-and-transport-bindings.md)
- [ADR-082: Recast the orchestrator as a capability shell with policy-dial supervision](./082-recast-orchestrator-as-capability-shell-with-policy-dial-supervision.md)
- [SPEC-062: Agent Missions, Managed Work, and Transport Bindings](../specs/SPEC-062-agent-missions-and-transport-bindings.md)
- [SPEC-094: Schedule Rules and Mission Triggers](../specs/SPEC-094-schedule-rules-and-mission-triggers.md)
- [PLAN-083: Schedule Rules and Mission Trigger Rollout](../plans/PLAN-083-schedule-rules-and-mission-trigger-rollout.md)

---

*Decision proposed: 2026-04-29*
*Decision makers: User, Codex*
