# SPEC-041: Cats Code v1 Local Builder Loop

> Turn the first `Cats Code` dashboard from a read-oriented projection into an
> actionable local builder loop above shared Core tasks, room-owned workspaces,
> and runtime preview/delivery primitives.

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Draft |
| **Owner** | Codex |
| **Reviewer** | User |

## Summary

`cats` already has the first `Cats Code` dashboard and task/artifact read
models. `cats-runtime` already has the harder execution substrate: workspace
contracts, session lifecycle, pluggable execution strategies, delivery
primitives, and preview/browser surfaces.

What is still missing is the first product-owned builder loop that connects
those pieces end to end.

This spec defines `Cats Code v1` as a local-first workflow:

- pick or bootstrap a room-owned coding workspace
- create or resume a code task on shared Core records
- run a coder session through the existing runtime bridge
- surface live plan/progress plus preview/build outputs
- let the owner decide whether to revise, review, commit, push, or publish

OpenManus remains useful prior art, but only in a narrow way. `Cats Code v1`
should borrow the value of `PlanningFlow` step tracking and re-planning, while
keeping Cats' stronger boundaries:

- Core owns tasks, approvals, and persistence
- product owns workspace authority and UI
- runtime owns execution, preview, repo, and delivery primitives

## Goals

- turn `Cats Code` into an actionable product surface instead of a read-only
  dashboard
- preserve the existing platform boundary where Code stays above shared Core
  tasks/artifacts instead of creating a separate Code schema
- make the first coding workflow local-first and workspace-first
- reuse `cats-runtime` workspace, preview, delivery, and strategy primitives
  instead of rebuilding them in product code
- borrow OpenManus-style step tracking and re-planning as product behavior,
  not as a runtime-owned second task system
- keep approval gates only where actions become externally consequential

Under the current re-architecture, this builder loop is a `Cats Code`
projection over the shared interaction engine, the materialization seam, and
normalized runtime delivery rather than a standalone execution model.

## Non-Goals

- building a full IDE, text editor, or file-tree replacement in this slice
- supporting every framework/language/runtime combination in v1
- moving task graphs, approval policy, or workspace authority into
  `cats-runtime`
- adopting OpenManus's Daytona sandbox or browser-heavy operating model for
  the first Code slice
- inventing a separate Code-only task, artifact, or review persistence model
- shipping `Cats Code > Playground` as part of the serious builder path

## Priority Bands

### P0: Must Ship for the First Real Code Slice

- explicit Code workspace binding using room-owned workspace semantics
- task-to-runtime execution from the Code surface
- live event tape plus focused plan/progress view
- build/preview artifact and preview-surface rendering
- repo follow-through actions using runtime delivery primitives

### P1: High-Value Follow-Ons After P0 Is Stable

- lightweight stuck/re-plan cues modeled after OpenManus `PlanningFlow`
- structured coder summary capture at task checkpoints
- manual review request flow from a completed code task

### P2: Explicitly Deferred

- automatic `1 coder + 2 peers` fan-out review loops
- multi-round re-review policy
- broad framework bootstrap/template catalog
- remote/cloud deployment productization beyond bounded local/external actions

## User Stories

- As a non-coder, I want to ask for an app change and then see a real local
  preview or build output without leaving `Cats Code`.
- As a coder who does not want to do the mechanical work, I want a code task to
  run against my chosen workspace, show me what changed, and let me decide what
  to do next.
- As an operator moving from `Cats Work` into `Cats Code`, I want the same task
  and acceptance criteria to continue without losing context.
- As a maintainer, I want the Code surface to reuse existing runtime and Core
  contracts rather than inventing a parallel code stack.

## Requirements

### Functional Requirements

#### Workspace and entry context

1. `Cats Code` shall remain a product slice above shared Core tasks and
   artifacts rather than introducing Code-only persistence contracts.
2. Every shared Code run shall resolve an explicit room-owned workspace before
   spawning or resuming runtime execution, following
   [SPEC-034](./SPEC-034-room-owned-workspace-bootstrap-and-ownership.md) and
   [ADR-038](../decisions/038-separate-room-owned-workspaces-from-session-owned-sandboxes.md).
3. The first slice shall support these starting contexts:
   - operator-selected local folder or repo
   - managed room workspace when no folder was selected up front
4. Product state shall keep room-owned workspace authority separate from any
   individual runtime session cwd.

#### Code task execution

5. `Cats Code` actions such as "build this", "continue implementation", or "fix
   this task" shall create or target shared Core tasks with
   `productHint = 'code'`.
