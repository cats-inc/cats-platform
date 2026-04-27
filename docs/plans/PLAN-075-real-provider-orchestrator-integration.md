# PLAN-075: Real Provider Orchestrator Integration

> Move from the PLAN-074 supervision shell into real provider-agent execution:
> Claude/Codex-backed driving agents, durable run lifecycle, Chat decision-core
> cutover, Work supervised runs, Code task/relay runs, and rescoping of the
> old planner/dispatcher core into Chat-only deterministic routing.

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
- [PLAN-023: Orchestrator Execution Loop and Recovery](./PLAN-023-orchestrator-execution-loop-and-recovery.md)
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
- `state.globalOrchestrator.executionTarget` still conflates two concepts:
  deterministic Chat router authority and the LLM-backed visible orchestrator
  participant used by solo / +New Chat execution.

## Objective

Replace the semantic-planning portion of the old Orchestrator decision core
with a provider-agent-driven core behind Cats-owned supervision. Deterministic
Chat routing remains a product promise and is retained as Chat-owned routing
logic.

The target architecture is:

1. A provider-backed driving agent receives a bounded observation and returns a
   semantic plan, recovery decision, tool request, or delegation request.
2. Cats validates that intent through deterministic policy, invariants,
   approval gates, tool manifests, budget, lifecycle, and product boundaries.
3. Cats executes allowed actions through supervised tool/runtime boundaries and
   persists evidence, traces, run state, and user-visible product projections.
4. Weak providers can still participate through narrower SOP/classifier/worker
   modes without being treated as autonomous peer agents.
5. Weak-model control is implemented by existing supervision pieces:
   `policyEngine` tightens per-action dials, `toolRegistry` exposes narrow
   weak-worker/SOP tools, `toolBoundary` validates schema, side effects, and
   approvals, and individual SOP tools run deterministic scaffolding before
   calling the weak model. PLAN-075 does not add a third first-class dispatcher
   or an alternate orchestration path.
6. Chat deterministic routing remains product-owned: explicit `@mention`
   resolution, room-default dispatch, audience / participant limits, lane /
   container addressing, and product recents/origin rules stay deterministic.
7. Old planner/dispatcher semantic-planning paths are retired. Remaining
   deterministic Chat router code is renamed or moved under Chat ownership
   instead of being treated as a compatibility shim.

## Scope

This plan covers:

- real Claude/Codex provider-agent integration through the supervision boundary
- capability profile bootstrap before live provider autonomy is enabled
- Ollama/local weak-model integration as tool-internal SOP/worker/classifier
  support, not as default autonomous agent execution
- weak-model policy dials and SOP tool internals, including tiny task
  granularity, SOP scaffolding, schema validation, retry, escalation, and
  tool-surface narrowing without introducing a separate dispatcher component
- Chat semantic decision-core cutover while preserving deterministic Chat
  routing behavior and visible Chat UI flows
- Work supervised run lifecycle beyond one-shot runtime launch
- Code task execute and relay fan-out convergence through the same run model
- lifecycle scheduler and run-loop ownership needed to keep provider agents
  alive, resumable, cancellable, and inspectable
- rescope of obsolete planner/dispatcher implementation after cutover:
  semantic-planning responsibilities leave the old core, deterministic Chat
  routing remains Chat-owned

## Non-Goals

- no redesign of Chat, Work, or Code renderer flows
- no new top-level Cat registry shape
- no conversion of temporary participants, solo execution targets, or worker
  invocations into durable Cats
- no provider-specific business logic outside provider adapters/capability
  profiles
- no direct product calls to runtime create/send outside
  `platform/supervision/runtimeBoundary`
- no deletion of deterministic Chat routing behavior. The target is not "no
  product path imports any router"; the target is "only Chat owns deterministic
  routing, and semantic planning no longer lives in the old core."
- no eval-suite execution or live session-history ingestion infrastructure.
  PLAN-075 lands schema/source fixtures for capability evidence source types,
  but does not run evals, stream session-history observations, or read raw
  transcript/history content into capability profiles; eval-driven and
  history-driven profile updates are tracked by a separate follow-up plan.
