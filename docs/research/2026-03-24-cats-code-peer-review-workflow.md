# Cats Code: Peer Review Workflow with Parallel Cats

## Metadata

- **Date**: 2026-03-24
- **Author**: Claude
- **Status**: Draft — pending review
- **Scope**: Peer review workflow on the Cats Code product surface
- **UI Layout**: Undecided — this document does not cover concrete UI layout design
- **Related**:
  - `cats-platform/docs/research/2026-03-24-task-substrate-as-heartbeat-foundation.md`
  - `cats-platform/docs/research/2026-03-24-structured-choices-design-reference.md`
  - `cats-platform/docs/specs/SPEC-020-embedded-preview-surfaces-for-runtime-artifacts-and-services.md`
  - `cats-platform/docs/plans/PLAN-016-dynamic-room-workflow-orchestration.md`
  - `cats-runtime/docs/specs/SPEC-003-agent-backend.md`

---

## Background

Cats Code serves two kinds of users:

- **People who do not write code**: they confirm requirements through structured
  choices (clarifying questions injected via SKILL.md), then the Coder Cat
  handles everything
- **People who can code but would rather not**: they care more about quality
  assurance. The common practice is peer review, and for efficiency they set up
  2 Peers to review at the same time, forming a **pair programming mode of
  1 Coder + 2 Peers**

This document explores the workflow design for the second scenario.

---

## Workflow Definition

### Roles

- **Owner**: raises the requirement and makes the final decision
- **Boss Cat** (or Lead Cat): the orchestrator, responsible for dispatching work and aggregating results
- **Coder Cat**: writes the code
- **Peer Cat A / B**: review the work, each producing opinions independently

### Flow

```
Owner raises a requirement
  → Boss Cat clarifies the requirement (structured choices, if needed)
  → Boss Cat creates a task and assigns it to the Coder Cat
  → Coder Cat works
  → Coder Cat finishes and produces a structured summary
  → Boss Cat triggers fan-out: dispatches two review tasks at the same time
    → Peer Cat A reviews (independent session)
    → Peer Cat B reviews (independent session)
  → Both Peers finish (converge)
  → Boss Cat aggregates the two reviews and presents them to the Owner
  → Owner decides: accept all / accept selectively / request changes / discuss with the Coder
  → (If changes are needed) Coder Cat revises based on the reviews → may trigger another review cycle
```

### Trigger Conditions

- **Automatic trigger**: review starts automatically when the Coder Cat finishes
  (suits Owners who do not write code)
- **Manual trigger**: review is triggered only after the Owner confirms the
  Coder's output (suits Owners who write code and may look at it first)
- **Optional trigger**: the Owner sets in advance that this task needs no
  review, and review is skipped

---

## Technical Feasibility Analysis

### Existing Capabilities

**Multi-cat parallel execution**
- cats-runtime supports multiple sessions running at the same time
- Each Peer Cat has an independent session, with no interference
- The session observe API (SSE/NDJSON) can track each session's progress in real time

**Orchestrator dispatch**
- The Boss Cat can dispatch tasks to multiple Cats (existing orchestration contract)
- The task substrate (see the related research) provides the assignment → wakeup chain

**Structured output**
- The SKILL.md injection mechanism can teach a Cat to output a specific JSON format
- The structured choices mechanism (see the related research) lets a Cat present decision options
- The renderer parses the JSON and renders it as interactive components

**Real-time feedback from session observe**
- Each session's progress events can be pushed to the frontend in real time
- The frontend can subscribe to multiple sessions' observe streams at once

### What Needs to Be Built

**Fan-out / Converge workflow**
- The Boss Cat dispatches multiple tasks at the same time (fan-out)
- Wait for all tasks to finish, then aggregate (converge)
- PLAN-016 designs this pattern but it is not yet implemented
- Minimal implementation: the Boss Cat prompt describes the fan-out behavior,
  and the product layer tracks the status of multiple tasks and notifies the
  Boss Cat to aggregate once all are completed

**Canvas / Preview presentation**
- The Coder Cat's code summary and the Peer Cats' review results need a
  structured presentation surface (not a plain chat transcript)
- SPEC-020 already defines the concept of embedded preview surfaces
- The concrete UI layout is out of scope for this document

**Review-specific SKILL.md**
- Peer Cats need an injected review skill that guides them to output structured review results
- The Coder Cat needs an injected summary skill that guides it to output a structured summary when it finishes

---

## SKILL.md Design

### coder-summary skill (injected into the Coder Cat)

Guides the Coder Cat to output a structured summary after finishing a piece of work:

```json
{
  "coderSummary": {
    "title": "User Auth Module",
    "description": "Implemented JWT-based auth, including login/register/refresh",
    "filesChanged": ["src/auth/jwt.ts", "src/middleware/guard.ts"],
    "keyDecisions": [
      "Chose jose over jsonwebtoken (lighter weight)",
      "Set token expiry to 1 hour"
    ],
    "reviewFocus": ["Security", "error handling", "edge cases"]
  }
}
```

