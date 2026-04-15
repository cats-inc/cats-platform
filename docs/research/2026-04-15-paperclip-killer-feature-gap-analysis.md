# Paperclip Killer-Feature Gap Analysis for Cats Chat + cats-runtime (April Update)

## Metadata

- **Date**: 2026-04-15
- **Author**: Claude
- **Scope**: `Cats Chat` + `cats-runtime` only
- **Explicit exclusions**: `Cats Work`-specific control-plane surfaces and
  `Cats Code`-specific IDE/developer surfaces
- **Baseline**: local `paperclip/` submodule at commit `7f893ac4`
  (@paperclipai/adapter-claude-local@0.3.1-1364) updated on 2026-04-15
- **Prior version**: [2026-03-20 analysis](./2026-03-20-paperclip-killer-feature-gap-analysis.md)

## Purpose

Point-in-time refresh of the 2026-03-20 Paperclip gap analysis. Paperclip
has seen significant development in the intervening month, particularly
around execution reliability, workspace workflows, and issue UX. This
update:

1. Re-baselines against the latest Paperclip commit
2. Documents new Paperclip features since March
3. Re-evaluates each killer feature against current Cats state
4. Notes where the gap has widened or narrowed

## What Changed in Paperclip Since March 2026

Key new work (from git log):

- **Execution reliability**: Hardened heartbeat and adapter runtime
  workflows, harness checkout conflict handling, linked worktree reuse
  for execution workspaces, auto-checkout scoped issue wakes
- **Codex fast mode**: Codex-local adapter now supports fast mode,
  with env probe safeguards to avoid fast mode during diagnostics
- **Worktree env bootstrap**: Dev runner worktree environment isolation,
  tightened workspace preflight, workspace link package preflight hooks
- **Issue workflow UX**: Issue thread markdown polish, issue-to-issue
  fast navigation, issue detail load stability, split regressions fixed,
  comment editor sync hardening
- **Routines system**: Draft routine defaults and run-time overrides —
  a new abstraction for recurring scheduled work beyond heartbeats
- **Inbox improvements**: Issue search with fallback, quicklook routing,
  inbox badge alignment, mobile nesting disabled
