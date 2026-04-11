# SPEC-055: Shared Audience-Participant Builder

> A single shared module that converts every source type into the
> `DraftComposerStackParticipant` shape consumed by `AudienceChip`, replacing
> eight inline construction sites across draft, active-chat, and workspace
> composer surfaces.

## Related Decision

- [ADR-056](../decisions/056-use-a-shared-audience-participant-builder-for-all-composer-surfaces.md)

## Problem

`DraftComposerStackParticipant` objects are constructed inline at eight
separate locations from five different source types. Each construction site
duplicates the same field mapping and independently decides how to build
derived fields like `executionLabel`. Adding a new field requires finding and
updating every site; missing one produces an inconsistency.

## Source Types and Current Construction Sites

- **ChatCat** — `chatNewChatDraftSupport.ts`, `ChatNewChatDraft.tsx` (direct
  lane cat), `ChatComposerTargetSlot.tsx` (direct lane cat),
  `WorkspaceComposerTargetSlot.tsx` (`catToAudienceParticipant`)
- **DraftTemporaryParticipant** — `chatNewChatDraftSupport.ts`,
  `ChatNewChatDraft.tsx` (temp participant)
- **ModelSelectorValue** — `ChatNewChatDraft.tsx` (parallel targets, solo
  model), `ChatComposerTargetSlot.tsx` (implicit recipient),
  `WorkspaceComposerTargetSlot.tsx` (solo model)
- **RecipientChipTarget** — `ChatComposerTargetSlot.tsx`
  (`recipientToAudienceParticipant`)
- **ComposerStackParticipant** (active-chat participants) —
  `ChatComposerTargetSlot.tsx` (`stackParticipantToAudienceParticipant`)

## Proposed Builder Module

**Location:** `src/products/shared/renderer/audienceParticipantBuilder.ts`

### Exported Functions

```ts
buildAudienceParticipantFromCat(cat: ChatCat): DraftComposerStackParticipant
```

Builds from `cat.name`, `cat.defaultExecutionTarget`,
`cat.defaultModelSelection?.controls`, `cat.avatarColor`, `cat.avatarUrl`.
Sets `isCat: true`, `catId: cat.id`.

```ts
buildAudienceParticipantFromTemporaryParticipant(
  tp: DraftTemporaryParticipant,
): DraftComposerStackParticipant
```

Builds from `tp.name`, `tp.provider`, `tp.instance`, `tp.model`,
`tp.modelSelection?.controls`. Sets `isCat: false`.

```ts
buildAudienceParticipantFromModel(
  model: ModelSelectorValue,
): DraftComposerStackParticipant
```

Builds from `buildModelSelectorLabel(model)`. Sets `isCat: false`,
`executionLabel` equals the label.

```ts
buildAudienceParticipantFromRecipient(
  recipient: RecipientChipTarget,
): DraftComposerStackParticipant
```

Builds from `recipient.name`, `recipient.provider`, etc.
Sets `isCat: Boolean(recipient.catId)`.

### Key Rules

- Every builder must populate `executionLabel` from the source data using
  `buildExecutionLabel` / `buildCatExecutionLabel` / `resolveControlDisplayLabels`
  from `shared/executionLabel.ts`.
- `key` format: `cat:{id}` for cats, `temp:{participantId}` for temp
  participants, `implicit:model` for model-only, `recipient:{name}` for
  named recipients.
- No builder may leave `executionLabel` as `null` when the source data
  carries provider information.

## Sites to Refactor

Each site replaces its inline construction with a call to the appropriate
builder:

- `chatNewChatDraftSupport.ts` — `groupComposerParticipants` construction
- `ChatNewChatDraft.tsx` — all five branches of `audienceParticipants`
- `ChatComposerTargetSlot.tsx` — `recipientToAudienceParticipant`,
  `stackParticipantToAudienceParticipant`, directLaneCat, implicitRecipient
- `WorkspaceComposerTargetSlot.tsx` — `catToAudienceParticipant`, solo model

## Intermediate Interface Cleanup

Once all active-chat paths use the builders directly, the
`ComposerStackParticipant` interface in `ComposerParticipantStack.tsx` and
`ChatComposerStackParticipantView` in `chatViewSupport.ts` may be removed or
reduced to presentation-only concerns, since `DraftComposerStackParticipant`
becomes the single canonical shape.

## Out of Scope

- Renaming `DraftComposerStackParticipant` (the "Draft" prefix is misleading
  now that it serves both draft and active contexts, but renaming is a
  separate cleanup)
- Changes to `AudienceChip` rendering logic
- Changes to tooltip format (already handled)

---

*Created: 2026-04-11*
