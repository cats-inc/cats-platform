# SPEC-058: Interaction Core and Domain Materialization

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Draft |
| **Owner** | Codex |
| **Reviewer** | User |
| **Related ADR** | [ADR-059](../decisions/059-adopt-a-unified-conversation-turn-lane-engine.md) |

## Summary

`Cats` is AI-first. That does not mean every product becomes "just chat" or
that `Code` and `Work` are only collections of chat rooms.

It means the platform should treat conversation turns as the primary interaction
substrate through which structured domain state is created, refined, and linked
over time.

This spec defines that relationship explicitly:

- `Chat` owns the shared interaction engine
- `Code` and `Work` own product-specific domain projections and workflows
- turns and lanes may emit structured mutations and artifacts, not only
  transcript text
- not every agent mission or run becomes operator-visible managed work
- external transports contribute context through transport bindings, not by
  redefining conversations or sessions
- domain state must preserve provenance back to the originating conversation
  flow
- future Code/Work schemas must build on this materialization seam rather than
  bolt a second parallel execution model on top of Chat

## Goals

- define how chat-native interaction materializes into structured product state
- ensure the unified turn/lane engine can support `Chat`, `Code`, and `Work`
- prevent future product slices from inventing separate conversation semantics
- establish a minimum contract for artifacts, entities, mutations, provenance,
  and projections
- allow `Code` and `Work` to grow richer schemas without re-architecting the
  interaction core again

## Non-Goals

- defining the full final `Cats Code` database schema
- defining the full final `Cats Work` operating schema
- replacing product-native dashboards with transcript-only interfaces
- specifying every UI component for artifact display or approval handling
- forcing all structured state to be authored exclusively by automated turns

## Problem Statement

The platform is already moving toward a shared conversation-turn-lane engine,
but `Code` and `Work` need more than transcript correctness.

They need durable, structured state such as:

- goals
- projects
- requirements
- backlog items
- tasks
- issues
- specs
- plans
- code changes
- test runs
- approvals
- workspace and resource links
- operational records for a one-person company

In an AI-first product, much of that state is not entered through dedicated
forms first. It is progressively discovered, proposed, negotiated, and refined
through conversation turns.

If the architecture stops at transcript delivery, later product work will be
forced to:

- scrape transcripts to reconstruct state
- build side-channel state machines unrelated to turns and lanes
- duplicate provenance and approval logic in product-specific hacks
- re-open the Chat core architecture to add missing seams

The platform needs a first-class materialization layer that sits next to the
interaction core and turns conversation outcomes into durable structured state.

The platform also needs one shared vocabulary for how agents execute work:

- `Managed Work`
  - durable operator-visible planning state
- `Mission`
  - delegated agent work bridging intent into execution
- `Run`
  - one execution attempt
- `Schedule / Trigger`
  - what launches a mission or run
- `Transport Binding`
  - the product-owned relation between an external thread/account and a
    canonical Cats entry path

## User Stories

- As an owner, I want a conversation to create or refine a task, spec, issue,
  or code artifact without losing traceability back to who said what and why.
- As a `Cats Code` operator, I want chat-driven coding activity to produce
  durable code-task, file, test, and review records instead of only transcript
  text.
- As a `Cats Work` operator, I want planning and execution conversations to
  materialize projects, work items, approvals, and outputs that survive beyond
  the transcript.
- As a maintainer, I want one provenance model across Chat/Code/Work instead of
  three unrelated audit trails.

## Requirements

### Functional Requirements

1. The unified interaction core shall remain the canonical source of
   conversational execution state:
   - `Container`
   - `Conversation`
   - `Turn`
   - `Lane`
   - `Segment`
   - `Session`
2. The platform shall define a separate but connected materialization layer for
   structured domain state.
3. A turn or lane may produce zero or more structured outputs in addition to
   transcript segments.
4. Structured outputs shall support at least these categories:
   - `entity mutation`
   - `artifact creation/update`
   - `resource reference/link`
   - `approval or governance event`
   - `execution result`
5. The platform shall not require product code to scrape rendered transcript
   text as the primary way to derive durable domain state.
