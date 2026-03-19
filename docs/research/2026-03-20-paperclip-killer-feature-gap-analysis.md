# Paperclip Killer Feature Gap Analysis for Cats Chat + Runtime

## Metadata

- **Date**: 2026-03-20
- **Author**: Claude
- **Scope**: Cats Chat + Cats Runtime only (excludes Cats Work and Cats Code specific features)
- **Baseline**: Paperclip v2026.318.0 (master, latest as of 2026-03-20)
- **Context**: Following a full session of spec/ADR authoring that addressed setup wizard, provider compatibility, workspace substrate, delivery policy, and budget/metering. This document captures the remaining killer feature gaps.

## Purpose

Identify Paperclip capabilities that Cats Chat and Cats Runtime still lack,
focusing on features that are critical for the core product vision: multi-Cat
autonomous collaboration under Boss Cat coordination with human-in-the-loop
governance.

Features exclusive to a Cats Work dashboard or Cats Code IDE experience are
excluded from this analysis.

## Already Addressed (2026-03-20 Session)

The following Paperclip-comparable concerns were addressed in today's
spec/ADR session and are **not** gaps anymore at the design level:

- **Provider compatibility and evidence engine** — SPEC-007, integrated with SPEC-007 error categorization and provider knowledge base
- **Setup wizard and packaged install** — ADR-021 (cats-inc), SPEC-023
- **Provider install metadata in manifests** — ADR-013 (cats-runtime)
- **Lightweight runtime setup and diagnostics** — ADR-014 (cats-runtime)
- **Workspace substrate tools** — ADR-015 (cats-runtime), SPEC-008
- **Delivery policy and governance levels** — ADR-022 (cats-inc), SPEC-024, ADR-016 (cats-runtime)
- **Budget policy and cost control** — ADR-023 (cats-inc), SPEC-025
- **Usage metering and rate-limit guardrails** — ADR-017 (cats-runtime), SPEC-010

These are designed but not implemented. Implementation remains future work.

## Previously Addressed (Pre-2026-03-20)

- **Multi-adapter/provider support** — cats-runtime supports 11 CLI providers + API + Agent backends
- **A2A/AAIF three-layer model** — ADR-010 (cats-runtime), SPEC-006
- **Runtime-managed skills** — SPEC-005 (cats-runtime)
- **Boss Cat / Primary Orchestrator** — ADR-011 (cats-inc), SPEC-011
- **Cat capability registry and skill profiles** — SPEC-015, SPEC-019 (cats-inc)
- **Telegram/LINE transport inbox** — ADR-016 (cats-inc)
- **Sleep/wake lifecycle** — ADR-015 (cats-inc)
- **Memory layering** — ADR-012 (cats-runtime)

---

## Remaining Killer Feature Gaps

### Gap 1: Heartbeat / Scheduled Agent Wakeup

**Priority**: Critical — blocks autonomous multi-Cat collaboration

**What Paperclip has**:

- Heartbeat system with scheduled agent wakeups (timer, assignment,
  on_demand, automation triggers)
- Each heartbeat run carries full invocation context: wake reason,
  task/comment/approval identifiers, workspace context, session handoff
  metadata
- Heartbeat run logs with structured output, exit codes, token usage, and
  context snapshots
- Session preservation across heartbeats (sessionIdBefore / sessionIdAfter)
- Configurable heartbeat schedule per agent
- Max turns per heartbeat run to bound execution cost

**What Cats has**:

- Request/response session model only
- cats-inc ADR-015 defines sleep/wake lifecycle as a UI-layer concept
- cats-runtime gap assessment (2026-03-19) lists heartbeat/scheduler as
  the second critical enabling gap for autonomous platforms
- cats-runtime SPEC-003 (agent backend) defines AgentInvocationContext with
  optional taskId, issueId, approvalId — partial foundation exists

**What is missing**:

- Runtime-level scheduled wakeup mechanism
- Invocation context contract that carries wake reason and pending work
  references
- Run lifecycle (start → execute → capture results → persist state → sleep)
- Bounded execution (max turns, max duration, max cost per run)
- Run result capture and structured storage

**Why it matters for Cats Chat**:

Without heartbeat, Boss Cat can assign work to specialist Cats, but those
Cats can only act while the human is actively in the app. The moment the
user closes the app or switches channels, all Cats stop. The core value
proposition of "hire Cats to work for you" requires Cats that can wake up,
do work, and report back without constant human presence.

**Relationship to existing specs**:

- Should build on SPEC-003 invocation context
- Should integrate with SPEC-010 metering (bounded execution cost per run)
- Should integrate with SPEC-007 compatibility engine (adapter-aware run
  behavior)
- Should feed activity/audit trail (Gap 4)

---

### Gap 2: Approval Workflow

**Priority**: Critical — blocks safe autonomous operation

**What Paperclip has**:

- Full approval gate system: agents request approval, human decides
- Approval statuses: pending, approved, rejected, revision_requested
- Approval comments and decision notes with audit trail
- Approval-issue linking (approvals tied to specific work items)
- Approval inbox UI with unread tracking
- Board governance: pause/resume agents, override decisions, full control
- Multiple approval types: agent hire, strategic decisions, budget changes,
  configuration changes

**What Cats has**:

- cats-inc terminology defines "Approval loop", "Escalation", "Takeover"
  as product concepts
- cats-inc CLAUDE.md describes escalation scenarios (Telegram stakeholder
  channel, owner escalation)
- PLAN-005 Phase 3 mentions governance actions and approval control points
- No spec or ADR defines the actual approval mechanism

**What is missing**:

- Approval request/response contract
- Approval state machine (pending → approved/rejected/revision_requested)
- Approval persistence and audit trail
- Integration with Boss Cat routing (when should approval be requested?)
- Integration with budget policy (SPEC-025 mentions approval for budget
  override but doesn't define the underlying approval system)
- Integration with delivery policy (SPEC-024 mentions manual_review_required
  but doesn't define how review approval works)

**Why it matters for Cats Chat**:

Multi-Cat collaboration without approval gates has two failure modes:
fully manual (human reviews everything, defeating the purpose) or fully
autonomous (Cats act without checks, risking bad outcomes). Approval is
the mechanism that lets Cats be autonomous within bounds — they work
independently until they hit a decision that needs human judgment.

This is also a prerequisite for several already-designed features:
- SPEC-025 budget override flows reference approvals
- SPEC-024 delivery policy references manual_review_required
- SPEC-008 workspace substrate update references approval gates
- Boss Cat's escalation and takeover flows need an approval substrate

---

### Gap 3: Session Compaction / Context Management

**Priority**: High — affects core chat experience quality

**What Paperclip has**:

- Adapter-aware session compaction with per-adapter policies:
  - Claude Code, Codex: maxSessionRuns: 0 (adapter handles internally)
  - Others: maxSessionRuns: 200, maxRawInputTokens: 2M,
    maxSessionAgeHours: 72
- Threshold-based rotation: when limits are hit, session is rotated
  (new session created, old session archived)
- Context snapshots stored per run for audit and replay

**What Cats has**:

- cats-runtime has session lifecycle (create, resume, fork, close)
- Session resume with provider-native continuity tokens
- No compaction strategy or automatic rotation
- No adapter-aware policy differentiation
- PLAN-003 open follow-up: "Decide whether transcript compaction /
  summarization should be provider specific or runtime generic"

**What is missing**:

- Compaction policy model (per-adapter or per-backend thresholds)
- Automatic session rotation when limits are hit
- Session history archival before rotation
- Summarization or carry-forward of critical context across rotations
- Integration with metering (SPEC-010) for token-based thresholds

**Why it matters for Cats Chat**:

Chat is the primary product surface. Long conversations will hit provider
context limits. Without compaction:
- Session fails hard when context limit is reached
- User must manually start new chats and re-explain context
- Cost increases as full history is replayed on every message

This directly affects the core user experience of Cats Chat more than
almost any other gap.

---

### Gap 4: Activity Log / Structured Audit Trail

**Priority**: High — enables observability for multi-Cat operation

**What Paperclip has**:

- Immutable activity log with:
  - Actor tracking (system, board, agent)
  - Action type (create, update, delete, etc.)
  - Entity type and ID
  - Run ID correlation
  - Detailed metadata (JSONB)
  - Timestamps
- Indexed queries by company, run, or entity
- UI: /activity page with filters
- Integration with inbox (unread tracking, recent activity mix)

**What Cats has**:

- Per-channel message transcript (conversation history)
- cats-inc ADR-011 separates transcript from orchestration trace
- SPEC-011 mentions Activity/Trace side panel for orchestration runs
- No cross-channel, cross-Cat structured activity model
- No structured event capture beyond chat messages

**What is missing**:

- Structured activity event model (actor, action, entity, metadata)
- Cross-channel activity aggregation
- Run/session correlation (which activity came from which execution)
- Event capture for non-chat actions (file changes, tool calls, approvals,
  budget events, workspace substrate changes)
- API surface for activity queries

**Why it matters for Cats Chat**:

When multiple Cats are working across multiple channels and workspaces,
the owner needs one place to understand what happened. Reading every chat
transcript is not viable. A structured activity log also becomes the
foundation for:
- Future Cats Work war-room dashboard
- Budget alert investigation ("why did spending spike?")
- Approval audit ("who approved what and when?")
- Debugging ("which Cat changed that file and why?")

Starting to capture activity events now, even before the full dashboard
exists, prevents data loss that can't be recovered retroactively.

---

### Gap 5: Cross-Session State Continuity

**Priority**: Medium — needed for multi-session autonomous work

**What Paperclip has**:

- Session state persists across heartbeat runs:
  - sessionIdBefore / sessionIdAfter tracking
  - Context snapshot (JSONB) stored per run
  - Session resume across runs with adapter-aware policies
- Agents maintain working memory across multiple wake/sleep cycles

**What Cats has**:

- cats-runtime session resume mechanism exists
- Provider-native continuity tokens are subordinate to runtime session
  identity (established in runtime contracts)
- ADR-012 defines memory layering (evidence, durable memory, retrieval)
- No structured cross-session state tracking beyond provider-native resume

**What is missing**:

- Structured run state capture (what was the Cat working on, where did it
  stop, what needs to happen next)
- Cross-session context carry-forward beyond provider-native resume tokens
- Integration with heartbeat system (Gap 1) for session handoff
- Working memory persistence that survives session rotation (Gap 3)

**Why it matters for Cats Chat**:

A Cat assigned a multi-step task (e.g., "research competitors and write a
report") may need multiple sessions across hours or days. Without cross-
session state, each new session starts from scratch — the Cat re-reads
files, re-discovers context, and may redo work. With heartbeat (Gap 1) and
session compaction (Gap 3), this becomes even more important: when a session
is rotated, the Cat needs to know what it was doing.

---

### Gap 6: Skill Injection Mechanism

**Priority**: Medium — needed to make runtime-managed skills operational

**What Paperclip has**:

- Before each heartbeat run, Paperclip injects skill files into adapter-
  specific directories (~/.paperclip/skills/ or equivalent)
- Skills include project/goal context, task details, collaboration rules
- Sensitive paths and identities are redacted before injection
- Skills are session-scoped (available during run, not permanent)

**What Cats has**:

- SPEC-005 defines runtime-managed skills conceptually:
  - SkillCatalogService, SkillResolver, SkillMaterializer
  - Three delivery modes: filesystem, instructions, none
  - Validation bar for skill packages
- No implementation of the actual injection/delivery mechanism
- No adapter-specific injection path mapping

**What is missing**:

- Concrete injection implementation per delivery mode:
  - filesystem: write to adapter-discoverable path before session
  - instructions: compile into session system prompt
  - none: warn and degrade
- Adapter-specific discovery path mapping (where does each CLI look for
  skills?)
- Skill cleanup after session ends
- Redaction of sensitive content before injection
- Integration with product skill profiles (SPEC-019) for determining which
  skills to inject

**Why it matters for Cats Chat**:

Skills are how Cats learn task-specific behavior beyond their base
capabilities. Without injection, the skill system defined in SPEC-005 is
design-only — Cats can't actually use workspace-bootstrap skills, coordinator
skills, or any other specialized behavior at runtime.

---

## Features Explicitly Excluded (Cats Work / Cats Code Territory)

The following Paperclip capabilities were evaluated and intentionally excluded
from this gap analysis because they belong to future Cats Work or Cats Code
product lines:

- Multi-company management and data isolation
- Organization chart and agent hierarchy visualization
- Goal hierarchy and strategic objective tracking
- Issue/task management system (kanban, status tracking, labels)
- Execution workspace worktree isolation
- Work product tracking (PRs, documents, artifacts)
- Plugin SDK and extension framework (scheduled jobs, webhooks, UI slots)
- Company logos and branding
- Full cost dashboard with provider/biller breakdown
- Configuration revisioning with rollback

These may be revisited when Cats Work or Cats Code scoping begins.

---

## Recommended Priority Order

If only three gaps can be addressed next:

1. **Heartbeat / Scheduler** — without this, autonomous multi-Cat
   collaboration is not possible
2. **Approval Workflow** — without this, autonomous operation is unsafe
3. **Session Compaction** — without this, core chat experience degrades
   on long conversations

The remaining three (activity log, cross-session state, skill injection)
should follow, with activity log being the most important of the three
because it becomes harder to backfill the longer it's delayed.

---

## Relationship to Existing Architecture

All six gaps fit within the established Cats architecture without requiring
structural changes:

- **Heartbeat / Scheduler**: cats-runtime owns execution; heartbeat is a
  runtime capability. Product layer (cats-inc) decides scheduling policy.
- **Approval Workflow**: cats-inc owns governance policy; runtime provides
  execution pause/resume primitives.
- **Session Compaction**: cats-runtime owns session lifecycle; compaction is
  a session management concern.
- **Activity Log**: runtime captures execution events; product aggregates
  and presents them.
- **Cross-Session State**: runtime owns session identity and resume;
  state persistence extends existing session contracts.
- **Skill Injection**: runtime owns skill delivery (SPEC-005); injection
  implements the delivery modes already defined.

The intent/delivery split pattern established today (product owns policy,
runtime owns primitives) applies consistently across all six gaps.

---

*Analysis completed: 2026-03-20*
*Author: Claude*
*Related documents*:
- [Paperclip Control-Plane Analysis](./paperclip-control-plane-analysis.md)
- [cats-runtime Paperclip Gap Assessment](../../../cats-runtime/docs/research/2026-03-19-paperclip-gap-assessment.md)
- [cats-runtime Paperclip/OpenClaw/Pi Alignment](../../../cats-runtime/docs/research/2026-03-17-paperclip-openclaw-pi-alignment.md)
