# ADR-132: Separate Participants, Audience and the Orchestrator Binding

## Status

Accepted, 2026-10-20. The owner set the model after a room of temporary
participants showed the default chat's model chip instead of its audience
(fixed narrowly in #282). It extends
[ADR-131](131-let-the-audience-chip-choose-the-audience-and-the-avatar-choose-the-model.md),
which keeps the audience chip for the audience and the avatar for the
participant. [SPEC-125](../specs/SPEC-125-conversation-participants-audience-and-orchestrator-binding.md)
specifies it and [PLAN-118](../plans/PLAN-118-conversation-participants-audience-and-orchestrator-binding-rollout.md)
stages it. Until those land, current behavior stays as described in SPEC-052
and SPEC-013.

## Context

- **Two meanings of "default chat".** The renderer's `resolveConversationMode`
  calls a conversation without active cats a default chat, so a room of
  temporary participants gets the default chat's model chip. The send path's
  `isDefaultChatChannel` counts every participant, so the same room is a
  participant chat.
- **An implicit "God Cat".** A conversation without participants is answered
  by the orchestrator on a separate session, with the provider/model stored on
  the conversation (`pending*`). Drafts show it as `implicit:execution_target`.
  It is not a participant: it cannot be counted, removed or chosen as audience,
  and adding a participant silently retires it.
- **The orchestrator carries identity and authority.** In participant rooms it
  speaks as the Boss Cat, answers every message without recipients, and is
  always treated as the `boss_cat` work capability, whatever model it runs.
  Only one Boss Cat exists (`bossCatId`).
- **"Lead" is vestigial.** `defaultRecipientId` is only a stream fallback
  outside DMs; its ★ badge has had no renderer since 2026-04-18 and lost its
  last host in #279.
- **The audience does not reach the send path.** The started-conversation chip
  keys participants as `participant:<id>` while send metadata expects
  `cat:<catId>` from cats only, so an audience picked on the chip is ignored
  and a temporary-participant room falls back to the orchestrator after its
  first message.

## Decision

1. **Owner.** Every conversation has exactly one owner: a person (the account).
   Ownership can move to another person. Artifacts produced in a conversation
   are owned by a person too; the agent that produced them is recorded as
   provenance, not as owner. Agents never own.
2. **Identity groups.** Each cat belongs to a group: `admin` or `standard`.
   Boss Cats are the admin group, and there may be several; today's Boss Cat
   becomes an admin. Temporary (provider/model) participants have no lasting
   identity and are always standard.
3. **Participants.** Participants are the agents in a room, available whether
   or not they are addressed.
   - A DM has exactly one participant: its cat.
   - Any other conversation has at least one. The first, the *default
     participant*, is seeded from the remembered default: a provider/model or a
     cat.
   - Every participant is a stored participant record. Provider/model
     participants are one kind, whether seeded or added later.
   - Any participant can be removed while at least one remains.
4. **Audience.** The audience is who the next message goes to, chosen from the
   participants, at least one. Its order is the order of a sequential turn,
   nothing more: the first recipient carries no extra responsibility. An
   `@mention` adds a participant to the turn's audience. `@Orchestrator` goes.
5. **Orchestrator.** The orchestrator is a mechanism, not an identity.
   - A non-DM conversation binds zero or one of its participants as its
     coordinator. A new conversation binds its first participant; the binding
     can be moved or cleared, and removing the bound participant clears it. A
     DM is bound to its cat.
   - The bound participant's own session carries the coordination: the
     coordinator is exactly as capable as the model bound to it. There is no
     separate orchestrator session.
   - Unbound, the mechanism is passive: a message goes to its audience and
     nothing is routed on.
6. **Permissions are role × group.**
   - Work inside the conversation: any participant, with its own tools.
   - Coordination (routing on, handing off to other participants): only the
     bound participant.
   - Actions beyond the conversation (opening conversations, assigning work,
     collaborating across rooms): only a bound participant that is an admin.
   - An admin that is only in the audience is an ordinary worker.
7. **Remembered default.** The next new conversation starts with the first
   participant of the last non-DM conversation created: its default
   participant, or whoever is first after it was removed, a provider/model or a
   cat. `newChatDefaults` holds either kind and stays shared by Chat, Work and
   Code.
8. **Concepts that go.** God Cat, Lead Cat, the default-chat mode in the
   renderer and the server, the conversation-level `pending*` target, the rule
   that the orchestrator is a Boss Cat, the single `bossCatId`, and the Boss Cat
   avatar that the header shows for a room it is not in.
9. **No data migration.** The owner resets every machine's data and has no
   other users or testers, so zero-participant conversations and the old
   `newChatDefaults` shape are unsupported rather than migrated. This
   deliberately waives, for this change only, the AGENTS.md pre-release policy
   that persisted-data changes ship a tested upgrade path. Because it changes a
   persisted-data requirement, the next release that includes it moves to the
   next minor (0.9.0), and its notes tell operators to reset Platform data.

## Consequences

### Positive

- One rule drives the UI everywhere: a DM, or the participant count.
- The audience a user picks is the audience that receives the message.
- Authority is explicit: a strong model gains nothing beyond its conversation
  unless an admin is bound as coordinator.
- A user can talk to a cat in a new conversation without it landing in the DM.

### Negative

- A plain new conversation with a provider/model default participant loses the
  `boss_cat` work capability that today's orchestrator carries; a user who
  wants it starts with a Boss Cat, which the remembered default then repeats.
- Server routing, session ownership and several frozen contracts change; this
  needs the integration review the parallel-delivery rules require.
- Existing data must be reset.

### Neutral

- The audience chip and avatar roles from ADR-131 stand unchanged.

## Alternatives Considered

### Keep the God Cat as the room's own lane, presented as participant one

- **Pros**: Keeps today's orchestrator session, continuity and Start fresh.
- **Cons**: The first participant stays a special case in data, routing and UI.
- **Why rejected**: The special case is what produced the wrong chip.

### Let permissions follow identity alone

- **Pros**: Simple: a Boss Cat can always act as admin.
- **Cons**: Any message that merely addresses a Boss Cat could act beyond the
  conversation.
- **Why rejected**: Coordination is where cross-conversation actions belong.

### Make an agent the conversation owner

- **Pros**: One accountable agent per conversation.
- **Cons**: Overlaps the coordinator and the admin group.
- **Why rejected**: People own; agents work.
