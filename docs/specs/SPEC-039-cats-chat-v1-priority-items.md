# SPEC-039: Cats Chat v1 Priority Items

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Draft |
| **Owner** | Codex |
| **Reviewer** | User |

## Summary

`Cats Chat` already has a real product substrate: chat-first IA, direct Cat
lanes, deterministic mention routing, operator-loop seams, Telegram Boss Cat
inbox MVP, companion-box storage, Cats-owned canonical memory, and a strong
`cats-runtime` execution boundary.

What it does **not** yet have is a frozen v1 priority order.

Based on the latest local `openclaw/` checkout
(`ab2ef7bbfc5c93e2fb7904efb51d10d9cc2fa5a7`,
`v2026.3.24-1174-gab2ef7bbfc`) and the current `cats` / `cats-runtime`
implementation state, this spec defines the first `Cats Chat` priority stack.

The main conclusion is:

- do **not** spend the next slice inventing more nouns
- do **not** borrow `Cats Work` or `Cats Code` concerns into Chat
- do finish the remaining productization work that makes Chat feel
  companion-first, transport-ready, and session-disciplined

## Baseline Snapshot

### OpenClaw latest reference state

The current local `openclaw/` submodule is already strong in the areas that
most directly pressure `Cats Chat`:

- production-grade Telegram transport behavior and command surfaces
- inbound queue modes (`collect`, `followup`, `steer`, `steer-backlog`)
- direct-message scope control and secure DM isolation rules
- session maintenance and explicit reset/cleanup discipline
- pre-compaction memory flush and durable memory layering
- subagent lifecycle with inspect / send / steer / kill semantics
- strong channel-facing troubleshooting and operator-facing controls

The most relevant local references re-checked for this spec were:

- `openclaw/README.md`
- `openclaw/CHANGELOG.md`
- `openclaw/docs/channels/telegram.md`
- `openclaw/docs/concepts/queue.md`
- `openclaw/docs/concepts/session.md`
- `openclaw/docs/concepts/memory.md`
- `openclaw/docs/concepts/compaction.md`
- `openclaw/docs/tools/subagents.md`

### `cats` already implemented

`cats` already has a substantial Chat baseline and should not pretend to be at
zero:

- chat-first IA with `Recents`, `My Cats`, and `Settings`
- default `Boss Cat`, direct Cat lanes, and topology-aware routing
- deterministic explicit `@mention` parsing and room-routing ownership
- solo-composer to Cat-led thread semantics
- transcript export and file-backed persistence
- operator-facing approvals, retry/reroute/acknowledge, progress, activity,
  traces, run inspection, and recovery read models
- Telegram Boss Cat inbox MVP with polling-first onboarding and durable
  room/private-lane routing
- per-Cat companion boxes, response profiles, and direct-session hydration
- Cats-owned canonical memory extraction, durable sync, retrieval context, and
  memory-flush seams
- live runtime event tapes and runtime-owned `content_block` rendering

### `cats-runtime` already implemented

`cats-runtime` is also no longer speculative:

- `cli`, `api/local`, and `agent` backend families
- OpenClaw Gateway as the first `agent` backend adapter
- runtime-managed skills with create/resume/fork re-entry
- worktree-backed session isolation and cleanup discipline
- usage metering, incident surfacing, and execution guardrails
- maintenance hooks, compaction preparation, and follow-through seams
- runtime-owned MCP facade
- provider capability truth and streamed `content_block` contracts

### Existing planning already in tree

This spec is a priority umbrella, not a replacement for existing detailed
documents. The most relevant current planning set is:

- companion direction:
  - [ADR-030](../decisions/030-own-per-cat-companion-boxes-in-product-and-hydrate-runtime-sessions.md)
  - [ADR-040](../decisions/040-make-companion-a-first-class-chat-mode-with-workspace-and-presence.md)
  - [SPEC-029](./SPEC-029-companion-boxes-ingestion-and-response-profiles.md)
  - [SPEC-031](./SPEC-031-built-in-memory-extraction-durable-sync-and-retrieval-context.md)
  - [SPEC-036](./SPEC-036-companion-workspace-presence-and-settings.md)
  - [PLAN-025](../plans/PLAN-025-companion-workspace-presence-and-settings.md)
