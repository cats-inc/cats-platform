# ADR-056: Use a Shared Audience-Participant Builder for All Composer Surfaces

> Stop constructing `DraftComposerStackParticipant` objects inline at every
> call site. Centralise the conversion from each source type (ChatCat,
> DraftTemporaryParticipant, RecipientChipTarget, ComposerStackParticipant,
> ExecutionTargetValue) into a single shared builder module so that tooltip,
> avatar, and identity fields stay consistent across draft, active-chat, and
> workspace composer surfaces.

## Status

Proposed

## Context

The `AudienceChip` component accepts `DraftComposerStackParticipant[]` as its
data model. Today, at least eight separate call sites manually construct these
objects from different source types:

1. `chatNewChatDraftSupport.ts` — ChatCat + DraftTemporaryParticipant
2. `ChatNewChatDraft.tsx` — ChatCat, DraftTemporaryParticipant,
   ExecutionTargetValue (five inline constructions for parallel, group,
   direct-lane, temp-participant, and solo modes)
3. `ChatComposerTargetSlot.tsx` — RecipientChipTarget,
   ComposerStackParticipant, ChatCat, ExecutionTargetValue
4. `WorkspaceComposerTargetSlot.tsx` — ChatCat, ExecutionTargetValue

Each site duplicates the same field mappings (`key`, `name`,
`executionLabel`, `avatarColor`, `avatarUrl`, `isCat`, `catId`,
`participantId`), and each must independently decide how to build
`executionLabel` from the source data. When a new field is added — as
happened with `executionLabel` for tooltip unification — every site must be
found and updated individually.

The recent tooltip-unification effort (commits `ef56e4a2`, `a9f51d42`)
required touching 15 files across three products to wire `executionLabel`
through every construction point, and still missed two sites on the first
pass.

## Decision

Replace inline `DraftComposerStackParticipant` construction with a set of
typed builder functions exported from a single shared module. Each builder
converts one source type:

- `buildAudienceParticipantFromCat(cat: ChatCat)`
- `buildAudienceParticipantFromTemporaryParticipant(tp: DraftTemporaryParticipant)`
- `buildAudienceParticipantFromExecutionTarget(executionTarget: ExecutionTargetValue)`
- `buildAudienceParticipantFromRecipient(recipient: RecipientChipTarget)`
- `buildAudienceParticipantFromStackParticipant(participant: ComposerStackParticipant)`

All call sites import from this module instead of constructing objects inline.
New fields added to `DraftComposerStackParticipant` only need to be wired in
one place per source type.

## Consequences

- Adding or changing a field on the audience-participant data model requires
  updating at most one builder per source type, not eight scattered sites.
- Tooltip, avatar, and identity logic stays consistent across draft,
  active-chat, and workspace surfaces by construction.
- The intermediate `ComposerStackParticipant` interface may still become
  unnecessary later if `buildChatComposerStackParticipants()` is simplified to
  produce `DraftComposerStackParticipant[]` directly, but the first refactor
  keeps a dedicated stack-participant builder so the current active-chat
  surface can be rewired without a larger shape-collapse in the same slice.
- `chatNewChatDraftSupport.ts` already contains some of this logic for the
  group-draft path; the refactor extracts and generalises it rather than
  creating a new pattern.

---

*Created: 2026-04-11*

