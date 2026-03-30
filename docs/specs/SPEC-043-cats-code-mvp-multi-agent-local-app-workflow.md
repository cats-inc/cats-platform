# SPEC-043: Cats Code MVP Multi-Agent Local-App Workflow

> Turn the user's current multi-terminal copy/paste software-production routine
> into a persistent, chat-first, multi-agent project thread for local app
> delivery, without requiring a visible code editor.

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Draft |
| **Owner** | Codex |
| **Reviewer** | User |

## Summary

The current real-world `Cats Code` workflow is not:

- one linear pipeline
- one model doing everything
- one build followed by one clean test pass

The current workflow is a human-operated relay loop:

- ask multiple agents the same problem
- compare and challenge their outputs
- relay strong arguments across models
- converge into RESEARCH / ADR / SPEC / PLAN artifacts
- choose a primary coder
- send implementation to secondary reviewers
- manually test the result
- loop back into brainstorming, wireframing, tech-fit, implementation, or
  review whenever reality changes

This spec defines the `Cats Code` MVP as the productization of that workflow.

The MVP should not try to ship a fully autonomous software factory. It should
first remove the repetitive message-relay labor while preserving the user's
role as conductor, arbiter, visual judge, and final hands-on tester.

The MVP should also keep the initial product scope narrow:

- `Cats Code` initially helps users create and iterate on local applications
- the product stays chat-first
- code editing is not the primary interaction model
- visible code editors are explicitly out of scope for the MVP

## Goals

- eliminate the user's manual copy/paste relay between multiple coding agents
- support multi-agent debate, critique, and convergence inside one persistent
  project thread
- make wireframe and visual-direction work a first-class artifact before and
  during implementation
- make tech-fit analysis a first-class step for local-app delivery without
  overwhelming non-technical users with raw stack jargon
- preserve the user's ability to arbitrate, redirect, and re-open earlier
  discussion modes at any time
- keep manual human testing as a formal product stage rather than an informal
  side conversation
- scope the MVP to local-app projects and local verification loops

## Non-Goals

- building a visible IDE or file editor as the main `Cats Code` interaction
  model
- replacing all human testing with automated tests or browser automation
- shipping a rigid linear wizard that assumes each stage is visited only once
- supporting broad cloud deployment or generalized remote production operations
  in the MVP
- solving every software-delivery workflow for every project type on day one
- exposing raw technical stack selection as the first interaction for novice
  users

## MVP Thesis

`Cats Code` should behave like a persistent software-production thread with
multiple working modes, not like a single linear build form.

The user should be able to re-enter brainstorming, wireframing, tech-fit,
documentation, implementation, review, or manual verification at any time
without losing project memory or restarting the project from scratch.

The product promise for the MVP is:

> help a user go from vague app idea to local, testable application through a
> chat-first, multi-agent workflow that preserves debate, evidence, and human
> judgment while removing most of the copy/paste coordination work

## Core Model

### Canonical container: project thread

The canonical container for `Cats Code` MVP shall be a persistent
project-scoped thread.

The project thread owns:

- user intent and evolving problem framing
- agent conversation history
- artifact history
- assignment history
- review history
- human-test history
- current recommended next actions

The thread shall remain the same thread even when the work loops back into an
earlier mode.

### Working modes instead of strict one-way stages

The MVP shall model work as switchable modes within one thread rather than as a
single irreversible pipeline.

The first slice shall support at least these modes:

- `discover`
- `shape`
- `fit`
- `document`
- `build`
- `review`
- `human_verify`
- `repair`

The current mode is a focus hint, not a one-way lock. The user may re-enter an
earlier mode at any time.

### Rounds

The project thread shall record distinct rounds of work so the product can
group artifacts and decisions without pretending that the whole project is
linear.

A new round should begin when the thread adopts a new explicit objective,
higher-level mode focus, or delivery handoff such as:

- discovery to shaping
- shaping to implementation
- implementation to review
- human verification to repair

Additional messages or retries may remain inside the same round as long as the
objective is still the same. A round should end when it reaches at least one
of these boundaries:

- a stable artifact bundle is produced
- the thread hands off into a different primary mode
- the thread enters a waiting state for human or agent action

Examples:

- discovery round
- wireframe round
- implementation round
- review round
- manual test round
- repair round

### Agent surface

For the MVP, the multi-agent discussion, drafting, and review surface should
remain product-owned at the thread/workflow level while delegating provider
execution to `cats-runtime` through runtime-backed session APIs.

`cats-runtime` remains the execution boundary for provider selection,
provider readiness, session lifecycle, and local app execution. `Cats Code`
should not add product-owned provider adapters for Codex, Claude, Gemini, or
other provider families.

### Agent roster

Each project thread should retain a visible agent roster for the currently
configured participant agents.

Each roster entry should include at least:

- agent identity
- provider or interface family
- model target when known
- transport or connector type
- current availability or waiting state
- quota or subscription context when known
- recent role history such as drafter, main coder, or reviewer