- routing and thread semantics:
  - [ADR-017](../decisions/017-allow-direct-cat-chat-and-move-routing-into-system-layer.md)
  - [ADR-024](../decisions/024-separate-explicit-mentions-from-dynamic-room-workflow.md)
  - [ADR-027](../decisions/027-adopt-chat-first-information-architecture-with-default-boss-cat.md)
  - [ADR-031](../decisions/031-separate-composer-lead-control-from-boss-orchestration-authority.md)
  - [ADR-042](../decisions/042-separate-channel-topology-from-routing-mode.md)
  - [SPEC-018](./SPEC-018-direct-cat-chat-and-conversation-routing-layer.md)
  - [SPEC-026](./SPEC-026-explicit-mentions-and-dynamic-room-workflow-orchestration.md)
  - [SPEC-027](./SPEC-027-chat-first-information-architecture-and-default-boss-cat.md)
  - [SPEC-030](./SPEC-030-composer-scoped-lead-cat-and-boss-auto-helper-semantics.md)
  - [PLAN-016](../plans/PLAN-016-dynamic-room-workflow-orchestration.md)
- transport/live-update direction:
  - [ADR-041](../decisions/041-push-transport-and-chat-invalidations-over-sse.md)
  - [SPEC-037](./SPEC-037-transport-driven-live-chat-updates-and-private-lane-transition.md)
  - [SPEC-038](./SPEC-038-telegram-bot-commands-and-transport-control-surface.md)
  - [PLAN-026](../plans/PLAN-026-transport-live-updates-and-private-lane-transition.md)
- runtime support seams:
  - [cats-runtime SPEC-003](../../../cats-runtime/docs/specs/SPEC-003-agent-backend.md)
  - [cats-runtime SPEC-005](../../../cats-runtime/docs/specs/SPEC-005-runtime-managed-skills-v0.md)
  - [cats-runtime SPEC-010](../../../cats-runtime/docs/specs/SPEC-010-usage-metering-rate-limit-detection-and-execution-guardrails.md)
  - [cats-runtime PLAN-004](../../../cats-runtime/docs/plans/PLAN-004-agent-backend.md)
  - [cats-runtime PLAN-012](../../../cats-runtime/docs/plans/PLAN-012-session-maintenance-hooks-and-cleanup-discipline.md)

## Goals

- freeze a practical v1 priority order for `Cats Chat`
- build on already-landed substrate instead of re-opening solved boundaries
- prioritize the product gaps where OpenClaw currently feels more mature
- keep `Cats Chat` distinct from `Cats Work` and `Cats Code`
- define what should ship first, what should follow, and what should stay out
  of scope for the first Chat promise

## Non-Goals

- redefining `cats-runtime` as the product owner of memory, transport policy,
  or companion state
- shipping `Cats Work` team templates or `Cats Code` builder loops as Chat work
- full autonomous scheduler or heartbeat-driven workflow orchestration
- LINE parity in the same first slice
- a giant marketplace or plugin-discovery UX in Chat v1
- replacing existing detailed specs with one giant implementation plan

## Core Thesis

`Cats Chat v1` should ship around **three product promises**:

1. one persistent companion that feels like a being, not a prompt preset
2. one transport-ready private-lane experience that feels reliable on Telegram
3. one trustworthy multi-Cat chat loop that stays understandable in a personal
   assistant product

Everything else is secondary until those three promises feel coherent.

## Priority Order

### Priority 1: Visible Companion Mode

This is the highest-value Chat differentiator and the most obvious gap between
the current substrate and the intended product.

The first visible companion slice shall:

1. productize companion as a first-class Chat mode above direct Cat chat
2. implement the visible companion workspace from [SPEC-036](./SPEC-036-companion-workspace-presence-and-settings.md):
   - `Overview`
   - `Resources`
   - `Creations`
   - `Settings`
3. expose product-owned presence and behavior controls at minimum for:
   - `awake`
   - `sleeping`
   - `verbal`
   - `vocalization`
4. make companion settings discoverable and coherent in one mode-owned surface,
   not scattered generic registry panels
5. expose memory highlights and a memory-management entry point from companion
   surfaces
6. keep companion ownership inside `cats`:
   - identity
   - response profile
   - resources
   - creations index
   - presence
   - transport binding

Why first:

- this is how `Cats Chat` becomes more than "chat with agent presets"
- the storage and hydration substrate is already landed
- the missing work is now mostly visible productization, not deep boundary
  invention

### Priority 2: Telegram and Private-Lane Product Maturity

The Telegram/Boss Cat seam is already functional. It is not yet mature enough
to feel trustworthy in daily use.

The first transport-maturity slice shall:

1. land the product-owned SSE invalidation seam and private-lane promotion from
   [SPEC-037](./SPEC-037-transport-driven-live-chat-updates-and-private-lane-transition.md)
2. land the first Telegram command/control surface from
   [SPEC-038](./SPEC-038-telegram-bot-commands-and-transport-control-surface.md)
3. define a first transport queue policy for messages that arrive while a Cat
   is already running:
   - default first-slice behavior should favor `collect`
   - the contract should reserve room for later `followup` and `steer`
4. define transport-safe reply chunking for Telegram-sized outputs:
   - split at safe natural boundaries
   - preserve formatting as far as possible
   - avoid mid-word and mid-structure truncation
5. keep transport control and transport diagnostics product-owned in `cats`
   rather than treating Telegram like a raw transcript mirror

Why second:

- OpenClaw is already better here in ways users notice immediately
- the current Cats transport seam is real enough to deserve production-grade
  polish
- this slice directly improves both companion and Boss Cat usage

### Priority 3: Session and Memory Discipline

`cats` and `cats-runtime` already have many of the right pieces, but the Chat
product still needs one coherent user-facing lifecycle story.

This slice shall:

1. freeze how session scope works across:
   - `Recents` solo or Cat-led threads
   - direct Cat lanes
   - Telegram-bound private lanes
2. define when Chat should preserve continuity versus reset context
3. consume runtime maintenance and compaction-preparation seams intentionally
   instead of leaving them as internal-only capability
4. ensure pre-reset, pre-compaction, and delete-adjacent memory flush behavior
   uses the existing Cats-owned canonical memory pipeline
5. keep provider/runtime continuity as auxiliary, with durable product memory
   remaining canonical

Why third:

- OpenClaw's queue/session/compaction discipline is one of its strongest
  practical advantages
- `cats-runtime` already exposes the right maintenance hooks and session
  lifecycle seams
- without this slice, long-running Chat usage will feel less dependable than
  the product promise suggests

### Priority 4: Lightweight Specialist-Cat Operations Inside Chat

`Cats Chat` should not become `Cats Work`, but it does need a cleaner
multi-Cat lifecycle than "wait and hope the invisible orchestration worked."

This slice shall:

1. build on the already-landed operator loop, recovery routes, and room
   workflow substrate
2. keep transcript as the primary surface, with operator state as on-demand
   secondary detail
3. expose clear status for:
   - active Cat(s)
   - blocked Cat(s)
   - waiting-for-review or waiting-for-target conditions
4. support lightweight inspect / retry / reroute / resume flows that fit
   personal-assistant chat rather than a heavy work dashboard
5. defer deeper review-gate and team-template behavior to `Cats Work`

Why fourth:

- this uses real landed substrate instead of inventing another orchestration
  layer
- it protects the multi-Cat value proposition without turning Chat into an ops
  console

### Priority 5: Spatial and Interaction Polish

Once the four priorities above are real, the next layer should improve how Chat
feels rather than expanding its domain.

