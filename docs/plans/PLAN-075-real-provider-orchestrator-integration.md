# PLAN-075: Real Provider Orchestrator Integration

> Move from the PLAN-074 supervision shell into real provider-agent execution:
> Claude/Codex-backed driving agents, durable run lifecycle, Chat decision-core
> cutover, Work supervised runs, Code task/relay runs, and removal of the old
> planner/dispatcher core once no product path uses it.

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Draft |
| **Owner** | Codex |
| **Reviewer** | User |

## Related Spec / Dependencies

- [PLAN-074: Cats Work Agent Supervision Rollout](./PLAN-074-cats-work-agent-supervision-rollout.md)
- [SPEC-082: Cats Work Agent Supervision and Tool Boundary](../specs/SPEC-082-cats-work-agent-supervision-and-tool-boundary.md)
- [ADR-082: Recast the Orchestrator as a Capability Shell with Policy-Dial Supervision](../decisions/082-recast-orchestrator-as-capability-shell-with-policy-dial-supervision.md)
- [PLAN-023: Orchestrator Execution Loop and Recovery Contract](./PLAN-023-orchestrator-execution-loop-and-recovery.md)
- [SPEC-011: Primary Orchestrator Chat Entry and Trace Separation](../specs/SPEC-011-primary-orchestrator-chat-entry-and-trace-separation.md)
- [SPEC-061: Concurrent, Parallel, Code Entry Presets, and Chat Continuity Follow-Through](../specs/SPEC-061-concurrent-parallel-semantics-and-code-entry-presets.md)
- [SPEC-062: Agent Missions, Managed Work, and Transport Bindings](../specs/SPEC-062-agent-missions-and-transport-bindings.md)
- [SPEC-063: Conversational vs Operational Agents and Surface Projections](../specs/SPEC-063-conversational-vs-operational-agents-and-surface-projections.md)

## Baseline

As of 2026-04-27:

- PLAN-074 has shipped the supervision foundation: contracts, policy dials,
  capability assessment, tool registry, tool boundary, durable evidence,
  policy snapshots, run state, approval sync, fake driving-agent harness, and
  Work supervised-run inspection surfaces.
- Chat, Work, and Code product paths no longer call
  `runtimeClient.createSession` or `runtimeClient.sendMessage` directly. The
  only direct calls are inside `src/platform/supervision/runtimeBoundary.ts`.
- Work supervised-run launch creates a real runtime session when a runtime
  client is available, sends a task prompt, writes runtime metadata, and
  surfaces the runtime response in task timeline.
- Code task execute and Code relay fan-out use the supervised runtime boundary.
- The old Chat planner/dispatcher code still owns meaningful decision behavior.
  Runtime-call cutover is not the same as decision-core cutover.

## Objective

Replace the old Orchestrator decision core with a provider-agent-driven core
behind Cats-owned supervision.

The target architecture is:

1. A provider-backed driving agent receives a bounded observation and returns a
   semantic plan, recovery decision, tool request, or delegation request.
2. Cats validates that intent through deterministic policy, invariants,
   approval gates, tool manifests, budget, lifecycle, and product boundaries.
3. Cats executes allowed actions through supervised tool/runtime boundaries and
   persists evidence, traces, run state, and user-visible product projections.
4. Weak providers can still participate through narrower SOP/classifier/worker
   modes without being treated as autonomous agents.
5. Old planner/dispatcher paths are deleted after product routes no longer
   reference them.

## Scope

This plan covers:

- real Claude/Codex provider-agent integration through the supervision boundary
- Ollama/local weak-model integration as SOP/worker/classifier support, not as
  default autonomous agent execution
- Chat decision-core cutover while preserving visible Chat UI flows
- Work supervised run lifecycle beyond one-shot runtime launch
- Code task execute and relay fan-out convergence through the same run model
- lifecycle scheduler and run-loop ownership needed to keep provider agents
  alive, resumable, cancellable, and inspectable
- cleanup of obsolete planner/dispatcher implementation after cutover

## Non-Goals

- no redesign of Chat, Work, or Code renderer flows
- no new top-level Cat registry shape
- no conversion of temporary participants, solo execution targets, or worker
  invocations into durable Cats
- no provider-specific business logic outside provider adapters/capability
  profiles
- no direct product calls to runtime create/send outside
  `platform/supervision/runtimeBoundary`
- no deletion of old planner/dispatcher files until tests prove no product path
  still depends on their semantics

## Acceptance Criteria

- Chat direct, solo, group, and parallel send flows run through the new
  provider-agent decision seam for semantic next-step choice.
- Chat visible behavior does not regress: route selection, typing handoff,
  runtime session metadata, direct lanes, group rooms, and parallel branches
  remain intact.
