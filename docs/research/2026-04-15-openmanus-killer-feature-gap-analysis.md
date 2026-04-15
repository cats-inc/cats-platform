# OpenManus Killer-Feature Gap Analysis for Cats Chat + cats-runtime (April Update)

## Metadata

- **Date**: 2026-04-15
- **Author**: Claude
- **Scope**: Cats Chat + cats-runtime only (excludes Cats Work and Cats Code)
- **Baseline**: local `OpenManus/` submodule at commit `52a13f2`
  (v0.3.0-148-g52a13f2, FoundationAgents/OpenManus) — unchanged since
  March analysis
- **Prior version**: [2026-03-26 analysis](./2026-03-26-openmanus-killer-feature-gap-analysis.md)

## Purpose

Point-in-time refresh of the 2026-03-26 OpenManus gap analysis. OpenManus
itself has not changed (same commit), but cats-runtime has advanced
significantly — particularly with ACP adapter work, execution strategies,
and the gap audit. This update re-evaluates each gap against current Cats
state.

## What Changed in OpenManus

Nothing. The submodule remains at v0.3.0-148 (commit `52a13f2`). The last
commits were JiekouAI provider addition, chart visualization merge, and
Daytona sandbox tools.

## What Changed in Cats Since March

Relevant cats-runtime progress:

- **ACP adapter**: `AcpAdapter`, `AcpStdioClient`, `RuntimeAcpHostBridge`
  now exist under `src/backends/agent/acp/` — a direct response to the
  A2A/ACP gap
- **Execution strategies**: `simple_tool_call`, `react`, `plan_execute`,
  `pdca`, `reflexion`, `tree_of_thoughts`, `deps` are shipped under
  `src/backends/api/runtime/strategies/`
- **Agent backend maturity**: OpenClaw adapter, Agent SDK bridge, ACP
  adapter, and agent adapter registry are all live
- **Gap audit**: 2026-03-30 audit confirmed execution strategies are no
  longer the largest gap

## Killer Feature Gaps — Status Update

### Gap 1: Structured Plan Decomposition as Runtime Primitive

**Prior priority**: High
**Status**: Significantly addressed

The `plan_execute` execution strategy in cats-runtime now provides
runtime-level plan decomposition. Combined with `pdca` (plan-do-check-act)
and `deps` (dependency-aware execution), the core capability that
OpenManus's PlanningFlow demonstrated is now architecturally present.

Remaining difference: OpenManus's PlanningFlow has explicit step status
tracking (`not_started`/`in_progress`/`completed`/`blocked`) with dynamic
re-planning. cats-runtime's strategies are more implicit — the LLM drives
plan revision rather than a structured data model. Whether the structured
model is worth the complexity depends on how multi-Cat orchestration
matures.

**Revised priority**: Medium — the architectural gap is largely closed;
the remaining difference is implementation depth.

---

### Gap 2: Agent Execution Loop with Stuck Detection

**Prior priority**: High
**Status**: Partially addressed

The `react` execution strategy provides a disciplined think → act loop
for API backends. cats-runtime also has execution guardrails (ADR-017)
for budget and rate-limit enforcement.

Still missing:

- Stuck detection (duplicate output tracking) — the specific behavioral
  guardrail that OpenManus provides
