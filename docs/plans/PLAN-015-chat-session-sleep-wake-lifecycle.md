# PLAN-015: Chat Session Sleep/Wake Lifecycle

Status: Approved

## Scope

Implement the session-lifecycle behavior defined in
[SPEC-016](../specs/SPEC-016-chat-session-sleep-wake-lifecycle.md)
and
[ADR-015](../decisions/015-adopt-cat-sleep-wake-lifecycle-for-chat-sessions.md).

This plan covers:

- wake-on-entry behavior for persisted chats
- wake-on-join behavior for newly added Cats
- wake-before-route behavior for sleeping targets
- first active-chat limits and automatic sleep policy
- product-facing sleep/wake terminology and status surfaces

This plan does not cover:

- full Telegram transport lifecycle UI
- full activity-panel redesign
- per-Cat custom active-chat limit overrides in the first slice

## Hard Constraints

- Keep `/new` as a draft page that does not require a live Cat connection.
- Do not require manual operator "activation" steps for normal chat use.
- Keep session isolation scoped per chat; do not collapse all Boss Cat chats into
  one shared session.
- Preserve the current `cats -> cats-runtime` boundary.
- Do not let "joined the chat" continue to mean "visually present but not really
  available."

## Phases

### Phase 1: Contract and Terminology Freeze

- [ ] Define the product-facing status vocabulary:
      - sleeping
      - waking_up
      - awake
- [ ] Decide where these statuses live in the read model:
      - direct lease mapping
      - or derived UI-specific presence status
- [ ] Freeze the rule that one Cat may have multiple awake sessions across
      different chats, subject to limits.
- [ ] Freeze the first configuration groups:
      - Boss Cat active chat limit
      - Other Cats active chat limit

**Deliverables**: stable terminology, state semantics, and limit vocabulary.

### Phase 2: Wake-on-Entry for Real Chats

- [ ] Add a wake trigger when the operator opens the first persisted chat after
        setup.
- [ ] Add a wake trigger when the operator opens an existing persisted chat.
- [ ] Keep `/new` exempt from eager wake behavior.
- [ ] Ensure the read model can show `Boss Cat` as sleeping, waking up, or awake
      without exposing raw runtime jargon.

**Deliverables**: persisted chat entry now implies presence instead of waiting
for first-send activation.

### Phase 3: Wake-on-Join and Wake-Before-Route

- [ ] When a Cat is added to an already active chat, start waking that Cat
      immediately.
- [ ] Replace "target has no active session" skip behavior with wake-and-continue
      behavior for eligible routed Cats.
- [ ] Ensure target-change flows still close outdated sessions cleanly before
      waking the new execution target.
- [ ] Keep Boss Cat as the visible product story for who is calling other Cats
      into the room.

**Deliverables**: newly joined Cats become truly available and routed Cats no
longer fail only because they were sleeping.

### Phase 4: Active Chat Limits and Automatic Sleep

- [ ] Add persisted settings for:
      - Boss Cat active chat limit
      - Other Cats active chat limit
      - idle timeout for sleep eligibility
- [ ] Implement a selection policy for which sessions to put to sleep first.
- [ ] Protect foreground, recently used, and operator-critical chats from being
      selected too early.
- [ ] Put older eligible idle sessions to sleep when limits are exceeded.

**Deliverables**: bounded session counts with predictable automatic sleep.

### Phase 5: UI Copy and Presence Surface

- [ ] Replace user-facing "activate" language with sleep/wake terminology where
      appropriate.
- [ ] Add subtle presence status to the chat header and/or activity surface.
- [ ] Ensure setup-first greeting and room-entry messaging no longer imply fake
      presence.
- [ ] Decide whether `joined`, `waking up`, and `awake` should appear as system
      notes, badges, or both.

**Deliverables**: product-visible lifecycle that matches actual session state.

### Phase 6: Validation and Documentation Sync

- [ ] Add tests for wake-on-entry on setup-complete and existing-chat entry.
- [ ] Add tests for add-cat immediate wake behavior.
- [ ] Add tests for wake-before-route when a target Cat is sleeping.
- [ ] Add tests for automatic sleep candidate selection and limit enforcement.
- [ ] Update architecture, API docs, and progress docs once implementation
      starts landing.

**Deliverables**: verified lifecycle behavior plus synchronized docs.

## Candidate Code Areas

| Area | Action | Why |
|------|--------|-----|
| `src/shared/app-shell.ts` | Extend | Expose user-facing presence status and settings fields |
| `src/chat/model.ts` | Modify | Keep assignment, wake, sleep, and target-change state coherent |
| `src/chat/runtimeActions.ts` | Refactor | Implement wake-on-entry, wake-on-join, wake-before-route, and sleep policy |
| `src/chat/store.ts` | Extend | Persist lifecycle settings and any new chat-presence fields |
| `src/server.ts` | Extend | Add or refine APIs used by wake/sleep flows |
| `src/renderer/App.tsx` | Refactor carefully | Trigger wake on real-chat entry and render product-facing presence states |
| `src/renderer/api.ts` | Extend | Support any new wake/sleep or settings APIs |
| `tests/` | Expand | Cover lifecycle transitions, limits, and recovery behavior |
| `docs/` | Update | Keep terminology, architecture, and specs aligned |

## Validation

- Entering a persisted chat makes `Boss Cat` awake or visibly waking up.
- Adding another Cat to an active chat starts real wake behavior immediately.
- Routing to a sleeping Cat wakes it instead of failing with a hidden activation
  prerequisite.
- `/new` remains an unconnected draft page.
- Active session counts stay bounded by configured limits.
- The product uses sleep/wake language instead of forcing users to reason about
  low-level runtime sessions.

## Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Eager wake on every old-chat entry creates too many sessions too quickly | High | Land limits and sleep eligibility soon after wake-on-entry |
| Wake-before-route increases turn latency for sleeping Cats | Medium | Show `Waking up` state and keep limits tuned conservatively |
| Product status vocabulary drifts away from the actual runtime lease state | Medium | Define one derived mapping and reuse it everywhere |
| Automatic sleep chooses the wrong chat and surprises users | High | Protect foreground, recent, and operator-critical chats from early eviction |
| Add-cat immediate wake introduces merge pressure across renderer and runtime code | Medium | Land API/state seams first, then wire renderer behavior |

## Suggested Handoff Instruction

Use this when delegating implementation:

> Implement SPEC-016 / PLAN-015. Keep `/new` as a draft page, but make persisted
> chats feel present: Boss Cat should wake on real chat entry, added Cats should
> wake when they join active chats, and routed sleeping Cats should wake before
> handling work. Use user-facing sleep/wake terminology and add first-slice
> limits for Boss Cat active chats versus Other Cats active chats.

---

*Last updated: 2026-03-23*

