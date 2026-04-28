# ADR-082: Recast the Orchestrator as a Capability Shell with Policy-Dial Supervision

> The current orchestrator in `src/platform/orchestration/` conflates
> rule-based routing with visible-participant execution and leaves no
> room for agent-native planning to surface. Narrow the orchestrator's
> declared scope to a capability shell (UI-facing contracts, tools,
> invariants, lifecycle), move **agent-native semantic planning**
> into the driving agent process while **deterministic routing,
> invariant enforcement, weak-model SOP pipelines, and validation /
> retry shaping remain platform responsibilities**, and govern
> supervision intensity through a single per-action `SupervisionPolicy`
> contract instead of per-session mode switching.

## Status

Proposed

> This ADR refines ADR-011 (Model the Primary Orchestrator as a Visible
> Cat). ADR-011 established that the visible orchestrator Cat and the
> orchestration system layer are related but distinct domain objects;
> this ADR narrows what the system layer is actually responsible for.
> It does not change the `Primary Orchestrator Cat` / `Boss Cat`
> identity model, transport bindings, or chat-first entry UX.

## Context

Two parallel research notes landed on 2026-04-23 — one from Claude,
one from Codex (see References) — both converged on the same
observation: the current Cats orchestrator is **against the grain of
modern agent coding**, and that misalignment is the single biggest
structural obstacle to Cats Work's cost story.

The observation factors into four concrete problems:

1. **The orchestrator wears two hats with the same name.** In
   `src/platform/orchestration/` a rule-driven `planner` /
   `dispatcher` / `execution/workflow` layer decides who speaks,
   which lane routes, which audience applies — all in TypeScript,
   none of it calls an LLM. But `state.globalOrchestrator` also
   carries an `executionTarget = { provider, instance, model }`
   used when `participantKind === 'orchestrator'` resolves as the
   talking participant (typically solo composer / +New Chat). The
   first hat is a rule-based router; the second hat is an LLM-backed
   participant. They share a state slot and a name, which is why
   every "what is the orchestrator?" conversation gets tangled.

2. **Rule-based routing is now a ceiling, not a floor.** Modern agentic
   systems (Claude Code, Cursor, Aider, Cline, OpenHands) all follow
   the same pattern: model as brain, system as tool / MCP / CLI
   surface, planning and delegation happen at inference time. By
   encoding every "next step" decision in our TS, we guarantee the
   system is no smarter than the rules we wrote. A paying Opus /
   GPT-4 session sees its reasoning capacity used only to fill in
   the cells the router allocated — a structural waste.

3. **Cats Work economics require hybrid orchestration.** Work runs
   are high-frequency and repetitive. A daily automation firing 500
   times on Claude Opus costs orders of magnitude more than the same
   workload dispatched so a strong agent only plans / reviews while
   weak local models (Ollama 7B-13B) handle classification,
   extraction, translation, and summarization sub-steps. Chat and
   Code can default to concierge with a strong agent; Work cannot —
   all-concierge is a more expensive Chat, all-conductor is an
   AI-less Zapier. This economic constraint, not aesthetic
   preference, is what forces the supervision model to support
   mixed-capability workers inside a single session.

4. **Dual-class ("Concierge" vs "Conductor") supervision fragments
   the real problem.** The intuitive first cut is to build two
   orchestrator implementations for strong vs weak models. That
   framing breaks down in practice: the same session can have a
   strong driver delegating to weak workers, the same strong model
   can hit a risky task that needs tighter approval, a weak model
   can outperform on a narrow slot, and same-model different-task
   contexts fluctuate mid-session. Supervision is a **policy value
   per action**, not a session-level identity.

Prior art in this repo already separates parts of the problem:

- **ADR-004** separates cat identity from provider execution — the
  three-axis split (identity / execution / supervision) this ADR
  formalizes is a direct extension.
- **ADR-011** established the two-layer (visible orchestrator Cat +
  system layer) model. This ADR does not touch the Cat identity
  layer; it narrows the system layer's declared responsibilities.
- **ADR-031** (superseded by ADR-055) separated composer lead
  control from Boss orchestration authority, an earlier move in the
  same direction.
- **ADR-063** separated managed work, missions, runs, and transport
  bindings — the execution granularity that a capability-shell
  orchestrator targets.
- **ADR-081** canonicalized the Interaction / Planning / Execution
  record taxonomy. `SupervisionPolicy` operates across all three
  layers but is not itself a durable record.

