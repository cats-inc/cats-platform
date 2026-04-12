# ADR-057: Adopt Segment-Native Assistant Transcript Delivery

> Model one assistant turn as an ordered sequence of persisted and live
> transcript segments, not as one flattened response string or one final
> assistant bubble.

## Status

Accepted

## Context

`Cats Chat` currently loses the real cadence of a single assistant turn.

Today the stack still assumes:

- live text is a single `previewText` string built by naive concatenation
- dispatch persistence writes one final `runtime_response` message
- routing and workflow state point to one `responseMessageId`
- transcript rendering can treat assistant typing as a cosmetic prelude to one
  final bubble

That architecture is now the wrong boundary.

The runtime already emits richer structure:

- ordered text chunks
- tool start / tool result events
- content blocks with `kind`, `index`, and `status`

But the product collapses that structure too early, which causes:

- assistant dots that feel fake because they disappear into one final bubble
- loss of the natural `text -> wait/tool -> text` rhythm of one turn
- a mismatch between `cats-runtime` dashboard behavior and Cats Chat
- more special-case gating logic in the renderer because the canonical product
  model is too weak

The user direction is explicit:

- fix the architecture, not just the visuals
- do not keep aliases or backward-compatibility shims for the wrong model
- if the current persistence model must be replaced, replace it

## Decision

`cats-platform` will adopt a segment-native assistant turn model across both
live rendering and persisted transcript state.

1. One assistant turn is an ordered sequence of segments, not one final
   response string.
   - Text segments, tool/status segments, and completion state belong to one
     canonical turn timeline.
   - The product must preserve that timeline instead of flattening it at the
     client boundary.

2. Live transcript and persisted transcript must share the same semantic model.
   - A live segment that becomes durable should remain the same conceptual
     segment after persistence.
   - The UI must not render one model while the store persists another.

3. Assistant text segments will persist as multiple transcript messages under
   the same turn/dispatch.
   - The singular `runtime_response`-as-the-whole-turn model is retired.
   - Dispatch and workflow state must become segment-aware instead of pointing
     to one `responseMessageId`.

4. Routing, workflow, and continuation logic must consume a canonical
   assistant-turn aggregate, not "the last assistant message body."
   - Mention parsing, workflow recommendation parsing, repair, and recovery
     should read the normalized full turn transcript assembled from its
     segments.

5. `contentBlocks` become the primary live transcript rendering source.
   - `previewText` accumulation is retired as the primary rendering model.
   - Dots/tool waiting states are part of the same segment timeline rather than
     a separate cosmetic layer.

6. `Show live progress details` is demoted to a presentation preference only.
   - It may control how much tool/status chrome is shown.
   - It must not control whether the assistant turn is segmented.

7. No backward-compatibility aliases will be preserved for the old singular
   response architecture.
   - Do not keep long-lived dual semantics such as
     `runtime_response` plus `runtime_response_segment`.
   - Do not keep singular `responseMessageId` contracts where the correct model
     is plural or turn-scoped.
   - Migration may require store repair or snapshot upgrades, but the landed
     architecture should expose one truthful model.

## Consequences

### Positive

- Cats Chat can finally show the real rhythm of one assistant turn:
  `text -> assistant dots/tool -> text`.
- Live and persisted transcript behavior become aligned instead of fighting
  each other.
- Group, direct, and solo surfaces can share one truthful assistant-turn
  contract.
- Renderer logic becomes less dependent on fragile timing heuristics because
  the canonical state is richer.

### Negative

- This is a real cross-layer refactor, not a renderer-only change.
- Shared chat contracts and workflow persistence will need to change.
- Existing tests and repair paths that assume one response message per dispatch
  must be rewritten.
- Snapshot/state migration may be required for older rooms.

### Neutral

- Tool/status segments do not have to persist as standalone assistant text
  messages if the product chooses a different durable representation for them,
  but the text segmentation contract must remain explicit.
- This ADR does not settle final CSS or bubble chrome details.
- This ADR does not by itself fix every existing group-chat bug, but all future
  fixes must target this model.

## Alternatives Considered

### Alternative 1: Keep single-message persistence and only improve live rendering

- **Pros**: smaller first patch; less state migration work
- **Cons**: live and durable transcript remain semantically different; routing
  and recovery still rely on the wrong model
- **Why rejected**: it preserves the root architectural mismatch and invites
  more renderer workarounds

### Alternative 2: Keep `previewText` as the primary live source and decorate it with dots

- **Pros**: minimal renderer churn
- **Cons**: cannot express `text -> tool -> text` truthfully; still collapses
  ordered blocks into one string
- **Why rejected**: the runtime already has the right structure, and the
  product should not throw it away

### Alternative 3: Introduce new segment contracts but keep old singular aliases indefinitely

- **Pros**: easier short-term migration
- **Cons**: dual semantics would prolong confusion, duplicate tests, and invite
  future regressions
- **Why rejected**: the user explicitly asked for the correct architecture
  without alias/backward-compatibility drag

## References

- [ADR-019](./019-normalize-runtime-previews-as-surfaces-not-provider-iframes.md)
- [ADR-041](./041-push-transport-and-chat-invalidations-over-sse.md)
- [ADR-050](./050-use-ack-first-chat-dispatch-lifecycle.md)
- [SPEC-056](../specs/SPEC-056-segment-native-assistant-transcript-delivery.md)
- [PLAN-047](../plans/PLAN-047-segment-native-assistant-transcript-delivery.md)
- [cats-runtime `contentBlocks` projector](../../../cats-runtime/src/core/runtime/contentBlocks.ts)
- [cats-runtime session observe SSE route](../../../cats-runtime/src/http/routes/observe.ts)

---

*Accepted: 2026-04-12*
*Accepted by: user direction captured through Codex*
