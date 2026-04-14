# ADR-063: Separate Managed Work, Agent Missions, Execution Runs, and Transport Bindings

> Freeze one shared vocabulary for operator-managed work, agent-delegated
> missions, execution attempts, schedules, and external transport bindings so
> Chat, Work, Code, Companion, and Telegram flows do not collapse into one
> overloaded `task/job/session` model.

## Status

Proposed

## Context

The current re-architecture already freezes the interaction core as:

- `Container`
- `Conversation`
- `Turn`
- `Lane`
- `Segment`
- `Session`

That solves transcript and turn/lane identity problems, but it does not yet
fully solve two adjacent vocabulary gaps.

### Gap 1: `task`, `job`, and `run` still overlap

The product now needs to support more than visible chat participants.

Future Cats surfaces include:

- runtime-backed coding agents
- peer-review assistants
- Guide Cat assists
- Companion-style offline helpers
- scheduled/background automations
- transport-facing orchestrators such as Telegram-bound Cats

Those agents do real work, but not every piece of agent work should become a
user-managed `Work` task.

Without a stricter vocabulary, the platform will keep conflating:

- operator-managed work items
- delegated agent assignments
- one-off execution attempts
- cron/event triggers

That would make Work noisy, Code ambiguous, and replay/audit trails difficult
to trust.

### Gap 2: external transport identity can still be conflated with conversations or sessions

Telegram direct-lane support must remain compatible with the unified engine.

That only works if the product does **not** collapse:

- Telegram bot binding identity
- Telegram thread identity
- product conversation identity
- runtime session identity

into a single concept.

The platform therefore needs one more explicit layer around the interaction
core: `Transport Binding`.

## Decision

The platform should separate five concepts clearly:

1. `Managed Work`
2. `Mission`
3. `Run`
4. `Schedule / Trigger`
5. `Transport Binding`

### 1. `Entity`, `Agent`, and `Participant` are different concepts

The product should distinguish:

- `Entity`
  - a reusable identity record
- `Agent`
  - an execution-capable entity that can chat, run tools, or perform
    background work
- `Participant`
  - one entity/agent's membership in one conversation context

This keeps reusable identity separate from conversation membership and runtime
execution.

### 2. `Cat`, `Boss Cat`, `Guide Cat`, and `Companion` are product projections or capabilities, not new core engine types

The product may keep user-facing terms such as:

- `Cat`
- `Boss Cat`
- `Guide Cat`
- `Companion`

But these must be modeled as product projections or capability postures over
`Entity`/`Agent`, not as alternate interaction-engine topologies.

That means:

- `Boss Cat` remains an optional coordinator capability
- `Guide Cat` remains an optional surface-assist capability
- `Companion` remains an agent-powered companion capability that may speak in
  direct lanes and may also perform background work

None of those concepts redefine `Conversation`, `Turn`, `Lane`, or `Session`.

### 3. `Managed Work` is the operator-facing, durable planning surface

`Managed Work` is the family of records the owner/operator explicitly tracks and
manages, such as:

- `Goal`
- `Project`
- `Requirement`
- `Backlog Item`
- `Issue`
- `Task`
- `Approval`

These belong to the Work-facing planning domain, even when they are created or
edited from Chat or Code.

### 4. `Mission` is an agent-delegated work unit, not automatically a Work task

A `Mission` is the delegated assignment given to one or more agents.

It bridges:

- operator intent
- conversation/materialization context
- runtime execution

One managed-work record may produce many missions.
One mission may exist without a managed-work record when it is purely internal,
background, or ephemeral.

Examples:

- a peer reviewer asked to inspect a branch
- Guide Cat asked to generate composer prompt chips
- Companion asked to triage yesterday's photos
- Telegram-bound Boss Cat asked to summarize one room for transport reply

### 5. `Run` is one execution attempt

A `Run` is one concrete execution attempt for a mission.

Examples:

- one CLI/model session
- one tool invocation batch
- one test/build attempt
- one retry after failure

`Run` is not the same thing as:

- managed work
- mission
- conversation lane identity

### 6. `Schedule / Trigger` is how work starts, not what the work is

A `Schedule` or `Trigger` is a launch condition, such as:

- cron
- webhook
- transport ingress
- owner click
- workflow continuation

Schedules create or activate missions. They do not replace missions or tasks.

### 7. Not every mission or run should materialize into Work

Only work that is meaningfully operator-visible, manageable, prioritizable, or
approvable should materialize into `Managed Work`.

Internal helper activity should usually remain:

- mission records
- run records
- audit/provenance records

without polluting the Work backlog.

### 8. `Transport Binding` sits outside the interaction core

`Transport Binding` is the product-owned relation between an external transport
thread/account and a canonical Cats conversation entry path.

Examples:

- one Telegram DM thread bound to one Cat-owned direct lane
- one LINE conversation bound to one orchestrator entry path

`Transport Binding` is distinct from:

- `Bot Binding`
  - static configuration for a transport-owned bot identity and policy
- `Conversation`
  - the canonical Cats interaction boundary
- `Session`
  - one runtime attachment generation

### 9. Telegram-compatible direct lanes must map through transport bindings, not sessions

For transport-bound direct lanes:

- a Telegram thread binds to one canonical direct-lane conversation through a
  transport binding
- each inbound Telegram message creates or continues a `Turn` in that
  conversation
- runtime `Session` remains ephemeral and replaceable

This preserves Telegram compatibility without giving transports their own
competing conversation model.

### 10. Canonical ownership must stay explicit across Chat, Work, and Code

The platform should preserve this ownership split:

- `Chat`
  - interaction state, transcript projection, transport entry context
- `Work`
  - managed-work records and operator planning views
- `Code`
  - implementation artifacts, execution profiles, workspace/repo context,
    previews, reviews, and code-facing projections
- shared interaction/materialization/core layers
  - missions, runs, schedules, provenance, and cross-product linkage

## Consequences

### Positive

- Work backlog stays meaningful instead of absorbing every helper action
- Companion, Guide Cat, and future automation agents get a clean execution
  vocabulary
- Code can distinguish durable tasks from transient execution attempts
- Telegram/direct-lane semantics stay compatible with the unified engine
- provenance becomes easier to query and explain across products

### Negative

- existing docs and APIs that say `task` or `job` loosely will need follow-up
  tightening
- some currently shared records may need clearer separation between
  operator-facing work and lower-level execution traces
- transport surfaces need more explicit binding models than before

### Neutral

- user-facing labels such as `Cat`, `Boss Cat`, `Guide Cat`, and `Companion`
  may remain
- some products may still expose lightweight task-like language in UI copy,
  provided canonical storage and provenance use the new vocabulary correctly

## Alternatives Considered

### Alternative 1: Put every agent assignment into Work

- **Pros**: fewer concepts; everything appears on one board
- **Cons**: Work becomes unreadable and noisy; internal helper loops overwhelm
  operator-managed planning
- **Why rejected**: operator-managed work and internal agent execution are not
  the same thing

### Alternative 2: Treat `job` as the one canonical execution term

- **Pros**: familiar from runtime and queue systems
- **Cons**: overloaded across cron jobs, coding jobs, background jobs, and
  user-facing tasks
- **Why rejected**: the term is too ambiguous for cross-product planning and
  audit use

### Alternative 3: Let Telegram threads behave like runtime sessions

- **Pros**: appears close to provider/runtime behavior
- **Cons**: transport identity, conversation identity, and session identity
- **Why rejected**: this would reintroduce the same class of identity bugs the
  unified engine is intended to remove

## References

- [ADR-059](./059-adopt-a-unified-conversation-turn-lane-engine.md)
- [ADR-061](./061-treat-guide-cat-as-an-optional-surface-assist-capability.md)
- [ADR-062](./062-separate-concurrent-turn-fan-out-from-parallel-container-composition.md)
- [SPEC-017](../specs/SPEC-017-telegram-inbox-and-room-routing.md)
- [SPEC-018](../specs/SPEC-018-direct-cat-chat-and-conversation-routing-layer.md)
- [SPEC-029](../specs/SPEC-029-companion-boxes-ingestion-and-response-profiles.md)
- [SPEC-058](../specs/SPEC-058-interaction-core-and-domain-materialization.md)

---

*Proposed: 2026-04-14*
*Proposed by: Codex*
