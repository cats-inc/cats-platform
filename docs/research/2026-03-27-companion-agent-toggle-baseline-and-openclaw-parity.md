# Companion / Agent One-Click Toggle Research: Baseline Skill and Tool Set and Architecture Adjustments

## Metadata

- **Date**: 2026-03-27
- **Author**: Codex
- **Scope**: `Cats Chat` (product layer) + `cats-runtime` (execution layer) + `openclaw` submodule reference status
- **Goal**: Support a "dual persona with a one-click companion/agent toggle", with the `agent mode` agent capability benchmarked against OpenClaw's strongest current capability band
- **Related**:
  - [2026-03-20-openclaw-chat-runtime-gap-analysis](./2026-03-20-openclaw-chat-runtime-gap-analysis.md)
  - [2026-03-20-openclaw-killer-feature-gap-analysis](./2026-03-20-openclaw-killer-feature-gap-analysis.md)
  - [2026-03-26-companion-core-capabilities](./2026-03-26-companion-core-capabilities.md)

---

## 1) Current Progress Snapshot (cats / cats-runtime / openclaw)

### 1.1 `cats` (product layer)

`cats` is already a chat-first product shell and has completed:

- Using `cats-runtime` as the only execution boundary
- Parallel chat/work/code product trees
- Orchestrator execution-loop and operator loop (approval/reroute/retry)
- companion-box (sources, derived memory, response-profile, session-context)
- Cats-owned canonical memory/retrieval foundation

But it is still in "Launch Track In Progress":

- Chat still has gaps (for example deeper automation, group replan, escalation/takeover)
- Companion capabilities have a foundational data layer but are not yet a "one-click dual persona" product experience
- There is still no explicit companion ↔ agent mode switching contract (UI and runtime request contract)

### 1.2 `cats-runtime` (execution layer)

`cats-runtime` already has the key agent execution foundation:

- Three backend types: `cli + api + agent`
- Runtime-managed skills (including catalog, hydration, delivery mode)
- Local tool runtime (files/search/shell/patch, etc.)
- MCP facade (HTTP + stdio)
- Usage guardrail, diagnostics, session lifecycle

Of these, **Agent Backend = In Progress**, but the following have landed:

- OpenClaw gateway adapter (`openclaw_gateway`)
- A second validation target, the agent SDK bridge
- First-layer diagnostic hookup for OpenClaw health/model/tool catalog

What remains:

- Broader remote tool discovery
- More complete agent-target semantic probes
- Deeper semantic validation of tool capabilities and policy layering

### 1.3 `openclaw` submodule status (in this repo)

In this monorepo, `openclaw` is a registered submodule dependency (`.gitmodules` has path+url);
but the working tree currently shows uninitialized content (the root has only the folder and no checked-out files), meaning that in this repo's current state **the latest OpenClaw source cannot be compared locally**.

The OpenClaw benchmark baseline for this research is therefore:

1. The OpenClaw capability map already recorded in existing research documents
2. The OpenClaw adapter capabilities that `cats-runtime` has declared and implemented

> Conclusion: you can start with a "benchmark-level contract" now instead of being blocked by the submodule checkout state.

---

## 2) Goal Definition: What the Dual-Persona Toggle Must Solve Is Not the UI but a "Contract Switch"

The "companion/agent one-click toggle" you want has three layers in essence:

1. **Interaction Contract**
   - companion mode: relationship continuity, character feel, low interruption, conversation-leaning
   - agent mode: task completion, tool orientation, interruptible replanning, traceable governance

2. **Execution Contract**
   - The same Cat identity can switch between different runtime strategies / skill bundles / tool policies

3. **Governance Contract**
   - Which actions require owner approval
   - Which channels may execute automatically (especially transport)

A UI toggle alone will not reach OpenClaw level;
the toggle must be wired directly to the runtime request + skill/tool policy selection.

---

## 3) Baseline Skills and Tools (first a "usable agent", then the strongest)

Below is the suggested **MVP baseline (required)**, which gets agent mode to "reliable and usable";
build on top of it to reach OpenClaw parity.

### 3.1 Skills Baseline (runtime-managed skills)

#### A. `companion-core` (default)

- identity/style/presence instruction layer (tone, response length, interruption threshold)
- memory recall discipline (pull only the necessary memory, avoid over-tooling)
- transport-safe response formatting (short sentences, chunkable)

#### B. `agent-core` (main skill after toggling)

- task intake normalization (goal, constraints, definition of done)
- plan-execute-report loop (minimal traceable steps)
- blocked-state policy (report when escalation is needed, request reroute)
- retry-safe semantics (avoid repeated side effects)

