# PLAN-074: Cats Work Agent Supervision Rollout

> Turn ADR-082 / SPEC-082 into the first shippable Work vertical slice:
> shared supervision contracts, conservative capability bootstrap,
> supervised tool boundaries, policy snapshots, evidence, and a fake
> driving-agent harness that proves Cats owns the boundary while the
> agent owns semantic planning.

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Ready for Review |
| **Owner** | Codex |
| **Reviewer** | User |

## Related Spec / Dependencies

- [SPEC-082: Cats Work Agent Supervision and Tool Boundary](../specs/SPEC-082-cats-work-agent-supervision-and-tool-boundary.md)
- [ADR-082: Recast the Orchestrator as a Capability Shell with Policy-Dial Supervision](../decisions/082-recast-orchestrator-as-capability-shell-with-policy-dial-supervision.md)
- [ADR-081: Canonicalize the Core Record Taxonomy as Interaction / Planning / Execution](../decisions/081-canonicalize-three-tier-core-record-taxonomy.md)
- [SPEC-062: Agent Missions, Managed Work, and Transport Bindings](../specs/SPEC-062-agent-missions-and-transport-bindings.md)
- [PLAN-054: Agent Missions, Managed Work, and Transport Bindings](./PLAN-054-agent-missions-managed-work-and-transport-bindings.md)
- [SPEC-040: Cats Work Team Templates and Work Intake](../specs/SPEC-040-cats-work-team-templates-and-work-intake.md)
- [PLAN-028: Cats Work Team Templates and Work Intake](./PLAN-028-cats-work-team-templates-and-work-intake.md)

## Overview

This plan ships the supervision model as a thin platform capability consumed
by `Cats Work` first. It deliberately does **not** wire a real Claude/Codex
agent process as the first step. The first slice must prove the contracts
before provider-specific behavior enters the system.

The rollout target is:

- shared TypeScript contracts for `SupervisionPolicy`, policy snapshots,
  capability assessment, tool manifests, `ToolResult`, run state, cancellation,
  and `AddressableTarget`
- conservative capability bootstrap that keeps provider delivery events
  separate from model/tool skill
- a supervised tool registry that enforces manifests, policy, invariants,
  approval, cancellation, and evidence
- Work run state and projection support that stays content-blind at the
  scheduler layer
- a fake driving-agent test harness that supplies semantic plans so tests can
  verify the platform enforces boundaries without replacing the plan
- one weak-worker/SOP sample path that is schema-validated and budget-limited

## Implementation Status

As of 2026-04-25, the local implementation has completed the supervision
contract/policy/tool-boundary foundation and the first shippable Work
supervised-run vertical slice.

Completed:

- shared supervision contracts, stable rejection codes, capability assessment,
  policy dials, schema versioning, tool manifests, runtime boundary manifests,
  and Work sample supervised tools
- durable tool-boundary evidence JSONL persistence with policy snapshot refs
- durable policy snapshot persistence as ADR-081 execution traces, without a
  new canonical record family
- supervised run inspection projection over core runs, run-state metadata,
  policy snapshot traces, and evidence rows
- Work task detail API projection with durable evidence supplied through the
  route dependency
- Work-owned task detail panel showing supervised run state, blockers, pending
  approvals, policy snapshot count, and evidence count
- cancellation context propagation into durable tool evidence
- fake driving-agent harness with rejection recovery and policy snapshot
  lineage on boundary evidence
- standardized helper for writing `metadata.supervision.runState`
- Work supervised-run launch route that seeds a bounded budget, reuses an
  existing active supervised run for the same task, and returns the inspection
  projection
- Work renderer action for starting a supervised run from task detail without
  changing navigation flow
- async lifecycle spawn tool for creating managed child runs under parent
  budget caps, plus Work fake-run coverage that delegates a child run through
  the tool boundary
- product-level Work fake-agent vertical test that starts through the Work API,
  persists policy snapshots, writes durable evidence, and reads the resulting
  inspection back through task detail
- static import-boundary enforcement for content-blind supervision lifecycle
  modules and product-owned rendering
- supervised tool approval requests can now be persisted into the production
  approval queue through run-scoped approval bindings, and owner decisions can
  be synchronized back into supervised run-state metadata
- `/api/core/approvals` recognizes supervised approval bindings and applies
  owner approval/rejection decisions back to the supervised run state

Follow-up:

- [PLAN-075: Real Provider Orchestrator Integration](./PLAN-075-real-provider-orchestrator-integration.md)
  now owns real Claude/Codex/provider-agent integration, Chat decision-core
  cutover, durable provider run lifecycle, and old planner/dispatcher cleanup.

## Non-Goals

- no Chat routing refactor and no deletion of `planner.ts` / `dispatcher.ts`
- no final Work supervision UI beyond existing/projection-compatible run
  inspection surfaces
- no new War Room surface development. Existing War Room mentions in this plan
  are historical verification context only; follow-up Work supervision UI
  should use task detail, Cockpit, Broken Links, or a new explicitly scoped
  surface instead.
- no new top-level canonical record family outside ADR-081 execution records
- no promotion of weak workers into durable Cats or operational agents
- no broad tool catalog; first slice uses a small testable tool set
- no real provider integration inside PLAN-074. Real Claude/Codex/provider-agent
  integration is tracked by [PLAN-075](./PLAN-075-real-provider-orchestrator-integration.md).

## Implementation Phases

### Phase 1: Shared Supervision Contracts

- [ ] Task 1.0: Survey existing type/function names before adding new
      contracts. Run `rg` across `src/platform/orchestration`,
      `src/platform/runtime`, `src/core`, and `src/shared` for
      `SupervisionPolicy`, `ToolResult`, `RunState`, `CapabilityAssessment`,
      and `CancellationContext`; reuse or rename deliberately rather than
      accidentally shadowing local concepts.
- [ ] Task 1.1: Create `src/platform/supervision/contracts.ts` exporting:
  - `SupervisionPolicy`
  - `SupervisionPolicySnapshot`
  - `PolicyContextSummary`
  - `CapabilityAssessment`
  - `CapabilitySourceEvidence`
  - `SupervisedToolManifest`
  - `SchemaRef`
  - `ToolResult<T>`
  - `AddressableTarget`
  - `RunPrimaryState`
  - `RunBlocker`
  - `CancellationContext`
  - `SupervisionSchemaVersion`
  `CancellationContext` shall include the SPEC-082 mandatory fields,
  including `reasonCode`; `toolCancellation` shall be derived from the tool
  manifest's `cancellation` value. `SupervisionSchemaVersion` shall use this
  minimum shape and shall be recorded on capability assessments, tool
  manifests, and policy snapshots that depend on this schema:

  ```ts
  interface SupervisionSchemaVersion {
    major: number;
    minor: number;
  }
  ```
- [ ] Task 1.2: Create `src/platform/supervision/errors.ts` for stable
      rejection codes:
  - `E_AUDIENCE_LIMIT_EXCEEDED`
  - `E_NOT_AUTHORIZED`
  - `E_BUDGET_EXCEEDED`
  - `E_APPROVAL_REQUIRED`
  - `E_APPROVAL_DENIED`
  - `E_RUN_CANCELLED`
  - `E_PRECHECK_FAILED`
  - `E_TOOL_SCOPE_DENIED`
  - `E_SCHEMA_INVALID`
- [ ] Task 1.3: Add `src/platform/supervision/index.ts` exports and keep the
      module independent from `products/work/renderer`.
- [ ] Task 1.4: Add contract tests proving:
  - `ToolResult` is discriminated by `status`
  - `AddressableTarget` excludes human operators
  - `SupervisedToolManifest.cancellation` is mandatory
  - `CancellationContext.reasonCode` is mandatory
  - policy snapshots use `policyBundleVersion` and optional `dialVersions`
  - aggregate-method/schema evolution is tied to `SupervisionSchemaVersion`

**Deliverables**: compile-time contracts and unit coverage, with no runtime
behavior change.

### Phase 2: Capability Assessment and Policy Engine

- [ ] Task 2.1: Create `src/platform/supervision/capabilityAssessment.ts`
      implementing conservative bootstrap:
  - absent an explicit capability bootstrap YAML rule, provider/model/control
    targets produce default/unknown bootstrap treatment
  - matching bootstrap config source evidence may produce `catalog_only`
    initial treatment, but provider catalogs alone do not assign strong/weak
    treatment
  - delivery/observability capabilities do not raise model confidence
  - source evidence is unordered and keyed by `evidenceId`
  - `assessedAt` updates when evidence changes; old `observedAt` values remain
  - conflicts are recorded when the same dimension has different levels