- Work supervised runs can start, resume, block, retry, cancel, request
  approval, delegate a child run, and persist user-visible timeline/evidence.
- Code `+New code`, `+Team code`, and `+Peer code` paths continue to work while
  task execute and relay fan-out are represented as supervised runs.
- Claude and Codex live provider paths can drive at least one Chat turn, one
  Work supervised run, and one Code task/relay path under supervision.
- Ollama/local weak-model paths enter with restricted tool surface and SOP
  scaffolding unless a capability profile proves stronger autonomy.
- Static tests fail any new product-layer direct runtime create/send calls.
- Old planner/dispatcher implementation files are removed or reduced to
  compatibility-free wrappers only after no product path imports them.

## Phase Gates

| Gate | Required Evidence |
|------|-------------------|
| Do not broaden provider tool access until FR-19 override-floor tests stay green. | `supervision-policy-engine.test.ts` and `supervision-tool-boundary.test.ts` cover denial and evaluated/observed positive paths. |
| Do not wire live provider-agent autonomy before fake driving-agent recovery tests are green. | `supervision-fake-driving-agent.test.tsx` and `work-supervised-run.test.tsx` pass. |
| Do not change Chat visible UI while cutting the decision core. | Targeted Chat smoke/probe tests prove direct, solo, group, and parallel runtime handoff. |
| Do not add direct runtime create/send calls in product code. | `supervision-runtime-boundary.test.tsx` and `rg runtimeClient.createSession/sendMessage` show only `runtimeBoundary.ts` calls runtime directly. |
| Do not delete old planner/dispatcher before import graph is clean. | Static import test and `rg` prove no product path imports the retired files. |

## Implementation Phases

### Phase 0: Inventory and Guardrails

- [ ] Task 0.1: Inventory current Chat planner/dispatcher imports and classify
      each path as decision, routing, transcript projection, runtime dispatch,
      or recovery.
- [ ] Task 0.2: Add a static boundary test that records the allowed direct
      runtime call location as only `src/platform/supervision/runtimeBoundary.ts`.
- [ ] Task 0.3: Add a static retirement test for old planner/dispatcher imports,
      initially documenting the current allowed legacy import set.
- [ ] Task 0.4: Record baseline targeted tests for Chat, Work, and Code runtime
      paths before cutover.

### Phase 1: Provider-Agent Decision Seam

- [ ] Task 1.1: Define a provider-agent decision contract under
      `src/platform/orchestration/` for bounded observations, semantic plans,
      recovery decisions, tool/delegation requests, and confidence.
- [ ] Task 1.2: Implement a provider-agent adapter that calls runtime through
      the supervised runtime boundary, not directly.
- [ ] Task 1.3: Make policy validation own deterministic routing, invariants,
      approval, weak-model SOP selection, budget, retry, and rejection.
- [ ] Task 1.4: Add tests proving the platform preserves agent semantic choices
      instead of substituting its own plan.

### Phase 2: Chat Decision-Core Cutover

- [ ] Task 2.1: Route Chat orchestrator planning through the new provider-agent
      decision seam while preserving existing Chat UI and transcript contracts.
- [ ] Task 2.2: Preserve direct-cat, solo, group, and parallel semantics:
      participants, lanes, audience, runtime session metadata, typing handoff,
      and recents origin must not regress.
- [ ] Task 2.3: Move recovery reasoning into provider-agent callbacks; keep
      platform recovery limited to deterministic validation, retry envelope,
      and state transitions.
- [ ] Task 2.4: Add targeted Chat probes for direct, solo, group, and parallel
      sends that assert session start, assistant progress, response, and no
      direct runtime calls.

### Phase 3: Durable Run Lifecycle Scheduler

- [ ] Task 3.1: Introduce a content-blind run lifecycle service for queued,
      running, waiting-for-approval, blocked, completed, failed, and cancelled
      supervised runs.
- [ ] Task 3.2: Support cooperative cancellation, timeout, retry, resume,
      pending approval cleanup, and late-finishing action evidence.
- [ ] Task 3.3: Add child-run delegation with budget inheritance, parent/child
      scope narrowing, and deadlock/cycle detection.
- [ ] Task 3.4: Keep semantic decisions outside the scheduler; static tests must
      prevent scheduler imports of transcript/message content readers.

### Phase 4: Work Real Provider Runs

- [ ] Task 4.1: Replace Work one-shot launch with a supervised provider-agent
      run loop that can continue after first response.
- [ ] Task 4.2: Persist provider-agent observations, plans, tool requests,
      approvals, and outcomes into task timeline, evidence, and run metadata.