The 2026-04-23 Claude research note documents the full derivation;
the sibling Codex research note proposes a concrete
`SupervisionPolicy` schema and a vertical-slice validation plan. This
ADR adopts the converged position from both.

## Decision

### 1. Four — and only four — orchestrator responsibilities

The platform orchestrator (system layer, not the visible Cat)
declares exactly four responsibilities. Anything not on this list
belongs to the driving agent process or to a product / UI layer.

- **UI-facing contracts, projections, and progress events** — the
  data shapes, projections, and event streams that product
  renderers consume (participant shape, lane / turn / segment state,
  live-indicator events, transcript event envelopes). The platform
  orchestrator **does not own rendering or input capture** — those
  belong to the product renderers under `src/products/*/renderer/`
  and to the shared design layer under `src/design/`. The
  orchestrator's job is to emit the structured truth the renderers
  need; drawing pixels is the renderer's job.
- **Tool / MCP / API surface** — the full set of capabilities an
  agent can invoke: internal APIs (workitem, participant, channel,
  runtime), external CLI wrappers (Claude Code, Codex, Gemini),
  third-party MCP servers, local compute resources. Some tools on
  this surface are implemented internally as rule-based SOP
  pipelines that may call weak models as workers — from the calling
  agent's point of view those are still tools, not peer agents.
- **Invariants** — hard constraints enforced at the tool boundary:
  audience / participant limits, permissions, destructive-action
  gates, budget caps, rate limits. Never enforced only in prompt
  text; always programmatically rejected or held for approval at
  the API call.
- **Lifecycle scheduler** — session creation, wake triggers
  (interactive / background / delegated), checkpoint and resume,
  budget envelopes, supervision detection (stuck loop / stall /
  confusion), event streaming, forced termination.

### Division of "who decides what happens next"

Within the above shell, the line between agent and platform is
**not** "agent decides everything, platform does nothing
intelligent":

- **Agent (driving LLM process) owns** high-level semantic
  planning for agentic workloads: step decomposition during an
  open-ended Code / Work task, delegation choices, tool selection
  across a task, mid-flight recovery reasoning, summarization of
  its own output, when to stop.
- **Platform owns** deterministic routing (for example explicit
  `@mention` resolution, channel-wired dispatch to a named target),
  invariant enforcement, weak-model SOP pipelines invoked as
  tools, validation / retry shaping applied by
  `SupervisionPolicy.validation` and
  `SupervisionPolicy.fallbackPolicy`, and evidence capture on
  every mutation (§5). These are policy responsibilities, not
  agent reasoning surfaces.

The platform's rule-based logic is therefore **not retired in
general**; it is retired from pretending to plan on behalf of
capable agents. The same rule logic continues to own the
interactions where determinism is the product promise (Chat routing
is the clearest case) and the pipelines where no agent-level
reasoning is appropriate (weak-model conductor flows exposed as
tools).

### 2. Separation between lifecycle scheduler and semantic policy

The lifecycle scheduler must **not read message content to make
semantic decisions**. It operates on metadata (timestamps, budget
state, retry counts, health signals). This is the specific
prohibition that prevents rule-based routing from growing back under
the scheduler label.

Policy engines, intent classifiers, and workflow steps **may** read
content to classify, route, validate, or score — provided they do so
at an auditable tool / API boundary and emit structured results.
This distinction (what read, for what purpose, with what audit
trail) is the contract, not "scheduler cannot see text".

### 3. Single orchestrator, per-action `SupervisionPolicy`

There is **one** orchestrator implementation. Supervision intensity
is a value computed per action from context, not a class chosen per
session. The contract is:

```ts
interface SupervisionPolicy {
  // How much the agent may decide for itself.
  // Discrete — not a 0..5 scalar — because agency is a gate, not
  // a smooth spectrum.
  autonomy: 'none' | 'single_step' | 'milestone_plan' | 'outcome_delegation';

  // Task chunk size given at a time.
  taskGranularity: 'tiny' | 'step' | 'milestone' | 'outcome';

  // Tool surface exposed this moment.
  toolScope: 'none' | 'read_only' | 'narrow_write' | 'broad_write';

  // Prompt and output scaffolding intensity.
  scaffolding: 'none' | 'few_shot' | 'grammar_forced' | 'sop_template';

  // Output validation strictness.
  validation: 'best_effort' | 'schema_required' | 'semantic_check';

  // Check-in cadence (orthogonal to autonomy).
  checkpointCadence: 'every_step' | 'milestone' | 'on_risk' | 'final';

  // Human-approval gate strength.
  // Orthogonal to autonomy so a strong agent on a high-risk action
  // can keep autonomy while requiring external approval.
  approvalThreshold: 'low' | 'medium' | 'high';

  // Recovery path on failure.
  fallbackPolicy: 'retry' | 'ask_human' | 'escalate_model' | 'delegate_other';
}
```

