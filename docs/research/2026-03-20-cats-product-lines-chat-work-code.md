# Cats Product Lines: Chat, Work, and Code

## Metadata

- **Date**: 2026-03-20
- **Author**: Claude
- **Context**: Following a full session of gap analysis against Paperclip and
  OpenClaw, and review of the crew-chat-poc prototype. This document captures
  the product positioning, shared infrastructure, differentiation strategy,
  and recommended shipping order for the three Cats product lines.

## Purpose

Define the relationship between Cats Chat, Cats Work, and Cats Code as
three distinct product surfaces built on a shared runtime and data layer.

This is not an ADR or spec. It is a product-level research note intended to
inform future roadmap decisions.

## The Three Product Lines

### Cats Chat — Personal Assistant (家用情境)

**Target user**: General consumer, non-technical or lightly technical.

**Core use cases**:

- Mental health companion / counselling
- Travel planning and itinerary generation
- Homework help and tutoring
- Research and report writing
- Daily life organization and reminders
- Creative writing and brainstorming

**Orchestration complexity**: Low.

- Boss Cat + 1–3 specialist Cats
- Mostly sequential, occasional parallel
- Simple @mention routing is usually sufficient
- Full room workflow (SPEC-026) is available but rarely needed

**Skill profile character**: Personal and lifestyle-oriented.

- Skills are about assistance, companionship, and personal productivity
- Not bound to formal work processes or quality gates
- Memory emphasis on personal preferences, past conversations, and user
  relationship (Know Your Boss)

**First impression**: Feels like a smart personal assistant with specialist
friends the user can call on.

---

### Cats Work — Digital Company (工作情境)

**Target user**: Solo entrepreneur, small team lead, agency owner.

**Core use cases**:

- Assemble a virtual software development team
  (PM, Architect, Coder, Tester, Reviewer, QA, Marketing)
- Assemble a content marketing team
  (Content Strategist, Copywriter, Designer, SEO Specialist)
- Assemble a legal/compliance team
  (Legal Counsel, Contract Reviewer, Compliance Officer)
- Assemble a finance/accounting team
  (Accountant, Financial Analyst, Budget Controller)
- Assemble custom teams with mixed roles

**Orchestration complexity**: High.

- Boss Cat as orchestrator with NEXT:-style dynamic delegation
- Multiple specialist Cats with formal role definitions
- Quality gates (reviewer rejection loops, QA validation)
- Checkpoint-based workflow with fork and converge
- Full SPEC-026 room workflow is the primary orchestration model

**Skill profile character**: Work-domain-specific role templates.

- Pre-built SKILL.md per job function
- Orchestration workflow embedded in templates (handoff order, quality
  gates, review expectations)
- Budget control and approval workflows are essential
- Activity log and audit trail are critical

**Key differentiator**: Pre-built role template marketplace.

Users do not configure each Cat from scratch. They select a team template
and the system assembles a working team with correct skills, workflows,
and quality gates:

```
Setup Wizard:
  "What kind of team do you want to build?"
  → Software Development Team
  → Content Marketing Team
  → Legal/Compliance Team
  → Custom...
```

Each template includes:

- A set of SKILL.md files per role
- Default orchestration workflow (sequential, parallel, quality gate rules)
- Recommended provider assignments per role
- Budget allocation suggestions

This is the crew-chat-poc model (tag-based roles, NEXT: directive
delegation, quality gates) productized into the Cats shell.

**Prototype reference**: `crew-chat-poc/` in the monorepo demonstrates the
core mechanics:

- Tag-based role system: orchestrator, pm, architect, coder, tester,
  reviewer, qa, marketer
- Dynamic delegation via NEXT: directives
- Per-agent provider assignment
- Quality gate loops (reviewer rejection → coder fix → re-review)
- AGENTS.md integration
- Multi-provider execution through cats-runtime

**First impression**: Feels like hiring a ready-made team that already knows
how to work together.

---

### Cats Code — Local App Builder (開發+部署)

**Target user**: Hobbyist developer, non-technical user who wants custom
apps, power user who wants to self-host tools.

**Core use cases**:

- "Build me a personal finance tracker" → code generated → deployed locally
- "Build me a recipe manager" → code generated → running in browser
- "Build me a dashboard for my data" → code generated → accessible at
  localhost
- Iterate on generated apps with natural language

**Orchestration complexity**: Low to medium.

- Typically 1–2 Cats (Architect + Coder, or one full-stack Cat)
- Emphasis on tool capability rather than multi-agent orchestration
- The orchestration that matters is the build/deploy pipeline, not
  inter-Cat delegation

**Skill profile character**: Development and deployment-focused.

- Skills are about code generation, build systems, package management,
  and local deployment
- Less about inter-role workflow, more about tool proficiency

**Key differentiator**: Code-to-running-app pipeline on the user's machine.

Many products can generate code. The differentiation is:

- Code is generated
- Dependencies are installed automatically
- App is built and started locally
- User opens browser and sees their running app
- Iteration happens through conversation ("change the color", "add a
  login page")

This requires:

- cats-runtime preview surfaces (ADR-011, currently proposed)
- Local server management (start/stop/restart dev servers)
- Dependency installation (npm install, pip install, etc.)
- Build pipeline awareness (Vite, Next.js, Flask, etc.)
- Port management and browser launch

**Overlap with environment-bootstrap**: The knowledge of how to install
runtimes and tools on the user's machine directly applies here.

**First impression**: Feels like having a developer who builds apps for you
and hands you the running result.

---

## Shared Infrastructure

All three product lines share the same runtime and data layers:

### cats-runtime (shared execution layer)

- Session lifecycle (create, message, resume, fork, close)
- Multi-backend execution (CLI, API, Agent)
- Provider compatibility engine (SPEC-007)
- Usage metering and rate-limit guardrails (SPEC-010)
- Workspace substrate tools (SPEC-008)
- Runtime-managed skills (SPEC-005)
- Session fork and context transplant (SPEC-011)
- Setup and diagnostics (ADR-014)

All three lines consume these capabilities identically.

### Cats Core (shared data layer)

- Cat identity and capability registry
- Channel and message model
- Transcript persistence
- Preference and workspace state
- Memory layer (when implemented)

### Cats (shared product shell)

The three lines do not need to be three separate applications. They can be
**three modes or setup templates within one Cats shell**:

- Same renderer, same server, same runtime client
- Different default skill profiles loaded at setup time
- Different setup wizard paths
- Different UI emphasis (Chat emphasizes conversation, Work emphasizes
  team overview and activity, Code emphasizes preview and iteration)

This is analogous to how crew-chat-poc already works: one engine, different
YAML configurations for different team compositions.

## What Makes Each Line Unique

### Cats Chat uniqueness

- Personal relationship with the user (Know Your Boss is central)
- Memory emphasis on user preferences and relationship history
- Low configuration burden (should work well out of the box)
- Transport channels (Telegram, LINE) are a primary interface
- Skill templates are lifestyle-oriented, not process-oriented

### Cats Work uniqueness

- **Pre-built role template marketplace** — this is the strongest
  differentiator against Paperclip, OpenClaw, and Claude Cowork
- Formal workflow with quality gates
- Budget control and approval workflows are first-class
- Activity log and audit trail for operational visibility
- War-room dashboard (future Cats Work UI)
- The crew-chat-poc proves the core orchestration model works

### Cats Code uniqueness

- **Code-to-running-app pipeline on localhost** — differentiator against
  Manus and Lovable (which deploy to cloud)
- Preview surfaces as first-class product experience
- Local deployment automation
- Build pipeline awareness
- Iterative development through conversation

## How Today's Specs/ADRs Map to Product Lines

### Primarily shared (all three lines)

- Provider compatibility engine (SPEC-007)
- Setup wizard and packaged install (ADR-021, SPEC-023)
- Provider install metadata (ADR-013)
- Usage metering and rate-limit guardrails (ADR-017, SPEC-010)
- Runtime-managed skills (SPEC-005)
- Memory layering (ADR-012)

### Primarily Chat + Work

- Room workflow and dynamic orchestration (ADR-024, SPEC-026)
- Explicit mention routing (ADR-017 cats)
- Session fork and context transplant (SPEC-011 runtime)
- Budget policy and war-room dashboard (ADR-023, SPEC-025)
- Workspace substrate tools (ADR-015, SPEC-008)
- Delivery policy (ADR-022, SPEC-024)
- Transport message handling (gap analysis)
- DM safety / transport access control (gap analysis)

### Primarily Work

- Full room workflow with checkpoint/fork/converge (PLAN-016)
- Pre-built role templates and team assembly
- Formal quality gates and approval workflows
- Activity log and structured audit trail
- Agent-to-agent messaging primitives

### Primarily Code

- Preview surfaces (ADR-011, proposed)
- Local server management and build pipeline
- Dependency installation automation
- Environment-bootstrap knowledge for runtime setup

## Recommended Shipping Order

### 1. Cats Chat first

**Why**: Simplest product skin. Validates that cats-runtime + Cats
integration works end-to-end. Lowest orchestration complexity means fewer
moving parts to debug. Transport channel (Telegram) integration provides
immediate tangible value.

**What ships**: Boss Cat, simple @mention routing, API provider baseline,
1-3 lifestyle skill templates, Telegram integration, basic memory.

### 2. Cats Work second

**Why**: This is the monorepo's original vision and has the strongest
differentiation story. crew-chat-poc proves the orchestration model. The
role template marketplace is something no competitor offers.

**What ships**: Team templates (starting with software development team),
full room workflow, quality gates, budget control, activity log.

### 3. Cats Code third

**Why**: The deployment challenge (making arbitrary generated code run
locally) is the hardest technical problem. But it's also the most
differentiated — "local Manus" is a strong positioning. Needs preview
surfaces and build pipeline awareness to be implemented first.

**What ships**: Single-Cat or dual-Cat code generation, local preview,
one-click local deployment for common frameworks (Vite/React, Flask,
Next.js).

## Key Insight: Same App, Three Modes

The three lines should ship as **one application with three setup paths**,
not three separate products:

```
First-Run Wizard:
  "How do you want to use Cats?"
  → Personal Assistant (Chat)
  → Digital Company (Work)
  → App Builder (Code)
```

Each choice loads different default skill profiles, different UI emphasis,
and different onboarding flow. But the underlying app, runtime, and data
layer are identical.

This means:

- A user can start with Chat and later add Work capabilities
- A user can have both Chat-style personal Cats and Work-style team Cats
  in the same installation
- Cats Code features are available to Work users (build and deploy what
  the team produces)
- No separate install, no separate infrastructure

## Risks

- **Scope**: Three product lines is ambitious. Mitigated by shared
  infrastructure and incremental shipping.
- **Identity confusion**: Users may not understand the three modes.
  Mitigated by clear setup wizard and the ability to mix modes.
- **Cats Work complexity**: Full room workflow with fork/converge is the
  hardest product feature to get right. Mitigated by crew-chat-poc
  validating the core pattern.
- **Cats Code deployment**: Making arbitrary code run locally is
  technically challenging and varies wildly by framework/language.
  Mitigated by starting with a small set of supported frameworks.

---

## References

- [crew-chat-poc](../../../crew-chat-poc/) — Cats Work prototype
- [Paperclip Killer-Feature Gap Analysis](./2026-03-20-paperclip-killer-feature-gap-analysis.md)
- [OpenClaw Killer-Feature Gap Analysis](./2026-03-20-openclaw-killer-feature-gap-analysis.md)
- [Paperclip Control-Plane Analysis](./paperclip-control-plane-analysis.md)
- [ADR-024 Separate Mentions from Room Workflow](../decisions/024-separate-explicit-mentions-from-dynamic-room-workflow.md)
- [SPEC-026 Room Workflow Orchestration](../specs/SPEC-026-explicit-mentions-and-dynamic-room-workflow-orchestration.md)
- [PLAN-016 Dynamic Room Workflow](../plans/PLAN-016-dynamic-room-workflow-orchestration.md)

---

*Research note completed: 2026-03-20*
*Author: Claude*
