# SPEC-082: Cats Work Agent Supervision and Tool Boundary

> Convert ADR-082 into the first implementable `Cats Work` contract:
> a strong driving agent may own semantic planning, weak models may be
> used as bounded worker tools, and every side effect is mediated by
> policy-evaluated tool/API boundaries with approvals, invariants, and
> evidence.

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Draft |
| **Owner** | Codex |
| **Reviewer** | User |
| **Related ADR** | [ADR-082](../decisions/082-recast-orchestrator-as-capability-shell-with-policy-dial-supervision.md) |
| **Related Spec** | [SPEC-050](./SPEC-050-group-chat-temporary-participants-and-reusable-lightweight-presets.md) |
| **Follow-up plan** | [PLAN-074](../plans/PLAN-074-cats-work-agent-supervision-rollout.md), [PLAN-080](../plans/PLAN-080-provider-capability-bootstrap-config-rollout.md) |

## Summary

`Cats Work` should not build a second-rate agent by hard-coding semantic
planning into TypeScript. Its core value is the opposite: let capable
agent processes such as Codex, Claude Code, or future provider agents
act as the brain, while Cats supplies the operating shell around them.

That shell is not passive. Cats owns the UI-facing contracts, tool/API/MCP
surface, invariants, lifecycle scheduler, approvals, budget gates, and
evidence capture. For weak or cheap models, Cats also owns rule-based
SOP pipelines that shape small tasks tightly enough for those models to
be useful.

This spec defines the first Work-facing contract for that model:

- per-action `SupervisionPolicy`, not a session-level boolean mode
- a versioned policy decision snapshot on every supervised action
- a three-state `ToolResult` for applied, pending approval, and rejected
  effects
- tool manifests that advertise side effects, preflight support, failure
  codes, approval behavior, and evidence requirements
- minimal scheduler/run semantics so agents can request lifecycle actions
  but cannot spawn unmanaged execution by themselves
- strong-agent and weak-worker execution paths that can coexist inside one
  Work run
- a shared `AddressableTarget` envelope so durable Cats, solo execution
  targets, temporary participants, and worker tools can be addressed
  uniformly without pretending they are all the same registry object

The first vertical slice is for `Cats Work`. Chat routing rules and Code
product UI can consume parts of this later, but this spec does not attempt
to refactor Chat delivery or every product surface at once.

## Goals

- make the ADR-082 capability-shell direction executable for the first
  Work run slice
- let a strong driving agent own open-ended semantic planning while Cats
  owns tool boundaries, invariants, lifecycle, approvals, and audit
- make weak local/provider models useful as bounded SOP worker invocations
  without presenting them as autonomous agents
- prevent side effects from being silently clipped, partially applied, or
  treated as successful while awaiting approval
- provide enough policy versioning and evidence to debug regressions in
  supervision decisions
- define how new or unknown provider/model profiles bootstrap before real
  evals or session history exist
- preserve Cat identity semantics while allowing common runtime addressing
  for solo, temporary, durable, and worker targets

## Non-Goals

- no implementation plan in this document; the rollout belongs in a later
  `PLAN-XXX`
- no immediate deletion of `planner.ts`, `dispatcher.ts`, or current Chat
  rule-based routing
- no new canonical record family beyond the existing ADR-081
  Interaction / Planning / Execution taxonomy
- no final UI design for Work run inspection, approval inboxes, or policy
  trace visualizations
- no final name for `@ask-weak`, `@spawn-subcat`, or any user-facing tool
  command
- no complete multi-agent collaboration protocol for arbitrary agent-to-agent
  spawning; this spec only defines the minimum lifecycle boundary needed for
  the first supervised Work run
- no provider/model benchmarking suite; this spec defines the profile inputs
  and bootstrap contract that the future eval system must populate
- no conversion of solo execution targets, temporary participants, or worker
  invocations into durable Cat registry records

## User Stories

- As an owner, I want to hand a Work outcome to a capable agent and let it
  plan the path, while the platform still blocks unsafe or over-budget actions.
- As an operator, I want weak local models to handle cheap extraction,
  classification, translation, or summarization steps only when the platform
  constrains those steps tightly enough.
- As a maintainer, I want every mutating tool call to say whether it actually
  happened, is waiting for approval, or was rejected.
- As a reviewer, I want evidence for agent-made changes: who proposed them,
  which policy allowed them, what changed, and whether approval was involved.
- As a platform engineer, I want supervision behavior to be versioned and
  auditable so policy changes can be tested and rolled back.
- As a product designer, I want one addressing model for targets without
  making every target a durable Cat with a direct lane and memory.

## Core Concepts

### Driving agent

The driving agent is the main LLM-backed process assigned to a Work run.
For a strong model, it may receive `outcome_delegation` and decide the
semantic plan, tool sequence, delegation choices, recovery path, and stop
condition. Cats still controls what tools are exposed and which side effects
are allowed.

### Worker invocation

A worker invocation is a bounded call to a weaker or cheaper model through
a tool-like interface. It is not automatically a Cat, participant, or
autonomous agent. It receives narrow input, strict scaffolding, validation,
and a small budget. Its output returns to the driving agent or SOP pipeline.

### Supervised action

A supervised action is any operation where Cats must decide current latitude:
tool exposure, approval threshold, validation strictness, checkpoint cadence,
or fallback behavior. Policy is evaluated at action time, not at session start.

### Tool boundary

The tool boundary is the only place where agent intent becomes platform
effect. It enforces invariants, approvals, budget, permissions, preflight
rules, and evidence capture. Prompt text can recommend behavior, but it is
not enforcement.

