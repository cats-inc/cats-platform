# ADR-112: Adopt a Core-Owned Transport Work Delivery Golden Path

> Make Cats Core the durable ledger for work that enters through Telegram or
> another transport, while transports remain ingress, decision, notification,
> and receipt surfaces.

## Status

Proposed

## Date

2026-09-02

## Context

Cats Desktop and Telegram already implement several individually useful parts
of a work-delivery flow:

- Telegram bindings receive messages, route them to a Cat's private lane, and
  return ordinary assistant replies.
- product-intent intake can capture a durable Work Item from `/work` or a
  confirmed natural-language proposal.
- phase-scoped Work tools can triage a ready Work Item and create a
  pending-approval Task.
- the Work product can approve a Task and start a supervised Run.
- supervision contracts represent queued, running, waiting, blocked, failed,
  cancelled, and completed execution states.
- delivery policy defines artifact, commit, push, pull-request, and preview
  modes together with approval gates.
- Code artifact declarations can materialize durable Artifacts with explicit
  provenance and publish rules.

Those parts do not yet form one user-owned delivery loop. A Telegram owner can
talk to a Cat and capture work, but must discover the Work UI, approve a Task,
start a Run separately, monitor it elsewhere, and then infer whether a runtime
response is an actual deliverable. Progress, decisions, result previews,
publication, and final delivery receipts do not reliably return to the source
binding.

The missing seam is architectural, not merely a new Telegram command. One
component must own the durable truth from request through delivery, while the
transport, product, supervisor, and runtime each retain their existing
boundaries. Adding a second agent ledger such as Beads would duplicate Work
Items, Tasks, Runs, Approvals, Artifacts, Outcomes, and Activities and would
introduce reconciliation before the product has one complete path over its
current records.

## Decision

Adopt one Core-owned golden path for transport-originated work:

```text
Telegram request
  -> persisted intake and scoped proposal
  -> explicit execution authorization
  -> Task admission and supervised Run
  -> milestone / decision updates
  -> result preview and evidence
  -> publish authorization when policy requires it
  -> delivery to the source binding with a durable receipt
```

The first product slice is specified by
[SPEC-114](../specs/SPEC-114-telegram-work-delivery-golden-path.md). The
architecture follows these rules.

### 1. Cats Core is the work ledger

Work Items, Tasks, Missions, Runs, Approvals, Outcomes, Artifacts, Activities,
and their links remain the authoritative records. The golden path may add
versioned metadata, Activities, projections, and a transport outbox, but it
does not introduce another authoritative job or agent-ledger record family by
default.

A new Core record family requires a later ADR with evidence that the current
record graph cannot express a required invariant. Beads or a similar external
ledger is not part of this path.

### 2. The end-to-end stage is a projection

Cats shall expose a user-facing golden-path stage derived from authoritative
records and transport delivery state. The conceptual stages are:

| Stage | Authoritative evidence |
|-------|------------------------|
| `received` | source update accepted idempotently and a durable intake anchor exists |
| `scope_proposed` | versioned goal, target, acceptance criteria, and delivery intent are visible |
| `execution_authorized` | the owner approved that exact proposal revision |
| `admitted` | an approved Task and queued supervised Run exist |
| `running` | the supervised Run is active |
| `decision_needed` | an unresolved approval, blocker, or owner question gates progress |
| `result_ready` | the Run has outcome evidence and ready Artifact or equivalent delivery evidence |
| `publish_authorized` | required delivery gates have been satisfied |
| `delivered` | the result was sent to the source binding and a receipt was persisted |
| `failed` / `cancelled` | authoritative terminal state and reason exist |

This stage is not a second state machine that can diverge from Core. It is a
projection with explicit derivation rules. `decision_needed` can return to
`running`, and a delivery failure can leave work at `result_ready` until retry
succeeds.

### 3. Explicit owner events cross irreversible boundaries

The scope proposal must make the goal, project/workspace, acceptance criteria,
delivery mode, and material side effects visible before execution.