- Step limit enforcement at the runtime level for API backends
- Tool output truncation policy (OpenManus's `max_observe`)

**Revised priority**: Medium-High — the ReAct loop exists, but stuck
detection remains a real operational gap for API backends.

---

### Gap 3: Container-Level Execution Sandbox

**Prior priority**: Medium-High
**Status**: Still open

No container-based execution in cats-runtime. Workspace modes
(source/sandbox/worktree) control filesystem scope but not process
isolation. The workspace contract rework has not introduced a
`containerized` execution option.

Hermes Agent cross-reference: Hermes supports 6 terminal backends
including Docker and Modal (serverless containers), demonstrating that
container execution is table stakes for agent frameworks. OpenAB
cross-reference: OpenAB's Kubernetes deployment with PVC persistence
shows the cloud-native deployment pattern.

**Revised priority**: Medium — still relevant for untrusted code, but
less urgent for Cats Chat specifically.

---

### Gap 4: A2A Protocol as Inter-Node Standard

**Prior priority**: Medium (strategic)
**Status**: Significantly addressed

cats-runtime now has:

- ACP adapter (`src/backends/agent/adapters/acp/`) with AcpStdioClient
  and AcpAdapter
- Agent adapter registry for managing multiple agent backend types
- RuntimeAcpHostBridge for exposing cats-runtime itself over ACP
- Research alignment document (2026-04-15) clarifying ACP as agent
  transport vs runtime facade

The ACP work addresses the interoperability concern more directly than
A2A would. The 2026-04-15 research notes that ACP solves client-to-agent
(which is the immediate need) while A2A solves agent-to-agent (which
remains complementary but less urgent).

**Revised priority**: Low — the strategic interoperability gap is
substantially closed via ACP. A2A remains a future consideration for
runtime-to-runtime mesh communication.

---

### Gap 5: Multimodal Tool Feedback Loop

**Prior priority**: Medium
**Status**: Still open

Tool outputs in cats-runtime remain text-only. No tool result schema for
visual data, no screenshot → LLM feedback loop. This gap is unchanged
but remains more relevant to Cats Code than Cats Chat.

**Revised priority**: Medium — unchanged.

---

### Gap 6: Unified Tool Registry with Dynamic Discovery

**Prior priority**: Medium
**Status**: Partially addressed

cats-runtime's MCP facade and provider tooling have matured. The ACP
adapter profiles system (`src/backends/agent/adapters/acp/profiles.ts`)
adds another dimension to tool catalog management.

Still missing: a single unified registry that merges local tools, MCP
tools, ACP tools, and runtime-discovered tools into one catalog with
dynamic registration/removal.

**Revised priority**: Medium — the tool surface is growing but manageable
without a formal unified registry for now.

---

## Revised Consolidated Priority

### Tier 1 — High (remaining real gaps)

- **Stuck Detection** (Gap 2) — lightweight to implement, high
  operational value for API backends

### Tier 2 — Medium (worth tracking)

- **Structured Plan Step Tracking** (Gap 1) — the strategy substrate
  exists; structured step models are a depth improvement
- **Container Execution Sandbox** (Gap 3) — relevant for untrusted code
  scenarios
- **Multimodal Tool Feedback** (Gap 5) — relevant when browser/preview
  tools mature
- **Unified Tool Registry** (Gap 6) — relevant as MCP ecosystem grows

### Tier 3 — Low (largely addressed)

- **A2A/ACP Interoperability** (Gap 4) — substantially closed via ACP
  adapter work

## Bottom Line

The gap picture versus OpenManus has changed dramatically since March.
Three of six gaps are now significantly addressed (plan decomposition,
A2A interoperability) or partially addressed (stuck detection). The
cats-runtime gap audit was accurate: execution strategies are no longer
the largest gap.

The single most valuable remaining OpenManus-originated gap is **stuck
detection** — a lightweight behavioral guardrail that prevents API
backends from looping indefinitely. OpenManus implements this in under
100 lines of Python (duplicate output tracking + step counter).
Everything else is either addressed or lower priority for Cats Chat.

## References

- [2026-03-26 OpenManus Killer-Feature Gap Analysis](./2026-03-26-openmanus-killer-feature-gap-analysis.md)
- [OpenManus Reference Analysis](./2026-03-24-openmanus-reference-analysis.md)
- [cats-runtime Gap Audit](../../../cats-runtime/docs/research/2026-03-30-openclaw-paperclip-openmanus-gap-audit.md)
- [cats-runtime ACP Alignment](../../../cats-runtime/docs/research/2026-04-15-acp-agent-backend-and-runtime-facade-alignment.md)
- [cats-runtime Execution Strategy Architecture](../../../cats-runtime/docs/research/2026-03-26-pluggable-execution-strategy-architecture.md)

---

*Analysis completed: 2026-04-15*
*Author: Claude*
