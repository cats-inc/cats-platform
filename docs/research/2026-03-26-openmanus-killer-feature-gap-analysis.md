# OpenManus Killer-Feature Gap Analysis for Cats Chat + cats-runtime

## Metadata

- **Date**: 2026-03-26
- **Author**: Claude
- **Scope**: Cats Chat + cats-runtime only (excludes Cats Work and Cats Code)
- **Baseline**: local `OpenManus/` submodule at commit `52a13f2`
  (v0.3.0-148-g52a13f2, FoundationAgents/OpenManus)
- **Comparison angle**: OpenManus is an open-source multi-agent execution
  framework; Cats Chat's runtime layer solves the same problem space — agent
  orchestration, tool execution, and multi-step planning
- **Prior art**: [OpenManus Reference Analysis](./2026-03-24-openmanus-reference-analysis.md)
  already covers what Cats can borrow. This document focuses on what Cats is
  *missing*, prioritized by impact

## Purpose

OpenManus and cats-runtime occupy overlapping architectural space from
different starting points:

- OpenManus: Python-based agent framework with built-in planning, ReAct
  execution loop, tool abstraction, Docker sandbox, and A2A protocol support
- cats-runtime: TypeScript-based session runtime with multi-backend provider
  coverage, workspace substrate, streaming, peer routing, and MCP facade

The prior reference analysis identified borrowable ideas. This analysis asks
the harder question: where does OpenManus have a capability that cats-runtime
genuinely lacks, and how much does that gap hurt?

## What Cats Already Has That OpenManus Also Has

These are not gaps:

- Multi-provider LLM support: cats-runtime has 13 CLI + API + Agent backends
  vs OpenManus's 6 API providers (OpenAI, Azure, Bedrock, Ollama, Anthropic,
  JiekouAI). Cats wins on breadth
- Tool execution: cats-runtime has LocalToolRuntime with list_files,
  read_file, write_file, edit_file, apply_patch, grep, glob, run_shell
- MCP support: cats-runtime has both MCP server (26 tools) and facade;
  OpenManus has both MCP client and server
- Human-in-the-loop: cats has structured choices (SPEC-033) with interactive
  buttons, multiSelect, allowSkip — richer UX than OpenManus's text-only
  AskHuman tool
- File editing: cats-runtime LocalToolRuntime covers OpenManus's
  StrReplaceEditor capabilities
- Session management: cats-runtime has full lifecycle
  (create/resume/fork/reset/delete/cancel) which OpenManus lacks entirely
- Streaming: cats-runtime has SSE + NDJSON dual transport; OpenManus has no
  streaming output
- Usage metering: cats-runtime has normalized metering across all backends;
  OpenManus has basic token counting only
- Workspace isolation: cats-runtime has three workspace modes
  (source/sandbox/worktree); OpenManus has no workspace concept outside
  Docker sandbox

## Killer Feature Gaps

### Gap 1: Structured Plan Decomposition as Runtime Primitive

**Priority**: High for multi-Cat orchestration

**What OpenManus has**:

PlanningFlow (`app/flow/planning.py`, 442 lines) is a first-class runtime
construct, not a prompt pattern:

- LLM receives a task → creates a structured plan with numbered steps
- Each step has explicit status: `not_started` / `in_progress` / `completed`
  / `blocked`
- Steps are assigned to specialist agents based on step type
- Plan can be modified mid-execution (add/remove/reorder steps)
- The plan itself is a persistent data structure the runtime tracks, not
  ephemeral prompt context
- Execution loop iterates step-by-step with status transitions

**What Cats has**:

- Boss Cat orchestrates through prompting and @mention-based routing
- CoreTaskRecord exists as a data structure but is not wired into an
  execution loop that drives plan steps
- SPEC-033 structured choices let the owner approve/redirect, but the plan
  itself is not a runtime-owned entity
- The reference analysis noted PlanningFlow as borrowable; the gap is that
  nothing equivalent exists as a runtime primitive

**What is missing**:

- A runtime-owned plan data structure (steps, dependencies, status, agent
  assignment)
- An execution loop that walks the plan step-by-step, dispatching to
  appropriate Cats
- Step-level status tracking visible to the product layer
- Dynamic re-planning: the ability for Boss Cat to modify the plan
  mid-execution when circumstances change (new information, blocked step,
  failed Cat)

**Why it matters**:

Without structured planning as a runtime primitive, Boss Cat's orchestration
is only as good as its prompt memory. For a 5-step task, this works. For a
20-step project with dependencies and failures, prompt-only orchestration
will lose track. OpenManus proves that step-level tracking with agent
assignment is implementable at modest complexity (~400 lines) and
dramatically improves multi-agent coordination reliability.

