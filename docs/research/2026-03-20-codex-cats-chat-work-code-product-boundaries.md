# Codex View: Cats Chat, Cats Work, and Cats Code Product Boundaries

## Metadata

- **Date**: 2026-03-20
- **Author**: Codex
- **Context**: Follow-up product-positioning note after the 2026-03-20
  architecture/spec/ADR pass across `cats` and `cats-runtime`, plus
  re-review of `crew-chat-poc/`, Paperclip, and OpenClaw.

## Purpose

Capture a Codex-authored view of how `Cats Chat`, `Cats Work`, and
`Cats Code` should relate to one another as product lines built on the same
runtime and core model, without collapsing them into the same UX or the same
mental model.

This is a research note, not an ADR. It is intended to guide future product
briefs, specs, and roadmap sequencing.

## Thesis

The Cats suite should be treated as **one shared execution platform with three
different top-level product promises**:

- `Cats Chat` is about **conversations**
- `Cats Work` is about **teams and work operating models**
- `Cats Code` is about **projects, previews, and local builder loops**

The mistake to avoid is turning:

- `Cats Work` into role-heavy `Cats Chat`
- `Cats Code` into coder-heavy `Cats Work`

All three can share `cats-runtime`, `Cats Core`, packaging, setup, provider
management, and telemetry. They should not share the same primary workflow or
the same primary information architecture.

## Shared Foundation

The suite now has a reasonably clear shared foundation.

### Shared execution substrate

`cats-runtime` should remain the common execution and environment boundary for
all three lines:

- provider compatibility and diagnostics
- runtime-managed skills
- workspace substrate tools
- fork and context-transplant primitives
- usage metering and rate-limit guardrails
- executable delivery primitives

This shared runtime lets the suite reuse the hard parts once while letting each
product line expose a different UX.

### Shared domain model

`Cats Core v1` is the shared product-facing model:

- Cats, groups, and roles
- channels and rooms
- tasks, runs, approvals, escalations
- owner profile and preferences
- artifact and archive metadata

This is the right common layer for Chat, Work, and Code. It is broad enough to
share identity and governance, but it does not force the three products into a
single UI metaphor.

### Shared host, different entry surfaces

I do not think the suite needs three unrelated executables. The more plausible
shape is:

- one packaged host
- one shared local runtime
- one shared local product server
- three primary entry surfaces or setup paths

That said, "same app" does not mean "just a mode toggle." Each line should
still have a distinct primary home surface.

## Product Line Boundaries

### Cats Chat

`Cats Chat` should be the lowest-friction, most personal surface.

Its center of gravity is:

- personal assistance
- lightweight specialist consultation
- channel-first interaction
- low-governance help
- relationship memory and preference memory

Typical scenarios:

- companionship or emotional support
- trip planning
- homework and report help
- household coordination
- quick research and synthesis

The primary unit is the **conversation**.

This means `Cats Chat` should optimize for:

- fast entry
- low setup burden
- direct `@`-based addressing when needed
- room workflow only when it truly adds value
- Telegram and similar transport entry points

What it should **not** become:

- a full org chart editor
- a process-heavy work console
- a software delivery dashboard by default

### Cats Work

`Cats Work` is the direct continuation of the original
`one-man digital company` ambition.

Its center of gravity is:

- company-like roles
- team assembly
- repeatable workflows
- governance, approvals, and budget control
- operational visibility

The primary unit is the **team / workspace / work item**, not the conversation.

This is the product where it makes sense to package role and workflow knowledge
for things like:

- general manager / executive assistant / Boss Cat
- PM
- architect
- engineering lead and engineers
- automation tester and QA
- browser-based operator roles
- marketing, design, finance, legal, and accounting roles later

The strongest product idea here is **template-driven team assembly**.

Users should not start from raw `SKILL.md` files. They should start from:

- company templates
- team templates
- role packs
- workflow packs

Under the hood these map to:

- capability profiles
- skill profiles
- runtime skill manifests
- delivery policy defaults
- budget defaults

This keeps the product accessible while preserving the runtime/product skill
split already defined in the current docs.

What `Cats Work` should **not** become:

- a thin wrapper over plain multi-Cat chat
- a generic agent playground with no operating model
- a giant horizontal marketplace on day one

My recommendation is to start with one serious domain family:

- software-company teams first

That is where the monorepo already has the strongest prototypes and the most
reusable know-how.

### Cats Code

`Cats Code` should be the local builder-loop product.

Its center of gravity is:

- create an app
- run it locally
- inspect it immediately
- iterate through conversation
- reduce deployment and setup friction

The primary unit is the **project / app / preview loop**.

`Cats Code` can absolutely use multiple Cats, but that is not its identity.
Its identity is:

- code generation
- dependency installation
- local dev server lifecycle
- preview surfaces
- packaging or local deployment assistance

This is why I do not think `Cats Code` should be defined merely as "the coding
team preset of Cats Work." It needs its own product promise:

> tell Cats what you want, and get a running local app with the lowest
> reasonable friction

That promise is closer to local Manus/Lovable than to a team-management product.

What `Cats Code` should **not** become:

- a generic software org simulator
- a pure code-generator with no preview/runtime loop
- a cloud-only builder that ignores the local-machine promise

## Relationship to `crew-chat-poc`

`crew-chat-poc` is useful, but it should be treated as a **seed**, not as the
destination.

The prototype proves a few important things:

- role specialization is valuable
- a single orchestrator model can work
- quality gates and handoff loops matter
- provider-specific role assignment is useful

But it is also heavily prompt- and tag-driven. The long-term product direction
should migrate those ideas into:

- product-owned team templates
- system-layer orchestration policy
- runtime-managed skills and manifests
- explicit governance surfaces

So the right reading of `crew-chat-poc` is:

- keep the workflow insight
- do not keep the exact operating mechanism

## Recommended UX Translation

### Chat should hide most of the machinery

Users should feel they are talking to helpful Cats. They should not need to
care about:

- provider topology
- formal workflow graphs
- role packs
- governance modes

### Work should surface team assembly and operating rules

Users should feel they are building a working company cell, not just opening a
chat room with many personas.

That means the Work UX should prominently surface things like:

- team roster
- role coverage
- active work item state
- approvals and blockers
- budget state
- activity log
- handoff / fork / converge state

### Code should surface preview and runtime feedback

Users should feel they are iterating on a product, not managing a team.

That means Code should emphasize:

- project scaffold choice
- runtime or framework fit
- install/build/start progress
- preview links and app health
- iteration history

## Strategic Differentiation

If the suite ships correctly, each line has a distinct differentiation story.

### Chat differentiation

- home/personal-first specialist Cats
- transport-friendly Boss Cat front door
- low-friction use without enterprise ceremony

### Work differentiation

- ready-made digital-company role packs
- reusable work operating models
- budget/governance/audit integrated into the product

### Code differentiation

- strong local-first builder loop
- preview and deploy on the user's own machine
- lower deployment friction than cloud-first code-generation products

## Recommended Sequence

I still think the broad sequence should be:

1. `Cats Chat`
2. `Cats Work`
3. `Cats Code`

But with one important nuance:

- `Cats Work` is the strongest expression of the original vision
- `Cats Code` may produce the sharpest external differentiation once the local
  builder loop is real

So the practical sequence is about execution risk, not long-term importance.

### Why Chat first

- smallest product promise
- easiest packaged experience to explain
- validates setup, providers, runtime integration, and transport entry points

### Why Work second

- it cashes out the original monorepo thesis
- it can reuse the dynamic room orchestration work already being specified
- it has the clearest path from `crew-chat-poc` know-how to product value

### Why Code third

- the local builder loop is operationally harder
- it depends on preview, package install, dev server management, and supported
  framework slices
- it is worth doing, but it should not force early overreach

## Product Rules I Would Carry Forward

These are the strongest high-level rules from this analysis.

1. `Cats Chat` should optimize for personal usefulness, not role-system
   visibility.
2. `Cats Work` should productize team templates, not expose raw runtime skills
   as the primary abstraction.
3. `Cats Code` should optimize for local preview and deployment loops, not for
   organizational fidelity.
4. `cats-runtime` should remain shared infrastructure, not be re-skinned into
   three separate runtimes.
5. `Cats Core` should remain the shared domain model, while each surface keeps
   its own primary workflow.
6. `crew-chat-poc` should inform workflow packs and team templates, but it
   should not dictate the final product architecture.

## Follow-on Documentation That Would Be Worth Writing

- a `Cats Work` product brief that defines team-template packs, role-pack
  families, and the first software-company slice
- a `Cats Code` product brief that defines the local builder loop, supported
  framework packs, and preview/deploy promises
- a shared suite navigation brief that decides how Chat, Work, and Code coexist
  inside one packaged shell

## References

- [architecture](../architecture.md)
- [terminology](../terminology.md)
- [SPEC-015 cat capability registry and runtime skill MCP mapping](../specs/SPEC-015-cat-capability-registry-and-runtime-skill-mcp-mapping.md)
- [SPEC-019 product skill profiles and runtime skill manifests](../specs/SPEC-019-product-skill-profiles-and-runtime-skill-manifests.md)
- [SPEC-024 workspace delivery policy and governance levels](../specs/SPEC-024-workspace-delivery-policy-and-governance-levels.md)
- [SPEC-025 budget policy, override flows, and war-room dashboard](../specs/SPEC-025-budget-policy-override-flows-and-war-room-dashboard.md)
- [SPEC-026 explicit mentions and dynamic room workflow orchestration](../specs/SPEC-026-explicit-mentions-and-dynamic-room-workflow-orchestration.md)
- [crew-chat-poc](../../../crew-chat-poc/)

---

*Research note completed: 2026-03-20*  
*Author: Codex*
