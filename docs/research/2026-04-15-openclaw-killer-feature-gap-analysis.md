# OpenClaw Killer-Feature Gap Analysis for Cats Chat + cats-runtime (April Update)

## Metadata

- **Date**: 2026-04-15
- **Author**: Claude
- **Scope**: Cats Chat + cats-runtime only (excludes Cats Work and Cats Code)
- **Baseline**: local `openclaw/` submodule at commit `7f35f769`
  (v2026.4.14-225, openclaw/openclaw) updated on 2026-04-15
- **Prior version**: [2026-03-20 analysis](./2026-03-20-openclaw-killer-feature-gap-analysis.md)
  baselined against v2026.3.14
- **Comparison angle**: OpenClaw is a multi-channel AI agent gateway;
  Cats Chat's Boss Cat Telegram/LINE Channel is functionally the same
  problem space

## Purpose

This is a point-in-time refresh of the 2026-03-20 OpenClaw gap analysis.
The prior analysis identified 8 killer-feature gaps and a consolidated
priority list merging Paperclip findings. This update:

1. Re-baselines against OpenClaw v2026.4.14
2. Notes what changed in OpenClaw since v2026.3.14
3. Re-evaluates each gap against current Cats state (late April 2026)
4. Cross-references new hermes-agent submodule findings where relevant

## What Changed in OpenClaw Since v2026.3.14

The ~1 month of commits (March → April 2026) is predominantly
maintenance, security hardening, and QA infrastructure:

- **Memory**: LanceDB cloud storage support added to `memory-lancedb`
  plugin (#63502) — enables remote vector storage alongside local
- **Channels**: QQ Bot channel support added; BlueBubbles webhook replay
  after gateway restart (#66857)
- **Context engine**: graceful degradation on third-party plugin
  resolution failure (#66930)
- **Skills**: `discussion_comment` support in secret-scanning skill
  (#65628)
- **Security**: dist symlink escape rejection, dist inventory hardening,
  Telegram document binary sanitization to prevent prompt inflation
  (#66877), memory dreaming self-ingestion block (#66852)
- **UI**: Model Auth status card on Overview dashboard (#66211),
  multi-language control UI refreshes (12 languages)
- **QA**: extensive Matrix transport substrate and scenario coverage,
  agentic node test shard splitting
- **Build**: plugin SDK API baseline refresh, A2UI bundle hash narrowing,
  legacy migration trimming

No new killer features were introduced. The existing gap analysis remains
structurally valid.

## What Cats Already Has That OpenClaw Also Has

Updated from March analysis — items that have been further strengthened:

- Multi-provider support: cats-runtime now has 13+ CLI/API/Agent backends
  including ACP adapter (`src/backends/agent/adapters/acp/`)
- Local tool runtime: unchanged (list_files, read_file, write_file,
  edit_file, apply_patch, grep, glob, run_shell)
- Skills system: SPEC-005 with product-level profiles (SPEC-015, SPEC-019)
- Setup/diagnostics: ADR-014, SPEC-023 (packaged setup wizard shipped)
- Budget/metering: ADR-017/023, SPEC-010/025
- Workspace substrate: ADR-015, SPEC-008, workspaceKind rework landed
- Provider compatibility: SPEC-007
- ACP protocol support: cats-runtime now has `AcpAdapter`,
  `AcpStdioClient`, `RuntimeAcpHostBridge` — a significant closure since
  March
- Execution strategies: cats-runtime ships `simple_tool_call`, `react`,
  `plan_execute`, `pdca`, `reflexion`, `tree_of_thoughts`, `deps`

## Killer Feature Gaps — Status Update

### Gap 1: Transport Message Handling (Queue Modes and Chunking)

**Priority**: Critical for transport channels
**Status**: Still open

No change in Cats. OpenClaw's steer/followup/collect queue modes and
per-platform chunking remain unmatched. This gap becomes more urgent as
Telegram Boss Cat usage grows.

Hermes Agent cross-reference: Hermes also implements message interruption
(send a new message to redirect the agent mid-turn) and platform-aware
delivery, reinforcing that this is a solved pattern across competitors.

---

### Gap 2: Memory System with Semantic Search

**Priority**: Critical for long-term agent usefulness
**Status**: Partially addressed

Progress since March:

- Cats now has companion-box sidecar storage with canonical memory
  extraction and retrieval substrate
- Owner durable-memory CRUD operations are live
- Canonical memory extraction from transcripts is implemented

Still missing vs OpenClaw:

- Hybrid search (BM25 + vector semantic matching) — OpenClaw now also
  has LanceDB cloud storage support, widening the embedding infrastructure
  gap
- Multiple embedding provider support
- MMR diversity re-ranking and temporal decay
- Pre-compaction memory flush mechanism

Hermes Agent cross-reference: Hermes adds a novel memory context fencing
pattern (`<memory-context>` tags with system notes) that prevents the
model from treating recalled memory as user input. This is a lightweight
but important safety mechanism Cats should consider.

---

### Gap 3: DM Safety / Transport Access Control

**Priority**: High for transport channels
**Status**: Still open

No change in Cats. Pairing codes, allowlists, and group activation rules
remain absent. OpenClaw's dmPolicy system is still the reference
implementation.

---

### Gap 4: Agent-to-Agent Messaging Primitives

**Priority**: High for multi-Cat collaboration
**Status**: Partially addressed

Progress since March:

- cats-runtime's ACP adapter and Agent SDK bridge now provide
  inter-agent communication foundations
- Peer routing protocol (PLAN-017) work has advanced

Still missing: Cat-to-Cat in-session messaging tools (sessions_send
equivalent), session discovery from agent context.

---

### Gap 5: Session Compaction with Pre-Compaction Memory Flush

**Priority**: High
**Status**: Still open

No change in Cats. Session compaction and the pre-compaction memory flush
remain unimplemented. Depends on memory system (Gap 2) maturity.

---

### Gap 6: Prompt Caching / Cost Optimization

**Priority**: Medium-High
**Status**: Still open

No explicit prompt caching strategy in cats-runtime. Cache-aware context
assembly and cache hit/miss tracking remain absent.

---

### Gap 7: In-Chat Commands and Session Control

**Priority**: Medium
**Status**: Still open

No transport-native command system for Telegram/LINE. Hermes Agent
cross-reference: Hermes has a rich in-chat command set (/new, /reset,
/model, /compress, /usage, /skills, /retry, /undo, /status) available
across CLI and all messaging platforms — further validating this pattern.

---

### Gap 8: Multi-Channel Transport Architecture

**Priority**: Medium (strategic)
**Status**: Still open

No general-purpose transport abstraction in Cats. OpenClaw added QQ Bot
support since last analysis, now covering 26+ platforms.

---

## Revised Consolidated Gap Priority

### Tier 1 — Critical

- **Transport Message Handling** (Gap 1) — unchanged, still blocks
  quality Telegram experience
- **Memory with Semantic Search** (Gap 2) — partially addressed, but
  hybrid search and embedding infrastructure remain open

### Tier 2 — High

- **DM Safety / Transport Access Control** (Gap 3) — unchanged
- **Session Compaction + Pre-Compaction Flush** (Gap 5) — unchanged
- **Agent-to-Agent Messaging** (Gap 4) — partially addressed via ACP

### Tier 3 — Medium

- **Prompt Caching** (Gap 6) — unchanged
- **In-Chat Commands** (Gap 7) — unchanged
- **Transport Abstraction** (Gap 8) — unchanged

## Bottom Line

The gap picture versus OpenClaw has narrowed slightly since March —
primarily through ACP adapter work and companion-box memory — but the
core transport-experience gaps (queue modes, chunking, DM safety) and
the memory infrastructure gap (hybrid search, embeddings) remain the
most impactful open items.

OpenClaw's own evolution in this period was maintenance-focused, not
feature-expanding. The competitive distance is stable. The most
actionable next step remains the same: transport message handling and
memory system depth.

## References

- [2026-03-20 OpenClaw Killer-Feature Gap Analysis](./2026-03-20-openclaw-killer-feature-gap-analysis.md)
- [2026-04-15 Hermes Agent Killer-Feature Gap Analysis](./2026-04-15-hermes-agent-killer-feature-gap-analysis.md)
- [cats-runtime ACP Agent Backend Alignment](../../../cats-runtime/docs/research/2026-04-15-acp-agent-backend-and-runtime-facade-alignment.md)
- [cats-runtime Gap Audit](../../../cats-runtime/docs/research/2026-03-30-openclaw-paperclip-openmanus-gap-audit.md)

---

*Analysis completed: 2026-04-15*
*Author: Claude*
