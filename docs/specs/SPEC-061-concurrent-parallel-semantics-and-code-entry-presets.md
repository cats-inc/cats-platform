# SPEC-061: Concurrent vs Parallel Semantics and Code Entry Presets

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Draft |
| **Owner** | Codex |
| **Reviewer** | User |
| **Related ADRs** | [ADR-059](../decisions/059-adopt-a-unified-conversation-turn-lane-engine.md), [ADR-062](../decisions/062-separate-concurrent-turn-fan-out-from-parallel-container-composition.md) |

## Summary

`Cats` needs one precise answer for two questions:

1. what `concurrent` and `parallel` mean in the shared interaction engine
2. how `Cats Code` entry surfaces map onto that engine

This spec defines:

- `concurrent` as one-thread fan-out inside one turn
- `parallel` as a container of independent child conversations
- explicit convergence policies for concurrent fan-out
- `+New code`, `+Team code`, and `+Peer code` as `Cats Code` product presets
  above the same shared engine

## Why

Without these distinctions:

- concurrent UI will leak sequential startup or branch semantics
- parallel surfaces will be mis-modeled as transcript clusters instead of child
  conversations
- `Cats Code` risks splitting into multiple incompatible workflow engines
- future automation such as peer-review loops will be implemented in the wrong
  layer

## Goals

- define `concurrent` and `parallel` in a way that survives Chat, Work, and
  Code reuse
- make `convergence policy` explicit instead of silently baking it into
  `concurrent`
- define first-class `Cats Code` entry presets
- keep worktree/permission/tool binding inside shared preset/execution-profile
  contracts
- keep peer-review automation above the engine instead of mutating transcript
  identity

## Non-Goals

- final CSS or renderer layout for concurrent clusters or parallel containers
- the full implementation plan for every Chat and Code UI surface
- exhaustive workflow templates beyond the first Code entry presets
- choosing the final set of peer-review automation macros for the first code
  slice

## Core Semantic Model

### Concurrent

`concurrent` means:

- one `Conversation`
- one `Turn`
- many active `Lane`s

All concurrent lanes belong to the same dispatch cycle and the same shared
conversation context.

Examples:

- one group-chat prompt sent to `Claude`, `Codex`, and `Gemini` together
- one team-code planning question sent to planner, reviewer, and security lanes

### Parallel

`parallel` means:

- one `Container`
- many child `Conversation`s

Each child conversation owns:

- its own transcript
- its own turn history
- its own lane state
- its own runtime/session lifecycle

Examples:

- three private compare chats inside one parallel chat group
- one main coding branch plus two review branches in `Peer code`

### Convergence Policy

Concurrent fan-out must carry an explicit `convergence policy`.

The platform should support at least:

- `keep_all`
- `pick_one`
- `synthesize_one`
- `promote_one_continue`

Definitions:

- `keep_all`
  - preserve every lane result as first-class outcome
- `pick_one`
  - select one lane result as the adopted outcome
- `synthesize_one`
  - generate a new merged outcome from multiple lane results
- `promote_one_continue`
  - choose one lane to become the next primary frontier while retaining the
    other lanes as evidence

## Product Requirements

### Concurrent and Parallel Requirements

1. The product shall reserve `concurrent` for thread-internal multi-lane
   fan-out inside one conversation turn.
2. The product shall reserve `parallel` for container-level composition of
   multiple child conversations.
3. The product shall not treat a parallel container as if it were one shared
   transcript with multiple assistant lanes.
4. The product shall not treat a concurrent turn as if it were a set of
   independent child conversations.
5. Concurrent turns shall expose or derive a `convergence policy`.
6. The default convergence policy may vary by preset or workflow, but it shall
   not be implicit in the word `concurrent`.
7. Concurrent lanes shall keep stable order within the turn according to
   dispatch-time audience order.
8. Parallel child conversations shall keep stable branch identity within the
   parent container according to container ordering rules.

### Concurrent UI Requirements

9. Concurrent Chat surfaces shall render one response cluster per concurrent
   user turn rather than reusing parallel-child-chat visuals.
10. Concurrent response clusters shall allow all lane results to remain visible
    even when a later workflow chooses one adopted outcome.
11. If a workflow uses `pick_one` or `synthesize_one`, the adopted outcome
    shall be represented as an extra projection or state overlay, not by
    pretending the other lane results never existed.