---

### Gap 2: Agent Execution Loop with Stuck Detection

**Priority**: High for API/Agent backend reliability

**What OpenManus has**:

The ReAct pattern (`app/agent/react.py`, `app/agent/toolcall.py`)
implements a disciplined think → act loop with:

- Step limit enforcement (configurable `max_steps`, default varies by agent)
- Stuck detection: tracks the last N responses; if the agent produces
  duplicate output, it is flagged as stuck and the loop terminates or
  recovers
- Per-step state machine (IDLE → RUNNING → FINISHED / ERROR)
- Token limit handling: if context exceeds limit, the loop handles it
  gracefully rather than crashing
- Tool choice mode control: NONE / AUTO / REQUIRED per step
- Response truncation (`max_observe`) to prevent tool output from
  overwhelming context

**What Cats has**:

- For CLI backends: the execution loop is owned by the external CLI (Claude
  Code, Codex, etc.) — cats-runtime does not control it
- For API backends: cats-runtime sends messages and processes tool calls, but
  there is no formalized think/act loop with recovery semantics
- No stuck detection mechanism
- No step limit enforcement at the runtime level (CLI providers have their
  own, but API/Agent backends do not)
- Execution guardrails (ADR-017) cover budget/rate-limit but not behavioral
  stuck states

**What is missing**:

- A runtime-level execution loop for API/Agent backends that enforces step
  limits
- Stuck detection: recognize when an agent is producing repetitive output
  and intervene
- Graceful context overflow handling for long multi-turn sessions
- Tool output truncation policy to prevent context bloat from verbose tool
  results

**Why it matters**:

CLI backends manage their own execution loops, but API backends (Claude API,
OpenAI, Gemini, Ollama) run through cats-runtime directly. Without stuck
detection and step limits, a misbehaving API agent can loop indefinitely,
consume budget, and produce no useful output. OpenManus's approach is
lightweight (duplicate tracking + step counter) but effective. This gap
becomes critical as cats-runtime's API backend usage grows.

---

### Gap 3: Container-Level Execution Sandbox

**Priority**: Medium-High for code execution safety

**What OpenManus has**:

DockerSandbox (`app/sandbox/core/sandbox.py`, 462 lines) provides:

- Docker container lifecycle (create/start/stop/remove)
- Resource limits: configurable memory (512MB default), CPU (1.0 default),
  timeout (300s default)
- Network isolation: configurable network mode, can fully disconnect
- Volume binding: mount host directories into container
- AsyncDockerizedTerminal: async command execution inside container
- Sandbox-specific tool variants: shell, files, browser, vision — all
  execute inside the container, not on the host
- Automatic cleanup on session end

**What Cats has**:

- Workspace isolation via `workspaceKind` (source/sandbox/worktree) controls
  *where* the session runs, not *how isolated* it is
- All workspace modes execute on the host OS directly
- No resource limits on session execution
- No network isolation
- No container-based execution option

**What is missing**:

- An execution mode where code runs inside a container rather than on the
  host
- Resource limits (memory, CPU, time) per session or per tool execution
- Network isolation option for untrusted code execution
- Sandbox-aware tool variants that execute inside the container

**Why it matters**:

When a Cat executes `run_shell` or writes/runs code, it runs directly on
the host. For trusted local usage this is acceptable, but for any scenario
involving untrusted input, shared infrastructure, or multi-tenant
deployment, container isolation is the standard safety boundary. This gap is
more relevant to Cats Code than Cats Chat, but Chat sessions that invoke
code-capable Cats also inherit the risk. The workspace contract rework
(workspaceKind/workspaceAccess) is the natural place to introduce a
`containerized` execution option in the future.

---

### Gap 4: A2A Protocol as Inter-Node Standard

**Priority**: Medium (strategic)

**What OpenManus has**:

A working A2A implementation (`protocol/a2a/`):

- JSON-RPC 2.0 endpoint
- `/.well-known/agent.json` capability advertisement (agent-card)
- Task send / get / cancel operations
- Agent tools exposed as A2A skills
- Compatible with the broader A2A ecosystem (LangChain, CrewAI, etc.)

**What Cats has**:

- Custom peer routing protocol (PLAN-017) with:
  - Peer identity, capability, and load snapshots
  - Trust-gated execution routing
  - HMAC-signed requests
  - SSE/NDJSON transport
- No A2A protocol support
- `docs/a2a/` has agent-card and task example files but no implementation

**What is missing**:

- A2A endpoint implementation on cats-runtime
- Agent-card generation from existing provider/capability metadata
- A2A task lifecycle mapped to cats-runtime session operations
- Interoperability with external A2A-compatible agents

**Why it matters**:

Cats's custom peer protocol works for LAN mesh scenarios, but it creates a
closed ecosystem. A2A is becoming a de facto standard for agent
interoperability. The gap is strategic rather than urgent: cats-runtime does
not need A2A today, but as the mesh network grows beyond same-runtime peers,
A2A compatibility avoids reinventing discovery and capability negotiation.
The reference analysis already recommended A2A for mesh Phase 1 star
topology.

---

### Gap 5: Multimodal Tool Feedback Loop

**Priority**: Medium for rich agent interaction

**What OpenManus has**:

Tools can return visual data that feeds back into LLM reasoning:

- BrowserAgent captures screenshots and returns base64-encoded images
- SandboxVisionTool captures sandbox screen state
- ToolResult schema includes `base64_image` field alongside text output
- LLM processes both text and visual output to decide next actions
- The agent can "see" the result of its browser or GUI interactions

**What Cats has**:

- Tool outputs in LocalToolRuntime are text-only
- cats-runtime API backends support multimodal input (images in user
  messages) but not multimodal tool output
- Browser substrate (SPEC-024) has manual driver for validation but no
  screenshot → LLM feedback loop
- No tool result schema for visual data

**What is missing**:

- A tool result schema that supports image/visual data alongside text
- Screenshot capture integration in browser or preview tools
- LLM context assembly that includes visual tool outputs
- Provider-aware multimodal tool result formatting (not all providers
  support vision in tool results)

**Why it matters**:

For Chat-only scenarios this is not critical. But as Cats invoke browser
tools, preview surfaces, or code-with-output flows, the ability for an
agent to *see* what it produced (a rendered page, a chart, an error
screenshot) and reason about it significantly improves output quality.
OpenManus demonstrates this is implementable with a simple schema extension
(base64 image in tool result) rather than a complex vision pipeline.

---

### Gap 6: Unified Tool Registry with Dynamic Discovery

**Priority**: Medium for tool ecosystem coherence

**What OpenManus has**:

ToolCollection (`app/tool/tool_collection.py`) manages all tool types
uniformly:

- Local tools (Python execute, file edit, web search) registered at init
- MCP tools discovered dynamically from connected MCP servers
- Sandbox tools registered when sandbox mode is active
- Single `execute_tool(name, **kwargs)` interface regardless of tool origin
- Dynamic addition/removal of tools during session
- All tools converted to a unified parameter format for LLM consumption

**What Cats has**:

- LocalToolRuntime provides built-in tools
- MCP facade exposes runtime services as MCP tools
- Skills system (SPEC-005) delivers behavioral instructions but not tools
- No unified registry that combines local tools, MCP tools, and
  runtime-discovered tools into a single surface for the LLM
- Tool availability is static per session — no dynamic tool
  registration/removal

**What is missing**:

- A unified tool registry that merges local tools, MCP-provided tools, and
  runtime-discovered tools into one catalog
- Dynamic tool registration/removal during a session (e.g., when a new MCP
  server connects mid-session)
- Consistent tool parameter serialization across tool origins
- Tool metadata (source, trust level, cost) for the LLM and product layer

**Why it matters**:

As cats-runtime's tool surface grows (local tools, MCP tools, delivery
tools, management adapter tools, browser tools), the absence of a unified
registry means the product layer must assemble tool lists from multiple
sources. OpenManus's ToolCollection is simple (~200 lines) but creates a
single source of truth for "what can this agent do right now?" This becomes
more important as the MCP ecosystem matures and Cats connect to external
MCP servers.

---

## Features Explicitly Excluded (Cats Work / Cats Code Territory)

- Full browser automation with Playwright (Cats Code / browser-rpa-core
  territory)
- Data analysis and chart visualization agents (specialized vertical, not
  core chat)
- Web search and crawling tools (not Cats Chat core)
- Computer use / desktop automation (rpa-automate territory)
- Docker-based development environments (Cats Code territory; Gap 3 above
  covers the safety angle, not the dev-environment angle)

## Secondary Observations

### What Cats Does Better Than OpenManus

- **Provider breadth**: 13 CLI + API + Agent backends vs 6 API-only
  providers. Cats can use local Claude Code, Codex, Gemini CLI, Cursor,
  Kiro, etc. as real execution engines — OpenManus only calls APIs
- **Session lifecycle**: cats-runtime has full
  create/resume/fork/reset/delete/cancel with workspace state. OpenManus
  has no session concept — each `agent.run()` is a one-shot execution
