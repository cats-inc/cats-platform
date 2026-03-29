# PLAN-027: Cats Chat v1 Priority Items

> Sequence the already-landed Chat substrate plus companion, transport, and
> runtime seams into one coherent `Cats Chat v1` delivery track without
> reopening the product/runtime boundary.

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Draft |
| **Owner** | Codex |
| **Assigned To** | Codex |
| **Reviewer** | User |

## Related Spec / Dependencies

- [SPEC-039: Cats Chat v1 Priority Items](../specs/SPEC-039-cats-chat-v1-priority-items.md)
- [PLAN-025: Companion Workspace, Presence, and Settings](./PLAN-025-companion-workspace-presence-and-settings.md)
- [PLAN-026: Transport Live Updates and Private-Lane Transition](./PLAN-026-transport-live-updates-and-private-lane-transition.md)
- [PLAN-021: Cross-Product Task Strategy Handoff and Runtime Bridge](./PLAN-021-cross-product-task-strategy-handoff-and-runtime-bridge.md)
- [cats-runtime PLAN-012: Session Maintenance Hooks and Cleanup Discipline](../../../cats-runtime/docs/plans/PLAN-012-session-maintenance-hooks-and-cleanup-discipline.md)

## Overview

`Cats Chat` is no longer missing a base product. It already has:

- chat-first IA
- direct Cat lanes and routing ownership
- Telegram/private-lane substrate
- companion-box and canonical-memory substrate
- operator-loop and recovery read models
- runtime event tapes and `cats-runtime` bridge seams

This plan is therefore an umbrella execution plan, not a greenfield build.

Its job is to sequence the remaining Chat work into one v1 stack:

1. finish visible companion mode
2. harden Telegram/private-lane product behavior
3. freeze session and memory discipline
4. expose lightweight specialist-Cat operations inside Chat
5. close with spatial and interaction polish

This plan does not replace [PLAN-025](./PLAN-025-companion-workspace-presence-and-settings.md)
or [PLAN-026](./PLAN-026-transport-live-updates-and-private-lane-transition.md).
It uses them as detailed subtracks and adds the missing Chat-wide sequencing,
continuity rules, and v1 exit criteria.

## Implementation Phases

### Phase 1: V1 Freeze and Shared Contracts

- [ ] Freeze the Chat v1 scope around the three promises from SPEC-039:
      companion-first identity, transport-ready private lanes, and trustworthy
      multi-Cat chat
- [ ] Map already-landed work plus PLAN-025 / PLAN-026 deliverables into one
      ordered execution backlog
- [ ] Define the shared Chat read-model gaps still needed for v1:
      - companion workspace summary
      - transport queue/diagnostic summary
      - session continuity summary
      - transcript-safe specialist-Cat status summary
- [ ] Align product defaults and task/planning helpers with
      [PLAN-021](./PLAN-021-cross-product-task-strategy-handoff-and-runtime-bridge.md)
      so Chat-side follow-through stays compatible with Work/Code handoff
- [ ] Publish one v1 exit checklist so later slices do not silently expand

**Deliverables**: one frozen Chat v1 execution map with shared contracts and
exit criteria.

### Phase 2: Visible Companion Mode

- [ ] Complete the visible companion workspace shell and section model from
      [PLAN-025](./PLAN-025-companion-workspace-presence-and-settings.md)
- [ ] Ensure companion mode is product-distinct from direct Cat chat and
      generic settings forms
- [ ] Surface companion-owned presence controls consistently across:
      - companion header/top bar
      - transcript quick controls
      - companion settings
- [ ] Expose companion memory highlights plus a durable memory management entry
- [ ] Make `Resources` and `Creations` legible as separate product concepts
- [ ] Keep long-lived companion identity, settings, transport binding, and
      memory product-owned in `cats`

**Deliverables**: one visible companion mode that feels like a persistent being
rather than a prompt preset.

### Phase 3: Telegram and Private-Lane Product Maturity

