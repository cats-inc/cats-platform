# ADR-059: Adopt a Unified Conversation-Turn-Lane Engine

> Replace mode-driven chat architecture with one canonical multi-target engine
> whose behavior is specialized only by orthogonal policies such as topology,
> scheduler, sharing, coordinator capability, and presentation.

## Status

Proposed

## Context

`Cats Chat` has accumulated repeated regressions around:

- sequential handoff timing
- concurrent fan-out transcript structure
- direct-lane reconnect ordering
- ghost bubbles and duplicate same-speaker bubbles
- user-turn processing indicators
- session-start gating
- repair/replay divergence from live behavior

These regressions are not isolated UI bugs.

They come from a deeper architectural problem: the product still behaves as if
`default`, `direct lane`, `group sequential`, `group concurrent`, and `parallel`
were separate chat modes with partially shared internals.

Today, several layers still normalize state differently:

- server dispatch and wake paths
- session/lease ownership
- continuation and workflow handoff logic
- system-message/session-start matching
- live-indicator projection
- durable transcript repair and replay

That creates the same failure pattern repeatedly:

- one layer treats a runtime `sessionId` as speaker identity
- another layer treats a target or participant as speaker identity
- another layer infers transcript shape from event timing
- another layer reconstructs state heuristically after the fact

The result is a mode-driven architecture where each lane or room shape needs its
own patch.

This is no longer acceptable. The next chat re-architecture must be the last
major structural rewrite for the current product generation, and the project
needs a hard architectural contract that every future implementation detail must
obey.

## Decision

`cats-platform` should freeze Chat core around one canonical
conversation-turn-lane engine.

The engine must represent every chat flow using the same core write model and
must specialize behavior only through explicit policy seams.

### 1. Canonical model

The canonical Chat execution model is:

- `Container`
- `Conversation`
- `Turn`
- `Lane`
- `Segment`
- `Session`

The meaning of each layer is fixed:

- `Container`: optional parent that groups one or more conversations
- `Conversation`: one durable transcript and execution boundary
- `Turn`: one user/system-initiated dispatch cycle
- `Lane`: one stable target-specific response track inside a turn
- `Segment`: one lane-local rendered unit such as text/tool/status delivery
- `Session`: one runtime attachment generation for a lane

`Conversation` is the canonical shared contract term for the durable
thread-like unit across `Chat`, `Work`, and `Code`. Product/UI language may
still say `thread`, and kinds such as `chat_thread`, `code_thread`, or
`work_thread` remain valid labels, but they do not replace `Conversation` as
the underlying engine record name.

### 2. One engine, not many chat-mode engines

The product may continue to expose UX entries such as:

- `+New chat`
- `+Group chat`
- `+Parallel chat`
- direct/private lane

But those must become presets or compositions above the same engine, not
separate architectural modes.

The architecture must no longer be organized around a global `chatMode`
decision tree that changes core identity, replay, or transcript semantics.

### 3. Behavior must come from orthogonal policies

The only allowed specialization dimensions are:

- `topology`
  - direct lane
  - shared room
  - parallel container
- `lane set`
  - one lane
  - multiple lanes
- `scheduler policy`
  - serial
  - concurrent
- `sharing policy`
  - shared transcript
  - isolated child conversations
  - relay-only
- `coordinator capability`
  - none
  - hidden Boss Cat
  - visible Boss Cat
- `presentation surface`
  - chronological transcript
  - clustered concurrent transcript
  - parallel compare container

No single policy is allowed to redefine the underlying write model.

### 4. Lane identity is canonical; session identity is ephemeral

Each response lane must have a stable lane identity such as `targetStateId`.

That identity is the canonical key for:

- live projection
- durable transcript grouping
- reconnect continuation
- repair/replay
- tests and observability

`sessionId` is not lane identity. It only identifies the current runtime
attachment generation for that lane.

Changing `sessionId` must never create a new logical bubble or lane.

### 5. Sequential semantics require frontier propagation

For any serially scheduled multi-lane turn, later lanes must receive the
completed frontier from earlier lanes.

This applies to both:

- explicit continuation handoff
- initial audience order that was declared `sequential` at dispatch time

That means a later sequential lane must not be built only from the original
user message if earlier lanes in the same turn have already completed.

At minimum, the engine must guarantee that later sequential lanes can see:

- the earlier completed lane outputs
- the current turn frontier that produced their dispatch

Whether this is materialized as a lane frontier object, prompt transcript
projection, or both is an implementation detail. The semantic guarantee is not.

### 6. Transcript projection is derived from canonical state, not event timing

Transcript structure must be projected from canonical turn/lane state.

It must not be inferred from:

- `session_started` timing
- first token timing
- connection order
- EventSource reconnect timing
- accidental bubble insertion order

System messages remain useful diagnostics and user-facing notes, but they must
not own the existence, ordering, or identity of assistant bubbles.

### 7. Repair and replay must rebuild, not reinterpret

Repair logic must replay canonical state and rebuild projections from it.

Repair must not:

- guess which speaker comes next
- synthesize transcript structure from partial heuristics
- silently finalize active turns because a temporary gap looked terminal
- invent UI-visible identity rules not present in canonical state

