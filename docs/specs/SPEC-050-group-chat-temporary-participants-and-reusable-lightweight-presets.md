# SPEC-050: Group Chat Temporary Participants and Reusable Lightweight Presets

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Draft |
| **Owner** | Codex |
| **Reviewer** | User |

## Summary

`Cats Chat` group chat currently assumes that every reusable group member must
already exist as a full `Cat` in the registry. That is too heavy for the common
case where the owner wants to spin up a few provider/model-backed specialists
for one room, compare their outputs, and move on.

The product should therefore support three distinct layers instead of forcing a
two-way choice between `full Cat` and `nothing`:

1. `Cat`
   A full reusable identity with optional persona, memory, skill, and longer-
   lived ownership semantics.
2. `Participant preset`
   A reusable lightweight template for future chats that keeps only minimal
   identity and execution-target information.
3. `Channel participant`
   A member that exists inside one chat channel and may be instantiated from a
   full Cat, a participant preset, or an ad hoc inline definition created
   during `+ Group chat`.

This spec sets the product direction that `+ Group chat` should allow direct
creation of temporary members for the current chat, while still providing a
promotion path to reusable lightweight presets and, later, full Cats.

## Goals

- let owners compose ad hoc multi-member group chats without a registry-first
  workflow
- avoid polluting `My Cats` with one-off reviewer / planner / coder variants
- preserve a reuse path for repeated temporary configurations without forcing
  full Cat creation
- keep transcript, mentions, and roster UI member-centric instead of exposing
  raw provider/model objects as the primary product concept
- keep token and prompt cost low by default for temporary and lightweight
  reusable participants
- align group chat UX with the accepted `entity` / `participant` direction
  instead of deepening Cat-only assumptions

## Non-Goals

- removing or devaluing full reusable Cats
- completing the entire generalized participant migration in the same slice
- replacing all current `assignedCats` storage and routing code in one pass
- making `provider/model` rows the primary visible identity in transcript UI
- requiring persona, memory, or skill authoring during ad hoc group member
  creation
- deciding the final long-term registry IA for every participant class outside
  the immediate `Chat` flow

## User Stories

- As an owner, I want to open `+ Group chat` and add two temporary specialists
  for this room only, so I do not have to create permanent Cats first.
- As an owner, I want those temporary members to look like named participants
  in the chat, so the transcript is readable and mentionable.
- As an owner, I want to save a temporary member as a reusable lightweight
  preset when I find a combination I use often.
- As an owner, I want to promote a lightweight preset into a full Cat only
  when I decide that it deserves persona, memory, skill, or transport setup.
- As a product developer, I want token cost to be driven by attached context
  layers, not by whether a participant happens to be persisted.

## Current Problem

Today the fresh `+ Group chat` flow is effectively tied to the existing Cat
registry:

- group member selection is based on existing Cat ids
- ad hoc provider/model specialists must be created as Cats first
- the add flow mixes current-chat assignment with registry creation
- one-off specialist combinations either pollute the registry or are not
  representable at all

This creates the wrong tradeoff:

- `full Cat` is too heavy for one-room experiments
- `no reusable middle layer` makes repeated ad hoc setups expensive

## Product Model

| Layer | Product Meaning | Lifetime | Reuse | Default Context Weight |
|-------|-----------------|----------|-------|------------------------|
| `Cat` | Full reusable helper identity | Cross-channel | Yes | Variable, may be rich |
| `Participant preset` | Reusable lightweight member template | Cross-channel | Yes | Minimal by default |
| `Channel participant` | Member instantiated in one channel | Per-channel | No, unless promoted | Minimal by default |

### Cat

`Cat` remains the correct model when the owner wants:

- durable identity
- persona or prompt shaping
- memory ownership
- skill or MCP attachments
- transport bindings
- clear presence in `My Cats`

### Participant Preset

`Participant preset` is the middle layer for repeated lightweight use:

- reusable across future `+ Group chat` flows
- not automatically part of `My Cats`
- no durable memory by default
- no heavy persona authoring by default
- no skill pack by default
- stores only lightweight member intent

### Channel Participant

`Channel participant` is the room member that actually appears in the chat:

- belongs to one channel
- may be sourced from:
  - full Cat
  - participant preset
  - ad hoc inline definition created in that chat
- carries the execution target snapshot used for that room
- is what the transcript, roster, mentions, and lead-routing surfaces should
  operate on

## Requirements

### Functional Requirements

1. `+ Group chat` shall continue to support selecting existing Cats directly as
   room members.
2. `+ Group chat` shall additionally allow the owner to create one or more
   ad hoc members for the current chat without first creating full Cats.
3. Ad hoc member creation shall collect only lightweight inputs:
   - display name
   - provider
   - optional instance
   - optional model
   - optional one-line role / focus description
