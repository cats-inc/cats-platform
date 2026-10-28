# Repositioning the Orchestrator: From Rule-Based Conductor to Capability-Shaping Shell

> Research synthesis of the 2026-04-23 owner × Claude discussion
> Author: Claude (Opus 4.7, 1M context)

## Introduction

This document records a thorough re-examination of the Cats product orchestrator architecture. It starts from a seemingly trivial type question — why the five kinds of "conversation targets" in a chat room cannot be one kind of object — extends into a critique of the orchestrator's current positioning, compares it with the evolution of the modern agent coding paradigm, and finally converges on a single-persona, multi-dial design that closely matches our intuition about workplace management.

There are five key conclusions:

1. The five kinds of objects "Default / Temp Participant / My Cat / Boss / Guide Cat" are not a technical necessity; they are historical accumulation.
2. The current orchestrator is a rule-driven static router, which runs against the modern agent paradigm of an LLM as the brain and tools as capabilities — defensible in Cats Chat, but a structural problem in Cats Code / Work.
3. The reshaped orchestrator has only four responsibilities: UI, Tool surface, Invariant, Lifecycle. All sovereignty over "deciding the next step" is returned to the model.
4. This reshaping is decisive for the economic viability of Cats Work — Work's usage scenario is high-frequency batch, so it only works as a hybrid (strong model drives + weak model workers).
5. But the orchestrator is not a dual-persona switch — it is one persona with a set of policy dials adjusted dynamically to the current context. In workplace terms: "speak to people in human language and to ghosts in ghost language" (adapt to the audience), not split into two supervisors.

## 1. Starting Point: Why Are the Five Kinds of Cats Not One Kind?

Today the "conversation targets" in Cats Chat have five different type representations:

- **Default target**: has only `provider / model / control`, no identity, no persona, one-shot.
- **Temp participant**: carries a role hint (translator, interviewer, ...), with a lifetime no longer than the channel.
- **My Cat**: a resident Cat listed by the user, with a name, avatar and persona.
- **Boss Cat**: My Cat + an `isBoss` flag.
- **Guide Cat (Catlas)**: built-in, cannot be deleted, persona locked.

Looking closely, the differences among the five fall only on four orthogonal axes: **avatar source, name source, lifetime, identity flags**. Each axis is an optional field or an enum.

But **unification has to be discussed in two layers**, otherwise things that should not be lumped together get mixed:

- **Runtime addressable-target / participant-like layer**: all five can share one participant shape that can be mentioned, addressed, and rendered with an avatar. The `if isDefaultChat / else if isTemp / else if isCat` branching that fills the composer, participant resolver and audience computation today is the tax of this layer, and should be removed.
- **Durable Cat registry layer**: **not shared**. Default and Temp lack the semantics "I am added to the bookshelf, can be renamed, have a direct lane, can be deleted / archived, have memory, have a transport binding". Forcing them into the same registry would make them accidentally inherit My Cat's persistence side effects, which is the one correct thing the current type split preserves.

Using the split from the Codex parallel research: **identity / execution / supervision are three orthogonal axes**. Cat is identity (whether registered, whether remembered), provider/model is execution (who speaks this time), and orchestration is supervision (who governs it). What the five kinds of Cats really share is the participant shape, not an identity store — this distinction must be stated explicitly.

- Default = participant with no name, no avatar, no persona, lifetime-per-turn, **no registry record**
- Temp = participant with synthesized identity, lifetime-per-channel, **no registry record**
- My = the baseline form, persistent, **registry record**
- Boss = My + `flags.isBoss`
- Guide = My + `flags.isBuiltin` + `flags.isReadOnly`

The current code's split is partly an error (the runtime participant shape was not extracted) and partly correct (the durable registry was not stuffed carelessly). The right refactoring path is to **extract ParticipantLike / AddressableTarget as the runtime abstraction and keep the Cat registry holding only durable records**, not to stuff all five into one Cat table.

On its own this does not matter much, but it exposes a deeper symptom: **the Cats type system internalized the original intuition that "conversation targets have a role hierarchy", and that intuition is exactly what the orchestrator design decision flows from.**