- no per-session provider-mode enum or capability-tier control-flow branch.
  Capability is an input to `policyEngine.decide*(ctx)`; it does not select an
  alternate orchestration path.

## Acceptance Criteria

- Capability profiles for Claude, Codex, Ollama/local, and unknown providers
  exist before any live provider-agent autonomy is enabled. Bootstrap covers
  catalog source evidence, schema-only eval/history source fixtures,
  operator overrides, and FR-19 override-floor enforcement.
- Chat direct, solo, group, and parallel send flows route semantic next-step
  choice through the new provider-agent decision seam where the task is
  agentic.
- Chat deterministic routing is explicitly carved out and remains product-owned:
  `@mention` resolution, room-default dispatch, audience / participant limits,
  lane/container addressing, and product recents/origin rules stay
  deterministic.
- The `globalOrchestrator.executionTarget` two-hat state is split or replaced:
  Chat router authority is not stored in the same slot as the LLM-backed
  visible orchestrator participant execution target.
- Chat visible behavior does not regress: route selection, typing handoff,
  runtime session metadata, direct lanes, group rooms, and parallel branches
  remain intact.
- Work supervised runs can start, resume, block, retry, cancel, request
  approval, delegate a child run, and persist user-visible timeline/evidence.
- Code `+New code`, `+Team code`, and `+Peer code` paths continue to work while
  task execute and relay fan-out are represented as supervised runs.
- Claude and Codex live provider paths can drive at least one Chat turn, one
  Work supervised run, and one Code task/relay path under supervision.
- Ollama/local weak-model paths use the same provider-agent decision seam and
  supervision lifecycle, but capability policy clamps their per-action dials:
  autonomy no higher than `single_step`, tiny task granularity, SOP scaffolding,
  schema-required validation, every-step checkpointing, narrow tool surfaces,
  and deterministic retry/escalation.
- Weak-model execution uses Cats-authored SOP tool internals rather than a
  separate dispatcher: a strong driver may call canonical tools such as
  `work.sop.ask_weak` or existing `work.sop.*` tools, and weak drivers may
  request only policy-allowed single-step SOP/tool actions. User-facing aliases
  such as `@ask-weak` must resolve through the product-owned command/alias
  resolver to canonical tool ids before entering `toolRegistry`.
- A weak model attempting autonomous delegation, broad-write access, or an
  unsupported next-step decision is rejected or escalated before execution.
- Tests demonstrate the same high-level request entering the same
  provider-agent decision seam under strong and weak capability profiles. The
  expected difference is policy dial output and allowed tool surface, not a
  second orchestration path.
- Provider-agent recovery happens within platform-selected
  `SupervisionPolicy.fallbackPolicy` options. The agent may propose which
  allowed fallback to use and provide corrected semantic input; the platform
  validates the proposal and still owns retry envelopes, escalation targets,
  approval gates, state transitions, and rejection.
- Code relay fan-out uses sibling supervised runs under one relay-round budget
  envelope by default. Child runs are reserved for delegation initiated by one
  running agent.
- Static tests fail any new product-layer direct runtime create/send calls.
- Non-Chat product trees cannot import the old Chat planner/dispatcher modules.
  Remaining Chat deterministic routing code is renamed/moved into a
  Chat-owned router path; old planner/dispatcher modules become un-importable
  from product trees once deterministic Chat routing lands in Chat ownership.

## Phase Gates