6. A structured output shall preserve provenance to its originating:
   - `containerId` when applicable
   - `conversationId`
   - `turnId`
   - `laneId`
   - originating participant identity
   - `sessionId` when relevant to runtime attachment history
7. A structured output shall support linkage to one or more domain records.
8. The platform shall support at least these cross-product record families:
   - managed work records such as goals, requirements, backlog items, issues,
     and tasks
   - task / issue / work item style records
   - specification / plan / decision style documents
   - code-change / test-run / review / preview style artifacts
   - approval / checkpoint / status records
9. The materialization contract shall allow the same turn to update both:
   - transcript-visible content
   - structured domain state
10. `Chat` shall remain able to operate without forcing every turn to produce
    structured outputs.
11. `Code` and `Work` shall be able to consume structured outputs without
    redefining the interaction lifecycle.
12. A structured output shall declare whether it is:
    - proposed
    - applied
    - superseded
    - rejected
    - informational only
13. The contract shall support human or Boss/Guide Cat review before a proposed
    structured output becomes applied durable state when governance requires it.
14. External-consequence workflows shall be able to require approval without
    changing the underlying conversation-turn model.
15. The platform shall support resource binding for materialized state,
    including at least:
    - workspace or repository
    - file paths or file references
    - preview/build/test outputs
    - linked conversations or child conversations
16. `Cats Code` shall be able to materialize code-adjacent state such as:
    - code tasks
    - linked specs or plans
    - file-change artifacts
    - test/build results
    - review requests and outcomes
17. `Cats Work` shall be able to materialize work-domain state such as:
    - projects
    - work items
    - approvals
    - execution status and outputs
    - downstream handoff intent to Chat or Code
18. The same structured record may be projected into multiple product surfaces
    without duplicating provenance.
19. Transcript projection shall remain a view over interaction state, not the
    storage owner for every future Code/Work artifact.
20. The platform shall support idempotent or deduplicable application of
    structured outputs so replay/reconnect does not create duplicate durable
    records.
21. Repair/replay paths shall rebuild transcript and structured projections
    from canonical state instead of inventing new mutations heuristically.
22. The platform shall allow a conversation turn to reference previously
    materialized domain state as input context for future turns.
23. Sequential multi-lane turns that rely on earlier lane results shall be able
    to pass both transcript frontier and structured materialization frontier
    into later lanes when needed.
24. The materialization contract shall support product-specific projection
    policies without allowing product-specific redefinition of turn/lane
    identity.
25. The platform shall distinguish:
    - managed work records
    - missions
    - runs
    - schedules / triggers
    instead of overloading one `task` or `job` concept for every layer.
26. Not every mission or run shall require promotion into a managed-work
    record.
27. The platform shall allow product policy to promote mission or run outcomes
    into managed Work when operator-visible tracking, approval, or follow-up is
    required.
28. `Cats Work` shall be the canonical home for managed-work records, while
    `Chat` and `Code` may create or update those records through the shared
    materialization seam.
29. `Cats Code` shall be able to own code-adjacent artifacts, execution
    profiles, previews, reviews, and other implementation resources without
    becoming the canonical owner of every project or backlog record.
30. External transports shall contribute context through transport bindings that
    remain distinct from conversation and session identity.

### Non-Functional Requirements

- **Traceability**: every materialized record must be attributable to its
  originating interaction context
- **Extensibility**: new `Code` or `Work` schemas must be addable without
  changing the interaction core contract
- **Separation of concerns**: interaction lifecycle and domain persistence must
  remain connected but distinct
- **Recoverability**: replay and rebuild must preserve both transcript and
  structured state semantics
- **Governance**: approval and policy hooks must attach to materialization
  state without redefining runtime session semantics

## Design Overview

### Layer Model

```text
Interaction Core
  Container -> Conversation -> Turn -> Lane -> Segment -> Session

Materialization Layer
  Turn/Lane outputs -> Effects/Mutations -> Entities/Artifacts -> Product projections

Execution and Entry Layers
  Managed Work -> Mission -> Run
  External thread/account -> Transport Binding -> Conversation entry
```

### Conceptual Flow