- [ ] Task 2.2: Create `src/platform/supervision/policyEngine.ts` with pure
      `decideSupervisionPolicy(ctx)` and per-dial helpers. The first version
      may be simple, but it must evaluate per action. In Phase 2, manifest-
      coupled dials such as tool-scope and approval decisions shall use small
      test fixtures rather than the future registry; Phase 3 completes those
      dials against the real `toolRegistry`.
- [ ] Task 2.3: Create `src/platform/supervision/policyVersions.ts` with
      `policyBundleVersion` and optional `dialVersions`.
- [ ] Task 2.4: Add operator override support as source evidence. Overrides
      may adjust effective policy but must not raise `confidenceLevel` above
      strongest non-override evidence and must not bypass the FR-19 effective-
      policy floor for `unknown` / `catalog_only` profiles. Any override that
      attempts `toolScope: 'broad_write'` or unrestricted
      `autonomy: 'outcome_delegation'` under that floor shall be rejected with
      `E_TOOL_SCOPE_DENIED` and recorded in policy snapshot reasons.
- [ ] Task 2.5: Add tests for:
  - unknown/catalog-only profile stays conservative
  - rich provider delivery events do not raise capability confidence
  - eval/history can downgrade catalog claims
  - conflicting source evidence populates `conflicts[]`
  - operator override metadata appears in snapshot reasons
  - operator override cannot lift the FR-19 floor; attempted `broad_write` /
    unrestricted `outcome_delegation` under `unknown` / `catalog_only` returns
    `E_TOOL_SCOPE_DENIED` and records the attempt in snapshot reasons
  - evaluated/observed capability can grant `broad_write` when other policy
    inputs allow it, the tool's `sideEffect` is `external_visible`,
    `destructive`, or `expensive`, and the resulting
    `approvalThreshold` is `high`; combinations that would grant
    `broad_write` with `medium` or lower approval on side-effect-bearing
    tools shall fail the test
  - `dialVersions` appears when a dial is independently versioned or
    experiment-participating
  - `aggregateMethod: 'conservative_per_dimension'` is covered by the current
    `SupervisionSchemaVersion`

**Deliverables**: deterministic, replayable policy decisions over explicit
capability evidence.

### Phase 3: Supervised Tool Registry and Boundary

- [ ] Task 3.1: Create `src/platform/supervision/toolRegistry.ts` with:
  - manifest registration
  - schema reference validation hooks
  - side-effect classification
  - tool-surface filtering by policy and parent run grants
- [ ] Task 3.2: Create `src/platform/supervision/toolBoundary.ts` that wraps
      tool execution and returns `ToolResult<T>` for every supervised call.
      In Phase 3, use an in-memory evidence sink so tool-boundary behavior can
      be tested before Phase 4 durable evidence persistence lands.
- [ ] Task 3.3: Implement the first three supervised tools:
  - `work.context.lookup`: read-only lookup over Work/core projection data
  - `work.local_note.apply`: local-state mutation for a draft/run note
  - `work.approval_gated.apply`: mutation that always returns
    `pending_approval` before landing, applies idempotently after approval,
    returns `E_APPROVAL_DENIED` when a denied approval request is retried, and
    returns `E_RUN_CANCELLED` when called against a cancelled run
- [ ] Task 3.4: Wire preflight behavior:
  - read-only preflight where feasible
  - `preflight: 'not_supported'` only with declared failure codes
  - no silent try-and-see mutating tools
- [ ] Task 3.5a: Wire cancellation lifecycle behavior:
  - `cooperative` / `best_effort` tools receive cancel requests
  - `not_supported` tools are not assumed interruptible
- [ ] Task 3.5b: Wire cancellation context mapping:
  - manifest `cancellation` maps into `CancellationContext.toolCancellation`
    (`cooperative` → `cooperative_requested`, `best_effort` →
    `best_effort_requested`, `not_supported` → `not_supported`)
  - cancellation evidence includes mandatory `reasonCode`
- [ ] Task 3.5c: Wire cancelled/denied request rejection behavior:
  - cancelled runs reject new tool calls with `E_RUN_CANCELLED`
  - denied approval retries reject with `E_APPROVAL_DENIED`
- [ ] Task 3.6: Add tool-boundary tests for:
  - all three `ToolResult` statuses
  - `E_TOOL_SCOPE_DENIED` when parent grants and action policy intersect empty
  - `E_TOOL_SCOPE_DENIED` when an override attempts to bypass the FR-19 floor
  - pending approval means no mutation landed
  - approval accepted applies idempotently
  - denied approval retry returns `E_APPROVAL_DENIED`
  - cancelled-run tool call returns `E_RUN_CANCELLED`
  - over-limit/invariant failure is rejected, not clipped
  - cancellation manifest behavior

