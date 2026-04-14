# SPEC-062: Agent Missions, Managed Work, and Transport Bindings

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Draft |
| **Owner** | Codex |
| **Reviewer** | User |
| **Related ADR** | [ADR-063](../decisions/063-agent-missions-and-transport-bindings.md) |

## Summary

`Cats` now has one shared interaction engine and one shared materialization
seam, but the platform still needs a stable vocabulary for agent execution and
external entry.

This spec defines that vocabulary.

It freezes:

- `Entity`, `Agent`, and `Participant`
- `Managed Work`
- `Mission`
- `Run`
- `Schedule / Trigger`
- `Transport Binding`

It also defines how those concepts should project across `Chat`, `Work`,
`Code`, `Companion`, and transport-bound direct lanes such as Telegram.

## Goals

- keep operator-managed work distinct from internal agent execution
- let Guide Cat, Companion, Boss Cat, coding agents, and scheduled helpers use
  one execution vocabulary
- preserve direct-lane and Telegram compatibility with the unified
  conversation-turn-lane engine
- define clear ownership boundaries for Chat, Work, Code, and shared execution
  records
- avoid reusing `task`, `job`, or `session` as ambiguous umbrella terms

## Non-Goals

- defining every future Work board field or Code database table
- replacing existing product-facing names such as `Cat` or `Boss Cat`
- designing every Telegram or Companion UI surface in this document
- requiring every background helper action to appear on a user-facing board

## Problem Statement

As Cats adds richer agents, two problems become unavoidable.

First, the product needs many classes of agent work:

- background Companion analysis
- Guide Cat suggestions
- Telegram summarization
- coding, testing, and review loops
- future scheduled automations

If all of that is called `task`, the Work backlog becomes useless.
If all of it is called `job`, the term becomes too ambiguous to reason about.

Second, external transports such as Telegram must map into the same direct-lane
engine without collapsing transport identity into conversation or runtime
identity.

The platform therefore needs one vocabulary that all products and transports
share.

## User Stories

- As an owner, I want my Work backlog to show the things I actually manage, not
  every hidden helper step.
- As a developer, I want to tell the difference between a durable task, an
  agent assignment, and a retry run.
- As a Companion user, I want background photo triage and memory extraction to
  happen without turning every sweep into a visible Work task.
- As a Telegram user, I want to message one Cat-bound bot and have that message
  continue the right direct lane without tying transport state to one runtime
  session.

## Requirements

### Functional Requirements

1. The platform shall distinguish these identity layers:
   - `Entity`
   - `Agent`
   - `Participant`
2. `Entity` shall mean the reusable identity record.
3. `Agent` shall mean an execution-capable entity that can speak, reason, run
   tools, or perform background work.
4. `Participant` shall mean one entity/agent's membership inside one
   conversation context.
5. Product-facing labels such as `Cat`, `Boss Cat`, `Guide Cat`, and
   `Companion` may remain as projections or capability postures over
   `Entity`/`Agent`.
6. The platform shall distinguish these work/execution layers:
   - `Managed Work`
   - `Mission`
   - `Run`
   - `Schedule / Trigger`
7. `Managed Work` shall mean operator-visible durable planning records, such as:
   - `Goal`
   - `Project`
   - `Requirement`
   - `Backlog Item`
   - `Issue`
   - `Task`
   - `Approval`
8. `Mission` shall mean an agent-delegated work unit that bridges managed work,
   interaction context, and execution.
9. `Run` shall mean one concrete execution attempt for a mission.
10. `Schedule / Trigger` shall mean the launch condition for missions, such as:
    - cron
    - webhook
    - transport ingress
    - owner action
    - workflow continuation
11. A mission may link to zero or more managed-work records.
12. The platform shall not require every mission to materialize into
    operator-visible managed work.
13. The platform shall only materialize missions into Work-facing records when
    the work is meaningfully:
    - operator-visible
    - manageable
    - prioritizable
    - approvable
14. Agent-internal or background activity may remain mission/run records only.
15. The platform shall define `Transport Binding` as the product-owned relation
    between an external transport thread/account and one canonical Cats
    conversation entry path.
16. `Transport Binding` shall remain distinct from:
    - `Bot Binding`
    - `Conversation`
    - `Session`
17. Telegram and similar transport entrypoints shall map inbound messages into
    canonical Cats turns through a transport binding rather than by treating
    the transport thread as a runtime session.
18. For a transport-bound direct lane:
    - the transport binding shall identify the canonical direct-lane
      conversation
    - each inbound transport message shall create or continue a turn in that
      conversation
    - runtime sessions shall remain replaceable execution attachments
19. The materialization layer shall preserve provenance between:
    - conversation/turn/lane context
    - mission
    - run
    - linked managed work when applicable
