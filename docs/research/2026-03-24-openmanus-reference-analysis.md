# OpenManus Reference Analysis for Cats Ecosystem

## Metadata

- **Date**: 2026-03-24
- **Author**: Claude
- **Status**: Draft — pending review
- **Scope**: Extract the designs and implementations from OpenManus (FoundationAgents) that are worth referencing for Cats
- **Source**: `OpenManus/` submodule (MIT license, MetaGPT team, Python, ~6,449 lines)
- **Related**:
  - `cats-platform/docs/research/2026-03-24-cats-code-peer-review-workflow.md`
  - `cats-platform/docs/research/2026-03-24-cats-work-aggregator-and-mesh-vision.md`
  - `cats-platform/docs/research/2026-03-24-structured-choices-design-reference.md`
  - `cats-platform/docs/research/2026-03-24-task-substrate-as-heartbeat-foundation.md`

---

## Overview

OpenManus is an open-source AI agent framework from the MetaGPT team,
positioned as an open-source Devin. This document does not evaluate OpenManus's
overall maturity; it focuses only on **the parts with direct reference value for
Cats**.

---

## Reference Item 1: PlanningFlow (Multi-Agent Task Decomposition)

### What OpenManus does

`OpenManus/app/flow/planning.py`

- A large task comes in → the LLM automatically breaks it into multiple steps
- Each step is assigned to a different specialist agent (Manus / DataAnalysis / SandboxAgent)
- Complete step status tracking (pending → running → completed / failed)
- The plan can be adjusted dynamically during execution (add / modify steps)

### Reference value for Cats

**Maps directly to the Boss Cat's dispatch behavior:**

```
Owner: "Build me a landing page with login"

Boss Cat (PlanningFlow equivalent):
  Step 1: Design the UI mockup → assign Designer Cat
  Step 2: Implement the auth module → assign Coder Cat A
  Step 3: Implement the landing page → assign Coder Cat B (depends on Step 1)
  Step 4: Review → assign Peer Cat A + B (depends on Step 2, 3)
  Step 5: Integration testing → assign QA Cat (depends on Step 4)
```

**Designs worth borrowing:**

- **Step state machine**: OpenManus uses `not_started` / `in_progress` / `completed` /
  `blocked` — nearly identical to our `CoreTaskStatus`
- **Dynamic re-planning**: if extra steps are found to be needed midway, the LLM can modify the plan —
  the Boss Cat needs this ability too
- **Agent selection logic**: PlanningFlow picks a specialist according to the nature of the step —
  the Boss Cat picks a Cat according to SKILL.md capabilityTags

**What we already have but OpenManus does not:**

- DB persistence for the task substrate (OpenManus keeps it only in memory)
- Approval gate (OpenManus plans do not need owner approval)
- Budget pre-check (OpenManus does not track cost)

### Recommendation

PlanningFlow's step decomposition logic can serve as a reference for the Boss
Cat dispatch prompt. There is no need to port code, but the plan's data
structure and the re-planning mechanism are worth referencing in the
orchestrator SKILL.md.

---

## Reference Item 2: A2A Protocol Integration

### What OpenManus does

`OpenManus/protocol/a2a/`

- Implements Google's Agent-to-Agent protocol
- Agents are exposed as JSON-RPC 2.0 endpoints
- Has a standard agent-card (capability declaration)
- Supports task send / get / cancel

### Reference value for Cats

**Maps directly to cross-node communication in the mesh network:**

Our monorepo already has A2A agent-card and task example files in `docs/a2a/`.
OpenManus has a **working implementation** to compare against.

**Use in the mesh scenario:**

```
Node A (cats-runtime) ── A2A ── Node B (cats-runtime)
                                  │
                            A2A agent-card:
                            {
                              "name": "node-b",
                              "capabilities": ["code_gen", "review"],
                              "provider": "claude",
                              "available_quota": "80%"
                            }
```

- Each cats-runtime node exposes an A2A agent-card declaring its capabilities
- The Hub discovers nodes, dispatches tasks, and collects results through A2A
- We do not need to invent our own discovery protocol — A2A has already defined it

**Benefits over a homemade protocol:**