### Addressable target

`AddressableTarget` is a runtime envelope for "who or what may receive a
message, assignment, or tool invocation." It is not the same thing as a Cat
registry record.

Durable Cats, Boss Cat, and Guide Cat are durable agent identities. Solo
execution targets and temporary participants are not durable Cats. Weak worker
invocations are tools unless explicitly promoted by a later feature.

## Requirements

### Functional Requirements

#### Work run and scheduler boundary

1. **FR-1 (Work run launch).** A supervised Work run shall start from a
   managed-work or mission context, not from an untracked provider session.
   `+New work` may create the primary `Conversation`, `Project`, `WorkItem`,
   and `Task` linked through `WorkItem.taskId` that define that context, but
   it shall not create a run by itself. The run begins only when the operator
   or workflow starts supervised execution.
2. **FR-2 (Run state model).** The first slice shall represent a primary run
   state with explicit blocker reasons. Primary run states are:
   - `queued`
   - `running`
   - `waiting_for_approval`
   - `blocked`
   - `completed`
   - `failed`
   - `cancelled`
   Primary state is derived on every run-state evaluation, including initial
   run creation. `waiting_for_approval` is the primary state when at least one
   unresolved approval request is gating progress. `blocked` is the primary
   state for non-approval blockers such as budget exhaustion, dependency
   waits, missing configuration, timeout, or tool unavailability. If multiple
   blockers exist, the run shall also carry a `blockers[]` list; unresolved
   approval takes precedence in the primary state, while other blockers remain
   visible in `blockers[]`. Terminal states (`completed`, `failed`,
   `cancelled`) take precedence over both waiting states.

   Approval denial shall close the approval request as `denied`. If the
   current `fallbackPolicy` can continue without the denied action, the run
   shall re-evaluate blockers and return to `running`, `blocked`, or
   `waiting_for_approval`; otherwise the run shall become `failed` with the
   denial recorded as the terminal cause. Operator cancellation shall set the
   primary state to `cancelled`, mark unresolved approval requests as
   `cancelled`, stop scheduling new actions, and request cooperative
   cancellation for in-flight tool calls whose manifest declares
   `cancellation: 'cooperative'` or `'best_effort'`. Already-applied mutations
   shall not be rolled back by cancellation; evidence for in-flight actions
   that finish after cancellation shall carry a structured cancellation context
   so reviewers can see whether the effect landed before or after the cancel
   request:

   ```ts
   interface CancellationContext {
     requestedAt: string;
     requestedBy: string;
     runStateAtRequest: 'queued' | 'running' | 'waiting_for_approval' | 'blocked';
     toolCancellation: 'cooperative_requested' | 'best_effort_requested' | 'not_supported';
     effectLanded: 'before_cancel_request' | 'after_cancel_request' | 'not_applied';
     reasonCode:
       | 'operator_decision'
       | 'budget_hard_stop'
       | 'policy_violation'
       | 'external_event'
       | 'other';
     reasonNote?: string;
   }
   ```
   `reasonCode` is mandatory; `reasonNote` is an optional human-readable note.
   `toolCancellation` is derived from the tool's manifest `cancellation` value
   (`cooperative` → `cooperative_requested`, `best_effort` →
   `best_effort_requested`, `not_supported` → `not_supported`) and only appears
   on evidence rows for in-flight tool calls; a run cancelled while `queued`
   with no in-flight tool call does not emit a tool-evidence
   `CancellationContext` but shall still record the cancel reason on the
   run-state audit trail.
   After a run reaches `cancelled`, any new tool call against that run shall
   return `rejected` with `E_RUN_CANCELLED`. If an agent retries or resumes a
   request whose approval was denied, the tool boundary shall return
   `rejected` with `E_APPROVAL_DENIED`.
3. **FR-3 (Scheduler owns lifecycle and stays content-blind).** The lifecycle
   scheduler shall create, pause, resume, cancel, and terminate runs based on
   metadata such as trigger, budget, health, approvals, timeouts, retry count,
   and operator action. The scheduler shall not read raw message content,
   transcript text, prompts, completions, or artifact bodies to make semantic
   planning, routing, or rescheduling decisions. Policy engines, classifiers,
   workflow steps, and supervised tools may read content only at auditable
   tool/API boundaries and shall emit structured results.
4. **FR-4 (No unmanaged self-spawn).** A driving agent shall not directly
   create unmanaged sessions, agents, or runs. It may request delegation,
   worker invocation, or a new run through tools; the scheduler/tool boundary
   decides whether that request becomes real execution.
5. **FR-5 (Invocation categories).** The first slice shall distinguish
   blocking tool calls from async lifecycle requests:
   - a blocking tool call returns `ToolResult<T>`; all three statuses are
     valid, and only `status: 'applied'` carries the immediate tool output
   - an async lifecycle request is mediated by a tool boundary and returns
     `ToolResult<RunRef | LifecycleRequestRef>` where `status: 'applied'`
     means the run/request was created, not that the child work completed
     and `pending_approval` / `rejected` retain the normal ToolResult meaning
   Child run progress and completion shall arrive later through scheduler/run
   events, not by overloading the lifecycle request result.
6. **FR-6 (Budget inheritance).** Delegated runs and worker invocations shall
   receive an explicit budget envelope derived from the parent run. They shall
   not inherit unlimited access by default.
7. **FR-7 (Deadlock prevention baseline).** The scheduler shall detect at
   least approval waits, timeout waits, and exhausted-budget waits, and surface
   them as `blocked` or `waiting_for_approval` rather than leaving a run
   indefinitely `running`.