1. A conversation turn runs through the shared interaction engine.
2. Lanes produce transcript-visible segments and optional structured outputs.
3. Structured outputs enter a materialization pipeline.
4. The pipeline either:
   - records informational outputs only, or
   - proposes/applies domain mutations and artifacts
5. Product surfaces such as Chat, Code, and Work project the resulting state in
   their own ways.

### Structured Output Types

The minimum normalized output vocabulary should distinguish:

- `Mutation`
  - create/update/link/close/approve/reject style intent against domain records
- `Artifact`
  - generated or linked deliverables such as specs, code diffs, tests, previews
- `Reference`
  - pointers to files, repos, workspaces, URLs, child conversations, tasks
- `Execution Result`
  - runtime outcomes such as build status, test result, publish attempt

### Provenance Model

Every materialized output should be able to answer:

- which conversation produced this?
- which turn produced this?
- which lane or participant proposed it?
- was it merely proposed or actually applied?
- what approval or policy gate affected it?
- what resource or workspace did it touch?

### Product Projection Model

The same underlying output may project differently:

- `Chat`
  - transcript row
  - inline artifact chip
  - approval/status notice
- `Code`
  - task detail
  - file/test/build/review panels
  - workspace timeline
- `Work`
  - project/work-item timeline
  - approval queue
  - downstream handoff summary

### Ownership Model

- `Chat`
  - owns interaction and transcript projection
- `Work`
  - owns managed-work records and planning hierarchy
- `Code`
  - owns implementation artifacts, execution profiles, previews, reviews, and
    other code-adjacent resources
- shared platform/core layers
  - own mission, run, schedule, provenance, and transport-binding seams

## Boundaries

### What stays in the interaction core

- turns, lanes, sessions, segments
- transcript delivery and live state
- scheduler and coordinator policy
- provenance roots for who/when/where interaction happened

### What belongs in materialization

- task/spec/issue/code/work entities
- managed work, mission, run, and schedule contracts
- artifacts and execution outputs
- approval application state
- domain-specific product dashboards
- resource bindings and cross-product references
- transport-binding state for external entrypoint continuity

### What must not happen

- `Code` or `Work` inventing a second incompatible conversation lifecycle
- transcript rendering becoming the only durable source for artifacts
- `sessionId` being reused as product-domain identity
- product-specific persistence bypassing shared provenance

## Dependencies

- [ADR-059](../decisions/059-adopt-a-unified-conversation-turn-lane-engine.md)
- [ADR-063](../decisions/063-agent-missions-and-transport-bindings.md)
- [ADR-039](../decisions/039-use-core-task-metadata-as-cross-product-plan-exchange.md)
- [SPEC-040](./SPEC-040-cats-work-team-templates-and-work-intake.md)
- [SPEC-041](./SPEC-041-cats-code-v1-local-builder-loop.md)
- [SPEC-043](./SPEC-043-cats-code-mvp-multi-agent-local-app-workflow.md)
- [SPEC-052](./SPEC-052-current-turn-recipients-dispatch-policy-and-parallel-chat-terminology.md)

## Open Questions

- [ ] What the first normalized structured-output envelope should look like in
      storage and APIs.
- [ ] Whether applied mutations should always be materialized synchronously with
      turn completion or may be finalized by a follow-up projector step.
- [ ] Which initial artifact taxonomy should be treated as cross-product core
      versus product-local extension.
- [ ] How much of the approval policy should live in shared core contracts
      versus product-owned adapters for Code and Work.

## References

- [ADR-059](../decisions/059-adopt-a-unified-conversation-turn-lane-engine.md)
- [ADR-063](../decisions/063-agent-missions-and-transport-bindings.md)
- [SPEC-040](./SPEC-040-cats-work-team-templates-and-work-intake.md)
- [SPEC-041](./SPEC-041-cats-code-v1-local-builder-loop.md)
- [SPEC-043](./SPEC-043-cats-code-mvp-multi-agent-local-app-workflow.md)
- [SPEC-035](./SPEC-035-cross-product-task-strategy-handoff-and-runtime-bridge.md)

---

*Created: 2026-04-14*
*Author: Codex*
*Related Plan: [PLAN-050](../plans/PLAN-050-interaction-core-and-domain-materialization.md)*