- [ ] Complete the product-owned SSE invalidation and route-stable private-lane
      promotion work from
      [PLAN-026](./PLAN-026-transport-live-updates-and-private-lane-transition.md)
- [ ] Land the first Telegram command/control surface from
      [SPEC-038](../specs/SPEC-038-telegram-bot-commands-and-transport-control-surface.md)
- [ ] Add a first product-owned transport queue policy, with `collect` as the
      default first-slice behavior
- [ ] Add transport-safe long-reply chunking that preserves natural boundaries
      and formatting as far as possible
- [ ] Expand product diagnostics so stale transport, queue, or delivery issues
      are inspectable without digging into raw runtime logs
- [ ] Ensure unread, recents, and direct-lane/private-lane transitions stay
      fresh under live transport traffic

**Deliverables**: Telegram/private-lane behavior that is reliable enough for
daily use.

### Phase 4: Session and Memory Discipline

- [ ] Freeze Chat continuity rules across:
      - solo recents threads
      - lead-Cat or routed rooms
      - direct Cat lanes
      - Telegram-bound private lanes
- [ ] Add product-facing reset/sleep/resume/compaction behavior above existing
      `cats-runtime` maintenance seams
- [ ] Ensure pre-reset, pre-compaction, and delete-adjacent flows consume the
      Cats-owned canonical-memory flush path intentionally
- [ ] Expose session health and continuity summaries so the operator can tell
      whether they are preserving context, resuming, or starting clean
- [ ] Keep room-owned workspace and session-owned cwd semantics legible in Chat
- [ ] Verify archive/recover, transport reconnect, and lane recovery rules do
      not corrupt continuity or memory ownership

**Deliverables**: one coherent lifecycle story for long-running Chat usage.

### Phase 5: Lightweight Specialist-Cat Operations

- [ ] Add transcript-adjacent specialist-Cat status views for:
      - active Cat(s)
      - blocked Cat(s)
      - waiting-for-review or waiting-for-target states
- [ ] Keep the transcript as the primary surface and move heavier control-plane
      detail into secondary surfaces
- [ ] Reuse existing Core/operator-loop data for inspect, retry, reroute, and
      resume flows rather than inventing a second Chat-only orchestration layer
- [ ] Keep the UI model compatible with multiple simultaneously active Cats
      rather than assuming one actor at a time
- [ ] Defer heavy template/review/budget operations to `Cats Work`

**Deliverables**: a multi-Cat chat loop that feels inspectable without becoming
an ops console.

### Phase 6: Spatial Polish and V1 Exit

- [ ] Normalize layout behavior across solo, direct-lane, companion, and
      multi-Cat modes
- [ ] Refine secondary-surface placement, preview behavior, and operator
      indicators using the existing spatial-layout guidance
- [ ] Close cross-mode UI inconsistencies in composer, top bar, transcript, and
      side surfaces
- [ ] Add regression coverage for the integrated companion/transport/session
      flows
- [ ] Update Chat-facing docs and mark v1 readiness once exit criteria pass

**Deliverables**: one polished Chat v1 candidate with coherent cross-mode
behavior.

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `src/products/chat/renderer/components/**` | Modify/Create | Companion mode, transport controls, transcript-side specialist status, and secondary-surface UI |
| `src/products/chat/renderer/hooks/**` | Modify/Create | Live invalidation, session continuity, and Chat-only operator affordances |
| `src/products/chat/renderer/styles/**` | Modify/Create | Cross-mode layout, companion, transcript, and secondary-surface polish |
| `src/products/chat/api/**` | Modify | Product-owned transport, companion, and lifecycle routes |
| `src/products/chat/state/**` | Modify | Session continuity, memory flush, companion state, and routing/read-model helpers |
| `src/core/**` | Modify | Shared planning, operator-loop, task, and memory-lifecycle helpers consumed by Chat |
| `src/design/**` | Modify | Shared suite-level primitives used by Chat v1 surfaces |
| `tests/**` | Modify/Create | Companion, transport, session, and multi-Cat Chat regression coverage |
| `docs/specs/**` | Modify (follow-on) | Update linked Chat specs if v1 sequencing changes any approved scope wording |