| Gate | Required Evidence |
|------|-------------------|
| Do not broaden provider tool access until FR-19 override-floor tests stay green. | `supervision-policy-engine.test.ts` and `supervision-tool-boundary.test.ts` cover denial and evaluated/observed positive paths. |
| Do not start live provider-agent autonomy before capability profile bootstrap lands. | Capability tests cover catalog source evidence, eval/history source fixtures without ingestion, conservative unknown defaults, operator override ceilings, and FR-19 override floor. |
| Do not wire live provider-agent autonomy before fake driving-agent recovery tests are green. | `supervision-fake-driving-agent.test.tsx` and `work-supervised-run.test.tsx` pass. |
| Do not change Chat visible UI while cutting the decision core. | Targeted Chat smoke/probe tests prove direct, solo, group, and parallel runtime handoff. |
| Do not add direct runtime create/send calls in product code. | `supervision-runtime-boundary.test.tsx` and `rg runtimeClient.createSession/sendMessage` show only `runtimeBoundary.ts` calls runtime directly. |
| Do not retire old semantic planner paths before Chat deterministic routing is carved out. | Static import test proves non-Chat product trees cannot import old Chat planner/dispatcher modules; Chat router tests prove deterministic behavior remains. |
| Do not add weak-model tools that bypass the provider-agent seam. | `weak-worker-no-ad-hoc-routing.test.ts` proves weak-model calls enter through registered supervised tools and `toolBoundary`; no Phase 7 routing entrypoint may invoke a weak provider directly. |

## Chat Deterministic Routing Carve-Out

Chat keeps deterministic routing as a product-owned contract. This is not the
old semantic planner, and it should not move into the provider-agent decision
loop.

Deterministic Chat routing includes:

- explicit `@mention` / addressed-target resolution
- direct-lane target binding
- room-default dispatch where the room topology already determines who should
  receive the turn
- audience and participant limits
- lane / branch / container addressing
- product-scoped recents and origin-surface ownership
- validation of whether a requested participant/audience mutation is allowed

Provider-agent semantic planning includes:

- how to decompose an open-ended task
- which allowed tool to use next inside an agentic workload
- when to delegate under an allowed policy
- how to summarize progress and decide stop/readiness inside the task
- how to choose among platform-approved fallback options after failure

The cutover must split these two responsibilities before any old
planner/dispatcher semantic code is removed. The likely outcome is that
deterministic Chat routing is renamed or moved under `src/products/chat/**`,
while semantic planning exits the old core.

## Orchestrator Two-Hat Split

The current `state.globalOrchestrator.executionTarget` slot conflates:

- rule-based Chat router authority
- the LLM-backed visible orchestrator participant execution target used by
  solo / +New Chat execution

PLAN-075 must split this before Chat cutover completes. The target shape is:

- a Chat-owned deterministic router configuration with no provider/model
  execution target
- a provider-agent execution target for the visible orchestrator participant,
  capability profile, and runtime session defaults
- projections that clearly tell renderers whether they are displaying routing
  authority, a visible participant, or a runtime-backed worker

This prevents solo / +New Chat from treating a provider/model change as a
router identity change, and prevents deterministic routing from inheriting
LLM-backed participant semantics.

## Capability Evidence Boundaries

PLAN-075's capability profile work is a schema seam, not a live evidence
ingestion system. The deliverable is:

- TypeScript contracts for capability source references.
- Zero-row or static fixture records proving catalog, eval-run reference,
  session-history summary reference, and operator override sources can be
  represented.
- Pure policy tests that consume those fixtures.

The bounded run/history summaries allowed in `policyEngine.decide*(ctx)` are
field-limited metadata summaries, not byte-limited transcript excerpts. Allowed
summary categories are:

- counts, such as completed run count, failed run count, retry count, timeout
  count, format-failure count, and tool-misuse count
- ratios/aggregates, such as success rate, schema-valid rate, approval-denial
  rate, median duration bucket, and budget-consumption bucket
- enumerated outcomes, such as last terminal state, last rejection code,
  capability source kind, and risk class

Raw user text, assistant text, transcript snippets, message bodies, prompt
fragments, and unbounded history summaries never enter
`policyEngine.decide*(ctx)`.

## Implementation Phases

### Phase 0: Inventory and Guardrails

- [ ] Task 0.1: Inventory current Chat planner/dispatcher imports and classify
      each path as decision, routing, transcript projection, runtime dispatch,
      or recovery.