### Parallel UI Requirements

12. Parallel surfaces shall present child conversations as distinct branches,
    not as lane cards inside one transcript turn.
13. Relay or automation across parallel child conversations shall preserve
    branch identity and provenance.

## Code Entry Presets

### +New code

`+New code` is the one-person coding entry point.

Baseline contract:

- one `Conversation`
- one primary code `Task` linked to that conversation
- one primary coding participant or implicit runtime target
- one project/workspace intent
- one execution profile chosen at creation or updated later
- zero or more `Run`s as concrete execution attempts occur
- zero or more `Artifact`s linked to the task and, when applicable, the
  producing run

The first slice should treat:

- `Task` as the durable coding objective
- `Run` as one execution attempt against that task
- `Artifact` as a durable output of the task or run

`+New code` should remain Code-owned by default. It may later project into
`Cats Work` through managed-work promotion or a linked `WorkItem`, but that
should not be the preset's default creation behavior.

Initial preset inputs should include:

- working directory (`cwd`)
- worktree policy
- permission profile
- bound skill/tool/memory profile when applicable

### +Team code

`+Team code` is the shared multi-participant coding room.

Baseline contract:

- one shared `Conversation`
- multiple participants
- configurable workflow/coordinator policy such as PDCA or
  plan-build-test-review
- shared transcript and artifact context

`+Team code` may use:

- sequential sub-steps
- concurrent sub-steps

but remains one shared conversation.

### +Peer code

`+Peer code` is the branch-and-review container.

Baseline contract:

- one `Container`
- multiple child code conversations
- each child may bind a different execution profile and worktree
- one or more automation/convergence policies define result flow between
  branches

Typical first-slice roles include:

- main coder
- reviewer 1
- reviewer 2

## Execution Profile Requirements

1. Code presets shall capture runtime-affecting inputs as an `execution
   profile`.
2. An execution profile shall be bindable to:
   - a participant
   - a lane
   - or a child conversation preset
3. An execution profile shall support at least:
   - `cwd`
   - worktree mode
   - permission profile
   - tool/skill profile
   - memory/profile binding when applicable
4. The platform shall not treat these values as renderer-only temporary form
   state with no durable semantic model.

## Automation and Review Requirements

1. `Peer code` shall support explicit automation policies for cross-branch
   review or handoff.
2. These policies may include:
   - share main result to reviewers
   - collect reviewer findings
   - return findings to main branch
   - promote selected branch outcome
3. Automation policies shall preserve provenance for:
   - source branch
   - target branch
   - triggering artifact or message
   - timestamp
   - policy id
4. Automation policies shall not redefine child-conversation or lane identity.

## User Stories

- As a Chat user, I want `concurrent` to feel like one compare turn rather than
  a hidden set of sequential startups.
- As a Chat user, I want `parallel` to feel like multiple bound private threads
  rather than one room transcript pretending to be a compare grid.
- As a Code user, I want a clear entry point for solo coding work without
  entering a team or branch-comparison workflow.
- As a Code user, I want a team room where shared planning, implementation, and
  review can happen in one durable project thread.
- As a Code user, I want a peer-review container where one branch can build,
  other branches can review, and automation can relay findings without manual
  copy/paste.

## Open Questions

- Which convergence policy should be the default for concurrent group chat:
  `keep_all` or a product-specific compare default?
- Which automation presets should ship first for `Peer code`:
  review-only, review-and-patch, or promote-selected-branch?
- How much of `execution profile` should be editable at entry time versus later
  inside project settings?

## Related Documents

- [SPEC-043](./SPEC-043-cats-code-mvp-multi-agent-local-app-workflow.md)
- [SPEC-047](./SPEC-047-compare-chat-concurrent-groups-and-relay.md)
- [SPEC-052](./SPEC-052-current-turn-recipients-dispatch-policy-and-parallel-chat-terminology.md)
- [SPEC-057](./SPEC-057-concurrent-group-lane-native-live-transcript.md)

## Related Plan

- [PLAN-053](../plans/PLAN-053-concurrent-parallel-semantics-and-code-entry-presets.md)

---

*Created: 2026-04-14*
*Author: Codex*
*Updated: 2026-04-19*
