# Agent Control Surface Registry

> Central map for mandatory structured callbacks between Cats and agent/runtime
> processes.

## Purpose

This document is the parent registry for places where Cats requires an agent,
runtime bridge, or platform scheduler to report structured state before the
system continues.

Not every mandatory callback is a tool call. Tool calls are the right shape when
an agent or runtime bridge asks Cats to perform a capability or side effect.
Other control points are better modeled as decision envelopes, finalization
envelopes, or lifecycle events.

This registry answers two questions:

1. Which structured surfaces exist today?
2. Which registry owns the detailed contract?

`docs/tool-calls.md` is a child registry of this document. A surface appears in
`tool-calls.md` only when it is a callable tool or supervised tool manifest.

## Core Rule

Prompt text is not enforcement. If Cats needs to depend on an agent response for
control, safety, persistence, routing, final rendering, audit, or retry
behavior, that response must be a structured control surface.

Side effects must cross a supervised boundary. A decision envelope may propose a
tool call, but platform state changes only when the platform executes the
corresponding tool, route, delegate, or lifecycle request through its boundary.

## Surface Kinds

| Kind | Producer | Consumer | Side effect by itself? | Purpose | Detail registry |
|------|----------|----------|------------------------|---------|-----------------|
| `bounded_observation` | Platform | Agent | No | Give the agent limited, policy-shaped state instead of raw product/runtime internals. | This document, feature SPEC |
| `decision_envelope` | Agent | Platform | No | Let a strong model provide semantic planning, tool intent, delegation, or recovery decisions. | This document, SPEC-082 |
| `tool_call` | Agent or runtime bridge | Platform | Yes, when applied | Request a concrete capability through manifest, policy, approval, budget, validation, and evidence gates. | [tool-calls.md](./tool-calls.md) |
| `finalization_envelope` | Agent / runtime adapter | Platform | No | Gate the visible final response and any structured claims before the user sees it. | This document, feature SPEC |
| `lifecycle_event` | Runtime bridge / scheduler | Platform | No direct product mutation unless consumed by scheduler | Report run/session/checkpoint/timeout/cancellation state. | Feature SPEC / runtime docs |
| `evidence_event` | Tool boundary / scheduler | Platform | No | Persist audit evidence for a supervised action that was applied, rejected, or held. | SPEC-082 / implementation contract |

## Placement Rules

- If the surface lets an agent ask Cats to do something, register it as a tool
  in [tool-calls.md](./tool-calls.md).
- If the surface lets an agent explain what it plans to do next, register it as
  a decision envelope here. The platform may validate it and then execute
  resulting tools separately.
- If the surface gates what the user is about to see, register it as a
  finalization envelope here.
- If the surface is emitted by the runtime or scheduler without agent authorship,
  register it as a lifecycle or evidence event here.
- If the same operation is also exposed as a public HTTP route, document the
  HTTP route in [api.md](./api.md) and cross-link it from this registry.
- Feature SPECs may define deep behavior, but a mandatory control surface must
  also be discoverable from this document.

## Current Registry

Shared role-procedure context and Orchestrator collaboration operations
are specified in [SPEC-118](specs/SPEC-118-orchestrator-knowledge-and-collaboration-operations.md)
and staged in [PLAN-110](plans/PLAN-110-orchestrator-knowledge-and-collaboration-rollout.md).
Inline knowledge now reaches the applicable visible and decision requests, with
`productKnowledge` provenance in request metadata and visible assistant receipts.
Provider-selected default Chat keeps its own identity; Code/Work retain their
product-owned instructions despite sharing the internal actor slot. K2's opt-in
read/preparation operations use the existing observation/decision policy gate
and supervised tool boundary, with structured feedback to the same session.
K3 adds owner-confirmed conversation/membership and fixed-role Work operations.
The model only queues a role Run; the host independently checks the owner grant
before expensive execution, then returns an authoritative inspection receipt.