- [ ] Task 0.2: Add a static boundary test that records the allowed direct
      runtime call location as only `src/platform/supervision/runtimeBoundary.ts`.
- [ ] Task 0.3: Add a static rescope test for old planner/dispatcher imports:
      non-Chat product trees must not import them. Chat imports are temporarily
      allowed only for deterministic routing until deterministic Chat routing
      lands in a Chat-owned router path; once it lands, the allowlist drops to
      the new router path and the old planner/dispatcher modules become
      un-importable from any product tree.
- [ ] Task 0.4: Record baseline targeted tests for Chat, Work, and Code runtime
      paths before cutover.
- [ ] Task 0.5: Inventory `cats-runtime` client/server capabilities required
      for lifecycle work: resume, cancel, observe, stream, close, delete, and
      session metadata persistence.

### Phase 1: Capability Profiles and Per-Action Policy Inputs

- [ ] Task 1.1: Bootstrap provider capability profiles for Claude, Codex,
      Ollama/local, and unknown providers using conservative defaults before
      any live provider-agent autonomy is enabled.
- [ ] Task 1.2: Define source-of-truth schema fixtures for capability evidence:
      provider catalog, eval suite/eval run reference, session-history summary
      reference, and operator override. PLAN-075 only lands the schema seam for
      these source types; live eval/history ingestion is a follow-up plan.
- [ ] Task 1.3: Enforce operator override ceilings and FR-19 override floor:
      overrides may change effective policy within evidence limits, but cannot
      create broad-write or unrestricted outcome delegation under
      unknown/catalog-only confidence.
- [ ] Task 1.4: Wire the capability profile as a per-action input to
      `policyEngine.decide*(ctx)` so dial output reflects provider capability
      together with task profile, bounded run/history metadata summaries, and
      invariants. Do not pass raw transcript/message/history content into
      `policyEngine.decide*(ctx)`, introduce a per-session provider-mode enum,
      or branch the orchestration path on capability tier; capability is a
      vector input, not a control-flow switch.
- [ ] Task 1.5: Add tests for capability conflicts, source metadata, override
      floor/ceiling, conservative unknown defaults, and how capability profiles
      shift `policyEngine.decide*(ctx)` dial output for the same task input
      across strong and weak providers.

### Phase 2: Provider-Agent Decision Seam

- [ ] Task 2.1: Define a provider-agent decision contract under
      `src/platform/orchestration/` for bounded observations, semantic plans,
      recovery decisions, tool/delegation requests, and confidence.
- [ ] Task 2.2: Implement a provider-agent adapter that calls runtime through
      the supervised runtime boundary, not directly.
- [ ] Task 2.3: Make policy validation own deterministic routing, invariants,
      approval, weak-model policy dial tightening, budget, retry, and
      rejection.
- [ ] Task 2.4: Add tests proving the platform preserves agent semantic choices
      instead of substituting its own plan.
- [ ] Task 2.5: Define weak-capability policy dials without bypassing the
      provider-agent seam: autonomy no higher than `single_step`, tiny task
      granularity, `sop_template` scaffolding, schema-required validation,
      every-step checkpointing, narrow tool surfaces, and deterministic
      retry/escalation.
- [ ] Task 2.6: Split `globalOrchestrator.executionTarget` into deterministic
      router configuration and visible orchestrator participant execution
      target. Renderers must receive projections that distinguish both hats.

### Phase 3: Chat Semantic Cutover and Router Rescope

- [ ] Task 3.1: Route Chat semantic planning through the new provider-agent
      decision seam while preserving existing Chat UI and transcript contracts.
- [ ] Task 3.2: Carve deterministic routing out of the old planner/dispatcher:
      explicit mentions, direct lanes, room-default dispatch, audience limits,
      lane/container addressing, and origin-surface recents remain Chat-owned
      deterministic behavior.
- [ ] Task 3.3: Preserve direct-cat, solo, group, and parallel semantics:
      participants, lanes, audience, runtime session metadata, typing handoff,
      and recents origin must not regress.
