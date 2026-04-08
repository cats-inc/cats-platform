# ADR-055: Retire Lead Semantics and Separate Composer Recipients from Dispatch Policy

> Stop treating `lead_cat` / `leadParticipantId` as the organizing concept for
> Cats Chat. The composer should speak in terms of current-turn recipient(s),
> while dispatch policy decides whether those recipients reply sequentially or
> concurrently.

## Status

Accepted

Supersedes:

- ADR-031: Separate Composer Lead Control from Boss Orchestration Authority

## Context

Recent Cats Chat layout discussion exposed four separate problems:

1. The composer slot to the left of Send is carrying the wrong meaning.
   - Sometimes it behaves like a room roster.
   - Sometimes it behaves like a mode switch.
   - Sometimes it behaves like a "lead" identity.
2. Treating `pending provider/model` as a standalone `solo` mode is misleading.
   - From the user's perspective, it still means "this is who I am asking next."
   - It behaves like an unnamed or implicit counterpart, not like the absence
     of a counterpart.
3. The word `lead` has become overloaded.
   - default visible responder
   - fixed room captain
   - orchestration authority
   - direct-lane counterpart
4. The word `parallel` now collides across two different product concepts.
   - `Parallel Chat` is already a distinct product mode for isolated multicast
     comparison.
   - thread-internal multi-recipient fan-out currently also uses `parallel`
     in contracts and trace metadata.

At the same time, the product wants a simpler Cats Work demo path where
multiple recipients may reply one after another. That behavior is easier to
explain when recipient selection and dispatch policy are separate concepts.

## Decision

### 1. Retire `lead` as the primary Cats Chat conversation-control concept

`lead_cat`, `leadCatId`, and `leadParticipantId` are retired as the intended
product language for the composer and routing model.

The product should instead talk about:

- `recipient` or `current-turn recipient`
- `default recipient(s)`
- `dispatch policy`

Direct lanes, single-counterpart threads, and team rooms may still have one
default counterpart, but that default should no longer be described as the
session's permanent `lead`.

### 2. The composer target slot represents current-turn recipient(s)

The slot to the left of Send is the answer to:

`If this message is sent now, who is it being sent to first?`

That slot must not be used to show the entire room roster.

Room roster and room context belong in:

- the header bar
- room side panels
- participant-management surfaces

### 3. `pending provider/model` is an implicit recipient, not a separate conversation mode

When no named participant is selected and the next turn is controlled by
provider/model selection, the product should treat that target as an
`implicit recipient`.

This means:

- the composer still truthfully shows who the next turn is addressed to
- product semantics no longer depend on a special "no recipient exists" story
- temporary participants, named Cats, and model-backed implicit recipients can
  be explained through one mental model

### 4. Recipient selection and dispatch policy are separate layers

The product separates:

- `recipient(s)`: who the outgoing message is addressed to
- `dispatch policy`: how those recipients should reply
- `workflow continuation`: what may happen after those addressed replies

`dispatch policy` must support:

- `sequential`
- `concurrent`

This policy may be chosen:

- when the channel is created
- again before each send as a per-turn override

### 5. A multi-recipient stack does not imply one specific policy

Multiple recipients shown in the composer stack mean only:

- this outgoing turn is addressed to multiple counterparts

They do not by themselves force `concurrent` dispatch.

If the selected policy is `sequential`, the stack order is the intended reply
order.

The UI does not need extra numbering by default; stack order is enough.

### 6. Reserve `Parallel Chat` for the isolated multi-chat product mode

The word `parallel` is reserved for the existing product mode that binds
multiple isolated child chats into one comparison container.

Thread-internal multi-recipient execution must use `concurrent` instead.

This means the terminology cleanup is two-sided:

- thread workflow shape moves from `parallel` to `concurrent`
- `Parallel Chat` internals should stop using `concurrentGroups` style names
  and move to `parallelChat*` naming

## Consequences

### Positive

- the composer slot gets one stable meaning
- `pending provider/model` and temporary participants now fit the same product
  model
- sequential multi-recipient demos become easier to explain
- orchestration can stay separate from front-stage conversation targeting
- `Parallel Chat` keeps its own clear vocabulary

### Negative

- the refactor is cross-cutting and touches frozen shared contracts
- older lead-based docs and specs must be superseded
- renderer, routing, API contracts, and tests all need coordinated renaming

### Neutral

- this ADR does not force a final visual design for the recipient chips
- this ADR does not require implicit recipients to be persisted as full
  participant records immediately
- this ADR does not eliminate orchestration authority; it separates that layer
  from recipient selection

## Alternatives Considered

### Alternative 1: Keep `lead` as a narrow default-responder term

- **Pros**: less immediate rename work
- **Cons**: still leaves the composer speaking in a room-role vocabulary rather
  than a turn-target vocabulary
- **Why rejected**: the user wants the slot to answer "who am I talking to
  with this message?", not "who is this room's lead?"

### Alternative 2: Make multi-recipient selection always mean `concurrent`

- **Pros**: simpler default rule
- **Cons**: blocks approachable sequential demos and confuses recipient
  selection with delivery policy
- **Why rejected**: Cats Work and handoff-style flows need sequential
  multi-recipient turns to remain first-class

### Alternative 3: Keep `parallel` for thread fan-out and `concurrent` for Parallel Chat internals

- **Pros**: fewer thread-workflow renames
- **Cons**: the product-facing mode called `Parallel Chat` would still be
  backed by `concurrent*` internals while thread execution kept `parallel`,
  which is the opposite of the intended product story
- **Why rejected**: if terminology is being cleaned up before launch, it should
  converge on the product language now

## References

- [ADR-024](./024-separate-explicit-mentions-from-dynamic-room-workflow.md)
- [ADR-031](./031-separate-composer-lead-control-from-boss-orchestration-authority.md)
- [ADR-042](./042-separate-channel-topology-from-routing-mode.md)
- [ADR-051](./051-generalize-participants-and-adopt-guide-cat-terminology.md)
- [SPEC-030](../specs/SPEC-030-composer-scoped-lead-cat-and-boss-auto-helper-semantics.md)
- [SPEC-050](../specs/SPEC-050-group-chat-temporary-participants-and-reusable-lightweight-presets.md)
- [SPEC-052](../specs/SPEC-052-current-turn-recipients-dispatch-policy-and-parallel-chat-terminology.md)

---

*Decision made: 2026-04-08*
*Decision makers: User, Codex*