#### Supervision policy

8. **FR-8 (Single policy shape).** The platform shall use one per-action
   `SupervisionPolicy` shape:

   ```ts
   interface SupervisionPolicy {
     autonomy: 'none' | 'single_step' | 'milestone_plan' | 'outcome_delegation';
     taskGranularity: 'tiny' | 'step' | 'milestone' | 'outcome';
     toolScope: 'none' | 'read_only' | 'narrow_write' | 'broad_write';
     scaffolding: 'none' | 'few_shot' | 'grammar_forced' | 'sop_template';
     validation: 'best_effort' | 'schema_required' | 'semantic_check';
     checkpointCadence: 'every_step' | 'milestone' | 'on_risk' | 'final';
     approvalThreshold: 'low' | 'medium' | 'high';
     fallbackPolicy: 'retry' | 'ask_human' | 'escalate_model' | 'delegate_other';
   }
   ```

9. **FR-9 (No scalar autonomy).** Autonomy shall remain an enum, not a numeric
   0-5 score. The values are gates with discontinuities, not a smooth scale.
10. **FR-10 (Per-action evaluation and decision ownership).** The policy shall
    be computed for each supervised action. A session, run, agent, or provider
    shall not be assigned one fixed supervision mode for its whole lifetime.
    For agentic Work workloads, the driving agent owns semantic planning,
    decomposition, tool selection, delegation choices, recovery reasoning, and
    stop judgment within the granted tool surface. The platform owns
    deterministic routing, invariant enforcement, weak-model SOP pipelines,
    validation/retry shaping, lifecycle, approvals, budget, and evidence.
11. **FR-11 (Independent dials).** Each policy field shall be resolved
    independently. A strong model may keep `outcome_delegation` while a risky
    tool still requires `approvalThreshold: 'high'`.
12. **FR-12 (Policy snapshot).** Every supervised action shall persist a
    durable policy decision snapshot in the ADR-081 execution layer alongside
    run/action/evidence records. It is not a new canonical top-level record
    family. The snapshot shall include at least:

    ```ts
    interface SupervisionPolicySnapshot {
      policyBundleVersion: string;
      dialVersions?: Partial<Record<keyof SupervisionPolicy, string>>;
      experimentId?: string;
      evaluatedAt: string;
      actionId: string;
      runId: string;
      actorRef: string;
      policy: SupervisionPolicy;
      contextSummary: PolicyContextSummary;
      reasons: string[];
    }
    ```

13. **FR-13 (Policy versioning).** Policy decision functions shall be versioned
    at bundle granularity by default. If individual `decide*` dial functions
    have ever bumped independently from the bundle or participate in an A/B
    experiment, the snapshot shall capture `dialVersions` for those dials. If
    all dials ship only as one bundle, `dialVersions` may be omitted. The
    policy bundle version and any required dial-level versions used for an
    action shall be captured in the snapshot and in evidence for any resulting
    mutation.
14. **FR-14 (A/B safety).** Policy A/B tests shall be opt-in by configuration
    and shall record `experimentId`. A default production run shall have a
    deterministic policy version without silent randomization.
15. **FR-15 (Regression replay target).** A stored policy snapshot shall carry
    enough summarized context for maintainers to replay or inspect why a
    policy version granted or denied a tool/action class.

#### Policy context and capability bootstrap

16. **FR-16 (Policy context vector).** Policy evaluation shall use a vector
    context, not a tier label. The minimum inputs are:
    - actor identity and projection
    - provider/model/control target
    - capability profile
    - delivery/observability profile
    - action type and side-effect class
    - task complexity and reversibility
    - budget state
    - approval state
    - recent session/run reliability
    - operator overrides
17. **FR-17 (Capability profile source split).** The capability profile shall
    not be sourced from `ProductProviderEventCapabilities`. Provider delivery
    observability and model intelligence/tool skill are separate axes.