- [ ] Task 3.4: Split recovery ownership. `SupervisionPolicy.fallbackPolicy`
      defines the allowed fallback set, retry envelope, escalation targets,
      approval gates, and state transitions. The provider agent may propose
      which allowed fallback to use and provide corrected semantic input for
      that fallback. The platform validates the proposal, rejects disallowed
      fallback choices, and must not synthesize corrected semantic content on
      the agent's behalf. If no fallback option remains allowed, the run moves
      to a failed terminal state with evidence rather than asking the agent for
      another retry.
- [ ] Task 3.5: Add targeted Chat probes for direct, solo, group, and parallel
      sends that assert session start, assistant progress, response, and no
      direct runtime calls.
- [ ] Task 3.6: Rename or move retained deterministic Chat router code under
      Chat ownership once semantic-planning imports are gone.

### Phase 4: Durable Run Lifecycle Scheduler

- [ ] Task 4.1: Introduce a content-blind run lifecycle service for queued,
      running, waiting-for-approval, blocked, completed, failed, and cancelled
      supervised runs.
- [ ] Task 4.2: Support cooperative cancellation, timeout, retry, resume,
      pending approval cleanup, late-finishing action evidence, and terminal
      failure when no `fallbackPolicy` option is allowed.
- [ ] Task 4.3: Add child-run delegation with budget inheritance, parent/child
      scope narrowing, and deadlock/cycle detection.
- [ ] Task 4.4: Keep semantic decisions outside the scheduler; static tests must
      prevent scheduler imports of transcript/message content readers.
- [ ] Task 4.5: Define the run-loop decision handoff: after each provider
      response, semantic next-step choice returns to the provider-agent seam or
      the weak-worker tool boundary; the scheduler never reads response text to
      decide the next semantic action.
- [ ] Task 4.6: Update `cats-runtime` client/server contracts only where needed
      for lifecycle operations. If no runtime change is required, record why in
      the progress log.

### Phase 5: Work Real Provider Runs

- [ ] Task 5.1: Replace Work one-shot launch with a supervised provider-agent
      run loop that can continue after first response. The loop lives in the
      provider-agent decision seam from Phase 2, not inside the lifecycle
      scheduler from Phase 4 and not inside `products/work/api`; the lifecycle
      scheduler only manages run-state transitions and budget/cancellation
      bookkeeping and never reads response content to decide the next semantic
      action.
- [ ] Task 5.2: Persist provider-agent observations, plans, tool requests,
      approvals, and outcomes into task timeline, evidence, and run metadata.
- [ ] Task 5.3: Implement Work resume/retry/cancel endpoints or actions using
      the lifecycle service.
- [ ] Task 5.4: Verify Claude/Codex can drive a Work supervised run from task
      detail without changing the Work UI flow.

### Phase 6: Code Real Provider Runs

- [ ] Task 6.1: Represent Code task execute as a supervised run with runtime
      session attachment, evidence, and task/run metadata.
- [ ] Task 6.2: Represent Code relay fan-out as sibling supervised runs under
      one relay-round budget envelope, with per-agent evidence and convergence
      records. Child runs are used only when a running relay agent delegates.
- [ ] Task 6.3: Keep `+New code`, `+Team code`, and `+Peer code` entry flows
      stable while moving execution behind the run lifecycle.
- [ ] Task 6.4: Verify Claude/Codex can drive one Code task execute and one
      relay fan-out path under supervision.

### Phase 7: Weak-Worker Tools and SOP Pipelines

- [ ] Task 7.1: Extend the PLAN-074 `toolRegistry` (which already seeds
      `work.sop.classify_text_batch` as the first weak-worker SOP tool) only
      with canonical `work.sop.ask_weak` for the first live weak-provider
      slice. `work.sop.ask_weak` is not a generic prompt passthrough; its input
      schema shall include a bounded `question`, an `expectedOutputSchemaRef`,
      an explicit `allowedToolNames` list, and a hard budget. Its output schema
      shall be structured and schema-validated before the result reaches the
      driver. The manifest declares narrow input schemas, side-effect class,
      approval behavior, and capability floor, following the PLAN-074 manifest
      shape. User-facing aliases such as `@ask-weak` must map to canonical
      dotted tool ids in the product-owned command/alias resolver before
      registry lookup; extraction, summarization, translation, schema-fill, and
      broader `work.sop.*` catalog expansion are follow-up scope unless needed
      by the first live slice.
