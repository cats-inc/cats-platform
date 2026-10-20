# SPEC-125: Conversation Participants, Audience and Orchestrator Binding

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Approved |
| **Owner** | Owner |
| **Reviewer** | Owner |

## Summary

Every conversation has participants, the agents in the room. A DM has exactly
one, its cat; any other conversation has at least one, the first seeded from
the remembered default. Each message has an audience chosen from them. A
conversation may bind one participant as its coordinator, the orchestrator
mechanism, and authority beyond the conversation needs that coordinator to be
an admin cat. People own conversations and their artifacts. This replaces the
implicit God Cat, the Lead Cat, the default-chat mode and the orchestrator's
implied Boss Cat authority
([ADR-132](../decisions/132-separate-participants-audience-and-the-orchestrator-binding.md)).

## Goals

- One UI rule for drafts and started conversations: a DM, or the participant
  count.
- The audience shown on the chip is the audience the message is sent to.
- Coordination and authority are explicit, inspectable and changeable.
- A user can start a non-DM conversation with any cat.

## Non-Goals

- Migrating existing data: the owner resets it (ADR-132 §9).
- Multi-person ownership UI or transfer flows beyond the data rule.
- Changing DMs beyond binding their cat as coordinator.
- New work or collaboration capabilities; only who may use them changes.

## Terms

