# ADR-058: Adopt Lane-Native Concurrent Group Transcript Delivery

> Model one concurrent group-chat user turn as a fixed-order response cluster
> with one stable lane per target, not as a chronological stream of assistant
> bubbles created by connection timing.

## Status

Proposed

## Context

`Cats Chat` currently treats concurrent group delivery too much like a shared
chronological transcript.

That leads to the wrong user-visible behavior:

- assistant bubbles appear in session-start order instead of audience order
- sequential job startup leaks into the UI even when the routing mode is
  `concurrent`
- faster targets can begin showing text before slower targets have even attached
  a session, so the transcript still feels like a staggered startup race
- reconnect and `session_started` timing can create duplicate or ghost bubbles
- the same target can appear to create a second bubble because the product
  lacks a stable lane identity above `sessionId`
- a finished lane can disappear and reappear when other lanes continue

The current architecture still mixes three different identities:

- the dispatch-time target identity
- the runtime session identity
- the renderer bubble identity

That coupling is acceptable for default or direct flows only because there is
effectively one visible assistant lane. It breaks down in concurrent group
chat, where the user expectation is different:

- "these three audiences are all part of this one fan-out"
- "their positions should stay stable"
- "their content should grow in place"
- "runtime connection order should not decide transcript structure"

The product therefore needs a stronger contract than "whoever emits first gets
the next assistant bubble."

## Decision

`cats-platform` should adopt a lane-native concurrent group transcript model.

### 1. One concurrent user turn creates one response cluster

After the product resolves the current turn's concurrent targets, the UI should
materialize one concurrent response cluster for that user turn.

That cluster is the canonical live and durable container for all assistant
responses in the turn.

### 2. Cluster order is fixed by dispatch-time audience order

The order of concurrent lanes must be captured at dispatch time and remain
stable for the life of the turn.

The default ordering rule is:

- the audience-chip order at the moment the user sends the turn

Runtime events must not reorder the cluster by:

- first `session_started`
- first token
- first completion
- reconnect timing

### 3. Lane identity is target-native, not session-native

Each concurrent lane must be keyed by a stable dispatch-lane identity, such as
`targetStateId`.

`sessionId` remains important, but only as internal lane state:

- it gates the current runtime attachment
- it distinguishes reconnect generations
- it does not create a new UI lane

### 4. Lanes materialize together once fan-out targets are known

Even if the backend opens jobs sequentially, the UI should not reveal that as a
sequential transcript structure.

When the concurrent target set is known:

- all concurrent lanes become visible together
- each lane starts in a pre-stream state such as `pending` or `connecting`
- later session-start or text events only advance the existing lane state

### 5. Lane text is gated by a cluster-ready barrier

Materializing all lanes together is necessary but not sufficient.

To avoid leaking sequential startup through token timing, concurrent lane text
must not become user-visible until the cluster reaches a ready barrier.

That barrier opens when every non-terminal lane has either:

- attached its first valid session for this turn, or
- entered a terminal unavailable state such as `failed` or `cancelled`

This means:

- early text from a faster lane may be buffered briefly
- the concurrent compare surface becomes visible before text begins
- the user sees "the cluster is ready" before "lane A happened to win the race"

### 6. Each lane owns its own segment-native transcript timeline

Within a concurrent lane, assistant delivery still follows the
segment-native rules from ADR-057.

That means:

- text, tool/status, waiting, and sealed phases stay inside the same lane
- same-speaker follow-up segments are lane-local, not new global transcript rows
- reconnect updates the same lane instead of creating a second lane for the
  same target

### 7. Session and connection events are lane-state updates, not lane creation

`session_started`, attach progress, and reconnect events remain useful
observability signals, but they must not decide whether a concurrent lane
exists.

They only transition an already-materialized lane through states such as:

- `pending`
- `connecting`
- `streaming`
- `sealed`
- `failed`

### 8. Durable transcript should preserve cluster semantics

After completion, the transcript should continue to preserve the notion that
these assistant responses belonged to the same concurrent user turn.

The product should keep the resulting assistant outputs grouped and ordered by
their cluster lanes instead of flattening them back into a timing-driven global
assistant list.

## Consequences

### Positive

- concurrent group chat becomes visibly concurrent instead of "secretly
  sequential startup"
- assistant lane positions stay stable and easier to scan
- all lanes can enter visible content mode together instead of exposing backend
  startup skew
- reconnect no longer implies a second bubble or a second speaker row
- session timing bugs become easier to diagnose because lane identity is no
  longer inferred from timing
- live and durable transcript semantics become closer to each other

### Negative

- the transcript renderer will need a cluster/lane concept above today's
  general bubble list
- read-model and persistence logic must preserve dispatch-time lane order
- server delivery will need a bounded buffering/multiplex layer so one fast lane
  does not leak text before the cluster is ready
- session/system-message rendering rules will need tightening so they do not
  fight lane visibility

### Neutral

- the backend may still start actual jobs sequentially for operational reasons
- this ADR does not define the final CSS/card treatment for lane containers
- this ADR does not by itself redesign direct-lane or default reconnect behavior

## Alternatives Considered

### Alternative 1: Keep a chronological bubble list and let session timing decide bubble creation

- **Pros**: smaller renderer change; uses existing transcript assumptions
- **Cons**: concurrent UX still looks sequential; reconnect keeps creating ghost
  or duplicate bubbles
- **Why rejected**: connection timing is not the user's mental model for a
  concurrent group turn

### Alternative 2: Key concurrent bubbles by `sessionId`

- **Pros**: easy to reconcile with runtime events
- **Cons**: reconnect creates new UI identity; the same logical target can
  appear multiple times
- **Why rejected**: `sessionId` describes a runtime attachment, not a stable
  response lane

### Alternative 3: Materialize lanes only when each target first streams text

- **Pros**: fewer placeholders before content appears
- **Cons**: lane order becomes timing-driven and unstable; slower targets look
  like they were not part of the fan-out
- **Why rejected**: it hides the fact that the turn already fanned out to all
  selected audiences

### Alternative 4: Materialize all lanes together but allow text to stream as soon as each lane is ready

- **Pros**: lower latency for the fastest lane; less server buffering
- **Cons**: the UI still reveals sequential startup timing and undermines the
  "all lanes started together" mental model
- **Why rejected**: this still makes concurrent group chat feel like a race
  between attachments instead of one coordinated compare turn

### Alternative 5: Solve concurrent UX by reusing Parallel Chat semantics

- **Pros**: stable compare-style layout already fits multi-lane thinking
- **Cons**: parallel chat is a different product boundary with private child
  chats, not one shared group transcript
- **Why rejected**: group-chat concurrent delivery still needs its own
  in-room cluster model

## References

- [ADR-042](./042-separate-channel-topology-from-routing-mode.md)
- [ADR-050](./050-use-ack-first-chat-dispatch-lifecycle.md)
- [ADR-057](./057-adopt-segment-native-assistant-transcript-delivery.md)
- [SPEC-052](../specs/SPEC-052-current-turn-recipients-dispatch-policy-and-parallel-chat-terminology.md)
- [SPEC-057](../specs/SPEC-057-concurrent-group-lane-native-live-transcript.md)
- [PLAN-048](../plans/PLAN-048-concurrent-group-lane-native-live-transcript.md)

---

*Proposed: 2026-04-14*
*Proposed by: Codex*
