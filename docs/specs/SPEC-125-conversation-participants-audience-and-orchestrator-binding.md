# SPEC-125: Conversation Participants, Audience and Orchestrator Binding

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Draft |
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
5. FR-5: The participant limit counts every participant, the default one
   included.

### Audience

6. FR-6: Every message to a non-DM conversation carries an audience of one or
   more participant ids. The renderer never sends an empty audience.
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
    `bossCatId`. Several cats may be admins. Existing settings that choose the
    Boss Cat choose admins.
20. FR-20: An admin cat's avatar keeps the gold frame wherever cats are shown.

### Owner

21. FR-21: Each conversation and each artifact it produces records one owner,
    a person, and the producing agent as provenance.

### Remembered default

22. FR-22: Creating a non-DM conversation saves its first participant as
    `newChatDefaults`: a provider/model target or a cat id.
23. FR-23: A new draft starts with that participant: a provider/model chip, or
    a cat chip that looks like a DM's.

### Composer and header

24. FR-24: A DM, or a non-DM conversation with one participant, hides that
    participant's avatar in the composer, and the audience chip stands in for
    it: a provider/model chip, or a cat chip.
25. FR-25: With two or more participants, the participant avatars show and
    the audience chip chooses among them.
26. FR-26: The header shows no avatar for a cat that is not a participant.

### Data and release

27. FR-27: Removed: the default-chat mode, `pending*` on conversations,
    `implicit:execution_target`, `defaultRecipientId` outside DMs, the Lead
    badge, and the God Cat seeding paths. Zero-participant conversations and
    the old `newChatDefaults` shape are unsupported.
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

cat.group: admin | standard
newChatDefaults: { kind: 'model', provider, instance, model, modelSelection }
               | { kind: 'cat', catId }
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

## Open Questions

- [ ] Start fresh: reset a participant's session from its popover, or drop it.
- [ ] A message without an audience from Telegram, the API or mobile: send it
      to the coordinator, to every participant, or reject it.
- [ ] Draft minimums and seeding: one participant everywhere, with +New
      seeding the default participant only, `+` adding one at a time, +Group
      seeding the default participant plus one and +Parallel one per lane.
      This changes behavior the draft visibility matrix locks (the group
      minimum of two, the zero-to-two seeding and the two-participant send
      gate); each change needs explicit approval.
- [ ] Header roster with one participant: hide it like the composer, or keep it
      as a status row.
- [ ] Whether editing the default participant's model in a draft also updates
      `newChatDefaults` immediately, as it does today.
- [ ] Which coordination behaviors the coordinator keeps from today's
      orchestrator: continuation recommendations, handoff rewriting, product
      knowledge and collaboration tools.
- [ ] Where the admin group is managed in Settings.

## References

- [ADR-131](../decisions/131-let-the-audience-chip-choose-the-audience-and-the-avatar-choose-the-model.md)
- [ADR-132](../decisions/132-separate-participants-audience-and-the-orchestrator-binding.md)
- [SPEC-052](SPEC-052-current-turn-recipients-dispatch-policy-and-parallel-chat-terminology.md)
- [SPEC-013](SPEC-013-provider-catalog-consumption-and-ui-seam.md)

---

*Created: 2026-10-20*
*Author: Claude (with the owner)*
*Related Plan: [PLAN-118](../plans/PLAN-118-conversation-participants-audience-and-orchestrator-binding-rollout.md)*