Each field is resolved independently by a dedicated `decide*(ctx)`
function at the moment the action is about to execute. Context is
a vector, not a scalar tier label, at minimum:

- **Capability profile** — tool-use accuracy, JSON fidelity,
  reasoning depth, context length. Sources are a combination of
  (1) explicit provider/model/control entries in the operator-owned
  capability bootstrap YAML, (2) eval results run against the
  provider / model, (3) accumulated task history per provider /
  model, and (4) operator overrides. Provider/model catalogs may
  supply inventory facts such as context window and declared tool
  support, but those facts do **not** classify a provider/model as
  strong or weak unless the capability bootstrap YAML explicitly
  lists that target. **Not sourced from
  `ProductProviderEventCapabilities`** — that signal describes
  delivery / observability (whether we can observe incremental
  text, tool_use events, tool_result events, progress, reasoning
  events), not intelligence. A provider can deliver tool_use
  events perfectly while the model inside calls tools with poor
  accuracy; the two axes are independent and must not be conflated.
- **Delivery / observability signals** — `ProductProviderEventCapabilities`
  and adjacent delivery-shape metadata. These influence a
  different subset of policy dials (for example `validation` and
  `fallbackPolicy` may need to be stricter when we cannot observe
  incremental progress) but **do not** constitute the capability
  profile on their own.
- **Task profile** — complexity, side-effects, idempotency,
  reversibility, cross-system reach.
- **Session history** — success rate, format-failure count, tool
  misuse count, observed reliability in this session (hot-start
  signal that outweighs static capability guesses).
- **Invariants / budget state** — remaining budget, time left,
  approvals outstanding, concurrency count.

Policy evaluation is **scoped to the action**, not the session. A
strong driver calling `@ask-weak(...)` evaluates a fresh
`SupervisionPolicy` for that sub-invocation with the worker's
capability context; the driver's own autonomy is unchanged.

### 4. Invariants as structured errors, not silent clipping

Every tool call returns a **discriminated three-way result** so
that "applied", "not applied yet", and "refused" are never
collapsed into the same top-level flag:

```ts
type ToolResult<T> =
  | { status: 'applied';          result: T }
  | { status: 'pending_approval'; requestId: string; summary: string }
  | { status: 'rejected';         error:  { code: string; message: string; details?: unknown } };
```

Rules:

- `status: 'applied'` means the effect has landed. The agent can
  safely reason forward assuming the requested change took effect.
- `status: 'pending_approval'` means **nothing has happened yet**;
  a request for human confirmation is now in flight. The agent
  must not assume the change took effect and must not retry blindly.
  It may continue with unrelated work or wait; the platform emits
  a follow-up event when the user accepts or declines.
- `status: 'rejected'` means a structured refusal. `code` is a
  recognizable constant (for example `E_AUDIENCE_LIMIT_EXCEEDED`,
  `E_NOT_AUTHORIZED`, `E_BUDGET_EXCEEDED`). The agent decides
  whether to adjust and retry, ask for help, or give up.

The platform must never silently clip, redirect, or partially
apply an over-limit request, because that pollutes the agent's
world model and every subsequent reasoning step is built on a
false premise. The earlier `{ ok: true, ... }` / `{ ok: false, ... }`
shape is **explicitly replaced** by this three-way result —
overloading `ok: true` to mean both "succeeded" and "awaiting
approval" was one of the mistakes the first draft made.

Destructive / externally-visible / expensive actions therefore
return `{ status: 'pending_approval', requestId, summary }`
instead of executing. The UI surfaces the pending request; only
on explicit user confirmation does the effect land, at which
point the platform emits a follow-up event whose payload carries
the eventual `{ status: 'applied', result }` or
`{ status: 'rejected', error }`.