An execution confirmation is a later explicit owner event. It may
idempotently materialize the already-visible proposal as an approved Task and
request its supervised Run in one product command. This preserves the existing
rule that intake must not create and execute work in the same assistant action
or owner message. It also removes the accidental requirement for a second
Desktop-only "Start Run" click after Telegram has already authorized the
versioned scope.

Execution authorization does not silently waive delivery governance. A
separate publish authorization is required whenever the effective
`CoreDeliveryGate` or a newly discovered material side effect requires one.
Policy may pre-authorize a delivery action only when that action was explicit
in the approved scope and no effective gate requires another review.

### 4. Product and platform layers own orchestration

Responsibilities remain separated as follows:

| Layer | Owns | Must not own |
|-------|------|--------------|
| Telegram transport | update/callback ingress, Telegram API delivery, binding-local idempotency, external message receipts | Work lifecycle truth or execution policy |
| Chat / Work products | intent capture, proposal UX, authorization commands, Work projections, owner-visible controls | provider process mechanics or a hidden parallel task store |
| Cats Core | durable work graph, approvals, policy, provenance, outcomes, artifacts, activities | Telegram API details or provider-specific execution |
| Cats platform supervision | admission, scheduler/run lifecycle, checkpoints, retries, blockers, evidence | semantic ownership of the user's goal or transport identity |
| `cats-runtime` | runtime sessions, model/tool execution, capability and execution results | product approval policy, final completion judgment, or delivery governance |

The transport callback handler must call a product-owned authorization command;
it must not mutate Task or Run records directly.

### 5. Transport ingress and execution are asynchronous

Telegram polling or webhook handling may wait for bounded validation,
idempotent persistence, and an acknowledgement. It must not remain blocked for
the lifetime of model execution. Long work resumes through durable scheduler,
run, activity, and outbox state.

Progress notifications are milestone-based and coalesced. Token streaming is
not a transport progress protocol. Decision requests and terminal results may
bypass routine progress coalescing.

### 6. Source provenance and delivery receipts close the loop

The originating binding, external chat, update/message, conversation, Work
Item, Task, Run, Outcome, Artifact, and delivery attempt must remain
traceable. Secrets such as bot tokens are never copied into Core metadata.

Completion and delivery are distinct:

- a runtime response means that an execution step returned;
- a completed Run means Cats accepted terminal execution evidence;
- `result_ready` means an owner-visible result can be reviewed;
- `delivered` means the result reached the source binding and Cats persisted
  the Telegram response or a classified delivery failure.

Transport retries use stable idempotency keys. Duplicate Telegram updates or
callback queries must not create duplicate Work Items, Tasks, Runs, publish
actions, or final messages.

### 7. The initial slice is intentionally narrow

The first acceptance path covers:

- one authorized owner in a direct Telegram bot chat;
- one bound Cat with a usable provider/model and capability profile;
- a text `/work` request, with confirmed natural-language proposals joining
  the same path after intake;
- one selected project/workspace;
- `artifact_only` and `commit_only` delivery as the required proof modes;
- milestone, decision, result, and receipt messages returned to Telegram;
- a Desktop deep link for inspection and recovery.

Group-chat policy, inbound attachment ingestion, arbitrary multi-agent
delegation, LINE parity, host wake-from-sleep, and automatic external publish
are follow-up slices. Higher-side-effect delivery modes may reuse the contract
only after their existing gates are enforced end to end.

## Consequences

### Positive

- A Telegram owner can delegate and receive a result without manually stitching
  together Chat, Work, and Runtime screens.
- Existing Core records become operationally useful before another ledger or
  reconciliation layer is introduced.
- Intake separation and publish gates remain explicit while redundant UI
  approvals are removed.
- Every transport update can be explained from durable work, execution,
  evidence, and delivery records.
- Telegram becomes one client of a reusable transport-originated work contract,
  not a separate task system.

### Negative

- Cross-product orchestration and projection code must coordinate several
  existing record families.