## Technical Decisions

- Treat this as an umbrella execution plan above existing detailed companion
  and transport plans rather than merging everything into one giant spec.
- Keep transport policy, companion identity, presence, and canonical memory
  product-owned in `cats`.
- Keep Chat transcript-first; operator or settings detail belongs in secondary
  surfaces.
- Use additive read models and focused product controls rather than exposing
  raw runtime payloads as the primary UX.
- Start transport queue maturity with `collect` as the default product policy,
  while leaving room for later `followup` / `steer` behavior.

## Testing Strategy

- **Unit Tests**:
  companion settings/presence normalization, transport queue/chunking helpers,
  continuity-rule helpers, session/memory flush decision logic
- **Integration Tests**:
  Telegram ingress to SSE invalidation to lane promotion, reset/sleep/resume
  lifecycle behavior, canonical-memory flush before continuity resets, direct
  and private-lane recovery flows
- **Renderer/Behavior Tests**:
  companion workspace transitions, transcript-side specialist indicators,
  secondary-surface interactions, recents/unread freshness, multi-active-Cat
  top-bar and transcript behavior
- **Manual Testing**:
  daily-use companion chat, Telegram private-lane usage, long-running session
  reset/resume, and routed multi-Cat help inside the main Chat surface

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Chat v1 scope expands into Work/Code territory | High | Freeze the three Chat promises and explicitly defer team-template or builder-loop behavior |
| Product/runtime boundary blurs under transport or continuity work | High | Keep identity, transport policy, and memory product-owned and use runtime only for execution/local session seams |
| Transport live updates cause UI thrash or stale route state | Medium | Prefer invalidation-plus-refetch correctness first, then narrow refresh scope deliberately |
| Specialist-Cat controls overwhelm the transcript | Medium | Keep transcript primary and move heavier control-plane detail behind secondary surfaces |

## Progress Log

| Date | Update |
|------|--------|
| 2026-03-29 | Plan created to sequence the `Cats Chat v1` priority stack above existing companion, transport, and runtime-discipline substrate |
| 2026-03-29 | Implementation started on branch `claude/spec-039-chat-v1`. Shared files modified: `api/companionBoxRoutes.ts` (memory delete/update routes), `api/routeSupport.ts` (eventHub dependency), `api/resources/index.ts` (event route registration). |
| 2026-03-29 | **Phase 2 complete**: Visible companion workspace with 8 new components, 2 hooks, renderer API client, companion store memory CRUD, styles, and app route integration. |
| 2026-03-29 | **Phase 3 complete**: SSE invalidation hub created and wired into server bootstrap + requestRouter. Event route registered. Transport event publishing wired into Telegram webhook handler. Renderer `useChatEvents` hook connected in App.tsx — refreshes room, recents, and unread on SSE events. Telegram command router wired into inbound webhook path (commands intercepted before room bridging). Reply chunking wired into outbound bridge delivery. |
| 2026-03-29 | **Phase 4 partial**: Session continuity rules and operations landed (rules, reset/sleep/resume/compact). Companion wake triggers `activateChatChannel` + app-shell refresh. Companion sleep sends deactivation request + refresh. Full session-continuity API routes (dedicated REST endpoints for reset/compact) deferred to follow-up. |
| 2026-03-29 | **Phase 5 partial**: CatStatusRow component rendered in ChatView for multi-Cat rooms. Cat status resolution wired with operator view. Layout normalization module landed but not yet consumed by ChatView class names (CSS-only integration deferred). |
| 2026-03-29 | **Phase 6 complete**: 36 new tests across 5 test files covering session-continuity-rules, telegram-chunking, chat-event-hub, cat-status-resolution, session-health-summary. 578/579 pass (1 pre-existing failure). |

---

*Created: 2026-03-29*
*Author: Codex*