18. **FR-18 (Config-gated bootstrap treatment, three open tiers).** Bootstrap
    treatment is a three-way label — `weak_worker`, `default`, or
    `strong_agent` — sourced only from the operator-owned capability
    bootstrap YAML. A target with no matching YAML rule starts as
    `bootstrapTreatment: 'default'` with `confidenceLevel: 'unknown'`.
    `default` is the open middle tier: the operator implicitly trusted the
    model by selecting it, so the policy engine grants `narrow_write`
    toolScope, `step` task granularity, and `schema_required` validation
    (the only validation level the provider-agent gate currently enforces;
    `semantic_check` is reserved for a future implementation that wraps
    the schema-ref gate with an additional semantic check).
    Operators tighten by listing the model under `weak_worker` (clamped to
    `read_only` / `single_step` / `tiny` / `sop_template` / `schema_required`
    / `every_step` / `ask_human`) or loosen by listing it under
    `strong_agent` (additionally unlocks `milestone_plan` autonomy,
    `few_shot` scaffolding, `milestone` checkpoint cadence, and `retry`
    recovery). Cats shall not infer `strong_agent` or `weak_worker` from
    provider names, runtime availability, runtime delivery richness, static
    provider catalogs, or model labels — those facts may inform the YAML
    rules but never short-circuit them. The FR-19 evidence floor still
    bounds `broad_write` and unrestricted `outcome_delegation` for every
    treatment until `evaluated`/`observed` evidence arrives.

    The assessment shape separates the bootstrap treatment from confidence
    level and source evidence:

    ```ts
    type CapabilityDimension =
      | 'tool_use_accuracy'
      | 'json_fidelity'
      | 'reasoning_depth'
      | 'context_reliability'
      | 'recovery_reliability';

    interface CapabilityClaim {
      level: 'unknown' | 'catalog_only' | 'evaluated' | 'observed';
      summary: string;
    }

    interface CapabilitySourceEvidence {
      evidenceId: string;
      source:
        | 'bootstrap_config'
        | 'provider_catalog'
        | 'operator_override'
        | 'eval_suite'
        | 'session_history';
      observedAt: string;
      claims: Partial<Record<CapabilityDimension, CapabilityClaim>>;
      metadata?: {
        bootstrapConfigVersion?: string;
        bootstrapRuleId?: string;
        bootstrapConfigPath?: string;
        catalogVersion?: string;
        evalSuiteId?: string;
        evalRunId?: string;
        historyWindow?: { startedAt: string; endedAt: string; runIds: string[] };
        overrideId?: string;
        overrideReason?: string;
        overrideExpiresAt?: string;
      };
    }

    interface CapabilityAssessment {
      assessedAt: string;
      bootstrapTreatment: 'default' | 'strong_agent' | 'weak_worker';
      confidenceLevel: 'unknown' | 'catalog_only' | 'evaluated' | 'observed';
      confidenceSources: CapabilitySourceEvidence[];
      aggregateMethod: 'conservative_per_dimension';
      conflicts: Array<{
        dimension: CapabilityDimension;
        evidenceIds: string[];
        selectedLevel: CapabilityClaim['level'];
        reason: string;
      }>;
    }
    ```
    `confidenceSources` is an unordered evidence set; array order carries no
    priority. `evidenceId` is a stable identifier for the evidence item inside
    the assessment and is the value referenced by `conflicts[].evidenceIds`;
    source-specific machine identifiers live in `metadata` and are the
    authoritative join keys. Aggregation shall be per capability dimension.
    Eval-suite and session-history evidence may downgrade bootstrap-config or
    provider-catalog claims; positive bootstrap/catalog facts alone shall not
    upgrade a profile above `catalog_only`. Provider catalogs are inventory
    sources only unless referenced by a matching bootstrap YAML rule; product
    code shall not create strong/weak bootstrap treatment from a built-in
    provider-name allowlist. Adding a new evidence item shall update top-level
    `assessedAt` while preserving older source `observedAt` values. A conflict
    exists when two or more evidence items make claims for the same dimension
    with different `level` values; same-level claims with different summaries
    are not conflicts, but implementations may preserve both summaries for
    audit. `aggregateMethod: 'conservative_per_dimension'` is the only
    supported first-slice aggregation method and is persisted as an audit
    label; adding another method requires a schema/manifest version bump.
    Operator override is a source, not a confidence level. It may raise or
    lower effective policy only when it carries override metadata and appears
    in the policy snapshot reasons, but it shall not raise `confidenceLevel`
    above the strongest non-override evidence level **and** shall not lift the
    effective-policy floor defined in FR-19. Conflicting source claims shall be
    preserved in `conflicts[]` rather than overwritten.

19. **FR-19 (Evidence floor for high-impact dials).** When `confidenceLevel`
    is `unknown` or `catalog_only`, the effective policy shall not grant
    `toolScope: 'broad_write'` or unrestricted `autonomy:
    'outcome_delegation'` **regardless of operator override or bootstrap
    treatment**. These two dials require `evaluated`/`observed` evidence
    even when the YAML labels the target as `strong_agent`. Other dials
    (such as `toolScope: 'narrow_write'`, `autonomy: 'milestone_plan'`,
    `taskGranularity`, `scaffolding`, `validation`, `checkpointCadence`,
    `approvalThreshold`, `fallbackPolicy`) are **not** floored by FR-19; an
    operator override or the bootstrap treatment may set them at any tier
    consistent with the FR-18 mapping. Any override attempting to reach
    `broad_write` or unrestricted `outcome_delegation` under `unknown` /
    `catalog_only` shall be rejected with `E_TOOL_SCOPE_DENIED`, and the
    override attempt shall appear in the policy snapshot reasons. This is
    the combined invariant across FR-18 (override cannot raise
    `confidenceLevel` above non-override evidence) and FR-19 (effective
    policy floor for the two high-impact dials).
20. **FR-20 (Observed hot-start).** Session/run history such as JSON failures,
    tool misuse, repeated retries, or successful validated outputs shall be
    allowed to tighten or loosen policy within the same run.
21. **FR-21 (Operator override audit).** Operator overrides that raise
    autonomy, broaden tools, or reduce approval thresholds shall appear in the
    policy snapshot reasons.

#### Tool manifests

22. **FR-22 (Tool manifest contract).** Every tool exposed to a driving agent
    or worker shall declare a versioned manifest with canonical schema
    references:

    ```ts
    interface SchemaRef {
      id: string;          // canonical schema registry id
      version: string;
      format: 'json_schema';
      uri?: string;        // optional resolvable URI, not a local-only path
    }

    interface SupervisedToolManifest {
      name: string;
      manifestVersion: string;
      description: string;
      sideEffect: 'none' | 'local_state' | 'external_visible' | 'destructive' | 'expensive';
      preflight: 'required' | 'available' | 'not_supported';
      blocking: 'blocking' | 'async';
      cancellation: 'cooperative' | 'best_effort' | 'not_supported';
      approval: 'never' | 'policy' | 'always';
      evidence: 'none' | 'summary' | 'pre_post_snapshot' | 'artifact_reference';
      failureCodes: string[];
      maxBudgetHint?: BudgetEnvelope;
      inputSchema: SchemaRef;
      outputSchema: SchemaRef;
    }
    ```
    `cancellation` is mandatory. `cooperative` means the tool promises to
    observe platform cancel requests and stop safely when possible.
    `best_effort` means the platform may send a cancel request but completion
    is not guaranteed. `not_supported` means the scheduler shall not assume
    the in-flight call can be interrupted.

