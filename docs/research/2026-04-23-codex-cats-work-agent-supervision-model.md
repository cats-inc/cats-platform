# Codex Research: Cats Work Agent Supervision Model

Date: 2026-04-23
Author: Codex
Source: Conversation synthesis with the product owner
Status: Research note, not an accepted decision

## Summary

Cats Work should not be framed as a rule-based orchestrator that competes with
modern agent coding systems. Its strongest product thesis is different:

> Cats Work is a management layer for mixed-capability AI labor.

The platform should let strong autonomous agents use tools, APIs, MCP servers,
runtime sessions, and other provider CLIs with substantial freedom, while
holding them inside product-owned permissions, state transitions, audit trails,
approval gates, budgets, and lifecycle controls.

For weaker or cheaper models, Cats Work should progressively increase
structure: smaller tasks, narrower tools, stricter schemas, more checkpoints,
more validation, and more frequent escalation. This is not a second
orchestrator personality. It is the same manager adapting its supervision style
to the worker's capability, task risk, cost profile, and observed performance.

## Core Claim

The orchestrator should be a manager, not a second brain pretending to out-plan
Codex, Claude, Gemini, or future agent processes.

The practical architecture is:

```text
Strong agent process = planner / operator / executor
Cats Platform = UI, tools, state, permissions, scheduler, approval, audit
Weak model = narrow worker inside structured SOPs and validators
```

That means the orchestration layer has two jobs:

1. Create a reliable operating environment for capable agents.
2. Provide enough supervision structure for weaker models to still produce
   useful, bounded work.

It should not hard-code a universal workflow for every task just because the
platform can.

## Why This Matters

If Cats Work tries to become a large rule-based planner, it risks fighting the
direction of agent coding. The most capable current systems are already good at
planning, tool use, file inspection, iteration, and recovery when they are given
the right operating context.

The platform's advantage is not that it can write better plans than every model.
Its advantage is that it can provide the things raw agent processes do not own:

- durable product state
- official tools and APIs
- permission boundaries
- lifecycle control
- scheduling
- approval gates
- runtime capacity management
- memory and evidence capture
- UI for humans to inspect, redirect, and approve work
- cost-aware routing across expensive, cheap, free, local, and provider-backed
  execution lanes

This is the same pattern as human management. A highly capable worker gets
goals, resources, constraints, and occasional review. A weaker worker gets
smaller assignments, clearer SOPs, closer checkpoints, and less authority. The
manager has one role, but varies the management style.

## Orchestrator Definition

The cleanest definition is:

> The orchestrator is an agent supervision and lifecycle layer that binds one
> or more agent processes to Cats tools, permissions, state, and approval gates.

It is not only a visible Cat. It is not only a provider/model pair. It is not a
fixed rule tree.

At runtime, it may bind to:

- a strong agent process such as Codex, Claude, Gemini, or a comparable agentic
  runtime
- a named Cat that acts as the visible or delegated front-stage actor
- a provider/model/control target for LLM judgment
- a cheaper or local model for narrow substeps
- deterministic APIs for state mutation and invariant enforcement

The important distinction is that provider/model is execution, Cat is identity,
and orchestration is supervision plus lifecycle control.

## The Fourth Option

In the earlier framing, three possible orchestrator interpretations were on the
table:

1. Give orchestrator ability or permission to one or more Cats.
2. Configure provider/model/control targets for orchestrator logic to call.
3. Delegate orchestration to one or more visible Cats.

All three are useful, but none is sufficient as the primary model.

The better fourth option is:

> Orchestrator as an agent process binding: connect a capable agent process to
> Cats tools, state, memory, permissions, scheduler, and approval gates.

If forced to choose among the original three, option 3 is closest to the agentic
direction because it treats a delegated agent/Cat as the actor. But the better
product architecture is option 4.

## Invariants Belong at Tool Boundaries

Prompt instructions are useful but insufficient. Core invariants must be
enforced programmatically at the API and tool boundary.

Examples:

- adding too many participants returns a structured `limit_exceeded` error
- cueing too many audience members is rejected, reduced, or converted into an
  approval-required state
- destructive actions require explicit approval
- high-cost provider/tool access is checked against budget and allowlists
- runtime-session limits are enforced by the platform, not by a prompt request
- state transitions are validated by the server before mutation

The agent should see these constraints in its prompt and tool descriptions so it
can plan well, but the platform must still enforce them when the tool is called.

This gives the agent freedom to think while preventing it from violating product
truth.

## Capability-Aware Supervision

The supervision model should not be a boolean switch between `autonomous` and
`rule_based`.

It should be continuous and policy-driven:

```ts
interface SupervisionPolicy {
  autonomyLevel: 0 | 1 | 2 | 3 | 4 | 5;
  taskGranularity: 'tiny' | 'step' | 'milestone' | 'outcome';
  toolScope: 'none' | 'read_only' | 'narrow_write' | 'broad_write';
  checkpointCadence: 'every_step' | 'milestone' | 'on_risk' | 'final';
  approvalThreshold: 'low' | 'medium' | 'high';
  fallbackPolicy: 'retry' | 'ask_human' | 'escalate_model' | 'delegate_other';
}
```

This allows one orchestrator personality to manage different workers
differently:

| Worker class | Supervision style | Appropriate work |
|--------------|-------------------|------------------|
| Strong autonomous agent | Outcome delegation with broad tools and approval gates | planning, coding, multi-step execution, delegation |
| Strong but high-risk context | Milestone checkpoints and stricter approval | production changes, external sends, destructive actions |
| Mid-tier model | Template-driven workflow with limited tools | research summaries, structured plans, drafts |
| Weak local model | Tiny tasks, schema output, no direct mutation | classification, extraction, title generation, summarization |
| Untrusted model | Draft-only, human or strong-agent approval | suggestions, alternatives, low-confidence proposals |

## Role of Rule-Based Logic

Rule-based logic is still important, but it should not be the main brain for
high-capability agents.

Its strongest roles are:

- enforcing invariants
- selecting safe defaults
- shaping weak-model tasks
- validating structured output
- splitting work into fixed SOP steps when the worker cannot plan reliably
- deciding when to escalate to a stronger model or human
- retrying with smaller context or narrower instructions
- preventing invalid state mutation

For strong agents:

```text
Give goal + tools + constraints + checkpoints.
```

For weak models:

```text
Give one small step + constrained input + schema + validator.
```

That is not two different orchestrators. It is one supervision system varying
management intensity.

## Scheduler and Lifecycle Are Required

Even if a strong agent is the real planner, it cannot reliably own its own
lifecycle from inside a single run.

Cats Work still needs a scheduler/task substrate that can:

- start agent sessions
- attach tools and context
- allocate runtime/session capacity
- persist task/run state
- support background, delayed, recurring, and resumed work
- handle retry, timeout, cancellation, and failure recovery
- request and record approvals
- preserve audit trails and artifacts
- allow agents to request delegation or spawn, while the platform approves and
  performs the actual lifecycle operation

The agent may decide what should happen next. The platform decides what is
allowed, what is scheduled, what is durable, and what must be approved.

## Cats Work Product Thesis

The core of Cats Work is not merely "chat plus work items."

The core is:

> Make mixed-cost, mixed-capability AI labor useful by supervising it like a
> real workforce.

This creates a strong economic angle:

- expensive agents do high-leverage planning and review
- free or cheap local models do narrow bulk work
- strong agents or humans review weak outputs at risk boundaries
- the platform records evidence, cost, confidence, and lineage
- tools expose real business actions but enforce hard product rules

The user should not need every worker to be elite. Cats Work should make a
portfolio of workers productive.

## Implications for Product Design

1. Cat identity and execution target must remain separate.
   A Cat can switch provider/model without becoming a different Cat.

2. Solo, temporary participant, My Cat, Boss Cat, and Guide Cat can share an
   addressable-target abstraction, but they should not all become the same
   durable registry record.

3. Boss Cat and Guide Cat are not special provider/model rows. They are visible
   identities with capabilities layered on top.

4. The orchestrator should not be modeled as `ruleBased = true/false`.
   Supervision should be a policy derived from capability, risk, reversibility,
   cost, and observed reliability.

5. API and MCP tools should be designed as the primary operating surface for
   agents, not as thin wrappers around UI actions.

6. Every important mutation should produce structured evidence: who requested
   it, which model/agent proposed it, which policy allowed it, what it changed,
   and whether approval was required.

## Open Questions

- How should Cats Work score agent capability over time?
- Should capability tiers be manually assigned, measured from evals, learned
  from task history, or all three?
- What is the smallest useful scheduler/task substrate that supports this model
  without becoming a heavyweight workflow engine too early?
- Which actions should always require human approval, even when requested by a
  trusted strong agent?
- How should weak-model output confidence be represented when the model cannot
  self-assess reliably?

## Recommended Next Step

Define a small `SupervisionPolicy` contract and use it to drive one vertical
slice:

1. one strong-agent path with outcome-level delegation
2. one weak-model path with SOP-style structured output
3. one shared tool boundary enforcing the same invariant in both paths
4. one audit trail showing task, run, model, tool call, approval, and result

This would prove the real Cats Work thesis: not that the platform has one
perfect orchestrator, but that it can manage different kinds of AI workers well.
