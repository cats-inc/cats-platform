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

- live transcript becomes content-block / segment driven
- persisted transcript can store multiple assistant text messages for one turn
- workflow and continuation logic become turn-aggregate aware rather than
  assuming one `runtime_response`
- settings no longer decide whether segmentation exists

## Goals

- make one assistant turn visibly segmented in both live and durable transcript
- preserve the natural rhythm of `text -> wait/tool -> text` for a single
  assistant
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
6. Live transcript rendering shall use structured `contentBlocks` or their
   replacement segment model as the primary source of truth.
7. After the first visible assistant segment in a turn, any further waiting
   state for that same turn shall remain assistant-owned and shall not revert to
   the user bubble.
8. The product shall render same-speaker waiting between persisted text
   segments, including tool/status waits where relevant.
9. `Show live progress details` shall not control whether segmentation exists;
   it may only control the density of supplemental tool/status detail.
10. Continuation routing, mention parsing, workflow recommendation parsing,
    repair, and recovery shall consume the canonical full turn transcript
    instead of assuming the last assistant message contains the whole answer.
11. The server shall publish transcript invalidation/update events after each
    persisted assistant segment so the UI does not need manual refresh to see
    intermediate stages.
12. The landed architecture shall not preserve old singular-response aliases as
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
  -> ordered assistant turn segments
  -> product turn aggregate
  -> persisted transcript messages + live assistant wait states
  -> continuation/recommendation parser reads aggregate turn text
```

### Model Principles

1. `segment` is the smallest user-visible assistant delivery unit.
2. `assistant turn` is the ordered collection of those segments.
3. Live and persisted transcript are two views of the same turn.
4. Tool/status progress may be represented differently from text, but it must
   not destroy segment order.
5. Renderer code must not rebuild fake segmentation from flattened strings.

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

- [ ] Should tool/status phases persist as explicit system/tool transcript
      entities, or remain live-only while text segments persist durably?
- [ ] What is the final canonical shape for segment-aware workflow response
      references: `responseMessageIds`, `responseSegments`, or a separate turn
      aggregate record?

## References

- [ADR-057](../decisions/057-adopt-segment-native-assistant-transcript-delivery.md)
- [ADR-050](../decisions/050-use-ack-first-chat-dispatch-lifecycle.md)
- [SPEC-039](./SPEC-039-cats-chat-v1-priority-items.md)
- [PLAN-047](../plans/PLAN-047-segment-native-assistant-transcript-delivery.md)

---

*Created: 2026-04-12*
*Author: Codex*
*Related Plan: [PLAN-047](../plans/PLAN-047-segment-native-assistant-transcript-delivery.md)*