Mutating tools **should** ship with a matching read-only
preflight query where it is feasible to provide one
(`@get-channel-capacity`, `@list-participants`,
`@describe-permissions`) so an agent can pre-check capacity,
permission, and conflict state rather than treat errors as
discovery probes.

Not every tool can offer a precise preflight — external APIs
without query endpoints, one-shot side effects on opaque provider
CLIs, actions whose feasibility genuinely depends on execution
time — and forcing one would either lie or block useful
capabilities. The contract is therefore:

- where feasible, provide a preflight query covering
  capacity / permission / known-blocking-conflict checks;
- where not feasible, the tool's schema and documentation must
  explicitly mark the action as non-preflightable and carry the
  expected failure codes so the agent can plan around it without
  expecting a pre-check.

Silent "there is no preflight, try and see" tools are not
acceptable; the absence of a preflight must itself be an
advertised property of the tool.

### 5. Evidence capture as a first-class cross-cutting concern

Every mutation that lands through the tool layer produces a
structured evidence record: requester identity, proposing model /
agent, policy shape that allowed it, pre-image and post-image of
the change, approval trail if any. This record is what lets humans
audit agent-produced outcomes after the fact, which Work in
particular depends on. Evidence is not a new canonical record type
— it reuses `CoreActivityRecord` and adjacent execution-layer
evidence rows per ADR-081 — but the platform orchestrator is
responsible for ensuring every mutation through its tool surface
emits an evidence row.

**Redaction / size / secrets guardrail** — pre-image and post-image
are meant as **minimal redacted structural snapshots**, not raw
dumps. The evidence row must not inline:

- full message transcripts, raw prompts / completions, or entire
  tool call arguments / results (summarize structurally; keep full
  content behind a pointer)
- bearer tokens, API keys, OAuth secrets, or any credential-like
  value (always redacted; never persisted even once)
- large binary / blob content (images, PDFs, audio, video, build
  outputs — link via `CoreArtifactRecord` reference instead)
- external third-party payloads beyond the structural summary
  needed for audit (quote the specific fields that changed, not
  the whole envelope)

Large or sensitive content belongs in a referenced record
(`CoreArtifactRecord`, existing transcript storage, opaque
`artifactId` pointer) so evidence rows stay small, auditable,
cheap to query, and safe to ship across trust boundaries. Evidence
that cannot be captured within these bounds — for example an
action whose meaningful pre/post image is inherently secret —
should instead record the action's occurrence and an opaque
reference, not the secret content itself.

### 6. Identity / execution / supervision three-axis separation

Following and extending ADR-004:

- **Identity** — `Agent` / Cat registry entry; determines whether a
  participant is durably stored, renameable, deletable, searchable
  across sessions.
- **Execution** — `provider / instance / model` target; determines
  which LLM actually produces a given output.
- **Supervision** — `SupervisionPolicy`; determines how much
  latitude the execution target has for this action.

These axes are orthogonal. A single Cat can swap providers without
becoming a different Cat. A single provider / model can run under
different `SupervisionPolicy` values across actions. Solo and
temporary participants share a runtime `ParticipantLike` /
`AddressableTarget` shape with durable Cats but do not enter the
durable Cat registry, because they have no persistent identity
semantics (no direct lane, no memory, no transport binding, no
delete / archive).

That registry separation does not cap agency. A room-scoped temporary
participant created from a strong provider preset can still run under
provider-agent supervision, tool grants, budgets, and approvals for that
room. Per ADR-004's identity / execution split and SPEC-050's channel
participant model, the temporary part is its identity / lifecycle, not its
capability ceiling.

## Scope — what this ADR does not do

- It does **not** add or rename any record type in
  `src/core/types.ts`. Evidence capture reuses existing canonical
  records per ADR-081.
- It does **not** change the frozen shared contracts
  (`src/core/types.ts`, `src/platform/orchestration/contracts.ts`,
  `src/shared/roomRouting.ts`). Adapting those contracts to the
  new orchestrator shape requires separate SPEC + PLAN work.
- It does **not** implement `SupervisionPolicy` — the interface
  declared above is the contract target; the first implementation
  lands through the PLAN that follows this ADR.
- At decision time it did **not** delete
  `src/platform/orchestration/planner.ts` or
  `src/platform/orchestration/dispatch.ts`. PLAN-075 later retired those
  files after deterministic Chat routing and legacy debug projections moved
  under Chat ownership.