- [ ] Task 7.2: Implement deterministic SOP scaffolding inside the individual
      weak-worker tools, reusing the PLAN-074 supervised-tool pattern. SOP
      tools own prompt templates, expected schemas, retry limits, escalation
      targets, and confidence thresholds for their bounded operation; they do
      not introduce a parallel dispatcher layer above the tool boundary.
- [ ] Task 7.3: Enforce weak-capability dials through `policyEngine` and
      `toolBoundary`: no autonomous delegation, broad-write, unrestricted
      outcome delegation, or open-ended recovery ownership unless capability
      evidence and policy explicitly allow it.
- [ ] Task 7.4: Add a contrast test proving strong and weak capability profiles
      enter the same provider-agent seam for the same high-level request, while
      weak profiles receive stricter policy dials and narrower permitted tools.
- [ ] Task 7.5: Add evidence tests proving weak-worker calls are attributed as
      tool executions under the parent run/driver, not as independent peer
      agent lifecycles by default.
- [ ] Task 7.6: Add a static or contract test proving Phase 7 does not create
      a weak-model routing entrypoint outside the provider-agent seam,
      `toolRegistry`, and `toolBoundary`. Weak-provider calls must originate
      from registered supervised tool executors, not ad hoc route helpers.
      Name this test `weak-worker-no-ad-hoc-routing.test.ts`.

### Phase 8: Chat Router Ownership and Old Semantic Core Removal

- [ ] Task 8.1: Move or rename retained deterministic Chat routing into a
      Chat-owned module path. Its contract remains `@mention` resolution,
      direct-lane binding, room-default dispatch, audience limits,
      lane/container addressing, and recents/origin ownership.
- [ ] Task 8.2: Remove semantic-planning exports from the old
      planner/dispatcher modules after Chat, Work, and Code semantic paths use
      the provider-agent seam.
- [ ] Task 8.3: Add/keep static tests proving non-Chat product trees cannot
      import old planner/dispatcher modules. Chat may import the new
      deterministic router path because that routing is still a product
      contract.
- [ ] Task 8.4: Update docs and tests so the canonical split is explicit:
      Chat deterministic router owns routing; provider-agent seam owns
      agentic semantic planning; supervision policy owns validation, fallback,
      approval, budget, and invariants.

## Weak-Model Control Contract

Weak-model support is not a second personality mode for the Orchestrator. It is
the same supervision system applying denser platform control when the worker is
not capable enough to own the plan.

PLAN-075 must not introduce a standalone weak-model dispatcher. The ownership
line is:

- `policyEngine` chooses per-action supervision dials from capability evidence,
  risk, tool manifest, run budget, and product invariant context
- `toolRegistry` defines the weak-worker/SOP tools that may call a weak model
- `toolBoundary` enforces schema, side-effect class, approval, scope, retry,
  rejection, and evidence emission
- each SOP tool owns its internal prompt scaffolding, expected output schema,
  bounded retry, confidence threshold, and escalation target

Registered weak-worker tools use canonical dotted ids such as
`work.sop.classify_text_batch` and `work.sop.ask_weak`. UI/composer aliases
such as `@ask-weak` are not registry ids; they are owned by the product command
/ alias resolver and must be resolved before the tool request reaches
`toolRegistry`.

`work.sop.ask_weak` is not a generic weak-model passthrough. Its first-slice
contract is:

- input includes a bounded `question`, an `expectedOutputSchemaRef`, an
  explicit `allowedToolNames` list, and a hard budget
- output is structured, schema-validated, and rejected with `E_SCHEMA_INVALID`
  before the result reaches the driver when validation fails