This polish bucket should focus on:

1. the secondary-surface framework from the spatial-layout guidance
2. split artifact / preview behavior where it helps Chat, not Code
3. cleaner transcript-side operator indicators and companion quick controls
4. layout consistency across solo, direct-lane, companion, and multi-Cat room
   modes

This is important, but it is intentionally lower priority than companion,
transport, and session discipline.

## Requirements

### Functional Requirements

1. `Cats Chat v1` shall prioritize companion productization, Telegram/private-
   lane maturity, session/memory discipline, and lightweight specialist-cat
   operations in that order.
2. `Cats Chat v1` shall preserve the existing product/runtime boundary:
   long-lived companion identity, transport policy, and canonical memory remain
   product-owned in `cats`.
3. The v1 scope shall reuse already-landed `cats-runtime` seams for:
   - skills
   - maintenance hooks
   - agent backend execution
   - metering and guardrails
   - event capability truth
4. The v1 scope shall not require `Cats Work` or `Cats Code` surfaces in order
   to deliver Chat value.
5. The v1 scope shall treat transport behavior as first-class product behavior,
   not as a best-effort relay detail.
6. The v1 scope shall keep direct-lane and companion continuity compatible with
   the existing topology split (`channelKind`) and routing rules.
7. The v1 scope shall keep the main chat canvas transcript-first, with heavier
   operator or settings detail moved into secondary surfaces.

### Non-Functional Requirements

- **Continuity**: the same Cat should feel persistent across sessions and
  transports
- **Legibility**: routing, presence, and transport actions should remain easy
  to reason about for a home-user Chat product
- **Boundary integrity**: `cats-runtime` remains the execution boundary, not
  the long-lived product store
- **Incrementality**: v1 priorities should build on the current substrate
  rather than require a second architecture reset

## Success Criteria

`Cats Chat v1` should feel ready when all of the following are true:

1. A user can treat one Cat as a real companion with visible presence,
   resources, creations, settings, and memory-aware continuity.
2. A Telegram-bound Cat can be used day to day without stale web UI, confusing
   command handling, or brittle long-message behavior.
3. Long-running chats preserve continuity intentionally across reset,
   compaction, and memory flush boundaries.
4. Multi-Cat help feels inspectable and dependable without requiring the user
   to leave Chat for Work-style control surfaces.

## Open Questions

- [ ] Should the first transport queue slice support only `collect`, or ship
      `collect + followup` together?
- [ ] For later non-Telegram transports, should the current platform-layer
      reply chunking helper be generalized into a shared transport formatter
      seam?
- [ ] Should companion dashboard open as a dedicated split workspace first, or
      as a transcript-adjacent secondary surface that can later expand?
- [ ] Which lightweight specialist-cat controls belong in Chat v1 itself, and
      which should remain inspect-only until later Work follow-through?

## References

- [OpenClaw Killer-Feature Gap Analysis for Cats Chat + cats-runtime](../research/2026-03-20-openclaw-killer-feature-gap-analysis.md)
- [OpenClaw Gap Analysis for Cats Chat + cats-runtime](../research/2026-03-20-openclaw-chat-runtime-gap-analysis.md)
- [OpenClaw Memory Layering Benchmark](../research/2026-03-19-openclaw-memory-layering-benchmark.md)
- [Companion / Agent 一鍵切換研究：Baseline 技能工具組與架構調整](../research/2026-03-27-companion-agent-toggle-baseline-and-openclaw-parity.md)
- [Cats Product Lines: Chat, Work, and Code](../research/2026-03-20-cats-product-lines-chat-work-code.md)
- [Codex View: Cats Chat, Cats Work, and Cats Code Product Boundaries](../research/2026-03-20-codex-cats-chat-work-code-product-boundaries.md)

---

*Created: 2026-03-29*
*Author: Codex*
*Related Plan: [PLAN-027](../plans/PLAN-027-cats-chat-v1-priority-items.md)*
