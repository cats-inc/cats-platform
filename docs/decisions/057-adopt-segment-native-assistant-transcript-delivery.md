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
- live rendering is owned by one mutable global `liveIndicator` bubble
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
- same-speaker follow-up segments that cannot own their own header/dots handoff
- sealed assistant bubbles that momentarily disappear or get replaced by one
  generic live bubble
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

5. Live transcript state becomes an assistant-turn segment timeline, not one
   mutable global live bubble.
   - Each assistant-owned live segment must carry stable identity scoped to the
     active turn and target, so same-speaker follow-up segments do not have to
     hijack or overwrite the prior bubble.
   - The canonical live segment states are `waiting`, `streaming`, and
     `sealed`.
   - When one segment seals and the same speaker continues, the next waiting
     state must appear as the next assistant bubble with the same speaker
     header, not as dots appended to the old sealed bubble and not as a return
     to the user bubble.

6. `contentBlocks` become the primary live transcript rendering source.
   - `previewText` accumulation is retired as the primary rendering model.
   - Dots/tool waiting states are projected into the same segment timeline
     rather than treated as a separate cosmetic layer.
   - The renderer must project runtime events into ordered segment phases
     instead of rebuilding cadence from one concatenated string.

7. `Show live progress details` is demoted to a presentation preference only.
   - It may control how much tool/status chrome is shown.
   - It must not control whether the assistant turn is segmented.

8. Durable and live segment order must share one canonical turn aggregate.
   - Text segments persist as transcript messages.
   - Non-text tool/status phases remain durable inside the same assistant-turn
     aggregate even when the collapsed transcript hides them.
   - Routing, repair, and later transcript reconstruction must read the same
     ordered turn aggregate rather than mixing one live model with another
     durable model.

9. No backward-compatibility aliases will be preserved for the old singular
   response architecture.
   - Do not keep long-lived dual semantics such as
     `runtime_response` plus `runtime_response_segment`.
   - Do not keep singular `responseMessageId` contracts where the correct model
     is plural or turn-scoped.
   - Because this product has not launched, stale local/dev snapshots may be
     discarded instead of carrying migration code or compatibility shims.

## Consequences

### Positive

- Cats Chat can finally show the real rhythm of one assistant turn:
  `text -> assistant dots/tool -> text`.
- Same-speaker multi-segment turns can hand off from one sealed bubble to the
  next named waiting bubble without losing avatar/header continuity.
- Live and persisted transcript behavior become aligned instead of fighting
  each other.
- Group, direct, and default surfaces can share one truthful assistant-turn
  contract.
- Renderer logic becomes less dependent on fragile timing heuristics because
  the canonical state is richer.

### Negative

- This is a real cross-layer refactor, not a renderer-only change.
- Shared chat contracts and workflow persistence will need to change.
- Existing tests and repair paths that assume one response message per dispatch
  must be rewritten.
- Existing local/dev room state that still uses the retired model may need to
  be discarded.

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

### Alternative 4: Keep one global live bubble and infer segment cadence inside it

- **Pros**: smaller renderer diff; fewer state types
- **Cons**: same-speaker follow-up segments cannot own independent waiting or
  sealed states; header/dots handoff remains timing-sensitive; persisted
  multi-bubble transcript cannot share the same semantic model
- **Why rejected**: it preserves the exact live-state mismatch now causing
  missing second-bubble dots and anonymous follow-up bubbles

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