## 2. The Orchestrator's Dual Identity

Searching `cats-platform` for where the orchestrator actually lives turns up two coexisting but often conflated meanings:

**Orchestrator-as-router** (`src/platform/orchestration/`)
Composed of planner, dispatcher and execution workflow, **entirely deterministic TypeScript**. It reads mentions, channel state and the participants structure, and uses rules to decide who speaks this turn, how lanes are cut, and who the audience is. Routing decisions **do not call an LLM**.

**Orchestrator-as-participant**
`state.globalOrchestrator` holds `executionTarget = { provider, instance, model }`. When routing resolves the target to `participantKind === 'orchestrator'` (typically the default / +New Chat mode), **only then does this target call an LLM**, but it plays the "speaker", not the "dispatcher".

The two hats share one state slot and look like one entity at the code level, but their responsibility logic is completely different. When the user sees "the orchestrator replied", what actually happens is: **router (rules) → resolves to the orchestrator answering itself → participant (LLM) produces a piece of text.**

This duality is the root of all the current confusion.

## 3. Misalignment with the Agent Coding Era

Agentic coding in 2025–2026 — Claude Code itself, Cursor, Aider, Cline, OpenHands — all adopt the same paradigm:

- **The model is the brain**.
- The system only provides **wrappers around tools / MCP / external CLIs**.
- The loop happens at inference time: the model reads context, picks a tool, looks at the result, then picks the next one.
- Planning, routing and delegation all happen at inference time, **not hard-coded in system code**.

By contrast, Cats' orchestrator-as-router locks every planning / routing decision into our TS. This means:

- All the intelligence of "what should happen next" must be pre-encoded by **us**.
- However capable the model is, it gets no dividend.
- Users pay Anthropic/OpenAI for a brain that can reason, yet are locked into "you may only reply with the one line I designate".

For Cats Chat this is still defensible — chat-room semantics really do need determinism (an @mention must arrive, audiences have a cap, the participant list must be predictable). But the workloads of Cats Code and Cats Work are agentic in nature — they need cross-step reasoning, conditional delegation and dynamic tool selection — and making Code/Work inherit Chat's shared orchestrator is equivalent to forcing them into a performance style where the camera turns but the body does not.

## 4. The Right Shape of the Transformation: Four Responsibilities

If we abandon the mistaken self-positioning of "the orchestrator decides who speaks", only four things remain that truly must be done:

**UI framework**
Render the transcript, show avatars, receive input, present state. A pure presentation layer with no agency concerns.

**Tool / MCP / API surface**
All capabilities an agent can call — internal APIs (workitem, participant, channel operations), external CLIs (Claude Code, Codex, Gemini), third-party service MCPs, local compute resources. These are the tentacles with which the agent actually "does things".

**Invariant**
Hard constraints: audience cap, participant cap, permission, destructive-action threshold, budget cap. They must live at the **tool boundary**, not as moral persuasion in a prompt.

**Lifecycle scheduler**
An agent cannot give birth to itself, does not clock in by itself, and does not checkpoint by itself. The system must provide session creation, wake triggers, pause / resume, budget envelopes, supervision and an event stream.

**Division of sovereignty**
- The system governs: when to power on and off, whether there is money and authority, where state is stored, who sees events.
- The **strong agent** governs: what to do after power-on, which tool to call, when to delegate, when to wrap up — **task-level agency is on it**.
- The **weak model** is not on this line — it is not an agent, it is a pipeline step. Decision sovereignty stays in the upper layer (rule / SOP / conductor pipeline / the strong agent that calls it), and it is only responsible for executing a single step with a clear I/O boundary well. Section 7 expands on this.

The most dangerous leak in holding this line is: **the lifecycle scheduler must not quietly make semantic decisions**. It looks at metadata (time, budget, error count, signals) to schedule the birth, aging, sickness and death of sessions, and **does not look at message text** to decide whether to reschedule — that would be the router coming back to life.

But note this boundary is a restriction on the **lifecycle scheduler**, not on the whole system. A policy engine, an intent classifier, and a workflow step (including the step that calls a weak model to classify) can of course read content — that is their job. The difference is:

- **Lifecycle scheduler reads content to decide = forbidden** (it turns into a router in disguise, is unauditable, and pollutes responsibilities).
- **Tool / policy / pipeline step reads content to decide = allowed**, but it must be at the tool/API boundary, auditable, and return structured results.

In other words, what is restricted is "who" reads and for what purpose, not "whether" reading is allowed.

## 5. The Engineering of Invariants

The correct implementation of an invariant is gatekeeping at the tool adapter layer plus structured errors, and **never silent clipping**.

The reason comes purely from how the agent loop works: the agent reasons about its next step from tool return values. If it calls `@add-participant(X)` but the roster is full, and the system quietly does not add, or clears someone else and then adds — the agent's world view is polluted. It thinks it succeeded, and all later reasoning is built on a lie.

There are two correct return shapes:

- Success: `{ ok: true, result: {...} }`
- Rejection: `{ ok: false, error: { code, message, details } }`

The `code` must be a recognizable constant (`E_AUDIENCE_LIMIT_EXCEEDED`, `E_NOT_AUTHORIZED`, `E_TOOL_REQUIRES_HUMAN_CONFIRM`, etc.) so the agent automatically enters recovery reasoning. A strong model already handles errors and changes strategy — we only need to structure the errors.

Two kinds of invariants must be handled separately:

- **Numeric / permission type**: block at the API call and throw an error.
- **Destructive / externally visible actions** (delete, public publish, burning a large amount of tokens): throwing an error is not enough; they need to be escalated to **human-in-the-loop**. The tool returns `{ state: 'pending_user_confirm', requestId }` and only really executes after the user confirms in the UI. The agent can continue doing other things or wait.

Every "change" tool should also be paired with a "query" tool (`@get-channel-capacity`, `@list-participants`, `@describe-permissions`) so the agent can pre-check instead of hitting a wall as a probe.

**Evidence capture is a natural extension of invariants**. Every mutation that actually happens should produce a structured receipt — **who requested, which model / agent proposed, which policy approved, what was changed, whether a human confirmation was involved**. The reason is not compliance fastidiousness but that Work is essentially **handing AI-produced results back to humans to take over and review**: people must be able to replay the whole chain of "who suggested what, why the system let it pass, and what the final result was" afterwards in order to trust the output. This is also, besides tool return values, the real traceable source for **session history / policy adjustments**.

## 6. Lifecycle: An Agent Cannot Give Birth to Itself

The minimal shape of the scheduler includes three session modes sharing the same runtime:

- **Interactive**: driven by user messages, idle → checkpoint; user speaks → wake.
- **Background**: driven by cron / events (an automatic summary every day at 9, webhook triggers). wake → run to completion → checkpoint.
- **Delegated**: a child session produced by the agent's `@spawn-subcat(...)`. Split into blocking (the caller waits) and async handle (the caller takes the `childSessionId` and continues).

Every session must carry a **Budget Envelope**: per-turn token cap, wall-time, cumulative daily quota, per-user concurrency cap (to stop an agent from forking without limit).

**Supervision** detects three kinds of anomalies: the same tool called N times in a row with the same arguments (stuck loop), no progress for N minutes (stall), and M consecutive tool errors (confusion). On a hit it pauses and escalates to the user to decide.

The good news is that `cats-runtime` + `runtime/client.ts` already have most of the infrastructure. What needs reinforcing: the background session trigger source, budget inheritance across the spawn hierarchy, and the supervision detection layer. What needs moving away is the **decision logic** currently in the planner / dispatcher (which should belong to the agent itself).

## 7. The Weak-Model Fallacy

The proposal I first made in this discussion was a "tier-scaled single framework": weak models also get the agent loop, just with a thicker shell — forced JSON schema, a pre-filtered tool set, injected few-shot examples. The owner explicitly rejected this direction, for a precise reason: **this pretends the weak model has agency.**

This reflection is worth expanding:

Treating a 7B model as a "shrunken agent" has three structural flaws:

1. A weak model is inherently bad at multi-step reasoning. Give it a reduced tool set and it still chooses wrong; give it a schema and it still emits bad JSON. Scaffolding cannot bridge the capability gap; it only makes failure less obvious.
2. In implementation it grows a symbiotic monster of "rules stuffed inside an agent loop, and an agent loop hung inside the rules", where the logic on both sides pollutes each other, and debugging is hell.
3. It assumes all problems are only differences of degree — but agency from 0 to 1 (having the ability to reason about tool errors and recover) is a breakpoint, not a continuous spectrum.

The correct reframe is: **a weak model is not a degraded agent, it is a non-agent text worker.** Its role in a workflow is single-step actions with clear I/O boundaries such as "fill in the blank", "classify", "translate" and "extract". Decision sovereignty stays with the workflow itself (i.e. the conductor pipeline), or with the strong-model agent upstream that calls it.

## 8. The Workplace Mapping of Management Styles

The analogy the owner pointed out directly translates the conclusions above into human intuition:

- **Strong subordinate (Opus / GPT-4)**: autonomous and capable. The supervisor's duty = give resources, give tools, and occasionally look up to check whether they are drifting. **The supervisor need not be smarter than them**.
- **Weak subordinate (small model, and cannot be replaced)**: limited ability, cannot be swapped out. The supervisor must teach hand by hand, confirm progress at all times, and assign only tasks simple enough. **The supervisor's intelligence becomes the decisive bottleneck** — if the supervisor cannot cut the task into a granularity the weak subordinate can do, the whole group collapses.

Several corollaries:

- Letting go ≠ lawlessness. Even a superstar employee cannot swipe the company card or touch the production DB. This maps to invariant + budget + human-in-the-loop.
- A weak subordinate is occasionally especially strong in a narrow domain (someone translates extremely fast). This maps to a strong driver calling `@ask-weak` to use a local 7B for things like translation.
- Check frequency is not a virtue; it is a function determined by ability. Daily status updates for a strong subordinate are an insult; for a weak subordinate, failing to watch closely causes mishaps.
- **Strong but high-risk situations** are a separate class, not a subset of strong subordinates. A senior engineer changing a production schema, a superstar PM issuing a statement on behalf of the company — however strong the person, high-destructiveness / high-irreversibility actions should have milestone checkpoints and external approval, not because their ability is distrusted, but because the cost of error is high enough to warrant an extra human confirmation. This maps to: **high autonomy dial + high approvalThreshold**, and these two dials must be adjustable independently, not tied together. (This is a worker classification the Codex parallel research pointed out explicitly; my original draft missed it and it was corrected when merging.)

This analogy lifts the whole architectural choice from "technical purism" to "intuition alignment" — most managers instinctively allocate this way, and our system architecture should be isomorphic to it.

## 9. The Cost Argument for Cats Work

The cost economics of the three product lines differ:

- **Chat**: low frequency, high unit price is OK; the user buys conversation quality. A main line of concierge + strong model is reasonable.
- **Code**: medium frequency, quality overrides everything; for high-value main lines (reasoning, refactoring, cross-file planning) it is worth letting Opus run slowly. But Code's **secondary subtasks** — lint, semantic search, summarization, boilerplate generation, test classification, simple rewrites, commit message drafting — can be fully offloaded to cheap / local models or deterministic tools, so hybrid has considerable savings room in Code too.
- **Work**: **high-frequency batch, repetitive**. An automation task running 500 times a day costs Opus ≈ $50/day and a local 7B ≈ $0. **That is an order-of-magnitude gap.**

This means:

- The **Chat main line** can go entirely concierge; Work cannot.
- The **Code main line** can go concierge, but subtasks equally benefit from hybrid. Going all concierge is not wrong, it just burns money that could have been saved.
- **Work cannot** — all concierge is a pricey Chat, all conductor is a Zapier without AI. **Only when hybrid (strong driver + weak workers) exists together is the Work product economically viable.**

This observation upgrades the orchestrator's dual-mode ability from "nice-to-have" to "the underlying economics that decide whether Work can exist".

Market comparison also supports this positioning:

- AutoGPT family: forces weak models to be agents, burns tokens and fails.
- Claude Code / Cursor: concierge-only, too expensive for repetitive work.
- Zapier / Make / n8n: the classic conductor, with no AI native.
- Enterprise RPA: too heavy and too expensive, SMBs cannot afford it.
- Langflow / Flowise: frameworks, not products.

The gap in the middle is "individuals / small teams, able to run on their own hardware, mix strong and weak models, have a UI to compose workflows, with predictable cost" — exactly the position Cats Work can occupy.

## 10. Refuting Dual Persona: There Is Only One Orchestrator

The second self-correction I raised in the discussion came from the owner's observation: **implementing the orchestrator as two classes, ConciergeOrchestrator vs ConductorOrchestrator, over-discretizes.** A real supervisor does not change bodies to become another person, but is the same person using different methods with different subordinates.

Situations a Boolean switch would miss:

- Within the same session, a strong driver and a weak deputy need both approaches at once.
- The same strong model does simple things today and complex things tomorrow, and the attitude toward it should differ.
- A weak model occasionally performs unexpectedly well on some task, and should be relaxed on the spot.
- A strong model occasionally fails format repeatedly, and should be tightened on the spot.
- Every one of the above shifts happens **inside the same session, even between two consecutive actions**.

The correct shape: **one orchestrator, multiple policy dials, each decision point evaluated in real time against the current context.**

Core dials:

- `decideToolSurface(ctx)` — which tools to expose at this moment.
- `decideValidation(ctx)` — how strict the output should be.
- `decideRetry(ctx)` — how many retries, with what correction hint.
- `decideScaffolding(ctx)` — few-shot / grammar / prompt detail level.
- `decideAutonomy(ctx)` — let go vs cut into fill-in-the-blank steps.

Each dial is evaluated independently and combined freely: any combination such as `autonomy high + validation strict + scaffolding light` is possible.

Context is a vector, not a scalar, with at least four dimensions:

- **Capability profile**: tool-use accuracy, JSON fidelity, reasoning depth, context length — abilities in different dimensions can differ greatly and cannot be collapsed into a tier label.
- **Task profile**: complexity, side effects, idempotency, cross-system.
- **Session history**: this model's success rate in this session so far, format failure count, tool misuse count (warm-start signals).
- **Invariants / budget state**: how much money is left, how much time is left, hard limits.

The scope of a policy is "this current action", not the whole session. At the moment a strong driver calls `@ask-weak(...)`, the sub-invocation runs the policy once with the worker's capability context, and the driver's own autonomy is entirely unaffected.

This framing simultaneously dissolves:

- The crudeness of "static session tier pre-judgment".
- The abrupt logic of "progressive fallback" (it is really just the policy reading session history and tightening automatically, not a mode switch).
- The implementation difficulty of the "strong driver + weak deputy" mixed scenario.

### Draft concrete Policy schema

A function signature `decide*(ctx)` alone is not yet a contract. The Codex parallel research proposed a `SupervisionPolicy` interface, which is worth using as a starting point but needs its dial naming aligned with this document and two corrections. The merged shape:

```ts
interface SupervisionPolicy {
  // Degree of letting go: from fully doing it for them to full delegation
  autonomy: 'none' | 'single_step' | 'milestone_plan' | 'outcome_delegation';

  // How large a task to give it each time
  taskGranularity: 'tiny' | 'step' | 'milestone' | 'outcome';

  // Which tier of tools is open at this moment
  toolScope: 'none' | 'read_only' | 'narrow_write' | 'broad_write';

  // Scaffolding strength (decideScaffolding in section 10 of this document)
  scaffolding: 'none' | 'few_shot' | 'grammar_forced' | 'sop_template';

  // Output validation strength (decideValidation in this document)
  validation: 'best_effort' | 'schema_required' | 'semantic_check';

  // How often to check
  checkpointCadence: 'every_step' | 'milestone' | 'on_risk' | 'final';

  // Threshold for requiring a human button press (independent of autonomy; see "strong but high-risk" in section 8)
  approvalThreshold: 'low' | 'medium' | 'high';

  // Recovery path on failure / anomaly
  fallbackPolicy: 'retry' | 'ask_human' | 'escalate_model' | 'delegate_other';
}
```