23. **FR-23 (Preflight clarity).** Mutating tools shall provide a read-only
    preflight where feasible. If preflight is impossible, the manifest shall
    explicitly say `preflight: 'not_supported'` and list expected failure
    codes.
24. **FR-24 (No silent try-and-see tools).** A mutating tool shall not omit
    both preflight support and declared failure codes.
25. **FR-25 (Side-effect class drives policy).** `sideEffect` shall be one of
    the policy inputs used to decide `toolScope`, `approvalThreshold`,
    `validation`, and `fallbackPolicy`.
26. **FR-26 (Tool surface narrowing).** The tool surface exposed to a worker
    invocation shall be the intersection of the parent run's granted tool
    surface and the policy grants for the worker action. A worker shall never
    receive tools broader than either its parent run or its own action policy.
    If the requested worker tool is outside that intersection, the call shall
    return `rejected` with `E_TOOL_SCOPE_DENIED`.

#### Tool results, approvals, and invariants

27. **FR-27 (Three-state tool result).** All supervised tools shall return the
    ADR-082 three-state result:

    ```ts
    type ToolResult<T> =
      | { status: 'applied'; result: T }
      | { status: 'pending_approval'; requestId: string; summary: string }
      | { status: 'rejected'; error: { code: string; message: string; details?: unknown } };
    ```

28. **FR-28 (Pending means no effect).** `pending_approval` shall mean the
    requested effect has not landed. Agents must not reason forward as if it
    succeeded.
29. **FR-29 (Stable rejection codes).** Rejections shall use stable machine
    codes such as:
    - `E_AUDIENCE_LIMIT_EXCEEDED`
    - `E_NOT_AUTHORIZED`
    - `E_BUDGET_EXCEEDED`
    - `E_APPROVAL_REQUIRED`
    - `E_APPROVAL_DENIED`
    - `E_RUN_CANCELLED`
    - `E_PRECHECK_FAILED`
    - `E_TOOL_SCOPE_DENIED`
    - `E_SCHEMA_INVALID`
30. **FR-30 (Invariant enforcement).** Audience limits, participant limits,
    permissions, destructive-action gates, budget caps, and rate limits shall
    be enforced programmatically at the tool/API boundary.
31. **FR-31 (No silent clipping).** The platform shall not silently truncate,
    redirect, downgrade, or partially apply over-limit requests. It shall
    return `rejected` or `pending_approval`.
32. **FR-32 (Approval lifecycle).** Approval requests shall have at least:
    - `requested`
    - `approved`
    - `denied`
    - `expired`
    - `cancelled`
33. **FR-33 (Approval follow-up).** When a pending approval resolves, the
    platform shall emit a follow-up event carrying the final `applied` or
    `rejected` outcome.
34. **FR-34 (Idempotent approval apply).** Applying an approved request shall
    be idempotent by approval/request id.

#### Evidence capture

35. **FR-35 (Evidence for mutations).** Every applied mutation through the
    supervised tool surface shall create evidence in the ADR-081 execution
    layer, reusing existing activity/evidence records rather than inventing a
    new top-level record family.
36. **FR-36 (Evidence envelope).** Evidence shall include at least:
    - requester identity
    - proposing provider/model/control
    - run id and action id
    - tool call id
    - durable policy snapshot reference
    - approval reference, if any
    - redacted pre-image summary
    - redacted post-image summary
    - artifact references, if content is large or sensitive
37. **FR-37 (Redaction rule).** Evidence shall not inline secrets, tokens,
    full raw transcripts, raw prompts/completions, large binaries, or complete
    third-party envelopes.
38. **FR-38 (Artifact references).** Large or sensitive content shall be stored
    behind artifact/transcript references where the existing record model
    supports it. Evidence rows shall remain small and queryable.
39. **FR-39 (Evidence on policy denial).** Rejected high-risk or security-
    relevant actions shall emit a lightweight audit event even when no mutation
    lands, so repeated unsafe attempts can be inspected. Low-risk repeated
    validation or rate-limit rejections may be aggregated, but the aggregate
    shall preserve count, time range, actor, tool/action class, and rejection
    code.

#### Strong-agent path

40. **FR-40 (Outcome delegation path).** For a sufficiently trusted strong
    driving agent and reversible/low-risk task, policy may grant:
    - `autonomy: 'outcome_delegation'`
    - `taskGranularity: 'outcome'`
    - `checkpointCadence: 'on_risk'` or `final`
41. **FR-41 (Agent owns semantic plan).** Under outcome delegation, the driving
    agent owns step decomposition, tool selection, delegation choices, recovery
    reasoning, and completion judgment within the granted tool surface.
42. **FR-42 (Platform still gates side effects).** A strong agent shall still
    receive `pending_approval` or `rejected` results when policy/invariants
    require it.
43. **FR-43 (Progress visibility).** Strong-agent runs shall emit progress
    events sufficient for Work to show current phase, last meaningful action,
    waiting state, and next expected checkpoint.

