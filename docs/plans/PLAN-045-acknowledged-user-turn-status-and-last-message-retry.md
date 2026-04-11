# PLAN-045: ACK-First User-Turn Status and Last-Message Retry

> Add a truthful post-ACK user-turn status model, defer assistant identity
> bubbles until session startup, and let the last failed user turn retry by
> replaying the same acknowledged message instead of appending a duplicate.

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Draft |
| **Owner** | User |
| **Reviewer** | Codex |

## Related Spec / Dependencies

- N/A as a standalone spec; this is a focused follow-up slice under an accepted
  lifecycle decision
- [ADR-050: Use an ACK-First Chat Dispatch Lifecycle](../decisions/050-use-ack-first-chat-dispatch-lifecycle.md)
- [ADR-041: Push Transport and Chat Invalidations over SSE](../decisions/041-push-transport-and-chat-invalidations-over-sse.md)
- [SPEC-039: Cats Chat v1 Priority Items](../specs/SPEC-039-cats-chat-v1-priority-items.md)
- [PLAN-023: Orchestrator Execution Loop and Recovery Contract](./PLAN-023-orchestrator-execution-loop-and-recovery.md)

## Overview

`Cats Chat` already uses the correct ACK-first send lifecycle:
the user bubble appears only after the backend has accepted the message.
The remaining gap is the UX and retry behavior between that ACK and the first
real assistant response.

Today the product still conflates three different states:

1. the user turn is accepted but runtime/session setup is still pending
2. a concrete assistant session has started and can truthfully own a bubble
3. the accepted turn failed and should offer a retry path

This plan fixes that split in two layers:

1. renderer truthfulness:
   keep post-ACK/pre-session feedback on the last user bubble, and only show a
   speaker-specific assistant progress bubble after `session_started`
2. recovery:
   add a last-message retry action that replays the same acknowledged user turn
   instead of sending a second copy of the user message

## Implementation Phases

### Phase 1: Lock the ACK-State View Model

- [ ] Task 1.1: Derive a renderer-owned last-user-turn status model from the
      authoritative room-routing state (`idle`, `processing`, `failed`).
- [ ] Task 1.2: Treat post-ACK/pre-session work as a user-turn execution state,
      not an assistant identity state.
- [ ] Task 1.3: Define the exact promotion boundary for assistant identity:
      `session_started` or equivalent session-bootstrap stream metadata, not
      "someone is next in the queue."
- [ ] Task 1.4: Restrict this state model to the newest acknowledged user
      message in the selected channel so older messages do not pick up stale
      spinners or retry affordances.

**Deliverables**: one stable, renderer-facing state model for the newest
acknowledged user turn

### Phase 2: Rebuild Transcript Feedback Around That Model

- [ ] Task 2.1: Show a lightweight processing indicator on the last user bubble
      after ACK and before assistant session startup.
- [ ] Task 2.2: Remove assistant identity from the waiting state; the waiting
      UI must stay generic until session startup is real.
- [ ] Task 2.3: After `session_started`, hand off from the user-bubble
      indicator to the assistant live bubble.
- [ ] Task 2.4: Keep retry hidden during normal processing and show it only on
      hover when the latest acknowledged user turn has failed.
- [ ] Task 2.5: Make failure and retry affordances visually subordinate to the
      transcript, not a second system-message rail.

**Deliverables**: truthful post-ACK transcript feedback with no optimistic
assistant identity

### Phase 3: Add Replay-Not-Resend Retry

- [ ] Task 3.1: Add a product API seam for retrying a failed acknowledged
      message by `channelId` plus `messageId`.
- [ ] Task 3.2: Validate server-side that retry only applies to the latest
      failed acknowledged user message and cannot run while a turn is already
      active.
- [ ] Task 3.3: Reuse the acknowledged source message for retry instead of
      appending a new user message to the transcript.
- [ ] Task 3.4: Keep SSE invalidation and live-indicator behavior aligned with
      the replayed turn so retry looks like a new execution of the same user
      bubble, not a duplicate send.

**Deliverables**: a last-message retry path that preserves transcript truth and
avoids duplicate user turns

### Phase 4: Verification

- [ ] Task 4.1: Add renderer tests for last-user-bubble processing,
      assistant-bubble promotion after session startup, and hover-only retry.
- [ ] Task 4.2: Add route/runtime tests that prove retry replays the same
      acknowledged source message without adding a second user bubble.
- [ ] Task 4.3: Add regression coverage for sequential multi-participant rooms
      so speaker handoff does not reintroduce pre-session identity bubbles.