### review-summary skill (injected into Peer Cats)

Guides a Peer Cat to output a structured review result:

```json
{
  "reviewSummary": {
    "score": 8,
    "verdict": "approve_with_suggestions",
    "highlights": ["JWT implementation is correct", "Middleware structure is clear"],
    "concerns": [
      {
        "severity": "suggestion",
        "file": "src/auth/jwt.ts",
        "line": 42,
        "description": "Suggest changing token expiry to 15 minutes"
      },
      {
        "severity": "warning",
        "file": "src/middleware/guard.ts",
        "description": "Missing rate limiting protection"
      }
    ]
  },
  "choices": [
    {"id": "approve", "label": "Accept this review", "style": "primary"},
    {"id": "revise", "label": "Request changes", "style": "secondary"}
  ]
}
```

### Differentiating the Two Peers

The two Peer Cats can be injected with review skills that have different focuses:

- **Peer A**: focuses on correctness, security, and edge cases
- **Peer B**: focuses on readability, architecture quality, and performance

This way the two reviews start from different angles, which reduces overlap and
increases coverage. The differentiation is achieved through prompt guidance in
SKILL.md and needs no code differences.

---

## Integration with the Task Substrate

The peer review workflow maps naturally onto the task substrate:

```
Boss Cat creates a task (type: "implementation")
  → assign Coder Cat
  → Coder Cat checkout → in_progress → completed
  → Boss Cat creates 2 sub-tasks (type: "review", parentTaskId: the task above)
    → assign Peer A → wakeup trigger
    → assign Peer B → wakeup trigger
  → Peer A completed + Peer B completed
  → Boss Cat queries that all sub-tasks of the parent task are completed
  → converge: aggregate the review results and present them to the Owner
  → Owner decides (structured choices)
  → update the parent task status
```

The task's `parentTaskId` field (`CoreWorkItemRecord` already has
`parentWorkItemId`) naturally supports this parent → sub-task fan-out structure.

---

## Coder Cat Output and Preview

After finishing work, the Coder Cat may produce:

- **Code changes** (diff / new files)
- **A local dev server** (for a web app, it can run `npm run dev` automatically)
- **A structured summary** (the coder-summary JSON defined above)

What cats-runtime already supports:

- **Delivery primitives** (commit, push) — implemented
- **Browser preview substrate** (page lifecycle, session binding) — implemented
- **Workspace isolation** (worktree-backed) — implemented

What is missing is the product layer connecting these into an end-to-end flow:
"Coder Cat finishes writing → automatically deploys to a local dev server →
the preview can be embedded and viewed in the Canvas".

---

## Owner Decision Points

After review completes, the Owner faces these decisions (presented through structured choices):

- **Accept all**: accept all suggestions from both Peers and have the Coder Cat make the changes
- **Accept selectively**: the Owner chooses which suggestions to accept one by one (each concern can be accepted or dismissed independently)
- **Request changes**: send it back to the Coder Cat with extra instructions
- **Discuss**: open a conversation with the Coder Cat to dig into a specific concern
- **Skip review**: the Owner has looked at it, finds it fine, and approves directly

---

## Iterative Review (Multiple Rounds)

Changes may need another review:

- **Automatic re-review**: a new review round is triggered automatically when the Coder Cat finishes revising
- **Diff review**: in the second round the Peer Cats look only at the diff, not everything again (through skill prompt guidance)
- **Owner-configurable round limit**: avoids infinite loops (for example at most 3 rounds)
- **Fast path**: if the change is small (only the issues the Peers pointed out
  were fixed), the Boss Cat can judge that a full re-review is unnecessary and
  do only a sanity check

---

## Relationship to Other Research

- **Task Substrate** (`2026-03-24-task-substrate-as-heartbeat-foundation.md`):
  provides task CRUD, fan-out sub-tasks, and assignment → wakeup triggers
- **Structured Choices** (`2026-03-24-structured-choices-design-reference.md`):
  provides the interactive UI mechanism for Owner decisions
- **SPEC-020** (Embedded Preview Surfaces):
  provides the conceptual framework for embedding previews in the Canvas
- **PLAN-016** (Dynamic Room Workflow Orchestration):
  provides the workflow pattern design for fan-out / converge

Together with this document, these four documents form the complete technical
foundation for the Cats Code peer review scenario.

---

## Conclusion

- The parallel review workflow of 1 Coder + 2 Peers is **technically feasible**
- Core dependencies: multi-session parallelism (exists), task substrate fan-out
  (to be implemented), structured-output SKILL.md (to be written), Canvas
  presentation (to be implemented, layout undecided)
- Differentiating the two Peers' review focus through SKILL.md lets the same
  mechanism produce complementary reviews
- Owner decision points are presented through structured choices, supporting
  accept all, accept selectively, send back, and discuss
- The whole flow needs no new cats-runtime features; wiring at the product layer is enough

---

*This document is for review discussion. UI layout design is out of its scope
and will be defined separately. If the review passes, it is recommended to fold
this into the Cats Code SPEC planning.*