The two corrections to the original version are worth noting:

1. **`autonomy` should not be a 0-5 scalar**. The Codex original used an integer for convenient interpolation, but autonomy is actually a **discrete breakpoint**: between "cannot act autonomously at all" and "given a goal, runs on its own" there is no continuous spectrum, only the switch of **whether it has multi-step reasoning permission** and the range of **how large a scope it may decide on**. An enum is more honest than a number.
2. **`approvalThreshold` must be orthogonal to `autonomy`**. Otherwise the strong-but-high-risk class of employee cannot be expressed in the schema. Section 8 of this document just corrected this.

The way to use it: each decision point (whether to let the agent plan, which tools to give, how strict the output should be) calls its own `decide*(ctx)` to produce this field's value for this moment; together they are this moment's `SupervisionPolicy` for this caller. The policy is not a fixed snapshot at session start-up but is computed in real time at each action boundary.

This schema also gives the engineering team an actionable PR target: **land this interface first and run one vertical slice**. The next section describes what that slice looks like.

## 11. Suggested Vertical Slice

This research is purely conceptual, but the Codex parallel research proposed a very pragmatic landing suggestion worth including: rather than refactoring the whole orchestrator at once, **first run the smallest end-to-end slice** that connects all core elements, then decide how to expand. The suggested slice has four parts:

1. **A strong agent path** — a Work session where Claude / Opus is the driver, receiving an outcome-level task ("compile this week's Linear issues into a weekly report"). At start-up it computes via `decide*(ctx)` `SupervisionPolicy = { autonomy: 'outcome_delegation', toolScope: 'broad_write', scaffolding: 'none', approvalThreshold: 'medium', ... }` and runs in concierge mode, planning and executing autonomously.
2. **A weak model path** — in the same Work session, the driver calls `@ask-weak` to hand "classify 30 issue titles into 5 topics" to a local 7B. This step's `SupervisionPolicy = { autonomy: 'none', taskGranularity: 'tiny', toolScope: 'none', scaffolding: 'grammar_forced', validation: 'schema_required', ... }`, running through the conductor pipeline.
3. **A shared invariant tool boundary** — both paths act through the same set of tool adapters such as `@read-linear-issue / @update-workitem`; the tool layer enforces structured errors such as `E_NOT_AUTHORIZED` / `E_BUDGET_EXCEEDED`, and destructive actions go through `pending_user_confirm`.
4. **An audit trail** — from task start to run end, write model name / prompt hash / policy shape / tool call / tool result / approval record / final output all into one evidence record that the UI can replay.

Once the slice runs end to end, it can answer several questions this research did not:

- Whether the policy evaluation overhead is acceptable (run the function once per action, or some level of cache).
- How the UI presents mixed Strong / Weak use (one Work task is one entity, but two kinds of models move underneath).
- How detailed the evidence record schema needs to be to suffice for human review without exploding in volume.
- Actual reasonable defaults for `SupervisionPolicy` (after how many sessions it is safe to loosen to `outcome_delegation`).

These questions will not be solved on paper, but answers surface quickly on a slice that runs. **The slice itself is the experimental apparatus for verifying this research's core thesis (the orchestrator is a capability shell, not a planner)**.

## 12. Open Questions

- **How is the capability profile maintained?** The provider catalog has part of it (`ProductProviderEventCapabilities`), but tool-use accuracy and JSON fidelity need measured data. What default does a session use the first time it runs a given provider?
- **Should policy input go through a small-model classifier?** The "task complexity" dimension is hard to judge with pure rules. Is it reasonable to run a cheap intent classifier for task profile analysis? If so, does the classifier itself not become part of the agent's judgment? Where is the line?
- **Cross-session budget aggregate**: How are user-level daily / monthly quotas fairly allocated across multiple sessions? Which session should be throttled?
- **Context drift in long-running background sessions**: In an automation session that runs all day, the context window gets flooded by new events. Should summary compression be done by the agent itself calling `@compress-context`, or forced by the scheduler stepping in?
- **Deadlock and priority inversion in multi-agent collaboration**: A spawns B and waits for the result, and B in turn spawns from the same session pool as A — how is this detected?
- **Does the policy itself need versioning / A-B testing**: Different versions of `decideToolSurface` may have different effects on different models and tasks. This becomes a system parameter tuning problem.

