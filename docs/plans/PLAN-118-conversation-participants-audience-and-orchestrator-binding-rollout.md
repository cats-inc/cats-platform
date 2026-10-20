# PLAN-118: Conversation Participants, Audience and Orchestrator Binding Rollout

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Ready |
| **Owner** | Owner |
| **Reviewer** | Owner |

## Related Spec

[SPEC-125: Conversation Participants, Audience and Orchestrator Binding](../specs/SPEC-125-conversation-participants-audience-and-orchestrator-binding.md),
deciding record [ADR-132](../decisions/132-separate-participants-audience-and-the-orchestrator-binding.md).

## Overview

Each phase is one or more PRs that keep `main` releasable. Tests that describe
today's behavior land first, so every intended change appears as a reviewed
diff. SPEC-125's open questions close before the phase that depends on them.
No data migration is written; the release that ships phase 3 is 0.9.0 with a
reset instruction.

## Implementation Phases

### Phase 0: Decisions

- [x] Task 0.1: Close SPEC-125's open questions with the owner and record the
      answers in the spec (2026-10-20).
- [ ] Task 0.2: Integration review of the frozen contract changes listed in
      SPEC-125 Dependencies.

**Deliverables**: SPEC-125 approved; ADR-132 unchanged or amended.

### Phase 1: Started-conversation characterization

- [x] Task 1.1: A matrix test like the draft visibility matrix for started
      conversations: DM, one provider/model participant, one cat, one
      temporary participant, two temporary participants, a cat with a
      temporary participant, and several cats. Record the composer chip mode
      and label, the header avatars, and the audience metadata a send carries.

**Deliverables**: Today's started-conversation behavior pinned, including the
audience-key defect as it is.

### Phase 2: Audience reaches the send path

- [x] Task 2.1: Key audiences by participant id in
      `shared/renderer/composerMessageMetadata.ts`, count provider/model
      participants as active, and send the chip's audience.
- [x] Task 2.2: Delete the unused duplicates
      (`chat/renderer/composerMessageMetadata.ts`,
      `chat/renderer/hooks/useComposerSubmit.ts`,
      `chat/renderer/conversationMode.ts`) and their tests' dependence on them.

**Deliverables**: A picked audience is the audience that receives the message,
in every room with participants. Shippable on its own as a patch.

### Phase 3: Server model

- [x] Task 3.1: Participant records for every non-DM conversation at creation,
      in insertion order, from every creator (renderer, Code sessions,
      collaboration, Telegram, parallel members); removal and archive guards
      keep at least one.
- [x] Task 3.2: `coordinatorParticipantId`; coordination in the coordinator's
      own session; remove the separate orchestrator session, lease, `pending*`,
      the default-chat branches and the God Cat display name.
- [x] Task 3.3: Routing: audience first; coordinator routing on; nothing more
      without a coordinator; reject a non-DM message without an audience;
      server-internal senders name their audience.
- [x] Task 3.4: Cat groups replace `bossCatId`; permission checks become
      coordinator × admin for actions beyond the conversation.
- [x] Task 3.5: `newChatDefaults` as model or cat, saved from a created
      non-DM conversation's first participant.
- [x] Task 3.6: Owner and artifact provenance fields.
- [x] Task 3.7: Remove Start fresh, the default-chat reply rewrite and the
      Telegram non-DM room fallback.
- [x] Task 3.8: Mobile audience control, released together with Task 3.3 so
      mobile can still send in non-DM conversations.

**Deliverables**: The server enforces SPEC-125; old data is unsupported.

### Phase 4: Renderer

- [x] Task 4.1: Replace the default-chat mode with "DM or participant count"
      in drafts and conversations; remove `implicit:execution_target`.
      Started conversations, layout modes and continuity topologies no longer
      have a default-chat mode; a draft's implicit chip becomes its real
      default participant in Task 4.2.
- [x] Task 4.2: The default participant as a real draft participant from the
      start; the group minimum of two behind an internal flag that defaults
      on; the draft visibility matrix unchanged.
- [x] Task 4.3: Coordinator control in the participant popover; admin frame;
      header avatars for every participant, one included, and none for
      non-participants; the admin switch in Settings › Cats. The popover also
      removes a participant while another remains; the header, the frame and
      the Settings switch landed with tasks 2.1 and 3.4.
- [x] Task 4.4: Remembered default as model or cat in new drafts.

**Deliverables**: Drafts and conversations follow one rule.

### Phase 5: Documentation and release

- [x] Task 5.1: Update SPEC-052, SPEC-013, `docs/api.md` and the participant
      sections of the deployment and setup guides. Also SPEC-069 (Start fresh
      removed) and the terminology; the deployment guide has no participant
      section, and its reset section is what the 0.9.0 notes point to.
- [x] Task 5.2: Owner selected Desktop 0.9.0 standard preview; version fields,
      exact Runtime/App pins, signing/update expectations and Platform reset
      instructions are included in the original release change and notes.

**Deliverables**: Documentation matches the code; release prepared on request.

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `src/products/chat/api/contracts.ts` | Modify | Participants, coordinator, `newChatDefaults`, audience metadata |
| `src/products/chat/state/model/index.ts` | Modify | Creation seeding, removal guards |
| `src/products/chat/state/mentionRouter.ts`, `state/runtime-dispatch/*` | Modify | Audience and coordinator routing |
| `src/products/chat/state/runtime-session/*`, `state/runtimeTargeting.ts` | Modify | Coordinator session, no orchestrator lease |
| `src/products/chat/state/workToolIntentResolver.ts`, `state/orchestratorKnowledge.ts`, `state/orchestratorCollaboration.ts` | Modify | Coordinator × admin gating |
| `src/products/chat/shared/channelTopology.ts` | Modify | Drop default-chat predicates |
| `src/app/renderer/productShell/conversationMode.ts` | Modify/Delete | Drop the default-chat mode |
| `src/products/shared/renderer/composerMessageMetadata.ts` | Modify | Participant-id audience keys |
| `src/products/shared/renderer/components/**` | Modify | Count-based composer, chip, roster, popover |
| `tests/started-conversation-composer-matrix.test.tsx` | Create | Phase 1 characterization |

## Technical Decisions

- Characterization before change, as with the draft visibility matrix.
- Phase 2 ships first because it fixes a live defect without the model change.
- No migration (ADR-132 §9).

## Testing Strategy

- Matrix tests for drafts and started conversations; intended changes are
  reviewed diffs.
- Server tests for creation seeding, removal guards, routing with and without a
  coordinator, and the coordinator × admin checks.
- Visual checks of the composer and header on a fresh profile.

## Risks

- Removing the separate orchestrator session touches session reuse,
  continuity and streaming labels across Chat, Work and Code.
- Clients that send no audience (Telegram, API, mobile) change behavior.
- Permission gating moves from role to role × group; a missed path either
  blocks a legitimate action or allows one it should not.

## Progress Log

- 2026-10-20: Plan drafted with ADR-132 and SPEC-125.
- 2026-10-20: SPEC-125 decisions closed; phase 0 task 0.1 done.