- It does **not** change the visible-orchestrator-Cat model
  established by ADR-011, the transport-binding rules of ADR-028,
  or the managed-work / mission / run separation of ADR-063.
- It does **not** decide `@ask-weak` / `@spawn-subcat` naming,
  signatures, or MCP transport. Those belong to a later SPEC.
- It commits only the bootstrap source of truth: absent explicit
  provider/model/control entries in the operator-owned capability
  bootstrap YAML, every execution target starts as the default
  unknown capability profile. Eval results, session history, and
  operator overrides remain separate evidence sources that can refine
  policy after bootstrap.

## Consequences

### Positive

- Single canonical answer to "what is the orchestrator responsible
  for?" that future SPECs, PLANs, and review comments can cite
  instead of re-litigating. Four bullets, nothing else.
- Strong-driver / weak-worker hybrid supervision becomes expressible
  without building two orchestrator classes; the same session
  handles both by evaluating different `SupervisionPolicy` values
  per action.
- Cats Work's cost thesis (hybrid labor) becomes a matter of
  populating `decide*(ctx)` correctly rather than of maintaining a
  duplicate orchestrator fork.
- The agent process gets its intelligence back: Claude / Codex /
  Gemini can plan, iterate, and recover without the platform
  pre-deciding the path.
- Invariant violations produce structured errors the agent can
  reason over, reducing "why did it try that again" mysteries.
- Evidence capture arrives as an explicit platform responsibility
  rather than a product-level afterthought, improving human
  auditability of agent output.
- Solo / Temp / My / Boss / Guide Cat unification at the runtime
  participant layer (while preserving registry separation) removes
  the `if isSolo / else isTemp / else isCat` branches that today
  inflate composer, participant resolver, and audience code paths.

### Negative

- `execution/workflow.ts` remains shared execution projection
  infrastructure. The old platform `planner.ts` and `dispatch.ts` files were
  retired by PLAN-075 after Chat-owned replacements landed, so future drift is
  guarded by static import tests rather than compatibility shims.
- `SupervisionPolicy` evaluation adds a per-action compute step; a
  naive implementation could double tool-call overhead. The first
  vertical slice must measure this and introduce caching only if
  observed cost warrants it.
- Policy decisions are harder to reason about as a set: instead of
  "this session is Tier S, so X", reviewers need to think about
  "at the moment action A ran, context C produced policy P". The
  evidence-capture requirement exists partly to make this
  traceable.
- Weak-model workers are now explicitly **not agents**. Product
  surfaces that currently show every LLM-backed participant as a
  "Cat" may need to distinguish agent Cats from worker invocations
  visually.
- New contributors have to absorb the three-axis split (identity /
  execution / supervision) before they can reason about supervision
  intensity. Terminology is added.

### Neutral

- No schema change, no migration, no immediate behavior change.
- ADR-011's visible-orchestrator-Cat identity model remains in
  force. `Boss Cat` is still the default public orchestrator Cat.
- Parallel-delivery ownership rules (Chat / Code / Work trees)
  remain in force; `SupervisionPolicy` lands in shared code only
  when more than one product needs it.
- Lifecycle scheduler primitives (`cats-runtime`,
  `runtime/client.ts`) remain the substrate; this ADR narrows what
  they are asked to do (operate on metadata), it does not replace
  them.

## Alternatives Considered

### Alternative 1: Keep the current rule-based orchestrator

- **Pros**: No migration work; Chat behavior would have stayed identical; the
  old `planner.ts` / `dispatch.ts` files covered then-current routing cases.
- **Cons**: Locks Cats Work into unfavorable economics (all
  concierge is too expensive, all conductor is not competitive);
  wastes strong-model reasoning for Code and Work; accumulates
  branch logic for every new case.
- **Why rejected**: The cost structure alone makes this unworkable
  once Work ships. The parallel research notes converge on this
  independently.

### Alternative 2: Split into `ConciergeOrchestrator` and `ConductorOrchestrator` classes

- **Pros**: Each class is simple and single-purpose; weak-model
  pipelines are clearly separate from strong-agent sessions; easy
  to reason about each in isolation.
- **Cons**: Forces every session to pick a mode at startup and
  stick with it; fails to cover strong-driver-plus-weak-worker
  within one session; fails to cover same-strong-model-different-
  risk-task; produces two parallel code paths that accrue drift.
