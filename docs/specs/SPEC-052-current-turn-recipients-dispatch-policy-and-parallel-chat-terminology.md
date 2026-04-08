# SPEC-052: Current-Turn Recipients, Dispatch Policy, and Parallel Chat Terminology

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Approved |
| **Owner** | Codex |
| **Reviewer** | User |
| **Supersedes** | [SPEC-030](./SPEC-030-composer-scoped-lead-cat-and-boss-auto-helper-semantics.md) |

## Summary

Cats Chat should stop framing the composer around a permanent `lead` actor.
The composer slot next to Send should represent the current turn's addressed
recipient(s), while a separate dispatch-policy control decides whether those
recipients reply sequentially or concurrently.

This spec also cleans up terminology around `Parallel Chat` so the product mode
keeps the word `parallel`, while thread-internal multi-recipient execution uses
`concurrent`.

## Goals

- make the composer slot truthful about who the next outgoing turn is addressed to
- stop using the composer slot as a room-roster surface
- treat `pending provider/model` as an implicit recipient rather than a
  special "no counterpart exists" mode
- allow multi-recipient turns to be either `sequential` or `concurrent`
- keep sequential multi-recipient behavior easy to demonstrate in Cats Work
- reserve `parallel` for the `Parallel Chat` product mode and remove the
  current terminology collision
- retire lead-based product language from this area before launch

## Non-Goals

- final visual styling for recipient chips or header chrome
- a complete redesign of transcript bubbles or participant management
- immediate persistence of implicit recipients as full participant records
- the full implementation plan for every file rename in the repo
- changing the product meaning of `Parallel Chat` into a shared-thread room

## Product Surface Split

The UI should separate these concerns cleanly:

### Header / Room Context

The header answers:

- what room is this
- who belongs to this room
- what high-level mode or context am I in

The header may show:

- participant roster
- room title
- room topology
- room-level controls

### Composer Recipient Slot

The slot to the left of Send answers:

- if I send this message now, who is it being sent to

It should show one or more `current-turn recipients`.

It should not show the full room roster.

### Dispatch Policy Control

The composer may expose a separate control that answers:

- should these recipients reply one after another or together

The UI copy may be friendly, for example:

- `Take turns`
- `Reply together`

The contract terms remain:

- `sequential`
- `concurrent`

### Workflow / Orchestration Surface

Workflow continuation answers:

- what may happen after the addressed recipients reply
- whether the system may hand off, converge, or suggest the next step

This is not the same thing as current-turn recipient selection.

## Core Model

### Current-Turn Recipient

A `current-turn recipient` is the participant or implicit target that the next
outgoing message is addressed to.

Recipient types:

1. `named participant`
   - an existing Cat-backed or temporary room participant
2. `implicit recipient`
   - a provider/model-backed target represented through pending model selection

### Default Recipients

Each channel may define a default recipient set that applies when the user does
not override it for the next send.

That default may contain:

- one implicit recipient
- one named participant
- multiple named participants

Stored default recipients are channel-level defaults.

They should not be rewritten merely because:

- a different participant was explicitly addressed for one turn
- a different participant happened to reply last
- one sequential step in a workflow passed through another participant

### Dispatch Policy

`dispatch policy` is how the addressed recipients should respond.

Supported values:

- `sequential`
- `concurrent`

Dispatch policy exists at two scopes:

1. channel default
2. send-turn override

The send-turn override wins for that outgoing message only.

### Workflow Continuation

Workflow continuation begins after the addressed recipients have replied or
failed.

Examples:

- continue to another participant
- converge results
- await user input

This layer must remain separate from both recipient selection and dispatch
policy.

Workflow continuation may preselect the next turn's transient recipient set,
but that is not equivalent to rewriting the stored channel defaults.

## Interaction Rules

### Single Recipient

When one recipient is selected:

- the composer shows that one target
- dispatch policy may still exist, but it is effectively moot for that turn

### Multiple Recipients

When multiple recipients are selected:

- the composer shows a stack of those recipients
- stack order is meaningful
- stack order is the reply order when dispatch policy is `sequential`
- the UI does not need explicit numeric badges by default

### Explicit Mentions

If the user explicitly mentions one or more valid participants for the current
turn, the composer should treat them as current-turn recipients for that send.

The recipient stack should therefore reflect the actual addressed targets, not
the full room roster.

