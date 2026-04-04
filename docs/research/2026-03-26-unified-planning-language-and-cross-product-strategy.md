# Unified Planning Language and Cross-Product Strategy Orchestration

## Metadata

- **Date**: 2026-03-26
- **Author**: Claude
- **Scope**: Cats Platform (Chat + Work + Code) and cats-runtime
- **Related**:
  - [Pluggable Execution Strategy Architecture (cats-runtime)](../../../cats-runtime/docs/research/2026-03-26-pluggable-execution-strategy-architecture.md)
  - [OpenManus Killer-Feature Gap Analysis](./2026-03-26-openmanus-killer-feature-gap-analysis.md)
  - [OpenManus Reference Analysis](./2026-03-24-openmanus-reference-analysis.md)
  - [Task Substrate as Heartbeat Foundation](./2026-03-24-task-substrate-as-heartbeat-foundation.md)
  - [Cats Code Peer Review Workflow](./2026-03-24-cats-code-peer-review-workflow.md)

## Purpose

cats-runtime will support pluggable execution strategies (ReAct, PDCA, ToT,
DEPS, Reflexion, etc.) through a unified `ExecutionStrategy` interface.
Different products (Chat, Work, Code) and different task types will select
different strategies.

This raises a cross-product coordination question: when a plan crosses
product boundaries (e.g. Work plans a feature, Code implements a sub-task),
how do different strategies interoperate without coupling to each other's
internal structure?

This document proposes that **CoreTaskRecord is the Unified Planning
Language** — the cross-strategy plan exchange format that allows plans
to flow between products and strategies without structural coupling.

## Core Insight

Every execution strategy produces a different internal plan structure:

- **ToT**: tree of branches with evaluation scores
- **PDCA**: linear cycle with check/act decision points
- **PlanAndExecute**: ordered step list with dependencies
- **Reflexion**: ReAct trace with failure memory annotations
- **ReAct**: flat sequence of think/act/observe

But when plans cross boundaries (strategy → task substrate → different
strategy), the internal structure must be normalized. CoreTaskRecord
already provides the normalization surface.

## CoreTaskRecord as Plan Exchange Format

The existing CoreTaskRecord schema supports plan exchange with minimal
additions:

### Already Present

- **parentTaskId**: express any hierarchy (tree, linear, nested cycles)
- **status**: unified 8-state machine (draft → pending_approval →
  approved → in_progress → blocked → completed → cancelled → archived)
- **assignedActorIds**: agent assignment
- **approval**: governance gate
- **conversationId**: context binding
- **metadata**: extensible dict for strategy-specific data

### To Add (metadata conventions, not schema changes)

Three metadata conventions that enable cross-strategy interop:

- **`strategyHint?: string`** — suggested execution strategy for this task.
  The producing strategy (or Boss Cat) writes this; the receiving runtime
  reads it to select the appropriate ExecutionStrategy implementation.
  Optional: if absent, product default applies.

- **`acceptanceCriteria?: string`** — what "done" looks like, expressed in
  natural language. Strategy-agnostic: any strategy can evaluate against
  this. This is the critical field that lets a PDCA "Check" phase or a
  Reflexion "evaluate" step know when to stop.

- **`strategyContext?: Record<string, unknown>`** — opaque,
  strategy-specific data. The producing strategy writes it; a different
  strategy receiving this task MAY ignore it. Examples:
  - ToT: `{ branchScores: [...], selectedBranch: "b2" }`
  - PDCA: `{ cycleCount: 2, lastCheckVerdict: "fail" }`
  - Reflexion: `{ failureMemory: ["TypeError on line 42 — wrong import"] }`

### Dependency Expression

Add `dependsOn?: string[]` (task IDs) to metadata. This enables:

- Linear plans: step 2 depends on step 1
- Fan-out/converge: steps 2a and 2b depend on step 1; step 3 depends on
  both 2a and 2b
- Tree structures: ToT branches expressed as parallel tasks with shared
  parent, converge selects best

## Cross-Product Plan Flow

### Example: Work → Code Handoff

```
Work product (PDCA strategy):
  Boss Cat decomposes: "Develop user auth feature"

  CoreTaskRecord (parent):
    title: "Develop user auth feature"
    status: in_progress
    metadata:
      strategyHint: "PDCA"
      acceptanceCriteria: "Auth endpoints pass integration tests,
                           PR approved by peer review"

  CoreTaskRecord (child 1):
    title: "Design API spec"
    assignedActorIds: [architect-cat]
    metadata:
      strategyHint: "ReAct"
      acceptanceCriteria: "OpenAPI spec covers login, logout, refresh"

  CoreTaskRecord (child 2):
    title: "Implement auth module"
    assignedActorIds: [coder-cat]
    dependsOn: [child-1-id]
    metadata:
      strategyHint: "ToT"              ← Work tells Code to use ToT
      acceptanceCriteria: "All tests pass, follows spec from child 1"

  CoreTaskRecord (child 3):
    title: "Peer review"
    assignedActorIds: [reviewer-cat-a, reviewer-cat-b]
    dependsOn: [child-2-id]
    metadata:
      strategyHint: "ReAct"
      acceptanceCriteria: "Both reviewers approve or concerns addressed"

  CoreTaskRecord (child 4):
    title: "Integration test"
    assignedActorIds: [qa-cat]
    dependsOn: [child-3-id]
    metadata:
      strategyHint: "PDCA"
      acceptanceCriteria: "E2E auth flow passes on staging"
```

