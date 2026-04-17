# PLAN-046: Shared Audience-Participant Builder

> Extract all inline `DraftComposerStackParticipant` construction into a
> single shared builder module, then replace every call site.

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Draft |
| **Owner** | User |

## Related

- [ADR-056](../decisions/056-use-a-shared-audience-participant-builder-for-all-composer-surfaces.md)
- [SPEC-055](../specs/SPEC-055-shared-audience-participant-builder.md)

## Overview

Eight call sites across three files manually construct
`DraftComposerStackParticipant` from five source types. This plan extracts
five typed builder functions into a shared module and rewires every site.

## Implementation Phases

### Phase 1: Create the Builder Module

- [ ] Task 1.1: Create `src/products/shared/renderer/audienceParticipantBuilder.ts`
- [ ] Task 1.2: Implement `buildAudienceParticipantFromCat(cat)`
- [ ] Task 1.3: Implement `buildAudienceParticipantFromTemporaryParticipant(tp)`
- [ ] Task 1.4: Implement `buildAudienceParticipantFromExecutionTarget(executionTarget)`
- [ ] Task 1.5: Implement `buildAudienceParticipantFromRecipient(recipient)`
- [ ] Task 1.6: Implement `buildAudienceParticipantFromStackParticipant(participant)`

**Deliverable**: one module, five functions, all using
`buildExecutionLabel` / `buildCatExecutionLabel` from `shared/executionLabel.ts`

### Phase 2: Rewire Draft Surfaces

- [ ] Task 2.1: Replace `chatNewChatDraftSupport.ts` group participant
      construction (lines 147-177) with builder calls
- [ ] Task 2.2: Replace `ChatNewChatDraft.tsx` `audienceParticipants`
      branches (lines 207-274) with builder calls
- [ ] Task 2.3: Replace `ChatNewChatDraft.tsx` parallel stub construction
      (line 622-633) with `buildAudienceParticipantFromExecutionTarget`

**Deliverable**: draft surfaces use builders, no inline construction

### Phase 3: Rewire Active-Chat Surfaces

- [ ] Task 3.1: Replace `ChatComposerTargetSlot.tsx` —
      `recipientToAudienceParticipant`, directLaneCat, implicitRecipient
      inline construction with builder calls
- [ ] Task 3.2: Replace `stackParticipantToAudienceParticipant` with
      `buildAudienceParticipantFromStackParticipant`
- [ ] Task 3.3: Evaluate whether `stackParticipantToAudienceParticipant` can
      be eliminated by having `buildChatComposerStackParticipants` produce
      `DraftComposerStackParticipant[]` directly
- [ ] Task 3.4: Replace `WorkspaceComposerTargetSlot.tsx` —
      `catToAudienceParticipant` and solo execution-target inline construction
      with builder calls

**Deliverable**: active-chat and workspace surfaces use builders

### Phase 4: Clean Up Intermediate Interfaces

- [ ] Task 4.1: If `ComposerStackParticipant` is no longer needed as a
      separate shape, remove it and have `ChatComposerTargetSlot` accept
      `DraftComposerStackParticipant[]` directly
- [ ] Task 4.2: If `ChatComposerStackParticipantView` collapses into
      `DraftComposerStackParticipant`, remove the duplicate interface from
      `chatViewSupport.ts`
- [ ] Task 4.3: Remove dead conversion functions
      (`stackParticipantToAudienceParticipant`,
      `catToAudienceParticipant`, etc.)

**Deliverable**: one canonical participant shape, no intermediate conversions

## Files to Create/Modify

| File | Action |
|------|--------|
| `src/products/shared/renderer/audienceParticipantBuilder.ts` | Create |
| `src/products/shared/renderer/components/chatNewChatDraftSupport.ts` | Modify |
| `src/products/shared/renderer/components/ChatNewChatDraft.tsx` | Modify |
| `src/products/chat/renderer/components/chat-view/ChatComposerTargetSlot.tsx` | Modify |
| `src/products/chat/renderer/components/chat-view/chatViewSupport.ts` | Modify |
| `src/products/shared/renderer/components/chat-view/WorkspaceComposerTargetSlot.tsx` | Modify |
| `src/products/chat/renderer/components/ComposerParticipantStack.tsx` | Modify/Remove |

## Risks

| Risk | Mitigation |
|------|------------|
| Builder misses a field that one call site was setting | Diff every replaced site against the builder output |
| `ComposerParticipantStack` is imported outside the composer | Search for all usages before removing |

## Progress Log

| Date | Update |
|------|--------|
| 2026-04-11 | Plan created |

---

*Created: 2026-04-11*