- the executor may call a weak provider only inside the supervised tool
  boundary and must persist evidence under the parent run/driver

For weak providers, the default policy dial shape is:

- `autonomy <= single_step`
- `taskGranularity = tiny`
- `scaffolding = sop_template`
- `validation = schema_required`
- `checkpointCadence = every_step`
- narrow tool surface and no broad-write tools
- deterministic retry/escalation selected by policy and the tool manifest

The weak model owns only the bounded response for the current action. It may
classify, summarize, extract, rewrite, format, or complete a narrow SOP tool
call. It does not own broad delegation, multi-step recovery, cross-product
routing, or write-heavy tool choice unless capability evidence and policy
explicitly grant that access for that action.

For strong providers, Cats can allow more semantic planning, but the same
policy/invariant/tool boundary still validates every proposed action before
execution. The difference is control density, not a boolean switch.

## Files Likely to Change

| Path | Action | Notes |
|------|--------|-------|
| `src/platform/orchestration/**` | Modify/Create | Provider-agent decision seam and removal of old semantic-planning paths. |
| `src/platform/supervision/**` | Modify | Runtime boundary, lifecycle hooks, scheduler integration, static guardrails. |
| `src/products/chat/state/**` | Modify | Route Chat orchestrator planning/recovery through the new seam and split two-hat orchestrator state. |
| `src/products/chat/routing/**` | Create/Modify | Product-owned deterministic Chat router if retained code is moved/renamed. |
| `src/products/chat/api/**` | Modify | Preserve runtime route support while cutting decision logic. |
| `src/products/work/api/**` | Modify | Work provider-agent lifecycle endpoints and projections. |
| `src/products/work/renderer/**` | Modify minimally | Only product-owned run actions/status surfaces; no UI redesign. |
| `src/products/code/state/**` | Modify | Code task execute run lifecycle. |
| `src/products/code/api/**` | Modify | Code relay/task execution run lifecycle. |
| `../cats-runtime/**` | Inspect/Modify if needed | Lifecycle operations such as resume, cancel, observe, stream, close/delete, and session metadata persistence. |
| `tests/supervision-*.test.*` | Modify/Create | Boundary, provider-agent, lifecycle, and capability tests. |
| `tests/chat-*.test.*` | Modify/Create | Chat decision-core cutover probes. |
| `tests/work-*.test.*` | Modify/Create | Work real-provider run lifecycle coverage. |
| `tests/code-*.test.*` | Modify/Create | Code task/relay supervised run coverage. |
| `tests/weak-worker-no-ad-hoc-routing.test.ts` | Create | Static/contract guard that forbids weak-provider calls outside registered supervised tool executors and `toolBoundary`. |
| `tests/weak-worker-*.test.*` | Create | First-slice weak-worker/SOP tool manifest, schema validation, escalation, policy dials, and evidence attribution. |

## Testing Strategy

- Unit tests for provider-agent contract parsing, validation, and rejection.
- Static boundary tests for direct runtime calls, scheduler content blindness,
  and non-Chat imports of old Chat planner/dispatcher modules.
- Capability profile tests for catalog source evidence, eval/history source
  fixtures without ingestion, operator override, conflict preservation,
  conservative unknown defaults, and FR-19 override-floor enforcement.
- Integration tests for Work and Code supervised run lifecycle with runtime
  stubs.
- Targeted Chat runtime probes for direct, solo, group, and parallel handoff.
- Live-provider smoke tests for Claude/Codex are optional in CI and gated behind
  explicit developer environment flags, but PLAN completion requires recorded
  local/manual evidence for one Chat turn, one Work supervised run, and one
  Code task/relay path. If credentials are unavailable, this plan remains
  blocked rather than silently complete.
- Weak-model tests prove Ollama/local capability profiles use the same decision
  seam, receive stricter policy dials, can only access allowed weak-worker/SOP
  tool(s), validate required schemas, and persist evidence under the parent
  run/driver instead of creating peer driving-agent lifecycles.