20. The platform shall allow one managed-work record to produce many missions
    and many runs over time.
21. The platform shall allow one mission to be retried or resumed across many
    runs without changing the mission identity.
22. Companion-style offline processing shall be modeled as missions and runs by
    default.
23. Companion outcomes shall only materialize into Work-facing tasks or review
    inbox items when the operator must explicitly inspect, approve, or act on
    them.
24. `Cats Work` shall remain the canonical planning surface for managed work.
25. `Cats Code` shall remain the canonical surface for code-facing artifacts,
    execution profiles, workspace context, and code-oriented projections.
26. `Cats Chat` shall remain the canonical interaction and transport-entry
    surface.
27. The platform shall support linked presentation of the same canonical record
    across Chat, Work, and Code without duplicating identity.
28. The canonical vocabulary shall prefer `mission` and `run` over overloaded
    uses of `job` in new product docs and contracts.

### Non-Functional Requirements

- **Vocabulary clarity**: Chat, Work, Code, Companion, and transport docs must
  use the same terms consistently.
- **Identity separation**: transport, conversation, lane, mission, run, and
  session identity must remain distinguishable.
- **Projection safety**: Work must not become a mirror of low-level execution
  noise.
- **Transport compatibility**: Telegram and future transport flows must remain
  compatible with the unified conversation-turn-lane engine.
- **Extensibility**: future agents and schedules must fit the same vocabulary
  without another core re-architecture.

## Design Overview

### Canonical Model Split

```text
Transport / Automation
  Transport Binding
  Schedule / Trigger

Interaction Core
  Container -> Conversation -> Turn -> Lane -> Segment -> Session

Execution / Materialization
  Managed Work -> Mission -> Run -> Artifacts / Approvals / References
```

### Ownership Model

- `Chat`
  - conversation, turn, lane, transcript, transport entry
- `Work`
  - managed work records and operator planning views
- `Code`
  - implementation artifacts, execution profiles, code-facing workflows
- shared/core/platform layers
  - transport bindings, missions, runs, schedules, provenance

### Presentation Rules

- `Chat`
  - may show linked work/task cards, mission status, and run summaries
- `Work`
  - should emphasize goals, requirements, issues, tasks, approvals, and linked
    downstream activity
- `Code`
  - should emphasize workspace, execution profile, artifacts, review, preview,
    and run state
- background helpers such as Companion
  - should remain mostly invisible unless they produce operator-actionable
    results

## Boundaries

### What belongs in managed work

- things the operator plans, prioritizes, approves, assigns, or tracks

### What belongs in missions and runs

- delegated agent work
- background processing
- retries
- tool/test/build execution
- transport summarization or automation steps

### What must not happen

- every agent action becoming a Work task
- Telegram thread ids becoming conversation ids
- runtime session ids becoming direct-lane identity
- `job` remaining the only canonical execution noun in new product contracts

## Dependencies

- [ADR-059](../decisions/059-adopt-a-unified-conversation-turn-lane-engine.md)
- [ADR-061](../decisions/061-treat-guide-cat-as-an-optional-surface-assist-capability.md)
- [ADR-062](../decisions/062-separate-concurrent-turn-fan-out-from-parallel-container-composition.md)
- [ADR-063](../decisions/063-agent-missions-and-transport-bindings.md)
- [SPEC-017](./SPEC-017-telegram-inbox-and-room-routing.md)
- [SPEC-018](./SPEC-018-direct-cat-chat-and-conversation-routing-layer.md)
- [SPEC-029](./SPEC-029-companion-boxes-ingestion-and-response-profiles.md)
- [SPEC-040](./SPEC-040-cats-work-team-templates-and-work-intake.md)
- [SPEC-041](./SPEC-041-cats-code-v1-local-builder-loop.md)
- [SPEC-058](./SPEC-058-interaction-core-and-domain-materialization.md)

## Open Questions

- [ ] Which first shared record shape should own missions and runs:
      shared core, platform orchestration store, or a hybrid projection?
- [ ] How much schedule metadata should be product-visible in the first slice
      for background automations?
- [ ] Whether `Bot Binding` and `Transport Binding` should stay distinct record
      families in first-slice storage or share a common envelope with different
      subtypes.

## References

- [ADR-063](../decisions/063-agent-missions-and-transport-bindings.md)
- [SPEC-058](./SPEC-058-interaction-core-and-domain-materialization.md)
- [Architecture](../architecture.md)
- [terminology.md](../terminology.md)

---

*Created: 2026-04-14*
*Author: Codex*
*Related Plan: [PLAN-054](../plans/PLAN-054-agent-missions-managed-work-and-transport-bindings.md)*