- **Why rejected**: The cases that fall through the two-class split
  are exactly the Cats Work cases, so the alternative fails the
  main cost-thesis driver.

### Alternative 3: Static Tier S / A / B / C per session

- **Pros**: Simple classification; policy decisions collapse to a
  tier lookup; predictable runtime cost.
- **Cons**: Capability is a vector (tool-use, JSON fidelity,
  reasoning, context length are uncorrelated), so a single tier
  label is always coarse; a weak model that shines on a narrow
  task gets held back; a strong model that drifts mid-session
  keeps its high tier well past the point where it should have
  tightened. Progressive fallback inside a session becomes
  awkward.
- **Why rejected**: The savings in runtime cost are illusory; the
  coarseness kills exactly the fine-grained supervision that makes
  the Work cost story work.

### Alternative 4: Keep the orchestrator but delegate to a named Cat for planning (research "option 3")

- **Pros**: Conceptually close to handing off agency to a real
  agent; preserves the orchestrator as a coordinator entity with
  opinions.
- **Cons**: Adds a proxy layer between the orchestrator and the
  agent process; splits supervision authority across two records
  (orchestrator policy plus cat persona); invites the same
  two-hat confusion the ADR is trying to retire. Option 3 from
  the original framing is closer to the right direction than
  options 1 and 2 but is still one abstraction layer too many.
- **Why rejected**: The cleaner move is for the driving agent
  process itself to bind directly to the tool / lifecycle surface,
  without a Cat proxy. ADR-011's visible Cat remains available for
  product-facing identity; this ADR decides the system-layer shape,
  not the persona shape.

### Alternative 5: Build `SupervisionPolicy` as a durable per-session record

- **Pros**: Easy to inspect via DB; audit trail for free; stable
  reference across retries.
- **Cons**: Binds policy to session lifecycle rather than action
  lifecycle; reintroduces the tier-at-startup failure mode; forces
  migration on policy shape changes.
- **Why rejected**: Policy must be per-action to handle mixed
  capability within one session. Evidence capture (§5) is the
  right persistence boundary; `SupervisionPolicy` is computed, not
  stored.

## References

- [ADR-004: Separate cat identity from provider execution](./004-separate-cat-identity-from-provider-execution.md)
- [ADR-011: Model the Primary Orchestrator as a Visible Cat](./011-model-primary-orchestrator-as-visible-cat.md)
- [ADR-028: Allow multiple public bot bindings with one Boss Cat](./028-allow-multiple-public-bot-bindings-with-one-boss-cat.md)
- [ADR-055: Retire lead semantics and separate composer recipients from dispatch policy](./055-retire-lead-and-separate-composer-recipients-from-dispatch-policy.md)
- [ADR-063: Separate managed work, agent missions, execution runs, and transport bindings](./063-agent-missions-and-transport-bindings.md)
- [ADR-081: Canonicalize the Core Record Taxonomy as Interaction / Planning / Execution](./081-canonicalize-three-tier-core-record-taxonomy.md)
- [SPEC-050: Group Chat Temporary Participants and Reusable Lightweight Presets](../specs/SPEC-050-group-chat-temporary-participants-and-reusable-lightweight-presets.md)
- [PLAN-080: Provider Capability Bootstrap Config Rollout](../plans/PLAN-080-provider-capability-bootstrap-config-rollout.md)
- [Research: Orchestrator as a capability shell (Claude)](../research/2026-04-23-claude-orchestrator-as-capability-shell.md)
- [Research: Cats Work Agent Supervision Model (Codex)](../research/2026-04-23-codex-cats-work-agent-supervision-model.md)
- `cats-platform/src/platform/orchestration/` — current orchestrator subsystem (planner, dispatcher, execution workflow)
- `cats-platform/src/products/chat/state/runtimeTargeting.ts` — `resolveOrchestratorExecutionTarget` (today's participant-hat entry point)
- `cats-platform/src/shared/providerCatalog.ts` — `ProductProviderEventCapabilities` (delivery / observability signal for supervision policy inputs; **not** a capability / intelligence profile — see §3)

---

*Proposed: 2026-04-25*
*Amended: 2026-04-28 — capability bootstrap source of truth is explicit YAML; unlisted provider/model/control targets default to unknown.*
*Proposed by: Claude, drawing on the 2026-04-23 owner × Claude discussion and the parallel Codex research note*