- **Participant**: an agent assigned to a conversation, stored as a participant
  record. Kinds: *cat* (lasting identity) and *provider/model* (exists only in
  the conversation; today's temporary participant).
- **Default participant**: the first participant a new non-DM conversation is
  seeded with.
- **Audience**: the participants one message is sent to.
- **Coordinator**: the participant bound to the conversation's orchestrator.
- **Admin / standard**: a cat's identity group. Provider/model participants
  are standard.
- **Owner**: the person a conversation and its artifacts belong to.

## Requirements

### Participants

1. FR-1: A DM has exactly one participant, its cat.
2. FR-2: Creating any other conversation stores at least one participant
   record, its first being the default participant from `newChatDefaults`.
   This applies to every creator: the renderer draft, Code sessions,
   collaboration rooms, Telegram rooms and parallel-chat members (each member
   seeded from its lane target).
3. FR-3: Participant order is insertion order. Cats do not sort ahead of
   provider/model participants.
4. FR-4: A participant can be removed while another remains; the last one
   cannot. Archiving, deleting or removing Chat from a cat must not leave a
   non-DM conversation without participants.
4a. FR-4a: The data model and the server allow a group with one participant.
   Only the UI keeps group entries (+Group, +Team Code, +Team Work) at two or
   more, behind an internal flag that defaults on and has no Settings control
   yet: on, the composer cannot remove a group's second-to-last participant;
   off, a group can drop to one and still send.
5. FR-5: The participant limit counts every participant, the default one
   included.

### Audience

6. FR-6: Every message to a non-DM conversation carries an audience of one or
   more participant ids, from every client and from server-internal senders
   such as collaboration hand-offs. The server rejects a non-DM message
   without an audience. A DM message needs none: it goes to the DM's cat.
7. FR-7: Audience keys identify participants by participant id in drafts and
   started conversations alike, and provider/model participants count as
   active participants.
8. FR-8: A new conversation's composer preselects every participant; later
   turns preselect the previous turn's audience.
9. FR-9: Audience order sets the order of a sequential turn and nothing else.
10. FR-10: `@name` adds that participant to the turn's audience. There is no
    `@Orchestrator` alias.

### Orchestrator binding

11. FR-11: A conversation stores `coordinatorParticipantId`, a participant id
    or null. Creation binds the first participant; a DM binds its cat.
12. FR-12: The coordinator can be moved to another participant or cleared from
    a participant's popover. Removing the coordinator clears the binding.
13. FR-13: Coordination runs in the coordinator's own session. No separate
    orchestrator session or lease exists.
14. FR-14: Without a coordinator, a message reaches exactly its audience and
    nothing is routed on.
14a. FR-14a: The coordinator keeps continuation recommendations and product
    knowledge. Collaboration tools act beyond the conversation and follow
    FR-17. The default-chat reply rewrite (a second pass that strips
    `@mentions` when nobody else is in the room) goes; an `@mention` of a
    non-participant is handled as any unresolved mention.

### Permissions

15. FR-15: Each participant works inside the conversation with its own tools.
16. FR-16: Routing on and handing off to other participants require the
    coordinator.
17. FR-17: Actions beyond the conversation require the coordinator to be an
    admin cat: opening conversations, assigning or preparing work,
    cross-conversation collaboration and similar host operations.
18. FR-18: The orchestrator is never treated as a Boss Cat by role alone.

### Identity groups

19. FR-19: Each cat has a group, `admin` or `standard`, replacing
    `bossCatId`. Several cats may be admins. Settings › Cats replaces choosing
    the Boss Cat with an admin switch on each cat.
20. FR-20: An admin cat's avatar keeps the gold frame wherever cats are shown.

### Owner

21. FR-21: Each conversation and each artifact it produces records one owner,
    a person, and the producing agent as provenance.

### Remembered default

22. FR-22: Creating a non-DM conversation saves its first participant as
    `newChatDefaults`: a provider/model target or a cat id. Editing the first
    participant's model in a draft saves it immediately, as today.
23. FR-23: A new draft starts with that participant: a provider/model chip, or
    a cat chip that looks like a DM's.

### Composer and header

24. FR-24: A DM, or a non-DM conversation with one participant, hides that
    participant's avatar in the composer, and the audience chip stands in for
    it: a provider/model chip, or a cat chip.
25. FR-25: With two or more participants, the composer shows the participant
    avatars and the audience chip chooses among them. The first `+` therefore
    turns the one-participant view into a two-participant view; the default
    participant was there all along.
26. FR-26: The header shows every participant's avatar, one included, as a
    one-to-one chat shows who it is with. A conversation with only its
    provider/model default participant now shows that participant there. The
    header shows no avatar for a cat that is not a participant.

### Data and release

27. FR-27: Removed: the default-chat mode, `pending*` on conversations,
    `implicit:execution_target`, `defaultRecipientId` outside DMs, the Lead
    badge, the God Cat seeding paths, Start fresh (the chip popover's button
    and hint, the `resetContinuity` request, `continuityResetAt` and its
    system message), the default-chat reply rewrite, and the Telegram
    bridge's non-DM room fallback (bindings are always DMs). Zero-participant
    conversations and the old `newChatDefaults` shape are unsupported.
28. FR-28: The release that ships this is the next minor (0.9.0), and its
    notes tell operators to reset Platform data
    ([Reset Platform data](../deployment.md#reset-platform-data)).

### Non-Functional Requirements

- **Security**: Cross-conversation actions check both the coordinator binding
  and the admin group on the server, never only in the renderer.
- **Compatibility**: Frozen contracts change (see Dependencies) through the
  integration review the parallel-delivery rules require.

## Design Overview

```
conversation
├── owner: person
├── participants: [p1 (default), p2, …]   insertion order, ≥1 (DM: exactly its cat)
├── coordinatorParticipantId: p? | null    DM: its cat
└── messages[i].audience: [p…]             ≥1, from participants

cat.group: admin | standard            Boss Cats are the admin group
newChatDefaults: { catId | null, provider, instance, model, modelSelection }
                 a cat when catId is set, else the provider/model, which also
                 stays the model a draft falls back to
```

Routing for a message:

1. Send to its audience, in order when sequential.
2. With a coordinator, the coordinator may route on or hand off; actions beyond
   the conversation also need the coordinator to be an admin.
3. Without a coordinator, stop after the audience.

## Dependencies

- Frozen contracts: `src/products/chat/api/contracts.ts` (channel creation,
  participants, `newChatDefaults`, message metadata), `src/core/types.ts` if
  cat groups or owners live there, and `src/platform/orchestration/contracts.ts`
  for the orchestrator target.
- Runtime session handling: the coordinator reuses its participant session.

## Decisions

Closed with the owner on 2026-10-20:

- Start fresh is removed, not moved to participants (FR-27).
- A non-DM message must carry an audience; there is no fallback recipient
  (FR-6). Telegram is DM-only. The mobile app sends no audience today and
  gains an audience control before the server starts rejecting messages
  without one.
- The group minimum of two is a UI rule behind an internal flag (FR-4a). The
  draft visibility matrix's locked behavior is unchanged: the group minimum,
  the two-participant send gate and the first `+` producing two participants
  all hold (FR-25).
- The header keeps one participant's avatar (FR-26).
- Draft edits to the first participant's model save the remembered default
  immediately (FR-22).
- The coordinator keeps continuation recommendations and product knowledge;
  collaboration tools need an admin coordinator; the reply rewrite goes
  (FR-14a).
- Settings › Cats manages the admin group (FR-19).

Settled during implementation, 2026-10-20:

- The admin group keeps the visible name Boss Cat (主控貓); the field is
  `cat.group`.
- `newChatDefaults` is `{ catId, provider, instance, model, modelSelection }`
  rather than a tagged union, so the model a draft falls back to survives a
  remembered cat. Creating a non-DM conversation through the API saves its
  first participant; server-internal creators (Code sessions, collaboration
  rooms, parallel members, Telegram) do not.
- A creator orders participants with `participantOrder` (`cat:<catId>` and
  `temp:<participantId>` keys); unlisted ones follow in input order.
- FR-4 is met by seeding: when archiving, deleting or removing Chat from a cat
  leaves a non-DM conversation empty, the remembered default joins it. Removing
  the last participant directly is refused with 409 `last_participant`.
- `DELETE /api/channels/:id/participants/:participantId` removes a cat or a
  temporary participant; `PATCH /api/channels/:id` with
  `coordinatorParticipantId` moves or clears the binding.
- A message's audience is its `recipientParticipantIds` plus the participants it
  @mentions (FR-10). A non-DM message whose audience is empty is refused with
  400 `audience_required`; a choice response returns to the participant that
  asked. Server-internal senders name their audience: a parallel member turn
  without its own goes to that member's participants.
- Only the coordinator routes turns on (@mentions and workflow
  recommendations in its replies); other participants answer and stop, and
  their prompt says a mention does not route.

## References

- [ADR-131](../decisions/131-let-the-audience-chip-choose-the-audience-and-the-avatar-choose-the-model.md)
- [ADR-132](../decisions/132-separate-participants-audience-and-the-orchestrator-binding.md)
- [SPEC-052](SPEC-052-current-turn-recipients-dispatch-policy-and-parallel-chat-terminology.md)
- [SPEC-013](SPEC-013-provider-catalog-consumption-and-ui-seam.md)

---

*Created: 2026-10-20*
*Author: Claude (with the owner)*
*Related Plan: [PLAN-118](../plans/PLAN-118-conversation-participants-audience-and-orchestrator-binding-rollout.md)*