**Deliverables**: a small but real supervised tool layer that can be used by
Work runs and contract tests.

### Phase 4: Work Run State, Policy Snapshots, and Evidence

- [ ] Task 4.1: Add execution-layer record helpers for supervised runs,
      actions, policy snapshots, approval references, and evidence references.
      Reuse ADR-081 execution records; do not add a new canonical top-level
      record family.
- [ ] Task 4.2: Create `src/platform/supervision/runState.ts` implementing:
  - primary state derivation
  - `blockers[]`
  - approval-denied path with/without fallback
  - operator cancellation
  - terminal-state precedence
  - cancellation context for late-finishing actions
  - `CancellationContext.reasonCode` and `toolCancellation` mapping
- [ ] Task 4.3: Extend `src/platform/persistence/evidence.ts` or adjacent
      execution persistence to write redacted evidence rows for applied
      mutations and high-risk rejections.
- [ ] Task 4.4: Ensure policy snapshots are durable and referenced by evidence.
- [ ] Task 4.5: Add projection support for Work run inspection using existing
      Work/API projection patterns. Keep rendering in Work renderer modules;
      platform supervision emits only contracts/events/projections.
- [ ] Task 4.6: Add tests for:
  - initial state with simultaneous approval and non-approval blockers
  - approval denial fallback vs terminal failure
  - operator cancellation closes pending approvals
  - applied mutations are not rolled back by cancellation
  - late-finishing actions carry `CancellationContext` with mandatory
    `reasonCode` and correct manifest-derived `toolCancellation`
  - scheduler decisions use metadata and do not read message/transcript text
- [ ] Task 4.7: Add static import-boundary enforcement, either as a dedicated
      test or small script, proving:
  - scheduler/run-state modules do not import raw message/transcript/prompt
    content readers
  - `src/platform/supervision/**` does not import
    `src/products/*/renderer/**`
  - Work supervision does not import Chat routing internals except through
    declared product APIs

**Deliverables**: Work can create and inspect supervised run state with durable
policy/evidence lineage.

### Phase 5: Fake Driving-Agent and Weak-Worker Harness

- [ ] Task 5.0: Define the fake driving-agent harness interface before writing
      the vertical-slice tests:

  ```ts
  interface FakeDrivingAgent {
    initialPlan(input: FakeAgentInput): SemanticPlan;
    reviseAfterRejection(input: FakeAgentInput, trace: ObservedActionTrace, rejection: ToolRejectionObservation): SemanticPlan;
  }

  interface FakeAgentInput {
    runId: string;
    workItemId?: string;
    goal: string;
    availableTools: SupervisedToolManifest[];
    policySnapshot: SupervisionPolicySnapshot;
    contextRefs: string[];
    budget: BudgetEnvelope;
  }

  interface SemanticPlan {
    planId: string;
    revisionOf?: string;
    steps: Array<{
      stepId: string;
      target: AddressableTarget;
      toolName: string;
      args: unknown;
      expectation?: 'applied' | 'pending_approval' | 'rejected';
    }>;
    stopCondition: 'after_steps' | 'after_approval' | 'on_rejection';
  }

  interface ObservedActionTrace {
    planId: string;
    observedStepIds: string[];
    toolCalls: Array<{
      stepId: string;
      toolName: string;
      status: ToolResult<unknown>['status'];
      result?: unknown;
      error?: { code: string; message: string; details?: unknown };
      requestId?: string;
    }>;
  }

  interface ToolRejectionObservation {
    stepId: string;
    toolName: string;
    code: string;
    message: string;
    details?: unknown;
  }
  ```

  The test harness shall compare `SemanticPlan.steps[*].stepId` with
  `ObservedActionTrace.observedStepIds` to prove the platform enforced the
  submitted plan rather than substituting a platform-generated semantic plan.
  Recovery ownership shall be tested by injecting a rejection such as
  `E_TOOL_SCOPE_DENIED`, passing the observed trace and rejection to
  `reviseAfterRejection`, and verifying the replacement plan comes from the
  fake agent rather than from platform logic.