### 8. Boss Cat is an optional coordinator capability

Boss Cat must not define a separate topology or chat-mode architecture.

Boss Cat is an optional coordinator capability layered above the same engine.

Two forms are allowed:

- `hidden Boss Cat`: orchestration only, no transcript presence
- `visible Boss Cat`: orchestration plus visible transcript contributions

Boss Cat may influence:

- target resolution
- scheduler choice
- retry/fallback/reroute policy
- fan-in and review policy
- approval/budget/governance rules

Boss Cat must not redefine:

- lane identity
- session identity
- transcript bubble identity
- the core turn/lane lifecycle

### 9. Parallel Chat is container composition, not special transcript logic

Parallel Chat must be modeled as a `Container` that owns multiple child
conversations.

It must not force the shared engine to pretend that all child branches belong to
one room transcript.

This allows the platform to compose:

- one direct lane
- one shared group room
- one sequential group room
- one concurrent group room

inside the same parent container without redefining the core engine.

### 10. Observability is part of the core contract

Every important runtime-to-product event must be traceable with a stable tuple
that includes:

- `containerId`
- `conversationId`
- `turnId`
- `laneId`
- `segment ordinal`
- `sessionId`
- `scheduler policy`
- `coordinator capability`

This is required so live, replayed, and repaired behavior can be compared
without relying on ad hoc debug inference.

## Core Invariants

The following invariants are mandatory for all future Chat work:

1. There is exactly one canonical write model: `Container -> Conversation -> Turn -> Lane -> Segment -> Session`.
2. `laneId` and `sessionId` must never be treated as the same identity.
3. A turn is an execution unit; a transcript row or bubble is only a projection.
4. Transcript structure must come from canonical turn/lane state, not event arrival order.
5. System messages may annotate state, but may not own bubble existence or ordering.
6. Repair/replay may rebuild projections, but may not invent new business semantics.
7. Serial scheduling must propagate completed frontier into later sequential lanes.
8. Concurrent scheduling must preserve stable lane order regardless of runtime timing.
9. Boss Cat is an optional coordinator capability, not a separate engine topology.
10. Product presets may vary UX entry points, but must not fork the core engine contract.

## Consequences

### Positive

- future fixes can target one engine instead of mode-specific patches
- sequential, concurrent, direct, and parallel behavior become comparable under
  one vocabulary
- lane/session bugs become easier to reason about and test
- Boss Cat can be added or removed without re-architecting transcript identity
- repair and live rendering can converge on the same state source

### Negative

- existing mode-specific assumptions will need to be removed, not just wrapped
- several server and renderer seams will need deeper normalization work before
  the architecture actually matches this ADR
- some current tests will need to be rewritten around turn/lane identity rather
  than transcript timing artifacts

### Neutral

- the product may keep current UX labels such as `+New chat`, `+Group chat`,
  and `+Parallel chat`
- not every surface must render the same projection, as long as they share the
  same underlying engine contract

## Alternatives Considered

### Alternative 1: Keep mode-driven architecture and patch each flow separately

- **Pros**: lower immediate rewrite pressure; smaller local fixes
- **Cons**: repeats the same identity, reconnect, and transcript regressions in
  every mode boundary
- **Why rejected**: this is the pattern that already consumed too much time and
  does not converge

### Alternative 2: Share only the renderer and keep upstream normalization split

- **Pros**: smaller UI refactor; appears to reduce duplication
- **Cons**: server, repair, and live routing would still disagree on what a
  lane or bubble means
- **Why rejected**: shared UI on top of divergent upstream semantics only hides
  the architectural problem

### Alternative 3: Make Boss Cat a first-class special chat mode

- **Pros**: easy to explain in product terms
- **Cons**: mixes coordination authority with topology and transcript identity
- **Why rejected**: Boss Cat should be optional capability, not a new engine
  branch

### Alternative 4: Keep using `sessionId` or system messages as UI truth

- **Pros**: close to runtime event stream; convenient for quick patches
- **Cons**: reconnect and timing races keep producing ghost or duplicate bubbles
- **Why rejected**: runtime attachment is not the same thing as durable lane
  identity

### Alternative 5: Treat Parallel Chat as a one-off feature outside the shared model

- **Pros**: less abstraction work up front
- **Cons**: prevents composition of direct/group/sequential/concurrent flows
  under a common parent
- **Why rejected**: the platform needs container composition, not another
  isolated branch of chat architecture

## References

- [ADR-017](./017-allow-direct-cat-chat-and-move-routing-into-system-layer.md)
- [ADR-024](./024-separate-explicit-mentions-from-dynamic-room-workflow.md)
- [ADR-042](./042-separate-channel-topology-from-routing-mode.md)
- [ADR-050](./050-use-ack-first-chat-dispatch-lifecycle.md)
- [ADR-055](./055-retire-lead-and-separate-composer-recipients-from-dispatch-policy.md)
- [ADR-057](./057-adopt-segment-native-assistant-transcript-delivery.md)
- [ADR-058](./058-adopt-lane-native-concurrent-group-transcript-delivery.md)

---

*Proposed: 2026-04-14*
*Proposed by: Codex*