- [ ] Task 4.3: Implement Work resume/retry/cancel endpoints or actions using
      the lifecycle service.
- [ ] Task 4.4: Verify Claude/Codex can drive a Work supervised run from task
      detail without changing the Work UI flow.

### Phase 5: Code Real Provider Runs

- [ ] Task 5.1: Represent Code task execute as a supervised run with runtime
      session attachment, evidence, and task/run metadata.
- [ ] Task 5.2: Represent Code relay fan-out as supervised child runs or
      sibling runs with per-agent evidence and convergence records.
- [ ] Task 5.3: Keep `+New code`, `+Team code`, and `+Peer code` entry flows
      stable while moving execution behind the run lifecycle.
- [ ] Task 5.4: Verify Claude/Codex can drive one Code task execute and one
      relay fan-out path under supervision.

### Phase 6: Provider Capability Profiles and Weak-Model Modes

- [ ] Task 6.1: Bootstrap provider capability profiles for Claude, Codex,
      Ollama/local, and unknown providers using conservative defaults.
- [ ] Task 6.2: Map strong providers to higher autonomy only when capability
      evidence allows it.
- [ ] Task 6.3: Map weak providers to SOP/classifier/worker modes with narrow
      tool scope, schema-required validation, and explicit escalation.
- [ ] Task 6.4: Add tests for capability conflicts, operator override ceilings,
      override floor, and weak-model route selection.

### Phase 7: Old Core Retirement

- [ ] Task 7.1: Remove product imports of old planner/dispatcher modules after
      Chat decision-core cutover passes.
- [ ] Task 7.2: Delete obsolete planner/dispatcher files or reduce remaining
      exports to non-compatibility wrappers only if deletion is blocked by a
      still-owned migration step.
- [ ] Task 7.3: Update tests and docs so old planner/dispatcher behavior is no
      longer treated as canonical.

## Files Likely to Change

| Path | Action | Notes |
|------|--------|-------|
| `src/platform/orchestration/**` | Modify/Create | Provider-agent decision seam and old core cutover. |
| `src/platform/supervision/**` | Modify | Runtime boundary, lifecycle hooks, scheduler integration, static guardrails. |
| `src/products/chat/state/**` | Modify | Route Chat orchestrator planning/recovery through the new seam. |
| `src/products/chat/api/**` | Modify | Preserve runtime route support while cutting decision logic. |
| `src/products/work/api/**` | Modify | Work provider-agent lifecycle endpoints and projections. |
| `src/products/work/renderer/**` | Modify minimally | Only product-owned run actions/status surfaces; no UI redesign. |
| `src/products/code/state/**` | Modify | Code task execute run lifecycle. |
| `src/products/code/api/**` | Modify | Code relay/task execution run lifecycle. |
| `tests/supervision-*.test.*` | Modify/Create | Boundary, provider-agent, lifecycle, and capability tests. |
| `tests/chat-*.test.*` | Modify/Create | Chat decision-core cutover probes. |
| `tests/work-*.test.*` | Modify/Create | Work real-provider run lifecycle coverage. |
| `tests/code-*.test.*` | Modify/Create | Code task/relay supervised run coverage. |

## Testing Strategy

- Unit tests for provider-agent contract parsing, validation, and rejection.
- Static boundary tests for direct runtime calls, scheduler content blindness,
  and planner/dispatcher retirement.
- Integration tests for Work and Code supervised run lifecycle with runtime
  stubs.
- Targeted Chat runtime probes for direct, solo, group, and parallel handoff.
- Optional live-provider smoke tests for Claude/Codex behind explicit developer
  environment flags; CI should not require live credentials or paid provider
  availability.
- Weak-model tests that prove Ollama/local models receive narrower SOP/tool
  surfaces unless capability evidence supports broader autonomy.

## Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Chat visible behavior regresses during decision-core cutover | High | Keep UI flow untouched; add direct/solo/group/parallel probes before deleting old paths. |
| Provider autonomy bypasses platform invariants | High | All provider outputs become proposed intents; platform validates and executes through supervised boundaries. |
| Old planner/dispatcher semantics linger indefinitely | High | Add import retirement test and make deletion a phase gate. |
| Weak models are treated like autonomous agents | Medium | Capability profile maps weak providers to SOP/classifier/worker modes by default. |
| Lifecycle scheduler starts reading transcript content | High | Static import tests enforce scheduler content blindness. |
| Real provider smoke becomes flaky or expensive | Medium | Keep live-provider tests optional; CI uses deterministic runtime stubs. |

## Progress Log

| Date | Update |
|------|--------|
| 2026-04-27 | Plan opened after PLAN-074 fake-driving-agent and runtime-boundary cutover prerequisites were met. |