When Coder Cat picks up child 2:

1. Reads `strategyHint: "ToT"` → runtime selects TreeOfThoughts strategy
2. Reads `acceptanceCriteria` → ToT uses this to evaluate branches
3. ToT internally creates branches, evaluates, selects best
4. Final result written back to CoreTaskRecord (status: completed,
   summary, strategyContext with branch scores)
5. Work's PDCA Check phase only reads `status: completed` + `summary`
   — does not need to understand ToT internals

### Key Properties

- **Strategy-agnostic plan handoff**: the producing strategy writes
  `strategyHint` + `acceptanceCriteria`; the receiving strategy reads them
- **Opaque context passthrough**: `strategyContext` carries
  strategy-specific data that other strategies can safely ignore
- **Unified status**: all strategies write to the same CoreTaskStatus,
  so fan-out/converge logic works regardless of which strategies
  the children used
- **No structural coupling**: Work doesn't know how ToT works internally;
  Code doesn't know it's inside a PDCA cycle

## Strategy Selection: Three-Layer Fallback

```
1. Task-level    — metadata.strategyHint (Boss Cat or parent strategy)
2. Cat profile   — SKILL.md declares preferred strategy
3. Product default:
   - Chat: ReAct (conversational, reactive)
   - Work: PDCA (quality-gated, structured)
   - Code: Reflexion (iterative, learns from failure)
```

Product defaults are conventions, not constraints. Any task can override
with `strategyHint`.

## Product-Specific Strategy Affinity

### Chat

- **Default**: ReAct — fast, reactive, good for conversational flow
- **Multi-step delegation**: PlanAndExecute — Boss Cat orchestrating
  multiple Cats benefits from upfront planning
- **Simple Q&A**: SimpleToolCall — no loop overhead needed

### Work

- **Default**: PDCA — explicit quality gates, structured evaluation
- **Exploratory research**: ToT — explore multiple approaches, pick best
- **Routine tasks**: ReAct — simple execute-and-report

### Code

- **Default**: Reflexion — iterative build/test, learns from failures
- **Architecture decisions**: ToT — explore design alternatives
- **Peer review**: ReAct — reviewers react to code, don't need cycles
- **Complex implementation**: PDCA — plan/code/test/refine cycle

## Relationship to Existing Architecture

### Task Substrate (already built)

CoreTaskRecord, CoreTaskStatus, parentTaskId, approval gates, wakeup
integration, run tracking, checkout semantics — all already exist. This
proposal adds metadata conventions on top, no schema changes needed.

### cats-runtime ExecutionStrategy (companion research)

The runtime-side pluggable strategy interface is defined in the companion
research document. This document covers the product-side plan exchange
format that feeds into and consumes from those strategies.

### Boss Cat Orchestration

Boss Cat's role is unchanged: decompose goals into tasks, assign Cats,
monitor progress, converge results. The new capability is that Boss Cat
can now also specify WHICH strategy each sub-task should use, based on
task characteristics.

### PlanningFlow (OpenManus reference)

OpenManus's PlanningFlow (~400 lines) implements plan decomposition +
step tracking + agent assignment + re-planning. In Cats, this maps to:

- Plan decomposition → Boss Cat skill prompt
- Step tracking → CoreTaskRecord with parentTaskId
- Agent assignment → assignedActorIds + wakeup
- Re-planning → Boss Cat modifies/adds child tasks mid-execution

PlanningFlow is NOT a separate system. It is an emergent behavior of
Boss Cat + task substrate + pluggable strategies working together.

## Validation: Peer Review Workflow

The Cats Code peer review workflow validates this architecture:

```
Step 1: Coder Cat implements    [strategy: Reflexion]
Step 2: Peer A reviews          [strategy: ReAct, depends: step 1] ← parallel
Step 3: Peer B reviews          [strategy: ReAct, depends: step 1] ← parallel
Step 4: Boss Cat converges      [depends: step 2, 3]
Step 5: Owner decides           [structured choices]
Step 6: Coder Cat revises       [strategy: Reflexion, depends: step 5, optional]
```

Each step is a CoreTaskRecord. Each step can use a different strategy.
Fan-out (steps 2+3) and converge (step 4) work through parentTaskId +
status checks. No strategy needs to know about any other strategy's
internals.

## Suggested Next Steps

1. Formalize `strategyHint`, `acceptanceCriteria`, `dependsOn` as
   documented metadata conventions (not schema changes)
2. Draft ADR for ExecutionStrategy contract (cats-runtime side)
3. Draft ADR for cross-product plan exchange conventions (cats side)
4. Implement SimpleToolCallStrategy + ReActStrategy as first two
   strategies
5. Add Boss Cat skill prompt for strategy-aware task decomposition

---

*Research completed: 2026-03-26*
*Author: Claude*