- `weak-worker-no-ad-hoc-routing.test.ts` proves no Phase 7 weak-model routing
  entrypoint calls a weak provider outside registered supervised tool executors
  and `toolBoundary`.

## Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Chat visible behavior regresses during decision-core cutover | High | Keep UI flow untouched; add direct/solo/group/parallel probes before removing old semantic-planning paths. |
| Provider autonomy bypasses platform invariants | High | All provider outputs become proposed intents; platform validates and executes through supervised boundaries. |
| Chat deterministic routing is accidentally treated as obsolete old core | High | Move/rename it into Chat ownership and test `@mention`, room default, direct lane, audience, and recents routing as product contracts. |
| Old planner/dispatcher semantic behavior lingers indefinitely | High | Add non-Chat import tests and make old semantic-planning path removal a phase gate while preserving Chat deterministic routing. |
| Weak models are treated like autonomous agents | Medium | Keep weak profiles on the same seam with stricter policy dials and expose weak-model calls only through supervised weak-worker/SOP tools by default. |
| Capability profiles arrive after live provider autonomy | High | Phase 1 and phase gates require conservative profile bootstrap and FR-19 override-floor tests before live autonomy is wired. |
| Phase 7 SOP work grows ad-hoc routing that bypasses the provider-agent seam | Medium | Do not introduce a standalone dispatcher; keep semantic choice in the provider-agent seam, supervision dials in `policyEngine`, enforcement in `toolBoundary`, deterministic scaffolding inside individual SOP tools, and `weak-worker-no-ad-hoc-routing.test.ts` against direct weak-provider calls. |
| Lifecycle scheduler starts reading transcript content | High | Static import tests enforce scheduler content blindness. |
| Real provider smoke becomes flaky or expensive | Medium | Keep live-provider tests optional; CI uses deterministic runtime stubs. |

## Progress Log

| Date | Update |
|------|--------|
| 2026-04-27 | Plan opened after PLAN-074 fake-driving-agent and runtime-boundary cutover prerequisites were met. |
| 2026-04-27 | Clarified weak-model final state: Cats retains denser SOP/policy control for weak providers, while strong providers may own more semantic planning under the same supervision boundary. |
| 2026-04-28 | Aligned phases with ADR-082: capability profiles move before live autonomy, weak providers default to tool-internal SOP workers, Chat deterministic routing is carved out as a retained product contract, and old core cleanup targets semantic-planning paths only. |
| 2026-04-28 | Removed the standalone weak-model dispatcher shape: weak-model control now stays on the same provider-agent seam and is expressed through policy dials, tool manifests, tool boundary enforcement, and individual SOP tool internals. |
| 2026-04-28 | Closing pass: dropped the residual provider-mode enum from Phase 1 in favor of capability-as-policy-input, pinned the Work run loop to the Phase 2 provider-agent seam, scoped the temporary Chat planner import allowance to deterministic Chat router landing, split recovery ownership between platform `fallbackPolicy` and agent semantic reasoning, and recorded eval/history ingestion + provider-mode enum as Non-Goals. |
| 2026-04-28 | Closing pass follow-up: anchored Phase 7 Task 7.1/7.2 to the existing PLAN-074 `toolRegistry` seed (`work.sop.classify_text_batch`) and supervised-tool pattern; renamed the SOP-control risk so it flags Phase 7 ad-hoc routing rather than a generic competing-planner concern. |
| 2026-04-28 | Review close-out: scoped eval/history to schema fixtures, bounded session-history inputs to metadata summaries, restored recovery as agent proposals within platform fallback policy, made Chat router move/rename mandatory, canonicalized weak-worker tool ids, narrowed Phase 7 first-slice tools, and added a no-ad-hoc-weak-routing gate/test. |
| 2026-04-28 | Precision close-out: defined bounded capability summaries, made the schema seam type-plus-fixture only, committed Phase 7's first weak-provider slice to non-passthrough `work.sop.ask_weak`, assigned alias resolution to the product command resolver, and unified the anti-bypass guard under `weak-worker-no-ad-hoc-routing.test.ts`. |