This roster is thread-wide rather than build-only. Discovery, shaping,
documentation, implementation, and review rounds should all be able to inspect
the same agent roster and quota context when routing work.

## User Stories

- As a user who is still thinking through what to build, I want multiple agents
  to explore options, challenge one another, and bring back fresh research so I
  do not need to manually coordinate the discussion.
- As a user who does not know the right stack, I want `Cats Code` to recommend
  a local-app route and explain the tradeoffs without opening with intimidating
  implementation jargon.
- As a user who cares about visual outcome more than source code, I want to see
  wireframes, previews, and testable behavior before I worry about underlying
  implementation details.
- As a user coordinating multiple coding models, I want one model to implement
  while others review and critique without me manually relaying every message.
- As a user doing the final hands-on check, I want my manual testing notes to
  become structured follow-up work instead of disappearing into chat noise.

## Requirements

### Functional Requirements

#### Project-thread and mode model

1. `Cats Code` shall use one persistent project thread as the canonical
   container for discovery, shaping, implementation, review, and repair.
2. The thread shall support switchable working modes rather than assuming a
   one-pass linear flow.
3. The user shall be able to re-open earlier modes such as `discover`, `shape`,
   or `fit` after later work has already begun.
4. The product shall preserve a readable timeline of rounds, mode switches,
   artifacts, approvals, and human feedback inside the same thread.

#### Multi-agent discussion and relay

5. The MVP shall support sending the same prompt or problem statement to
   multiple configured coding agents in parallel through the product-owned
   multi-agent relay surface.
6. The product shall support a one-click relay flow so one agent's answer can
   be forwarded to one or more other agents for critique, rebuttal, or
   refinement without manual copy/paste.
7. The first discussion slice should support both:
   - independent first-pass answers
   - critique after another agent's answer is visible
8. The product shall preserve which agent said what, when it was relayed, and
   what later critique or adoption followed, together with the relevant agent
   identity and quota context that informed routing decisions.
9. The product shall produce a convergence summary when multiple agent views
   exist, including at least:
   - areas of agreement
   - areas of disagreement
   - questions needing user arbitration
   - recommended next artifact or action

#### Research and discovery

10. `discover` mode shall allow agents to use web research and bring back
    source-grounded findings into the thread.
11. Discovery outputs shall retain source provenance and retrieval date so the
    user can see what evidence informed the recommendation.
12. Discovery shall support both:
    - user-led brainstorming
    - agent-led clarification where the user starts with a vague idea

#### Wireframe and shape-first work

13. `shape` mode shall be a first-class product path, not a side comment inside
    implementation chat.
14. The MVP shall support a minimum wireframe artifact before implementation
    starts. The minimum acceptable artifact for the MVP is a low-fidelity
    screen or flow layout with named regions, primary actions, and short
    rationale; generated mock images or HTML shells are optional follow-on
    outputs rather than the baseline contract.
15. The user shall be able to request a new wireframe or layout rethink even
    after implementation or testing has already started.
16. Approved wireframe or visual-direction artifacts shall remain visible as
    project memory that later implementation and review rounds can reference.

#### Tech-fit analysis for local apps

17. `fit` mode shall recommend an initial local-app technical route before
    major implementation begins.
18. The first slice shall keep scope to local-app delivery and shall not assume
    that cloud deployment is required.
19. Tech-fit outputs shall answer at least:
    - what app shell or runtime route is recommended
    - what data storage route is recommended
    - what local dependencies or environment prerequisites are required
    - whether the route appears feasible on the current machine
    - whether there are important library or ecosystem constraints
    - what local bootstrap or setup steps remain before the route is runnable
20. The first user-facing fit output shall present:
    - a recommended route
    - concise reasons
    - important risks
    before exposing deep stack detail.
21. More technical fit detail such as libraries, database choices, and local
    service expectations may be shown as expandable depth rather than mandatory
    first-pass reading.
22. The MVP does not need to fully automate environment bootstrapping, but
    fit outputs shall acknowledge readiness gaps and produce an actionable
    bootstrap handoff when the recommended route still requires local setup.

#### Artifact generation and ratification

23. The MVP shall treat the following as first-class project artifacts:
    - research notes
    - wireframes or shape notes
    - fit decisions
    - ADRs
    - specs
    - plans
    - implementation runs
    - review reports
    - human test notes
    - final decision summaries
24. The convergence flow shall allow the user to nominate or accept one agent
    as the drafting author for a formal artifact.
25. Drafted artifacts shall remain linked to the discussion and evidence that
    produced them.

#### Implementation and review loop

26. The MVP shall support selecting one primary coder for an implementation
    round and one or more secondary reviewers.
27. Primary-coder selection may consider at least:
    - user preference
    - perceived agent strength for the task
    - current subscription or quota context
28. The thread-wide agent roster and quota context may also inform routing
    during discovery, shaping, document drafting, and review, not only during
    primary-coder selection.