Strong-provider dials are still computed per action. A strong provider/model
baseline exists only when the capability bootstrap YAML explicitly marks the
provider/model/control target as `strong_agent`, or when later eval/history
evidence earns that effective policy. That baseline may allow broader semantic
planning than a weak worker, but policy shall still combine capability profile,
task risk, tool manifest, budget, approval posture, and product invariants
before granting broad-write tools or outcome delegation. Temporary participants
backed by a strong provider use the same execution-target capability baseline
as durable Cats with that provider, then may receive stricter channel-scoped
budget, time, or checkpoint limits; their temporary lifecycle must not relax
any dial.

#### Weak-model and SOP path

44. **FR-44 (Worker invocation as tool).** Weak models shall enter this spec's
    slice as worker tools or SOP steps, not as autonomous Cats. Promotion of a
    worker into a durable operational agent requires a separate spec.
45. **FR-45 (Tight scaffolding).** Weak-worker policy shall commonly use:
    - `autonomy: 'none'` or `single_step`
    - `taskGranularity: 'tiny'` or `step`
    - `toolScope: 'none'` or `read_only`
    - `scaffolding: 'grammar_forced'` or `sop_template`
    - `validation: 'schema_required'` or `semantic_check`
46. **FR-46 (Validated outputs).** Worker outputs shall be schema-validated
    before the driving agent or SOP pipeline consumes them.
47. **FR-47 (Cheap worker budget).** Worker invocations shall carry explicit
    cost/time limits and shall fail closed when those are exceeded.
48. **FR-48 (Escalation path).** A weak-worker failure shall follow the current
    action's `fallbackPolicy`, such as retry, ask human, escalate model, or
    delegate to another worker.
49. **FR-49 (SOP pipelines remain platform tools).** Rule-based pipelines for
    extraction, classification, summarization, translation, formatting, and
    validation may call weak models internally, but they are exposed to the
    driving agent as tools with manifests and results.

#### Addressable targets and identity separation

50. **FR-50 (Shared address envelope).** Product and tool APIs that need a
    target shall accept a common runtime envelope:

    ```ts
    type AddressableTarget =
      | { kind: 'durable_agent'; agentId: string; projection?: 'chat' | 'work' | 'code' }
      | { kind: 'execution_target'; provider: string; model: string; control?: string }
      | { kind: 'temporary_participant'; participantId: string; roleHint?: string; displayName?: string; avatarHint?: string }
      | { kind: 'worker_tool'; toolName: string; workerProfileId?: string };
    ```

51. **FR-51 (Durable Cat semantics).** My Cats, Boss Cat, Guide Cat, and other
    saved Cats map to `durable_agent` targets when they are addressed as
    identities. They may switch provider/model without becoming different
    agents.
52. **FR-52 (Solo semantics).** A solo execution target maps to
    `execution_target`. Changing its provider/model changes execution, not a
    durable identity record.
53. **FR-53 (Temporary participant semantics).** A temporary participant maps
    to `temporary_participant`. Per
    [SPEC-050](./SPEC-050-group-chat-temporary-participants-and-reusable-lightweight-presets.md),
    this kind describes channel-scoped identity and lifecycle only; it is not
    a capability tier and does not imply non-agentic or weak execution. A
    temporary participant may resolve to a strong provider/model execution
    target and `SupervisionPolicy` for a room turn, including provider-agent
    semantic planning and supervised tool access when policy allows. Its
    capability profile resolves through the bound `execution_target`
    provider/model/control selection; if that binding is missing or unknown,
    policy falls back to the `default` open-middle bootstrap treatment per
    FR-18. Role hints, display
    names, or avatar hints are presentation/runtime hints, not durable Cat
    identity fields. The room/channel binding is product-owned state from the
    participant system, not a field on `AddressableTarget`.
54. **FR-54 (Worker semantics).** A weak worker maps to `worker_tool` unless a
    later spec explicitly promotes it into a durable operational agent.
55. **FR-55 (Registry separation).** `AddressableTarget` shall not imply direct
    lane, memory, transport binding, rename/archive/delete, or My Cats roster
    membership. Those belong only to durable agent identity.
    Human operators are addressed through approval, assignment, or
    notification records, not through `AddressableTarget`; tools shall not
    target a human as though the human were an executable endpoint.

#### Chat and product boundary

56. **FR-56 (Chat deterministic routing preserved).** This spec shall not
    replace Chat's deterministic rules for explicit mentions, audience limits,
    direct lanes, or transport dispatch.
57. **FR-57 (Work-to-Chat calls respect Chat API).** If a Work agent requests
    an action that touches Chat, the Chat product API shall still enforce Chat
    routing and participant invariants through structured results.
58. **FR-58 (Chat product boundary).** Work supervision shall not create a
    second hidden Chat routing engine. It may call Chat tools; Chat remains the
    owner of Chat semantics.
59. **FR-59 (UI ownership boundary).** Supervision/orchestration modules shall
    emit contracts, projections, and events only. Rendering and input capture
    belong to product renderers under `src/products/*/renderer/` and shared
    design code under `src/design/`.

### Non-Functional Requirements

- **Auditability**: any applied mutation can be traced to actor, model,
  policy bundle/dial version, approval, and redacted pre/post state.
- **Cost control**: weak-worker usage must be budgeted explicitly and strong
  agents must not receive unlimited delegated budget by default.
- **Safety**: destructive, externally-visible, expensive, or irreversible
  actions default toward approval, preflight, and evidence.
- **Determinism at boundaries**: policy decisions, tool manifests, and tool
  results must be machine-readable and stable enough for tests.
- **Low coupling**: Work surfaces should depend on run/progress/evidence
  projections, not raw provider-session internals.