4. Ad hoc members created during `+ Group chat` shall appear as named members in
   the group roster and transcript, not merely as provider/model settings.
5. These ad hoc members shall be channel-scoped by default and shall not appear
   in `My Cats` automatically.
6. The group member picker shall allow promoting a channel-scoped member into a
   reusable lightweight participant preset.
7. The product shall support promoting a participant preset into a full Cat as
   an explicit later action.
8. Reusable participant presets shall be available as future member choices in
   later `+ Group chat` flows.
9. Participant presets shall remain lighter than full Cats and shall not
   require persona, memory, or skill configuration.
10. Full Cats, presets, and channel-scoped members shall remain distinguishable
    in product semantics even if some early implementation slices share storage
    mechanics.
11. Group-chat roster, mention, and lead-selection behavior shall operate on the
    channel participant layer rather than assuming every member is a full Cat.
12. The product shall not make raw provider/model objects the primary visible
    concept for group members. The owner should add `participants`, not
    anonymous targets.
13. If a full Cat or preset is used to create a channel participant, the
    channel shall retain the execution-target snapshot needed to keep that room
    stable even if the source object changes later.
14. The product may offer `Save as preset` and `Save as Cat` from the same
    room-member affordance, but those shall remain distinct actions with
    different persistence semantics.

### Non-Functional Requirements

- **Entry Simplicity**: Group chat setup should remain chat-first and should not
  force the owner into registry management before the first turn.
- **Registry Hygiene**: One-off group specialists should not automatically
  pollute `My Cats`.
- **Transcript Clarity**: Group members should remain human-readable,
  name-addressable participants inside the room.
- **Token Efficiency**: Temporary participants and reusable lightweight presets
  should default to minimal injected context. Persistence alone must not imply
  heavier prompt hydration.
- **Migration Compatibility**: Early slices may reuse current Cat-backed wiring
  internally, but the outward product model must preserve the distinction
  between full Cats, reusable lightweight presets, and channel-scoped members.

## Design Overview

```text
+ Group chat
    |
    +--> Add member
           |
           +--> Existing Cat
           |
           +--> Saved preset
           |
           +--> Temporary participant
                    |
                    +--> name + target + optional role
                    +--> instantiate channel participant
                    +--> join this room only
                    +--> optional "Save as preset"
                    +--> optional later "Promote to Cat"
```

### Recommended UI Direction

- Keep the fresh `+ Group chat` surface clean and composer-first.
- Let the participant chip / side panel own member composition.
- In that member flow, offer:
  - `Existing Cats`
  - `Saved presets`
  - `Temporary participant`
- Treat `Create full Cat` as a later promotion path, not the default first step
  for ad hoc group composition.

### Recommended Data Direction

The long-term shape should separate:

- reusable full `Cat` entity
- reusable `participant preset`
- channel-scoped `participant`

For near-term compatibility, the implementation may still bridge through
current Cat-based routes and state, but it should do so in a way that does not
collapse these product distinctions back together.

### Token and Prompt Direction

Prompt and token cost should be controlled by injected context layers, not by
which persistence bucket the member came from.

The default prompt hydration for temporary participants and participant presets
should therefore be minimal:

- display name
- optional role line
- execution target

No implicit durable memory, persona block, or skill profile should be loaded
unless the owner explicitly upgrades that participant into a richer object or
attaches more context.

## Open Questions

- [ ] Should reusable participant presets live under `Settings > Cats`, under a
      separate `Participants` / `Presets` surface, or stay chat-local in the
      first slice?
- [ ] Should the first delivery slice allow saving one member at a time as a
      preset, or should it also support saving a whole group composition as a
      reusable team template?
- [ ] Should participant presets ever appear in `My Cats`, or should that
      roster remain reserved for full Cats only?
- [ ] In the first migration slice, should channel-scoped temporary members be
      represented internally as lightweight hidden Cats for compatibility, or
      should the first slice introduce a separate persisted preset/member shape
      immediately?

## References

- [SPEC-027](./SPEC-027-chat-first-information-architecture-and-default-boss-cat.md)
- [SPEC-030](./SPEC-030-composer-scoped-lead-cat-and-boss-auto-helper-semantics.md)
- [SPEC-047](./SPEC-047-compare-chat-concurrent-groups-and-relay.md)
- [SPEC-049](./SPEC-049-guide-cat-setup-and-generalized-participant-entry.md)
- [ADR-027](../decisions/027-adopt-chat-first-information-architecture-with-default-boss-cat.md)
- [ADR-042](../decisions/042-separate-channel-topology-from-routing-mode.md)
- [ADR-051](../decisions/051-generalize-participants-and-adopt-guide-cat-terminology.md)

---

*Created: 2026-04-07*
*Author: Codex*
*Related Plan: TBD*