6. `Cats Code` shall use `reflexion` as the default execution strategy unless
   the task's planning metadata explicitly overrides it.
7. When execution begins, the product layer shall bridge task planning metadata,
   workspace context, and correlation data into `cats-runtime` through the
   existing runtime-neutral bridge defined by
   [SPEC-035](./SPEC-035-cross-product-task-strategy-handoff-and-runtime-bridge.md).
8. The first builder-loop slice may keep one primary coder execution thread per
   focused task to simplify product flow and state management.
9. `Cats Code` shall prefer resuming the existing task-bound runtime session
   when the workspace and task still align, instead of always starting a fresh
   session.
10. Code task detail shall expose the active runtime session's state, provider
    target, workspace summary, and last updated execution status.

#### Plan and live progress

11. Code task detail shall expose a product-owned plan/progress panel for the
    active code task.
12. The first-slice plan model shall support ordered steps with at least these
    statuses:
    - `not_started`
    - `in_progress`
    - `completed`
    - `blocked`
13. Plan steps may be sourced from task metadata, child tasks, or structured
    coder/orchestrator outputs, but they shall remain product/Core state rather
    than a runtime-owned second task system.
14. `Cats Code` shall allow re-planning without discarding the parent task,
    either by updating the displayed plan or by creating additional child tasks.
15. The existing Code live event tape shall remain a first-class companion to
    the plan panel, not the only progress surface.

#### Preview/build/artifact loop

16. `Cats Code` shall surface linked build and preview artifacts for the
    focused task using existing Core artifact records.
17. When `cats-runtime` exposes normalized preview surfaces or preview-capable
    artifact/service metadata, `Cats Code` shall render them in a dedicated
    preview area according to
    [SPEC-020](./SPEC-020-embedded-preview-surfaces-for-runtime-artifacts-and-services.md).
18. If inline rendering is unavailable or disallowed, `Cats Code` shall fall
    back to artifact detail, open-link, or download behavior without losing the
    task context.
19. When multiple code-linked outputs exist, `Cats Code` should prioritize the
    latest ready preview/build result as the default visual focus.

#### Repo and follow-through actions

20. `Cats Code` shall surface runtime-owned repo status and change inspection
    for the selected workspace.
21. The first slice shall provide preview-first follow-through actions above the
    runtime delivery substrate, including at least:
    - inspect repo status
    - preview commit payload
    - preview push payload
    - export or publish local artifacts
22. Actions with external consequences such as remote push, external publish, or
    deployment shall require explicit human approval via structured choices, as
    required by
    [ADR-034](../decisions/034-require-human-approval-gates-at-pipeline-decision-points.md).
23. Local code generation, dependency installation, testing, build, and local
    dev-server operations shall not require separate approval gates.
24. The first slice shall not require automatic commit or automatic remote push
    at task completion.

#### Review workflow

25. The first slice shall support an optional review entry from Code task
    detail after a coding run completes or reaches a meaningful checkpoint.
26. Review requests shall reuse shared Core parent/child tasks instead of a
    Code-only review model.
27. Automatic fan-out review loops with parallel peer Cats are explicitly
    follow-on work and shall not block the first real builder-loop slice.
28. `Cats Code` should preserve structured coder/reviewer summaries as visible
    task-adjacent outputs once review-oriented follow-ons land.

### Non-Functional Requirements

- **Boundary integrity**: `cats-runtime` must remain unaware of Code-specific
  task graphs, approvals, and product UI state.
- **Local-first usefulness**: the first slice must be valuable even before any
  remote deployment workflow exists.
- **Incrementality**: the builder loop must ship above the already-landed Core
  task/artifact contracts and runtime APIs.
- **Observability**: operators must be able to tell what workspace, task,
  session, plan step, and preview output they are looking at.
- **Safety**: approval gates must remain explicit for external consequences
  while keeping local iteration fast.

## Design Overview

```text
owner enters Code task
  -> resolve room-owned coding workspace
  -> create or resume Core task
  -> bridge task + workspace + strategy into runtime session
  -> stream live event tape
  -> maintain product-owned plan/progress view
  -> collect build/preview artifacts + preview surfaces
  -> owner chooses:
       revise
       request review
       preview commit
       preview push
       publish/export output
```

### What Code Already Has

- first Code dashboard and task/artifact read routes in `cats`
- code-oriented task/artifact projections above shared Core data
- route mounting and platform-surface identity for `/code`
- live event tapes in the Code renderer

### What Runtime Already Has