- [ ] Task 5.1: Create the fake driving-agent harness under tests with at
      least two alternative semantic plans for the same Work fixture.
- [ ] Task 5.2: Add a weak-worker/SOP sample tool, such as
      `work.sop.classify_text_batch`, with:
  - `toolScope: 'none'`
  - strict input/output schema
  - explicit budget envelope
  - schema validation before the result reaches the driving agent
- [ ] Task 5.3: Add a Work run fixture that combines:
  - strong-driver outcome delegation
  - read-only lookup
  - weak-worker classification
  - local mutation
  - approval-gated mutation
  This fixture drives `platform/supervision` internals directly and does not
  go through Work API routes; Phase 6 is the first phase that exercises the
  product API path.
- [ ] Task 5.4: Add contract tests proving:
  - semantic planning choice comes from the fake agent
  - rejection recovery plan comes from `reviseAfterRejection`, not platform
    substitution
  - the platform caps `reviseAfterRejection` recovery depth at a declared
    maximum (default 3). Exceeding the cap shall terminate the run with
    `failed` and evidence reasoning referencing the cap; the platform shall
    not silently keep calling `reviseAfterRejection` forever
  - observed action trace preserves the fake agent's selected step order
  - observed trace captures rejection `error.code` across the main FR-29
    codes, at minimum: `E_TOOL_SCOPE_DENIED`, `E_APPROVAL_DENIED`,
    `E_RUN_CANCELLED`, `E_BUDGET_EXCEEDED`, and `E_SCHEMA_INVALID`
  - deterministic routing/invariants remain platform-owned
  - weak-worker tool surface is narrower than parent run
  - worker schema failure follows `fallbackPolicy`
  - evidence captures actor/model/policy/tool/approval/pre-post summaries

**Deliverables**: first end-to-end supervised Work run without relying on a real
provider agent.

### Phase 6: Work API and Minimal Projection Integration

- [ ] Task 6.1: Add Work API routes for starting a supervised run from a
      managed-work/mission fixture or selected Work item.
- [ ] Task 6.2: Add Work API routes/projections for:
  - run state
  - blockers
  - policy snapshot summary
  - pending approvals
  - evidence summaries
  - tool-call results
- [ ] Task 6.3: Add a minimal Work-visible supervised-run status surface.
      Prefer reusing `RunInspector`, but if it cannot absorb the first slice
      cleanly, add the smallest product-owned renderer change that shows run
      state, blockers, pending approval count, evidence count, and last tool
      result summary. Full inspection UX remains deferred. Do not put React/UI
      logic in platform supervision.
- [ ] Task 6.4: Add manual verification notes for the first supervised Work
      run fixture.
- [ ] Task 6.5: Update docs if actual implementation paths differ from this
      plan.