- An open standard maintained by Google, with an ecosystem
- Already supported by multiple frameworks (OpenManus, LangChain, CrewAI)
- The agent-card capability declaration maps naturally to SKILL.md capabilityTags
- Task send / get / cancel maps to the CoreTaskRecord lifecycle

### Recommendation

Phase 1 (Star Topology) of the mesh network can adopt the A2A protocol directly
as the inter-node communication standard instead of building a custom protocol.
OpenManus's `protocol/a2a/` implementation can serve as a reference for a
cats-runtime A2A adapter.

---

## Reference Item 3: AskHuman Tool (Human-in-the-Loop Interruption)

### What OpenManus does

The AskHuman tool in `OpenManus/app/tool/`

- When the agent reaches something it is unsure about → it calls the AskHuman tool
- Execution pauses and waits for human input
- After the human replies, the agent continues

### Reference value for Cats

**This is the runtime-side counterpart of structured choices:**

- A Cat in a session hits a moment that needs an owner decision
- The Cat calls a tool similar to AskHuman → the session pauses
- The product layer receives the pause event → renders structured choices in the Chat UI
- After the owner chooses → the reply is sent back to the session → the Cat continues

**Mapping to our existing architecture:**

- OpenManus's `AskHuman` → the Cat's structured choices output
- OpenManus's tool call pause → the cats-runtime session's `busy` → `ready` state transition
- OpenManus's human reply → the product layer `POST /sessions/:id/messages` sends back the choice result

**Differences:**

- OpenManus's AskHuman is a plain-text prompt (what to ask is written by the agent itself)
- Our structured choices are structured JSON (with options, multiSelect, allowSkip)
- Our approach has better UX (buttons vs typing), but the underlying interrupt/resume mechanism is the same

### Recommendation

AskHuman's interrupt/resume pattern confirms that the runtime side of
structured choices needs no special mechanism — it is just a tool call that
makes the session wait for external input, fully consistent with the existing
session message flow.

---

## Reference Item 4: StrReplaceEditor (File Editing Tool)

### What OpenManus does

`OpenManus/app/tool/str_replace_editor.py`

- Four operations: `view` / `create` / `str_replace` / `insert`
- Supports undo (each edit records history)
- Path validation + safety checks
- Line number display + range limits (to avoid reading too much)

### Reference value for Cats

**The tool contract for a Coder Cat editing files in a cats-runtime session:**

- An interface nearly identical to Claude Code's Edit tool
- cats-runtime's `LocalToolRuntime` already has read / write / patch / grep / shell
- OpenManus adds **undo** — if a Peer Cat's review calls for reverting an edit,
  the undo history would be useful

### Recommendation

Low priority. Our LocalToolRuntime already covers the core operations.
Undo can serve as a reference for enhancing the Coder Cat workflow in the future.

---

## Parts Not Worth Referencing

- **Browser automation (browser-use + Playwright)**: we have `browser-rpa-core`,
  and for Cats Code a preview with an iframe + local dev server is enough
- **Daytona sandbox**: skip; it does not fit our native-software direction
- **Web search tools (Google / DuckDuckGo / Baidu)**: not a focus of Cats
- **Data analysis agent**: different from Cats's positioning
- **crawl4ai**: our freelance-job-aggregator already has its own scraping framework
- **ComputerUseTool (desktop automation)**: we have `rpa-automate`

---

## Relationship to Other Research

| OpenManus reference item | Corresponding Cats research |
|------------------|---------------------|
| PlanningFlow | Task Substrate + Peer Review Workflow (fan-out/converge) |
| A2A Protocol | Aggregator + Mesh Vision (cross-node communication) |
| AskHuman | Structured Choices (runtime-side interrupt/resume) |
| StrReplaceEditor | (already covered by cats-runtime LocalToolRuntime) |

---

## Conclusion

The most valuable references from OpenManus for Cats are:

- **PlanningFlow** — an implementation reference for the Boss Cat dispatch's
  step decomposition and re-planning mechanism
- **A2A protocol** — an inter-node communication standard the mesh network can
  adopt directly, with no need to build our own discovery protocol
- **AskHuman** — confirms that the runtime side of structured choices needs no
  new mechanism, consistent with the existing session message flow

For everything else we already have a corresponding solution and need not
introduce it again.

---

*This document is for review discussion. If the review passes, the
recommendation to adopt the A2A protocol can be promoted to a formal ADR.*