- **Extensibility**: future Code and Chat adoption should reuse the policy and
  tool-result contracts without importing Work-only concepts.
- **Operator clarity**: Work UI should show outcome, status, blocked reason,
  approval need, and evidence before raw trace detail.

## Design Overview

```text
Cats Work managed item / mission
  -> scheduler creates supervised run
  -> policy engine evaluates first action
  -> driving agent receives prompt + tool manifests + budget
      -> strong path:
          agent plans, selects tools, delegates as allowed
      -> weak path:
          SOP/worker tool receives tiny constrained task
  -> each tool call crosses supervised boundary
      -> preflight if available
      -> policy + invariant + budget evaluation
      -> ToolResult:
          applied | pending_approval | rejected
      -> evidence if mutation lands
  -> scheduler checkpoints, waits, resumes, blocks, or completes
  -> Work projects run state, approvals, blockers, evidence, outputs
```

### Policy Decision Flow

```text
Action request
  -> build PolicyContext
      actor + target + capability profile + delivery profile
      action risk + side effect + reversibility
      budget + approvals + recent reliability
  -> decide each SupervisionPolicy field
  -> persist SupervisionPolicySnapshot
  -> expose allowed tools / validate tool call
  -> return ToolResult and evidence reference
```

### Capability Bootstrap

For a new provider/model/control target:

1. Load the operator-owned capability bootstrap YAML from platform config
   (planned path: `config/provider-capability-bootstrap.yaml`, with a developer
   override env var allowed by implementation plan). If the file is absent,
   invalid, or has no matching rule, the target starts as
   `bootstrapTreatment: 'default'` and `confidenceLevel: 'unknown'`.
2. Match rules by normalized provider/model/control selector. A rule may omit
   model or control only to intentionally apply to every model/control under
   the listed provider; product code shall not add implicit provider-name
   fallbacks outside the YAML.
3. A matching YAML rule may set only one initial treatment:
   `default`, `strong_agent`, or `weak_worker`. Strong/weak treatment is a
   bootstrap policy hint, not a durable identity kind and not proof of
   evaluated capability.
4. A matching YAML rule may add one `bootstrap_config` source evidence item
   with `evidenceId`, rule id, config version/path, timestamp, operator reason,
   and per-dimension claims. That evidence may raise confidence only to
   `catalog_only`; eval-suite or session-history evidence is still required for
   `evaluated` or `observed`.
5. Provider catalog facts such as context window, declared tool-use support,
   streaming/event support, pricing, or local cost class may be recorded for
   display and adapter compatibility, but shall not by themselves assign
   strong/weak treatment or loosen policy dials.
6. Use conservative policy by default: narrow or read-only tools,
   schema-required output, frequent checkpoints, and approval for higher-risk
   side effects.
7. Promote confidence only after evals or observed run history demonstrate
   specific abilities such as JSON fidelity, tool-call accuracy, or reliable
   long-context behavior.

Example bootstrap YAML:

```yaml
version: 1
profiles:
  - id: codex-gpt-5-4-strong-candidate
    selector:
      provider: codex
      model: gpt-5.4
      control: default
    initialTreatment: strong_agent
    confidenceLevel: catalog_only
    reason: Operator-approved strong-agent candidate for supervised coding demos.
  - id: ollama-local-worker
    selector:
      provider: ollama
    initialTreatment: weak_worker
    confidenceLevel: catalog_only
    reason: Local Ollama targets start as SOP workers unless evals say otherwise.
```

Provider delivery capabilities can influence observability and fallback, but
they do not prove reasoning quality.

### Strong-Agent Example

An owner delegates: "Prepare a release readiness report for this work item."

The policy engine sees a strong evaluated model, read-heavy tools, reversible
outputs, and a low external side-effect class. It grants outcome delegation,
read-only plus narrow-write tools, milestone checkpointing, and schema-required
final report output. The agent chooses the investigation path. If it asks to
publish the report externally, that publish tool returns `pending_approval`.

### Weak-Worker Example

The strong agent needs to classify 200 log snippets. Instead of spending the
strong model on every snippet, it calls a `classify_log_snippet_batch` worker
tool. Cats gives a cheap local model a strict label schema, no write tools,
small budget, and validation. Bad rows are retried or escalated according to
the parent action's fallback policy.

## Acceptance Criteria

- A Work run can launch with a driving agent, budget envelope, and initial
  policy snapshot.
- Scheduler tests prove lifecycle decisions use metadata and do not read raw
  message/transcript/prompt/completion content for semantic rescheduling.
- Work decision-boundary contract tests inject two possible next-step plans
  from a fake driving agent and verify the platform applies only tool-surface,
  deterministic routing, invariant, validation/retry, lifecycle, approval,
  budget, and evidence rules without substituting its own semantic plan.
- A supervised tool manifest can describe manifest version, side effect,
  preflight support, cancellation behavior, approval behavior, evidence
  behavior, stable failure codes, and versioned canonical input/output schema
  references.
- Unit tests or contract tests cover all three `ToolResult` statuses.
- A pending approval does not mutate state until approval is accepted.
- Run-state tests cover initial evaluation with simultaneous approval and
  non-approval blockers, approval denial with and without fallback, operator
  cancellation, terminal state precedence, and multiple simultaneous blockers
  through `blockers[]`.
- Cancellation tests prove pending approvals are closed, new actions stop
  scheduling, already-applied mutations are not rolled back, and late-finishing
  in-flight actions carry a `CancellationContext` in evidence with correct
  `requestedAt`, `runStateAtRequest`, `effectLanded`, a mandatory `reasonCode`,
  and a `toolCancellation` value that correctly maps from the tool manifest
  (`cooperative` → `cooperative_requested`, etc.).