**Deliverables**: Work can start and inspect the first supervised run through
product-owned API/projection surfaces.

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `cats-platform/src/platform/supervision/contracts.ts` | Create | Shared supervision contracts from SPEC-082. |
| `cats-platform/src/platform/supervision/errors.ts` | Create | Stable rejection code constants and helpers. |
| `cats-platform/src/platform/supervision/capabilityAssessment.ts` | Create | Conservative capability bootstrap and evidence aggregation. |
| `cats-platform/src/platform/supervision/policyEngine.ts` | Create | Per-action policy decision functions. |
| `cats-platform/src/platform/supervision/policyVersions.ts` | Create | Bundle/dial version metadata. |
| `cats-platform/src/platform/supervision/toolRegistry.ts` | Create | Tool manifest registry and tool-surface filtering. |
| `cats-platform/src/platform/supervision/toolBoundary.ts` | Create | Policy/invariant/approval/evidence boundary returning `ToolResult<T>`. |
| `cats-platform/src/platform/supervision/runState.ts` | Create | Run primary-state derivation, blockers, cancellation, approval-denial behavior. |
| `cats-platform/src/platform/supervision/index.ts` | Create | Public exports. |
| `cats-platform/src/platform/persistence/evidence.ts` | Modify | Add or reuse evidence helpers for supervised tool mutations and high-risk rejections. |
| `cats-platform/src/core/model/executionRecords.ts` | Modify | Add execution-layer shapes only if needed for supervised run snapshots/evidence references. |
| `cats-platform/src/core/api/recordExecutionRoutes.ts` | Modify | Expose supervised run/policy/evidence projections if existing execution routes are the right seam. |
| `cats-platform/src/products/work/api/contracts.ts` | Modify | Add Work-facing run/projection contract shapes. |
| `cats-platform/src/products/work/api/projectionSupport.ts` | Modify | Add supervised run projection helpers. |
| `cats-platform/src/products/work/api/index.ts` | Modify | Wire minimal supervised-run routes. |
| `cats-platform/src/products/work/renderer/components/RunInspector.tsx` | Modify | Add the minimal supervised-run status surface, or add an equivalent Work-owned renderer component if `RunInspector` is the wrong seam. |
| `cats-platform/tests/supervision-contracts.test.ts` | Create | Contract shape and discriminated union tests. |
| `cats-platform/tests/supervision-capability-assessment.test.ts` | Create | Bootstrap, evidence, conflict, override, delivery-split tests. |
| `cats-platform/tests/supervision-policy-engine.test.ts` | Create | Policy versioning and per-action dial tests. |
| `cats-platform/tests/supervision-tool-boundary.test.ts` | Create | ToolResult, approval, preflight, rejection, cancellation tests. |
| `cats-platform/tests/supervision-run-state.test.ts` | Create | Run state, blockers, denial, cancel, scheduler content-blind tests. |
| `cats-platform/tests/supervision-boundary-imports.test.ts` | Create | Static import-boundary checks for content-blind scheduler and no renderer imports in platform supervision. |
| `cats-platform/tests/work-supervised-run.test.ts` | Create | Fake driving-agent and weak-worker vertical-slice tests. |
| `cats-platform/docs/specs/SPEC-082-cats-work-agent-supervision-and-tool-boundary.md` | Modify | Link this plan in metadata. |
| `cats-platform/docs/plans/README.md` | Modify | Add PLAN-074 to index. |
| `cats-platform/docs/specs/README.md` | Modify | Link SPEC-082 to PLAN-074. |
| `cats-platform/docs/README.md` | Modify | Add PLAN-074 to documentation index recent additions. |

## Technical Decisions

- **Create `platform/supervision/` as the shared home.** `Cats Work` is the
  first consumer, but the contracts are not Work-only. This keeps later Code
  adoption possible without importing Work internals. This is an explicit
  assumption, not a permanent entitlement: after the first Work slice, if no
  second product consumer is planned, review whether run-state helpers should
  remain platform-level or move down into `products/work`.
- **Use fake driving agents first.** Real provider integration would obscure
  whether failures come from the boundary or the provider. The first vertical
  slice should be deterministic and testable.
- **Phase 2 policy engine is allowed to be skeletal.** Dials that need real
  tool manifests are completed in Phase 3 against `toolRegistry`; Phase 2 uses
  fixture manifests only.
- **Phase 3 tool-boundary evidence uses a mock sink.** Durable evidence
  persistence lands in Phase 4. Phase 3 tests assert the boundary emits the
  right evidence request, not that it is durably stored.
- **Persist policy snapshots in the execution layer.** They are durable
  evidence context, not a new top-level canonical record family.
- **Keep the first release slice task/run-first.** `PLAN-074` does not create
  or bind extra managed-work / mission records during supervised launch. Those
  records can be added by a follow-up Work planning/mission rollout if the
  product needs them, but the first slice proves the supervision boundary with
  existing task and run records.
- **Keep scheduler content-blind.** Any test or implementation that reads raw
  transcript/message content in the lifecycle scheduler violates SPEC-082.
- **Treat weak workers as tools.** They enter through manifests, schema
  validation, budgets, and `ToolResult`, not as durable Cats.
- **No UI ownership in supervision modules.** Platform supervision emits
  contracts/projections/events; product renderers own UI.
- **Approval and cancellation are boundary semantics.** Tools do not invent
  local pending/denied/cancelled conventions.

## Phase Gates

These gates are mandatory PR checklist items. Where a test/script is named,
CI must enforce it; otherwise review must block the PR until the cited phase
artifact exists.

| Gate | Enforcement |
|------|-------------|
| Do not start real provider-agent integration until Phase 5 fake-driving-agent contract tests are green. | PR checklist must cite `work-supervised-run.test.tsx` passing; real-provider work belongs in a separate follow-up PLAN. |
| Do not expose a broad/write tool to any provider model until FR-19 override floor tests are green. | PR checklist must cite `supervision-policy-engine.test.ts` and `supervision-tool-boundary.test.ts` cases for `E_TOOL_SCOPE_DENIED` plus evaluated/observed positive path. |
| Do not ship Work API routes for supervised runs until policy snapshots and evidence references are durable. | PR checklist must cite Phase 4 persistence tests. |
| Do not add product-renderer imports to `src/platform/supervision/**`. | `supervision-static-boundary.test.tsx` must fail such imports. |