| Surface | Kind | Status | Producer | Consumer | Contract / implementation | Details |
|---------|------|--------|----------|----------|---------------------------|---------|
| `ProviderAgentBoundedObservation` | `bounded_observation` | Implemented contract | Platform orchestration / supervision | Driving provider agent | `src/platform/orchestration/providerAgentDecision.ts` | [Provider-Agent Observation](#provider-agent-observation) |
| `ProductKnowledgeContext` / `productKnowledge` receipt | `bounded_observation` / request metadata | K1 inline delivery; K2 exact read-operation procedure selection | Platform shared reader / Chat context assembly | Applicable Orchestrator reply and decision sessions | `src/platform/knowledge/productKnowledge.ts`, `src/products/chat/state/orchestratorKnowledge.ts` | [SPEC-118 K1](specs/SPEC-118-orchestrator-knowledge-and-collaboration-operations.md#k1-implementation-contract) |
| `ProviderAgentToolFeedback` / `toolResults` | `bounded_observation` | K2/K3 same-session feedback; at most four recent results / 24,000 serialized characters | Supervised Chat loop and Work host inspection | Coordinating provider-agent decision session | `src/platform/orchestration/providerAgentAdapter.ts` | [Orchestrator Collaboration Execution](tool-calls.md#orchestrator-collaboration-execution) |
| `CollaborationReport` | `finalization_envelope` | K2 preparation and K3 authoritative execution status/receipts; source and current Core truth rechecked at publication | Chat collaboration loops | Chat transcript/dispatch merge | `src/products/chat/state/orchestratorCollaborationReport.ts` | [SPEC-118 K3](specs/SPEC-118-orchestrator-knowledge-and-collaboration-operations.md#k3-admission-mutation-and-recovery-contract) |
| `chat.collaboration.ensure_*` / `work.collaboration.*` | `tool_call` | K3 owner-confirmed scope, fixed role queueing, inspection and stop | Actual Chat Orchestrator; host Work drain after queue receipt | Canonical Chat and Work delegates | `src/products/chat/state/collaborationExecutionSurface.ts` | [Execution contracts](tool-calls.md#orchestrator-collaboration-execution) |
| `ProviderAgentDecision` | `decision_envelope` | Implemented contract | Driving provider agent | Platform policy gate | `src/platform/orchestration/providerAgentDecision.ts`, `providerAgentPolicyGate.ts` | [Provider-Agent Decision](#provider-agent-decision) |
| `SupervisedToolInvocation` / `ToolResult<T>` | `tool_call` | Implemented contract | Agent, runtime bridge, or product delegate | Supervised tool boundary | `src/platform/supervision/contracts.ts`, `toolBoundary.ts`, `toolRegistry.ts` | [tool-calls.md](./tool-calls.md) |
| `PhaseScopedWorkToolSurface` | `tool_call` | Product delegates, Chat bounded-observation descriptors, planner `work-memory` intent, and runtime dispatch intent metadata implemented; runtime MCP execution adapter pending | Strong Cat / Boss Cat via phase-scoped observations and `work-memory` tool intent | Cats Work supervised tool boundary | `src/products/work/shared/workToolSurface.ts`, `src/products/work/shared/workToolObservation.ts`, `src/products/work/shared/workToolIntent.ts`, `src/products/chat/state/workToolIntentResolver.ts`, `src/products/work/state/workIntakeDelegate.ts` | [tool-calls.md](./tool-calls.md#phase-scoped-work-tools) |
| `CodeAssistantFinalization` | `finalization_envelope` | Scaffolded, not wired | Code assistant / runtime adapter | Cats Code finalization gate | `src/products/code/state/sessionFinalization.ts` | [Code Assistant Finalization](#code-assistant-finalization) |
| `ToolBoundaryEvidenceEvent` | `evidence_event` | Implemented contract | Tool boundary | Evidence sink / Work projections | `src/platform/supervision/toolBoundary.ts`, `evidenceSink.ts` | [Tool Boundary Evidence](#tool-boundary-evidence) |
| `RuntimeSupervisionContext` | `lifecycle_event` / boundary context | Implemented contract | Platform supervision wrapper | cats-runtime call path | `src/platform/supervision/runtimeBoundary.ts` | [Runtime Supervision Boundary](#runtime-supervision-boundary) |
| Code Catlas observation | `bounded_observation` | Implemented; fixture coverage | Code help service | Core-bound Catlas provider/model | `src/products/code/state/catlasHelp.ts` | [Catlas Code Help](#catlas-code-help) |
| `CatlasAdvice` | `finalization_envelope` | Implemented; fixture coverage | Catlas provider/model | Code help response gate | `src/platform/catlas/inference.ts` | [Catlas Code Help](#catlas-code-help) |

## Catlas Code Help

The [Code help HTTP route](api.md#code-catlas-help) accepts a separate user
question plus a bounded draft. The Code-owned service constructs an observation
with surface/time, Runtime reachability, draft coding target and availability,
workspace directory-check outcome, requested policy and explicit unknown/not-yet-
started state. Full paths, source files and composer content are excluded.

The Platform inference service adds the selected versioned knowledge contents
and instructs Catlas's Core-bound model to distinguish observed state, draft
intent and inference. Existing supervised Runtime wrappers request an isolated
read-only sandbox session with no requested skills or product-action executor.
Provider enforcement is still Runtime-owned; unsupported execution yields basic
guidance. No operation-decision envelope or new agent tool is exposed here.

`CatlasAdvice` is exactly `{ advice: string, knowledgeIds: string[] }`. The gate
requires bounded nonempty advice, known knowledge IDs and no extra fields. It
rejects non-text result segments. Advice is rendered as text. A separate receipt
identifies the input bundle/entries and observation by digest, the effective
provider/model/session, and best-effort cleanup. Server binding/enablement checks
and renderer context invalidation prevent reuse after settings change.

Fixture coverage includes actual inline knowledge transmission through the
Runtime HTTP client, failure/cancellation cleanup and UI invalidation. Live
provider and installed-Desktop acceptance remain pending under
[PLAN-109](plans/PLAN-109-cats-self-development-and-catlas-practice.md).

## Provider-Agent Observation

The platform sends a bounded observation to a driving provider agent instead of
raw product state. The current contract is `ProviderAgentBoundedObservation`.

Key properties:

- includes run id, goal, task kind/risk, actor target, policy dials, budget,
  available tools, context refs, summaries, and invariants;
- carries summaries and references instead of raw transcript/message/prompt
  content;
- lists only tools that the platform has decided are available under the
  current supervision policy.

Source of truth:

- `src/platform/orchestration/providerAgentDecision.ts`
- [ADR-082](./decisions/082-recast-orchestrator-as-capability-shell-with-policy-dial-supervision.md)
- [SPEC-082](./specs/SPEC-082-cats-work-agent-supervision-and-tool-boundary.md)
- [PLAN-075](./plans/PLAN-075-real-provider-orchestrator-integration.md)

## Provider-Agent Decision

The driving agent returns one `ProviderAgentDecision` envelope. This is not a
tool call. It is a structured model-authored decision that the platform gates
before any side effect occurs.

Current decision kinds:

- `semantic_plan`
- `tool_request`
- `delegation_request`
- `recovery_decision`

Rules:

- A `semantic_plan` may contain steps whose action is `call_tool`, but those
  steps are not applied until Cats invokes the named tool through the supervised
  tool boundary.
- A `tool_request` must name a tool inside the bounded observation's available
  tool list.
- A `delegation_request` is allowed only when the current policy grants enough
  autonomy.
- A `recovery_decision` must choose a fallback that the current policy allows.
- Policy validation failures are rejected before execution with stable
  supervision errors.

Source of truth:

- `src/platform/orchestration/providerAgentDecision.ts`
- `src/platform/orchestration/providerAgentPolicyGate.ts`
- [SPEC-082](./specs/SPEC-082-cats-work-agent-supervision-and-tool-boundary.md)

## Supervised Tool Calls

Tool calls are the boundary where agent intent can become platform effect.
Current supervised tool contracts use:

- `SupervisedToolManifest`
- `SupervisedToolRegistry`
- `SupervisedToolInvocation`
- `ToolResult<T>`
- `ToolBoundaryEvidenceEvent`

Result statuses:

- `applied`
- `pending_approval`
- `rejected`

Registry:

- [tool-calls.md](./tool-calls.md)

Source of truth:

- `src/platform/supervision/contracts.ts`
- `src/platform/supervision/toolRegistry.ts`
- `src/platform/supervision/toolBoundary.ts`
- [SPEC-082](./specs/SPEC-082-cats-work-agent-supervision-and-tool-boundary.md)

## Code Assistant Finalization

Cats Code has a structured finalization envelope that runtime adapters can
emit as a `finalization` stream event or as `result.finalization` /
`result.finalizationEnvelope` metadata:

```ts
interface CodeAssistantFinalization {
  assistantTurnId: string;
  bodyText: string;
  artifactClaims?: Array<{
    declarationId: string;
    label?: string | null;
    title?: string | null;
  }>;
}
```

This is not a tool call. It gates the final visible assistant response. If the
assistant claims that an artifact was produced or recorded, each
`artifactClaims[]` item must match an accepted same-turn `declare_artifact`
result. Otherwise finalization is blocked with
`artifact_claim_without_declaration`.

Source of truth:

- `src/platform/runtime/assistantFinalization.ts`
- `src/products/code/state/sessionFinalization.ts`
- [SPEC-092](./specs/SPEC-092-code-artifact-declaration-contract.md)
- [PLAN-081](./plans/PLAN-081-code-artifact-declaration-rollout.md)

## Tool Boundary Evidence

Every supervised tool boundary invocation emits evidence for the applied,
pending, or rejected attempt. Evidence is not the user-facing artifact; it is
the audit trail for policy decisions and effects.

Current evidence fields include:

- action id
- run id
- actor ref
- tool name
- tool result status
- manifest summary
- policy snapshot ref
- rejection code
- approval request id
- cancellation context

Source of truth:

- `src/platform/supervision/toolBoundary.ts`
- `src/platform/supervision/evidenceSink.ts`
- [SPEC-082](./specs/SPEC-082-cats-work-agent-supervision-and-tool-boundary.md)

## Runtime Supervision Boundary

Runtime session creation and message sends already cross a supervised boundary.
The wrapper stamps supervision metadata into runtime context and records the
operation under the same tool-boundary evidence model.

Current supervised runtime tools:

- `cats.runtime.session.create`
- `cats.runtime.message.send`

Details:

- [tool-calls.md](./tool-calls.md)
- `src/platform/supervision/runtimeBoundary.ts`
- [ADR-089](./decisions/089-split-runtime-request-and-stream-idle-timeouts.md)

## Future Surface Checklist

When adding a new forced agent callback, choose exactly one primary surface
kind:

1. `tool_call` if it can perform a capability or side effect.
2. `decision_envelope` if it is model-authored planning or routing intent.
3. `finalization_envelope` if it gates visible response commit.
4. `lifecycle_event` if it is runtime/scheduler-produced execution state.
5. `evidence_event` if it audits a boundary decision or effect.

Then update:

- this registry;
- [tool-calls.md](./tool-calls.md), if the surface is callable;
- the owning SPEC / PLAN;
- [api.md](./api.md), only if the operation is exposed as public HTTP;
- focused contract tests for the structured shape and rejection path.

---

*Created: 2026-04-29*
*Last updated: 2026-05-13*