29. The product shall support the user's current loop where one agent writes,
    other agents review, and feedback is routed back to the writer without
    manual copy/paste.
30. Reviewer output shall be captured as structured review artifacts with at
    least:
    - blocking findings
    - non-blocking suggestions
    - open questions
    - recommended next step
31. `SPEC-041` builder-loop execution may serve as the build/run substrate
    inside this broader workflow, but it shall not define the entire product
    identity of `Cats Code`.

#### Human verification and repair

32. `human_verify` shall be a first-class working mode rather than a hidden
    afterthought.
33. The MVP shall support capturing manual-testing feedback as structured
    project input, including at least:
    - expected behavior
    - actual behavior
    - reproduction notes
    - severity
    - optional screenshot or visual annotation
34. Human verification may happen multiple times across the life of one
    project thread.
35. Manual feedback shall be routable into a repair round without requiring the
    user to rewrite it as a new free-form prompt.

#### Evidence contract

36. Because the MVP does not expose a visible code editor as the primary
    surface, it shall provide a usable evidence contract for trust and
    arbitration.
37. The first evidence contract shall support at least these outputs:
    - wireframe or visual-direction artifacts
    - preview or runnable local output when available
    - changed-files summary
    - test results
    - review summaries
    - identified risks or blockers
    - implementation status
38. The evidence contract shall help the user decide what to do next without
    requiring direct code editing.

#### Waiting, resume, and arbitration

39. The product shall support explicit waiting states for:
    - agent work in progress
    - review pending
    - human testing pending
    - user arbitration pending
40. The product shall support resuming a thread after these waiting states
    without losing context.
41. The user shall remain able to overrule convergence, pick a different main
    coder, request another debate round, or redirect the work into a different
    mode.

### Non-Functional Requirements

- **Chat-first**: the primary authoring surface remains conversation and
  structured choices, not a visible code editor.
- **Human-centered**: the MVP reduces coordination labor but does not remove
  user arbitration or manual product judgment.
- **Non-linear**: project flow must tolerate loops, retries, and late-stage
  reframing.
- **Low intimidation**: stack-fit guidance should help novices without forcing
  them to think like maintainers on first contact.
- **Traceability**: major decisions, critiques, approvals, and evidence should
  stay attached to the project thread.
- **Local-first usefulness**: the initial scope must remain valuable for local
  application delivery even without remote deployment.

## Design Overview

```text
user starts with vague or concrete app intent
  -> open project thread
  -> fan out discussion to multiple agents
  -> relay and critique across agents
  -> converge on current understanding
  -> optionally branch into:
       shape mode (wireframe / layout direction)
       fit mode (local-app stack recommendation)
       document mode (RESEARCH / ADR / SPEC / PLAN)
       build mode (primary coder implementation)
       review mode (secondary critique)
       human_verify mode (manual testing + visual judgment)
       repair mode (fix round based on review or manual findings)
  -> repeat as needed inside the same thread
```

## MVP Boundary

### What this spec is trying to make real now

- multi-agent discussion and relay inside one project thread
- convergence without manual copy/paste labor
- formal artifact capture
- wireframe-first support
- local-app tech-fit recommendation
- one-primary-coder plus secondary-reviewers loop
- human testing as a formal round

### What this spec is not trying to make real yet

- a generalized autonomous software company
- a broad cloud-deployment orchestration product
- a visible source editor inside `Cats Code`
- complete elimination of human intervention
- a final visual layout spec for the product UI

## Relationship to Existing Specs

- [SPEC-041](./SPEC-041-cats-code-v1-local-builder-loop.md) defines the first
  code-task execution and preview/delivery loop above `cats-runtime`.
- This spec defines the broader `Cats Code` MVP workflow around discovery,
  shaping, fit, documentation, implementation relay, review, and human
  verification.
- In product terms, `SPEC-041` should be treated as one important build/run
  subsystem inside the larger `Cats Code` workflow rather than the whole
  product promise.

## Open Questions

- How much of agent-role selection should be automatic in the MVP versus
  explicitly user-picked every round?
- Should first-pass multi-agent answers default to blind parallel responses
  before any relay happens, or should that be an optional discussion mode?
- What is the smallest acceptable wireframe artifact for the MVP:
  text layout, generated mock image, HTML shell, or all three?
- How much machine-readiness detection should happen before fit recommendations
  are shown to the user?
- Which evidence items are mandatory before a build round can move into human
  verification?

## References

- [SPEC-041](./SPEC-041-cats-code-v1-local-builder-loop.md)
- [SPEC-035](./SPEC-035-cross-product-task-strategy-handoff-and-runtime-bridge.md)
- [SPEC-020](./SPEC-020-embedded-preview-surfaces-for-runtime-artifacts-and-services.md)
- [PLAN-029](../plans/PLAN-029-cats-code-v1-local-builder-loop.md)
- [Research: Codex View - Cats Chat, Cats Work, and Cats Code Product Boundaries](../research/2026-03-20-codex-cats-chat-work-code-product-boundaries.md)