- [ ] Task 4.4: Manually smoke-check solo, direct, group, and sequential room
      flows because transcript truthfulness is a product contract, not just a
      unit-test detail.

**Deliverables**: automated and manual coverage for the new ACK-state UX and
retry seam

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `src/products/chat/renderer/components/ChatView.tsx` | Modify | Pass last-user-turn status and retry affordances into the transcript surface |
| `src/products/chat/renderer/components/chat-view/chatViewSupport.ts` | Modify | Derive the newest acknowledged user-turn status and assistant-promotion gating |
| `src/products/chat/renderer/components/chat-view/TranscriptMessageItem.tsx` | Modify | Render the user-bubble processing and failure affordances |
| `src/products/chat/renderer/components/chat-view/TranscriptMessageActions.tsx` | Modify | Add hover-only retry for the newest failed user turn |
| `src/products/chat/renderer/styles/chat-thread.css` | Modify | Style the user-bubble spinner and retry affordance without mimicking an assistant bubble |
| `src/shared/liveIndicator.ts` | Modify | Separate generic waiting from session-started assistant identity |
| `src/products/shared/renderer/hooks/useLiveIndicator.ts` | Modify | Keep waiting state generic until session startup is confirmed |
| `src/products/chat/renderer/api/chat.ts` | Modify | Add a chat message retry API helper |
| `src/products/chat/api/resources/channelRoutes.ts` | Modify | Add a message retry route for acknowledged user turns |
| `src/products/chat/state/runtimeActions.ts` | Modify | Export a replay entrypoint if a dedicated last-message retry helper is added |
| `src/products/chat/state/runtime-dispatch/routing.ts` | Modify | Re-enter dispatch from an acknowledged source message without appending a duplicate user turn |
| `src/products/chat/state/runtime-dispatch/replay.ts` | Modify (if needed) | Reuse or extend replay primitives for message-level retry |
| `tests/chat-view-support.test.tsx` | Modify | Verify last-user-turn status derivation and assistant promotion gating |
| `tests/live-indicator.test.tsx` | Modify | Verify no assistant identity bubble appears before session startup |
| `tests/chat-view-participants.test.tsx` | Modify | Verify transcript rendering and hover-only retry affordance |
| `tests/channel-message-retry.test.js` | Create | Verify retry replays the same acknowledged user message and rejects invalid retry targets |

## Technical Decisions

- Decision 1: No new ADR is required; this is an implementation follow-up to
  the accepted ACK-first lifecycle in ADR-050.
- Decision 2: Post-ACK/pre-session feedback belongs to the newest user bubble,
  because the accepted user turn is authoritative before any assistant session
  exists.
- Decision 3: Assistant identity bubbles must not appear until session startup
  is real; "queued next speaker" is not enough.
- Decision 4: Retry must replay the same acknowledged source message instead of
  resending the text as a new user message.
- Decision 5: Retry is intentionally narrow in this slice:
  only the newest failed acknowledged user turn, and only as a hover action.

## Testing Strategy

- **Unit Tests**: last-user-turn status derivation, assistant-promotion gating,
  and retry eligibility checks
- **Integration Tests**: retry route validation, replay entrypoint behavior,
  and transcript/live-indicator handoff across ACK, session startup, and
  failure
- **Manual Testing**:
  - send a solo message and verify:
    user bubble appears after ACK, shows a generic spinner, then hands off to
    the assistant bubble only after session startup
  - break runtime startup before `session_started` and verify:
    the last user bubble shows failure plus hover-only retry, with no duplicate
    user message
  - retry that failed turn and verify:
    the same user bubble re-enters processing and only one source user message
    remains in the transcript
  - run a sequential group room and verify:
    each next participant stays generic until its own session startup event

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Retry accidentally appends a second user bubble | High | Drive retry from `sourceMessageId` and assert transcript user-message count stays stable |
| Waiting UI still leaks assistant identity before session startup | High | Gate assistant promotion on `session_started`-class stream metadata and cover it in `live-indicator` tests |
| Retry appears on stale or non-latest user messages | Medium | Derive eligibility from `lastOutcome`, `activeTurn`, and server-side route validation |
| Message-level retry conflicts with operator-loop retry semantics | Medium | Keep this slice scoped to the latest failed acknowledged user turn and reuse replay semantics instead of inventing a second recovery model |

## Progress Log

| Date | Update |
|------|--------|
| 2026-04-11 | Plan created for ACK-state transcript truthfulness and replay-based last-message retry |

---

*Created: 2026-04-11*
*Author: Codex*