- room/workspace-compatible session execution primitives
- workspace substrate audit/init/update contracts
- runtime delivery primitives for repo status, commit, push, and artifacts
- preview/browser substrate plus normalized preview surfaces
- session inspection, observe, branching, and MCP/HTTP surfaces

### What This Spec Adds

- the first product-owned end-to-end builder loop tying those pieces together
- an explicit Code workspace-first entry contract
- a focused plan/progress surface inspired by OpenManus `PlanningFlow`
- a bounded owner follow-through model after preview/build output exists

## OpenManus Borrowing Rules

OpenManus at local submodule commit `52a13f2` (`v0.3.0-148-g52a13f2`) confirms
that a lightweight plan panel with step states and re-planning meaningfully
improves long-running coding tasks.

`Cats Code v1` should borrow only these ideas:

- ordered step decomposition
- explicit step status tracking
- mid-run re-planning

`Cats Code v1` should explicitly not copy these OpenManus directions into the
first serious builder slice:

- in-memory runtime-owned planning as the source of truth
- Daytona sandbox dependency
- browser-use style automation as the main preview path
- a separate monolithic agent framework inside product code

## Dependencies

- [ADR-025](../decisions/025-make-cats-inc-a-platform-host-with-core-owned-product-projections.md)
- [ADR-032](../decisions/032-own-task-substrate-in-core-not-runtime.md)
- [ADR-034](../decisions/034-require-human-approval-gates-at-pipeline-decision-points.md)
- [ADR-038](../decisions/038-separate-room-owned-workspaces-from-session-owned-sandboxes.md)
- [ADR-039](../decisions/039-use-core-task-metadata-as-cross-product-plan-exchange.md)
- [ADR-059](../decisions/059-adopt-a-unified-conversation-turn-lane-engine.md)
- [ADR-060](../decisions/060-normalize-heterogeneous-runtime-delivery-into-product-events.md)
- [SPEC-020](./SPEC-020-embedded-preview-surfaces-for-runtime-artifacts-and-services.md)
- [SPEC-032](./SPEC-032-core-task-lifecycle-and-wakeup-integration.md)
- [SPEC-034](./SPEC-034-room-owned-workspace-bootstrap-and-ownership.md)
- [SPEC-035](./SPEC-035-cross-product-task-strategy-handoff-and-runtime-bridge.md)
- [SPEC-058](./SPEC-058-interaction-core-and-domain-materialization.md)
- [cats-runtime ADR-011](../../../cats-runtime/docs/decisions/011-runtime-owned-browser-and-preview-subsystem-with-pluggable-drivers.md)
- [cats-runtime ADR-015](../../../cats-runtime/docs/decisions/015-own-workspace-substrate-tools-in-cats-runtime.md)
- [cats-runtime ADR-016](../../../cats-runtime/docs/decisions/016-own-executable-delivery-primitives-not-delivery-policy.md)
- [cats-runtime ADR-024](../../../cats-runtime/docs/decisions/024-own-pluggable-execution-strategies-as-runtime-session-local-substrate.md)

## Open Questions

- [ ] Should the first Code slice support only existing folders/repos plus
      managed empty workspaces, or also a tiny starter-template catalog?
- [ ] Where should the first product-owned plan-step record live:
      task metadata, child tasks, or a hybrid derived read model?
- [ ] Should manual review request in the first follow-on create one review
      task or allow choosing one vs two peer reviewers from day one?
- [ ] Do we want one active coder session per focused task to remain a product
      rule beyond v1, or only a temporary simplification?

## References

- [Research: Cats Product Lines - Chat, Work, and Code](../research/2026-03-20-cats-product-lines-chat-work-code.md)
- [Research: Codex View - Cats Chat, Cats Work, and Cats Code Product Boundaries](../research/2026-03-20-codex-cats-chat-work-code-product-boundaries.md)
- [Research: Cats Code Peer Review Workflow](../research/2026-03-24-cats-code-peer-review-workflow.md)
- [Research: OpenManus Reference Analysis](../research/2026-03-24-openmanus-reference-analysis.md)
- [Research: OpenManus Killer-Feature Gap Analysis](../research/2026-03-26-openmanus-killer-feature-gap-analysis.md)
- [Research: Unified Planning Language and Cross-Product Strategy](../research/2026-03-26-unified-planning-language-and-cross-product-strategy.md)
- [Architecture](../architecture.md)
- [API](../api.md)

---

*Created: 2026-03-29*
*Author: Codex*
*Related Plan: [PLAN-029](../plans/PLAN-029-cats-code-v1-local-builder-loop.md)*