Unresolved mentions should remain warnings or validation feedback, not hidden
members of the recipient stack.

### Pending Provider/Model

If the outgoing turn is currently aimed at a provider/model selection rather
than a named participant, the composer must render that selection as an
implicit recipient.

The product should not describe this state as "no recipient."

### Sequential Ordering

For sequential multi-recipient turns:

- the composer stack order is the intended reply order
- the user may reorder recipients before sending
- the UI does not need a separate order badge or numbering treatment by default

### Per-Send Override

Before each send, the operator may override:

- recipient set
- dispatch policy

If no override is applied, the channel defaults are used.

### Default-Recipient Progression

For the first slice:

- explicit mention routing does not silently rewrite stored channel defaults
- a participant replying last does not silently become the new default
- workflow continuation may preselect the next transient current-turn
  recipient(s)
- changing the stored channel default requires explicit user action

This keeps conversation progress flexible without reintroducing a permanent
lead concept.

## Layout Requirements

1. The composer recipient slot shall represent current-turn recipient(s) only.
2. The composer recipient slot shall not be used as a full room-roster summary.
3. The header and participant surfaces shall carry room membership and room
   context.
4. Transcript bubbles shall continue to show actual speakers, not inferred
   leads.
5. Workflow and orchestration UI shall not masquerade as extra recipients in
   the same chip style.

## Terminology Requirements

1. `lead`, `leadCat`, and `leadParticipant` shall be retired from new
   product-facing Chat terminology in this area.
2. `pending provider/model` shall be documented as an `implicit recipient`.
3. `parallel` shall be reserved for the `Parallel Chat` product mode.
4. Thread-internal multi-recipient execution shall use `concurrent`.
5. User-facing docs and UI should speak about `recipient(s)` and `dispatch
   policy`, not about a permanent session lead.

## Contract and Naming Cleanup Requirements

This spec intentionally requires a real rename pass before launch rather than a
long-lived compatibility seam.

The required renames may land in sequenced implementation phases rather than a
single patch, but the shipped product should not preserve both vocabularies as
competing active terminology.

### Thread Workflow Contracts

Thread workflow contracts should migrate:

- from `parallel`
- to `concurrent`

Examples include:

- workflow shape values
- stage ids such as `parallel_fan_out`
- trace and checkpoint wording
- tests that describe thread-internal fan-out

### Parallel Chat Contracts

`Parallel Chat` internals should migrate:

- from `concurrentGroups`
- to `parallelChatGroups`

This applies to:

- API contracts
- state shapes
- busy keys
- route names
- renderer helpers
- tests and docs

### Lead-Based Compatibility Terms

The refactor should remove lead-based terms from shared and renderer-facing
contracts involved in this flow.

Transitional branch-local migration code is acceptable while the rename is in
flight, but the resulting landed contracts should not preserve `lead` as a
first-class compatibility concept for this feature area.

## Migration Direction

The implementation plan should at minimum audit:

- `src/shared/roomRouting.ts`
- `src/products/chat/api/contracts.ts`
- `src/products/chat/state/**`
- `src/products/chat/renderer/**`
- `tests/**`
- relevant docs and indexes

The migration should produce one coherent vocabulary:

- `recipient`
- `default recipient(s)`
- `implicit recipient`
- `dispatch policy`
- `sequential`
- `concurrent`
- `Parallel Chat`
- `parallelChat*`

## Rationale

This model keeps the product explanation simple:

- the composer says who you are talking to
- the dispatch control says how they should answer
- the workflow layer says what happens after that

That separation makes Cats Chat easier to understand, and it gives Cats Work a
more approachable sequential handoff story without inventing a second composer
mental model.

## Related Documents

- [ADR-024](../decisions/024-separate-explicit-mentions-from-dynamic-room-workflow.md)
- [ADR-042](../decisions/042-separate-channel-topology-from-routing-mode.md)
- [ADR-051](../decisions/051-generalize-participants-and-adopt-guide-cat-terminology.md)
- [ADR-055](../decisions/055-retire-lead-and-separate-composer-recipients-from-dispatch-policy.md)
- [SPEC-047](./SPEC-047-compare-chat-concurrent-groups-and-relay.md)
- [SPEC-050](./SPEC-050-group-chat-temporary-participants-and-reusable-lightweight-presets.md)