- Cancelled-run tool-call tests prove new tool calls return `E_RUN_CANCELLED`,
  denied approval retries return `E_APPROVAL_DENIED`, and cancellation requests
  are sent only to tools whose manifests declare cooperative or best-effort
  cancellation.
- An over-limit participant/audience-style request returns `rejected` with a
  stable code rather than clipping the request.
- A mutation that lands emits evidence with actor, model, policy snapshot,
  tool call id, approval reference if any, and redacted pre/post summaries.
- A weak-worker invocation uses a narrow policy, schema validation, and an
  explicit budget envelope, and its tool surface is a subset of both parent
  run grants and worker-action policy.
- Provider/model/control targets with no matching capability bootstrap YAML
  rule start as `bootstrapTreatment: 'default'` and `confidenceLevel:
  'unknown'`, regardless of provider name, model label, runtime availability,
  or provider delivery richness.
- Capability bootstrap config tests prove only YAML-listed targets receive
  initial `strong_agent` or `weak_worker` treatment, matching is
  provider/model/control-scoped, invalid config fails closed to default
  unknown, and unordered per-source evidence metadata records timestamp,
  source evidence id, per-dimension claims, source-specific metadata, and
  conflict resolution.
- Capability conflict tests prove different levels for the same dimension
  produce `conflicts[]`, same-level summary differences do not, and
  `selectedLevel` follows the conservative-per-dimension rule.
- Operator override tests prove override metadata is recorded and can adjust
  effective policy but cannot raise `confidenceLevel` above the strongest
  non-override evidence level **and** cannot lift the FR-19 floor: an override
  attempting `broad_write` or unrestricted `outcome_delegation` under
  `unknown` / `catalog_only` confidence shall be rejected with
  `E_TOOL_SCOPE_DENIED` and recorded in policy snapshot reasons.
- A provider with rich delivery events but no evals or observed successful
  history remains conservative; delivery observability alone does not raise
  capability confidence.
- Policy snapshots include `policyBundleVersion`, optional `dialVersions`, and
  optional `experimentId`; `dialVersions` is present when any dial has
  independently versioned or participated in an experiment.
- `AddressableTarget` can represent durable Cats, solo execution targets,
  temporary participants, and worker tools without converting all of them into
  Cat registry records; human operators are addressed through approval,
  assignment, or notification references instead.

## Dependencies

- [ADR-004](../decisions/004-separate-cat-identity-from-provider-execution.md)
- [ADR-011](../decisions/011-model-primary-orchestrator-as-visible-cat.md)
- [ADR-063](../decisions/063-agent-missions-and-transport-bindings.md)
- [ADR-081](../decisions/081-canonicalize-three-tier-core-record-taxonomy.md)
- [ADR-082](../decisions/082-recast-orchestrator-as-capability-shell-with-policy-dial-supervision.md)
- [SPEC-050](./SPEC-050-group-chat-temporary-participants-and-reusable-lightweight-presets.md)
- [SPEC-040](./SPEC-040-cats-work-team-templates-and-work-intake.md)
- [SPEC-062](./SPEC-062-agent-missions-and-transport-bindings.md)
- [SPEC-063](./SPEC-063-conversational-vs-operational-agents-and-surface-projections.md)
- [Research: Cats Work Agent Supervision Model](../research/2026-04-23-codex-cats-work-agent-supervision-model.md)
- [Research: Orchestrator as a capability shell](../research/2026-04-23-claude-orchestrator-as-capability-shell.md)

## Open Questions

- [ ] Where should the first policy engine live: shared platform
      orchestration, Work product backend, or a thin shared package consumed by
      Work first?
- [ ] What is the minimum durable storage shape for run state, policy snapshot,
      approval request, and evidence references without over-modeling the first
      slice?
- [ ] Which first three Work tools should exercise the contract: read-only
      context lookup, local draft/write mutation, and approval-gated external
      action?
- [ ] What eval harness should promote a provider/model from `catalog_only` to
      `evaluated` for JSON fidelity, tool-call accuracy, and recovery ability?
- [ ] How should policy regression replay be exposed: CLI test fixture, docs
      artifact, or Work admin/debug panel?
- [ ] What exact names should user-facing worker/delegation tools use?
- [ ] When should async delegation grow from simple scheduled run references
      into full multi-agent collaboration semantics, including blocking vs
      async joins, budget inheritance trees, and deadlock graphs?

## References

- [ADR-082: Recast the Orchestrator as a Capability Shell with Policy-Dial Supervision](../decisions/082-recast-orchestrator-as-capability-shell-with-policy-dial-supervision.md)
- [ADR-081: Canonicalize the Core Record Taxonomy as Interaction / Planning / Execution](../decisions/081-canonicalize-three-tier-core-record-taxonomy.md)
- [SPEC-062: Agent Missions, Managed Work, and Transport Bindings](./SPEC-062-agent-missions-and-transport-bindings.md)
- [SPEC-050: Group Chat Temporary Participants and Reusable Lightweight Presets](./SPEC-050-group-chat-temporary-participants-and-reusable-lightweight-presets.md)
- [SPEC-040: Cats Work Team Templates and Work Intake](./SPEC-040-cats-work-team-templates-and-work-intake.md)
- [Research: 2026-04-23 Codex Cats Work Agent Supervision Model](../research/2026-04-23-codex-cats-work-agent-supervision-model.md)

---

*Created: 2026-04-25*
*Author: Codex*