## Testing Strategy

- **Unit Tests**:
  - contracts, rejection codes, policy decisions, capability aggregation,
    schema references, tool-surface filtering, run-state derivation
- **Integration Tests**:
  - fake driving-agent supervised Work run
  - approval-gated mutation lifecycle
  - cancellation with cooperative/best-effort/not-supported tools
  - evidence row references durable policy snapshot
  - weak-worker schema validation and fallback behavior
- **Static / Boundary Tests**:
  - scheduler module does not import transcript/message content readers
  - platform supervision modules do not import product renderer modules
  - Chat routing remains product-owned
- **Manual Testing**:
  - run `npm run build`
  - open a Work task detail view and click `Start supervised run`
  - verify the page stays on the same task detail route and refreshes the
    `Run Guardrails` panel
  - inspect run state, blockers, policy snapshot count, pending approval
    count, and evidence summary in the Work-owned renderer
  - run `npm run build:test-ui` and
    `node --test --test-isolation=none build/test/work-supervised-run.test.js`
    to verify the fake-agent Work path: API launch, policy snapshot
    persistence, durable evidence, lifecycle child-run delegation, and task
    detail inspection
  - approval persistence, decision sync, and `/api/core/approvals` integration
    are covered by `supervision-approval-requests.test.tsx`

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Plan grows into a full agent runtime before contracts are tested | High | Use fake driving agents and three sample tools first; real providers are out of scope. |
| Capability profile becomes a black box | High | Persist source evidence with `evidenceId`, source metadata, conflicts, and policy snapshot reasons. |
| Operator override bypasses the conservative unknown/catalog-only floor | High | FR-19 tests require `E_TOOL_SCOPE_DENIED` and snapshot reasons for attempted broad-write / unrestricted outcome delegation. |
| Scheduler reintroduces semantic routing by reading content | High | Content-blind scheduler tests and explicit module-boundary checks. |
| Tool manifests drift from actual behavior | Medium | Registry-level manifest validation and tool-boundary tests for preflight/approval/cancellation/evidence. |
| Approval/cancellation edge cases fork across tools | Medium | Centralize pending/denied/cancelled behavior in `toolBoundary.ts` and `runState.ts`. |
| Evidence stores too much sensitive content | Medium | Evidence helpers only store redacted summaries and artifact/transcript references. |
| Work UI work leaks into supervision modules | Medium | Keep renderer changes optional/product-owned; add import-boundary checks. |
| Existing orchestration code conflicts with new contracts | Medium | New module is additive; do not delete `planner.ts` / `dispatcher.ts` in this plan. |

## Progress Log

| Date | Update |
|------|--------|
| 2026-04-25 | Plan created from ADR-082 / SPEC-082 after supervision-spec review rounds. |
| 2026-04-25 | Follow-up review pass: added override-floor coverage, fake driving-agent harness shape, cancellation reason mapping, phase dependency notes, and static boundary enforcement. |
| 2026-04-25 | Follow-up review pass: added recovery-capable fake-agent harness, schema-version shape, phase-gate enforcement, real-provider follow-up boundary, and stricter minimal Work status surface. |
| 2026-04-25 | Implementation pass: added Work supervised-run launch, bounded budgets, durable policy/evidence lineage, lifecycle child-run spawn, Work renderer launch action, idempotent active-run reuse, approval queue persistence/decision sync helpers, `/api/core/approvals` sync, and product-level fake-agent vertical coverage. |
| 2026-04-25 | Historical verification pass: `npm run build`, PLAN-074 targeted supervision/Work tests, `work-war-room.test.js`, and `architecture-boundaries.test.js` passed locally. War Room is no longer a follow-up UI development target. |
| 2026-04-28 | Scope update: War Room surface development retired; future supervision visibility belongs in task detail, Cockpit, Broken Links, or a newly scoped operator surface, not a War Room expansion. |
| 2026-04-27 | Opened [PLAN-075](./PLAN-075-real-provider-orchestrator-integration.md) as the follow-up for real provider-agent integration and old planner/dispatcher retirement. |

---

*Created: 2026-04-25*
*Author: Codex*
