# SPEC-056: Segment-Native Assistant Transcript Delivery

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Draft |
| **Owner** | Codex |
| **Reviewer** | User |
| **Related ADR** | [ADR-057](../decisions/057-adopt-segment-native-assistant-transcript-delivery.md) |

## Summary

Cats Chat must stop flattening one assistant turn into a single assistant
bubble. The product should preserve the runtime's real segment cadence and show
it both while streaming and after persistence.

This spec defines a full architectural correction:

- live transcript becomes assistant-turn segment-timeline driven
- persisted transcript can store multiple assistant text messages for one turn
- workflow and continuation logic become turn-aggregate aware rather than
  assuming one `runtime_response`
- settings no longer decide whether segmentation exists

## Goals

- make one assistant turn visibly segmented in both live and durable transcript
- preserve the natural rhythm of `text -> wait/tool -> text` for a single
  assistant
- make same-speaker follow-up segments render as their own named bubbles while
  preserving the assistant header across handoff
- keep assistant-owned waiting states on the assistant lane after the first
  assistant segment appears
- unify solo, direct, group, sequential, and concurrent surfaces under one
  assistant-turn delivery model
- remove the singular-response assumptions that currently drive regressions
- avoid long-lived aliases or backward-compatibility semantics for the old
  model

## Non-Goals

- final visual polish for every segment chrome or tool-chip style
- solving every existing sequential/concurrent routing bug in the same change
- preserving old snapshot/read-model compatibility if it conflicts with the
  correct architecture
- introducing provider-specific transcript formats

## User Stories

- As a chat user, I want to see an assistant's first segment land before the
  turn is fully complete so that dots and later text feel truthful.
- As a group-chat user, I want the same segmentation rules regardless of room
  mode so that assistant progress is understandable.
- As a maintainer, I want live and persisted transcript paths to share one
  model so that fixes do not keep bouncing between renderer and server hacks.

## Requirements

### Functional Requirements

1. The runtime-to-product message path shall preserve ordered assistant-turn
   segment boundaries instead of flattening them into one `content` string.
2. The product shall model one assistant turn as a turn aggregate containing
   ordered segments plus completion metadata.
3. The product shall persist assistant text output from one turn as multiple
   transcript messages when the runtime emits multiple text segments.
4. The product shall stop using singular `responseMessageId` as the canonical
   response pointer for dispatch/workflow state.
5. Dispatch and workflow state shall instead track segment-aware response
   identity sufficient to:
   - find all persisted messages for a turn
   - reconstruct canonical full turn text
   - finalize target completion truthfully
6. The product shall model live assistant delivery as an ordered segment
   timeline, not one mutable global live bubble.
7. Each live segment shall carry stable identity sufficient to reconcile with
   the active turn and target state without guessing from the latest visible
   speaker label alone.
8. Live segment state shall expose at least `waiting`, `streaming`, and
   `sealed`.
9. Live transcript rendering shall use structured `contentBlocks` plus the
   segment-timeline projector as the primary source of truth.
10. After the first visible assistant segment in a turn, any further waiting
   state for that same turn shall remain assistant-owned and shall not revert to
   the user bubble.
11. The product shall render same-speaker waiting between persisted text
   segments as the next assistant bubble with the same speaker header, including
   tool/status waits where relevant.
12. When one live segment seals and the next same-speaker segment has not yet
   emitted text, the UI shall show that next segment's named waiting bubble
   instead of mutating the sealed segment bubble in place.
13. Durable assistant-turn state shall preserve the ordered non-text phases
   needed to reconstruct the same canonical turn timeline even when the main
   transcript only persists text segments as chat messages.
14. `Show live progress details` shall not control whether segmentation exists;
   it may only control the density of supplemental tool/status detail.
15. Continuation routing, mention parsing, workflow recommendation parsing,
    repair, and recovery shall consume the canonical full turn transcript
    instead of assuming the last assistant message contains the whole answer.
16. The server shall publish transcript invalidation/update events after each
    persisted assistant segment so the UI does not need manual refresh to see
    intermediate stages.
17. The landed architecture shall not preserve old singular-response aliases as
    first-class supported behavior.

### Non-Functional Requirements

- **Correctness**: live and durable transcript must describe the same assistant
  turn structure
- **UX consistency**: direct, solo, group, sequential, and concurrent rooms
  must use the same assistant-turn segmentation rules
- **Observability**: trace/debug surfaces must expose segment/turn boundaries so
  failures can be diagnosed without guesswork
- **State safety**: the landed product model must expose one truthful contract;
  stale local/dev state may be discarded instead of preserving backward
  compatibility

## Design Overview

### Target Model

```
runtime stream
  -> ordered assistant turn phases
  -> live segment timeline projector
  -> product turn aggregate
  -> persisted transcript messages + durable non-text phase records
  -> continuation/recommendation parser reads aggregate turn text
```

### Model Principles

1. `segment` is the smallest user-visible assistant delivery unit.
2. `assistant turn` is the ordered collection of those segments.
3. Live and persisted transcript are two views of the same turn.
4. Tool/status progress may be represented differently from text, but it must
   not destroy segment order.
5. Renderer code must not rebuild fake segmentation from flattened strings.

### Live Segment Timeline

Each live assistant turn must be projected into an ordered segment timeline.

| State | Meaning | UI contract |
|-------|---------|-------------|
| `waiting` | The next segment is known but has not emitted text yet | Render a named assistant bubble with header and dots |
| `streaming` | The segment is actively receiving text or visible phase content | Render the segment bubble body plus trailing dots when still in flight |
| `sealed` | The segment has landed and must not be mutated by the next segment | Keep the bubble stable while the next segment gets its own bubble |

Projection rules:

1. The segment timeline is canonical for live rendering.
2. A sealed segment must stay visible while a following waiting/streaming
   segment appears beneath it.
3. Same-speaker follow-up segments must not be represented by resurrecting dots
   inside the prior sealed bubble.
4. The segment timeline must reconcile to the durable assistant-turn aggregate
   without relying on timing heuristics.

### Delivery Principles

- First assistant text segment should appear as soon as it is available.
- If the same assistant then waits on a tool or another runtime phase, the UI
  should show assistant-owned waiting at the correct insertion point.
- Later assistant text segments should land after that waiting state without
  reflowing the turn back into one synthetic bubble.

## Dependencies

- `cats-runtime` SSE/session delivery semantics for `content_block` and other
  observed events
- `cats-platform` chat dispatch, workflow persistence, renderer, and repair
  layers

## Open Questions

- [ ] Whether the durable non-text phase records should later become
      user-visible transcript rows in expanded/debug views, or remain part of
      the hidden assistant-turn aggregate while collapsed transcript mode stays
      text-first.

## References

- [ADR-057](../decisions/057-adopt-segment-native-assistant-transcript-delivery.md)
- [ADR-050](../decisions/050-use-ack-first-chat-dispatch-lifecycle.md)
- [SPEC-039](./SPEC-039-cats-chat-v1-priority-items.md)
- [PLAN-047](../plans/PLAN-047-segment-native-assistant-transcript-delivery.md)

---

*Created: 2026-04-12*
*Author: Codex*
*Related Plan: [PLAN-047](../plans/PLAN-047-segment-native-assistant-transcript-delivery.md)*