- **Tailnet bind presets**: Deployment setup with preconfigured bind
  strategies (learning from OpenClaw's networking/discovery docs)
- **Security**: Worktree tooling security docs, scoped import/approvals/
  activity/heartbeat route authorization
- **Dev tooling**: Plugin SDK prepared before CLI dev boot, workspace
  selector stability, server test isolation

## What Should Not Count as a New Gap

Same as March analysis — these areas have established Cats design
direction:

- Packaged setup and provider installation
- Provider compatibility and evidence capture
- Workspace substrate init/audit/update
- Budget policy vs runtime metering/rate-limit guardrails

## Killer Features — Status Update

### 1. Managed Local-Cat Enlistment

**Prior priority**: Highest
**Status**: Partially addressed, gap narrowing

Progress since March:

- Cats packaged setup wizard is shipped (SPEC-023)
- Provider setup helpers are bundled in desktop host
- Self-hosted CLI provider port matrix documented
- cats-runtime ACP adapter enables enlistment of ACP-compatible CLIs

Still missing vs Paperclip:

- End-to-end "Add Local Cat" product flow that takes a discovered CLI
  through diagnostics → binding → Cat identity creation
- Adapter-aware readiness probes (Paperclip now also has auto-checkout
  scoped issue wakes in the harness, further maturing their enlistment
  lifecycle)

The gap has narrowed but Paperclip's enlistment is still more integrated.
Paperclip's codex fast mode support shows continued investment in
adapter-specific optimizations that Cats has not matched.

---

### 2. Runtime-Managed Skills That Actually Execute

**Prior priority**: Highest
**Status**: Partially addressed

Progress since March:

- Skills system SPEC-005 direction is stable
- Product skill profiles (SPEC-019) defined
- Companion-core and agent-core skill baselines documented

Still missing:

- Skills materialized and injected into real execution sessions
- Adapter-aware skill delivery (tmpdir injection, runtime-home linking)
- Verification that skills were actually applied in a session

Paperclip continues to deliver skills into execution environments. The gap
is implementation, not design.

---

### 3. Chat-Native Run Inspector and Live Trace Surface

**Prior priority**: High
**Status**: Partially addressed

Progress since March:

- Cats now has live event tapes showing recent progress/text/tool
  milestones
- Runtime-backed live content block streaming is operational
- Stable block snapshots replace flat event lists

Still missing vs Paperclip:

- Unified inspector that shows: Cat state, wake reason, current/last run
  status, summarized result, log excerpt, preview/service/artifact links,
  session reset/retry/re-probe actions
- Paperclip has further polished their issue detail surfaces with
  load stability improvements, comment sync hardening, and split
  regression fixes — deepening their lead in operational visibility

---

### 4. Wakeup, Coalescing, and Session-Reset Semantics

**Prior priority**: High
**Status**: Partially addressed, gap widening on Paperclip's side

Progress since March:

- Cats sleep/wake product language (SPEC-016) is stable
- Live waiting indicators implemented in Chat

New on Paperclip's side:

- **Routines system**: Draft routine defaults with run-time overrides —
  Paperclip now has a scheduling abstraction beyond heartbeats, allowing
  recurring work to be defined declaratively with configurable behavior
- **Auto-checkout scoped issue wakes**: The harness now automatically
  checks out issues when waking for scoped work, tightening the
  wake → work → report cycle
- **Heartbeat runtime workflow hardening**: More reliable wake/execute
  cycle with adapter-specific runtime improvements

The gap has widened slightly because Paperclip's routines system adds
a new scheduling primitive that Cats has no equivalent for. Hermes Agent
cross-reference: Hermes also has built-in cron scheduling with natural
language jobs and platform delivery, further validating that runtime-level
scheduling is expected by the ecosystem.

---

### 5. Thin Extension Seam

**Prior priority**: Medium
**Status**: Still open

No significant change on either side. Cats continues to leave room for
MCP and extension seams without committing to a plugin SDK. Paperclip's
plugin story has not changed materially.

---

## New Gap: Execution Workspace Isolation

**Priority**: Medium-High (new)

Paperclip has invested heavily in execution workspace isolation since
March:

- Worktree env bootstrap with tightened isolation
- Linked worktree reuse for execution workspaces
- Workspace link preflight hooks scoped to linked worktrees
- Workspace preflight through server toolchain
- Worktree tooling and security documentation

Cats has workspace modes (source/sandbox/worktree) but lacks the
operational depth Paperclip now has in worktree lifecycle management.
This gap is more relevant to Cats Code than Cats Chat, but the pattern
applies wherever Cats execute code in isolated contexts.

## Revised Priority

### Tier 1 — Highest (core experience gaps)

- **Managed Local-Cat Enlistment** — narrowing but still the single
  biggest experiential gap
- **Runtime-Managed Skills** — implementation gap, design is ready

### Tier 2 — High (trust and operational quality)

- **Chat-Native Run Inspector** — Cats has live tapes, but lacks the
  unified inspector surface
- **Wakeup/Coalescing/Session-Reset** — gap widening due to Paperclip's
  routines system
- **Execution Workspace Isolation** (new) — Paperclip's worktree
  hardening sets a new bar

### Tier 3 — Medium

- **Thin Extension Seam** — unchanged

## Bottom Line

Compared to March, Cats has made real progress (packaged setup, live event
tapes, ACP adapter, companion memory) but Paperclip has also advanced
(routines, execution reliability, workspace isolation, codex fast mode).
The net gap has narrowed slightly for enlistment and run inspection, but
widened for scheduling/routines.

The single highest-value next step remains the same:

**Turn existing local CLIs into truly managed Local Cats.**

But the routines/scheduling gap is now the second-highest priority for
Chat, because Paperclip's routines system demonstrates that users expect
agents to wake and work on schedule, not just on demand.

## References

- [2026-03-20 Paperclip Killer-Feature Gap Analysis](./2026-03-20-paperclip-killer-feature-gap-analysis.md)
- [Paperclip Control-Plane Analysis](./2026-04-02-paperclip-control-plane-analysis.md)
- [cats-runtime Paperclip Gap Assessment](../../../cats-runtime/docs/research/2026-03-19-paperclip-gap-assessment.md)
- [cats-runtime Gap Audit](../../../cats-runtime/docs/research/2026-03-30-openclaw-paperclip-openmanus-gap-audit.md)
- [2026-04-15 Hermes Agent Gap Analysis](./2026-04-15-hermes-agent-killer-feature-gap-analysis.md)

---

*Analysis completed: 2026-04-15*
*Author: Claude*