- A durable transport outbox and recovery behavior add lifecycle complexity.
- Desktop background-service availability remains a real constraint for a
  local-first Telegram binding.
- Existing UI and API paths that treat approval and Run start as unrelated
  actions must gain a bounded combined authorization command.

### Neutral

- This decision does not make Telegram the canonical Work UI.
- This decision does not permit an agent to self-approve execution or publish
  actions.
- This decision does not require all delivery modes in the first release.
- This decision does not declare a Run complete solely because a provider
  produced a final assistant message.

## Alternatives Considered

### Alternative 1: Keep the Desktop handoff as the delivery workflow

- **Pros**: smallest immediate implementation change
- **Cons**: Telegram remains an intake relay; owners must discover and operate
  several unrelated controls, and no source-binding receipt closes the loop
- **Why rejected**: it does not satisfy transport-originated delegation

### Alternative 2: Make Telegram a complete parallel Work client

- **Pros**: every Work control could eventually be exposed in Telegram
- **Cons**: duplicates product semantics in callback handlers and makes a chat
  transport responsible for a large administrative UI
- **Why rejected**: the golden path needs a small decision surface, not a
  second Work application

### Alternative 3: Let `cats-runtime` own the job lifecycle

- **Pros**: execution and continuation would live near provider sessions
- **Cons**: runtime would have to own owner approvals, product policy,
  transport identity, artifacts, and delivery semantics
- **Why rejected**: these are Cats product/control-plane responsibilities

### Alternative 4: Introduce Beads as the shared agent ledger now

- **Pros**: could provide an agent-oriented issue graph and coordination
  vocabulary
- **Cons**: duplicates current Work/Task/Run state, requires bidirectional
  reconciliation, and does not itself solve Telegram authorization, runtime
  supervision, artifact publication, or delivery receipts
- **Why rejected**: complete one Core-owned path first; revisit only with a
  concrete coordination gap and migration contract

### Alternative 5: Treat the first execution approval as permission to publish everything

- **Pros**: fewer owner interactions
- **Cons**: hides side effects discovered during execution and bypasses
  existing delivery gates
- **Why rejected**: execution and publication have different risk boundaries

## References

- [ADR-016: Treat Telegram as Boss Cat Inbox, Not Room Mirror](./016-treat-telegram-as-boss-cat-inbox-not-room-mirror.md)
- [ADR-022: Own Chat Delivery Policy in Product](./022-own-chat-delivery-policy-in-product.md)
- [ADR-082: Recast the Orchestrator as a Capability Shell with Policy-Dial Supervision](./082-recast-orchestrator-as-capability-shell-with-policy-dial-supervision.md)
- [ADR-101: Use the Direct-Audience Cat for Slash-Mode Work Intake](./101-use-direct-audience-cat-for-slash-mode-work-intake.md)
- [ADR-103: Use Preset-Neutral Product Intent Intake](./103-use-preset-neutral-product-intent-intake.md)
- [ADR-105: Adopt a Phase-Scoped Work Tool Surface](./105-adopt-phase-scoped-work-tool-surface.md)
- [SPEC-024: Chat Delivery Policy and Governance Levels](../specs/SPEC-024-chat-delivery-policy-and-governance-levels.md)
- [SPEC-082: Cats Work Agent Supervision and Tool Boundary](../specs/SPEC-082-cats-work-agent-supervision-and-tool-boundary.md)
- [SPEC-092: Code Artifact Declaration Contract](../specs/SPEC-092-code-artifact-declaration-contract.md)
- [SPEC-107: Preset-Neutral Product Intent Intake](../specs/SPEC-107-preset-neutral-product-intent-intake.md)
- [SPEC-109: Phase-Scoped Work Tool Surface](../specs/SPEC-109-phase-scoped-work-tool-surface.md)
- [SPEC-114: Telegram Work Delivery Golden Path](../specs/SPEC-114-telegram-work-delivery-golden-path.md)

---

*Decision proposed: 2026-09-02*

*Decision makers: Owner direction + Codex*

*Last updated: 2026-09-02*