#### C. `agent-openclaw-parity-pack` (benchmark pack)

Focused on OpenClaw's strengths:

- queue mode policy (steer/followup/collect equivalent semantics)
- transport chunking policy
- pre-compaction memory flush discipline
- cross-session subagent messaging policy
- exec approval + escalation protocol

### 3.2 Tools Baseline (runtime tool policy)

#### Required `standard` set

- `read_file`, `read_files`, `list_files`, `inspect_path`, `grep`, `glob`
- `run_shell` (restricted by policy)
- `apply_patch`, `write_file`, `edit_file` (need an approval gate)

#### Control-plane tools required for agents

- session inspect/observe
- provider diagnostics
- runtime skills catalog
- maintenance / compaction follow-through reporting

#### Added tool semantics for OpenClaw parity

- queue management controls (interrupt/queue/merge)
- transport delivery controls (chunk / coalesce / thread reply)
- subagent messaging primitives (list/send/history)
- memory flush trigger + durable note write primitives

---

## 4) Suggested Architecture for the One-Click Toggle (without breaking the existing layering)

### 4.1 `cats` product layer: add a mode contract (without changing the runtime boundary)

Add `personaMode` to `Cats Chat`:

- `companion`
- `agent`

and on every dispatch, send structured execution hints (rather than scattered prompts):

- `personaMode`
- `requestedSkillProfiles[]`
- `toolPolicyProfile` (read_only / standard / extended)
- `approvalPolicyRef`
- `transportPolicyRef`

> Key point: `cats` decides only "intent and policy" and does not hard-bind to provider or backend details.

### 4.2 `cats-runtime` execution layer: add a mode-aware policy resolver

Add a unified resolver on the runtime side:

- Input: session metadata + message request hints
- Output:
  - resolved skill bundles
  - resolved tool capability profile
  - execution strategy family
  - approval hooks requirement

This lets the same session switch behavior at turn level (protected by policy).

### 4.3 Agent Backend (OpenClaw adapter) hardening points

To benchmark against OpenClaw's strong agent capabilities, three things are suggested first:

1. **Remote tool catalog semantic map**
   - Not just listing tools, but mapping them to the runtime capability taxonomy
2. **Queue/interrupt semantics bridge**
   - Abstract OpenClaw queue mode into a runtime-neutral contract
3. **Session-memory lifecycle bridge**
   - Align pre-compaction flush with maintenance hooks

---

## 5) Suggested Phasing (pragmatic and deliverable)

### Phase 0 (can start this week)

- Define the `personaMode` request/response contract (Cats API + runtime metadata)
- Define the `agent-core` / `companion-core` skills baseline
- Establish three `toolPolicyProfile` tiers: `read_only`, `standard`, `extended`

### Phase 1 (first make a usable agent mode)

- Wire the one-click UI toggle to the contract above
- Agent mode defaults to `agent-core + standard tools + approval-required mutations`
- Add observability: inspectability of the skill/tool policy actually applied on each turn after a mode switch

### Phase 2 (OpenClaw parity, stage one)

- Land the queue mode (steer/followup/collect) runtime contract
- transport chunking / coalescing
- Automate pre-compaction memory flush

### Phase 3 (OpenClaw parity, stage two)

- subagent messaging primitives
- More complete remote tool semantic probes
- Full-chain escalation/takeover (including transport)

---

## 6) Risks and Safeguards

### 6.1 Main risks

- Only a UI toggle without a runtime policy resolver (becomes a fake switch)
- Agent mode tool permissions too broad, lacking an approval gate
- Companion mode polluted by the tone of agent tools, losing the companion experience

### 6.2 Safeguard design

- Default `companion => read_only/standard`, forbidding high-risk mutations
- `agent => standard` as the starting point; `extended` always requires explicit owner authorization
- All high-risk tool calls carry a `policy reason + approval trail`

---

## 7) Actionable Conclusion

If your goal is:

- One-click switching between companion/agent inside Cats Chat
- Agent mode still benchmarked against OpenClaw's strongest agent capabilities

then the shortest path is:

1. First turn the toggle into a "mode-aware execution contract"
2. Immediately create `companion-core` / `agent-core` / `agent-openclaw-parity-pack`
3. Add the mode-aware policy resolver + queue/memory lifecycle bridge in `cats-runtime`
4. Then gradually catch up with OpenClaw's maturity in queue/subagent/transport details

This path keeps the existing architectural principles:

- `cats` remains the product and governance layer
- `cats-runtime` remains the only execution boundary
- OpenClaw is absorbed as adapter capability, rather than binding the product back to external implementation details