- **Streaming**: dual SSE + NDJSON transport with normalized progress
  events. OpenManus produces final output only, no incremental streaming
- **Workspace substrate**: three workspace modes with deterministic cleanup,
  worktree merge policies, snapshot-copy for forks. OpenManus has no
  workspace concept outside Docker
- **Usage metering and guardrails**: normalized metering across all backends
  with budget enforcement, rate-limit detection, cooldown. OpenManus has
  basic token counting only
- **Multi-product architecture**: Cats has a clear Chat / Work / Code
  product strategy sharing a common runtime. OpenManus is a single-purpose
  framework
- **Documentation maturity**: 23 ADRs, 20 specs, architecture guide.
  OpenManus has a README and inline docstrings
- **Peer routing**: LAN mesh discovery with trust-gated execution. OpenManus
  has no peer concept

### What OpenManus Does That Cats Might Never Need

- Python-native execution (Cats is TypeScript; Python tools would be MCP
  or subprocess)
- Built-in web search across 4 engines with fallback (not Cats Chat scope)
- crawl4ai web scraping integration (freelance-job-aggregator has its own)
- Embedded Daytona/Docker dev environment management (Cats Code may
  approach this differently)
- SWEAgent specialization for software engineering tasks (Cats Code will
  have its own approach via Local Cat CLI providers)

## Cross-Reference with Prior Analyses

Some OpenManus gaps overlap with previously identified Paperclip/OpenClaw
gaps:

- **Structured planning** overlaps with Paperclip's heartbeat/task
  substrate — but OpenManus's PlanningFlow is a more concrete reference
  implementation for step decomposition and re-planning
- **Container isolation** is unique to OpenManus among the three comparisons
- **A2A protocol** is unique to OpenManus among the three comparisons
- **Stuck detection** is unique to OpenManus — neither OpenClaw nor
  Paperclip address this behavioral failure mode
- **Multimodal tool feedback** is unique to OpenManus
- **Unified tool registry** is partially addressed by OpenClaw's tool
  ecosystem but OpenManus's ToolCollection is a cleaner architectural
  reference

## Recommended Priority

### Tier 1 — High (addresses real execution gaps)

- **Structured Plan Decomposition** (Gap 1) — makes multi-Cat orchestration
  reliable beyond prompt-memory limits
- **Agent Execution Loop with Stuck Detection** (Gap 2) — makes API/Agent
  backends robust against behavioral failure modes

### Tier 2 — Medium-High (strategic safety and interoperability)

- **Container-Level Execution Sandbox** (Gap 3) — makes code execution safe
  for untrusted scenarios; natural extension of workspace contract rework
- **A2A Protocol** (Gap 4) — makes the mesh ecosystem interoperable; should
  inform but not block current peer routing work

### Tier 3 — Medium (improves capability surface)

- **Multimodal Tool Feedback Loop** (Gap 5) — makes browser/preview tools
  useful for visual reasoning
- **Unified Tool Registry** (Gap 6) — makes the growing tool surface
  manageable as MCP ecosystem expands

## Bottom Line

OpenManus's unique contributions to the Cats gap picture are different from
OpenClaw and Paperclip. While those two highlighted product-surface and
governance gaps, OpenManus highlights **execution-engine gaps**:

1. **Structured planning** — the runtime needs a plan data structure, not
   just prompt-driven orchestration
2. **Stuck detection** — API backends need behavioral guardrails, not just
   budget guardrails
3. **Container isolation** — code execution safety needs a stronger boundary
   than filesystem workspace modes
4. **A2A interoperability** — the mesh should speak a standard protocol, not
   only a custom one

The first two are implementable at modest complexity (OpenManus does both
in under 700 lines of Python combined) and directly improve multi-Cat
reliability for Cats Chat.

## References

- [OpenManus Reference Analysis](./2026-03-24-openmanus-reference-analysis.md)
- [OpenClaw Killer-Feature Gap Analysis](./2026-03-20-openclaw-killer-feature-gap-analysis.md)
- [Paperclip Killer-Feature Gap Analysis](./2026-03-20-paperclip-killer-feature-gap-analysis.md)
- [cats-runtime Workspace Contract Terminology](../../../cats-runtime/docs/research/2026-03-25-workspace-contract-terminology-and-semantics.md)
- [cats-runtime ADR-017 Usage Metering](../../../cats-runtime/docs/decisions/017-usage-metering-rate-limit-detection-and-execution-guardrails.md)
- [cats Structured Choices (SPEC-033)](../specs/SPEC-033-structured-choices-contract.md)

---

*Analysis completed: 2026-03-26*
*Author: Claude*