## 13. Conclusion

The deepest takeaway of this discussion is not any single architectural decision but **clarifying a false dichotomy**: we originally thought the orchestrator's choice was "rule-driven" vs "fully hands-off agent-driven", and in fact neither is right. The correct answer is:

> **The orchestrator is only responsible for issuing driver's licenses, watching the rules, and deciding how many hours the gas station is open; the driver is the agent, who decides the throttle and steering wheel; but road conditions change the speed limit — on the same road the authority adjusts the speed limit to actual conditions, rather than changing the whole system.**

Translated into engineering terms: **one orchestrator, one set of policy dials, and one set of invariants / lifecycle / scheduler that does not split by model or task. Sovereignty is with the agent; the shape is shaped in real time by policy.**

This design is decisive for the economic viability of the Cats Work product, a capability release for Cats Chat / Code, and for the overall Cats architecture a philosophical reset from "trapped inside our own orchestrator's head" back to "serving, as a capability shell, brains smarter than us".

---

**Author's afterword**: This document was written by Claude after the discussion on 2026-04-23. During the process Claude was corrected twice by the owner on design direction (the tier-scaled single framework was rejected, the dual-orchestrator dual persona was rejected), recorded in sections 7 and 10. These corrections are the direct reason this document could reach its present conclusions.

**Revisions after the 2026-04-23 review**: After the first draft was submitted, the reviewer pointed out four places needing tightening, which this version has absorbed:

1. Section 1: describing the five kinds of Cats as "a degraded spectrum of the same Cat shape" could easily make people think they should be put into the same durable registry. Changed to a two-layer distinction: the runtime ParticipantLike / AddressableTarget layer can be shared, the durable Cat registry layer is not shared, and introduced the Codex parallel research's three-orthogonal-axes framework of identity / execution / supervision.
2. Section 4: the original vague statement "the agent governs what to do after power-on" was in tension with section 7's "decision sovereignty stays in the workflow" for weak models. Changed to explicitly distinguish **the strong agent owns task-level agency** from **the weak model is a pipeline step (no agency)**.
3. Section 4: the original statement "the scheduler cannot read message content" was too absolute. Changed so that the **lifecycle scheduler** should not make semantic decisions, while a policy engine / classifier / workflow step can and should read content at an auditable tool boundary.
4. Section 9: the original statement "Chat / Code can go entirely concierge" underestimated Code's hybrid space. Changed so that the Code main line can be concierge, but subtasks (lint, search, summarization, boilerplate, test classification, simple rewrites) equally benefit from hybrid.

**Cross-absorption of the 2026-04-23 Codex parallel research**: After reading the Codex version, four worthwhile items were added to this document:

1. A new **Evidence capture** paragraph at the end of section 5 — every mutation should produce a structured receipt (who requested, which model proposed, which policy approved, what changed, whether a human confirmation was involved), a cross-cutting supplement to invariants and session history.
2. Section 8 gained a **strong but high-risk situations** corollary — when a superstar employee performs highly destructive / highly irreversible actions, milestone checkpoints and approval are still needed; correspondingly the `autonomy dial` and `approvalThreshold` must be independent and not tied together.
3. Section 10 gained a **draft concrete Policy schema** — the `SupervisionPolicy` interface proposed by Codex, with its dial naming aligned to this document, as a contract draft, with two corrections: autonomy should be an enum rather than a 0-5 scalar, and approvalThreshold must be orthogonal to autonomy.
4. A new section 11 **Suggested Vertical Slice** — adopts Codex's four-part slice (strong agent path + weak model path + shared invariant tool + audit trail) as an actionable landing suggestion, and lists which of this research's arguments the slice can verify.

The original sections 11 / 12 (open questions, conclusion) shift to sections 12 / 13.
