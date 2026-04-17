import type { ChatCat } from '../api/workspaceContracts.js';
import type { DraftTemporaryParticipant } from './draftChatUtils.js';
import type { RecipientChipTarget } from './components/ComposerRecipientChip.js';
import { buildExecutionTargetLabel, type ExecutionTargetValue } from './components/ExecutionTarget.js';
import type { DraftComposerStackParticipant } from './components/chatNewChatDraftSupport.js';
import {
  buildCatExecutionLabel,
  resolveExecutionTargetLabel,
} from '../../../shared/executionLabel.js';

export interface AudienceParticipantStackInput {
  participantId: string;
  label: string;
  executionLabel: string | null;
  avatarColor: string | null;
  avatarUrl: string | null;
  useNeutralAvatar: boolean;
}

export function buildAudienceParticipantFromCat(
  cat: ChatCat,
): DraftComposerStackParticipant {
  return {
    key: `cat:${cat.id}`,
    name: cat.name,
    executionLabel: cat.defaultExecutionTarget
      ? buildCatExecutionLabel(cat as Parameters<typeof buildCatExecutionLabel>[0])
      : null,
    avatarColor: cat.avatarColor ?? null,
    avatarUrl: cat.avatarUrl ?? null,
    isCat: true,
    catId: cat.id,
    participantId: null,
  };
}

export function buildAudienceParticipantFromTemporaryParticipant(
  tp: DraftTemporaryParticipant,
): DraftComposerStackParticipant {
  return {
    key: `temp:${tp.participantId}`,
    name: tp.name,
    executionLabel: tp.provider
      ? resolveExecutionTargetLabel({
          provider: tp.provider,
          instance: tp.instance ?? null,
          model: tp.model ?? null,
          modelSelection: tp.modelSelection ?? null,
        })
      : null,
    avatarColor: null,
    avatarUrl: null,
    isCat: false,
    catId: null,
    participantId: tp.participantId,
  };
}

export function buildAudienceParticipantFromModel(
  target: ExecutionTargetValue,
  keyOverride?: string,
): DraftComposerStackParticipant {
  const label = buildExecutionTargetLabel(target);
  return {
    key: keyOverride ?? 'implicit:model',
    name: label,
    executionLabel: label,
    avatarColor: null,
    avatarUrl: null,
    isCat: false,
    catId: null,
    participantId: null,
  };
}

export function buildAudienceParticipantFromRecipient(
  recipient: RecipientChipTarget,
): DraftComposerStackParticipant {
  const execLabel = recipient.provider
    ? resolveExecutionTargetLabel({
        provider: recipient.provider,
        instance: recipient.instance ?? null,
        model: recipient.model ?? null,
        modelSelection: recipient.modelSelection ?? null,
        executionLabel: recipient.executionLabel ?? null,
      })
    : (recipient.executionLabel?.trim() || null);
  return {
    key: recipient.catId ?? recipient.participantId ?? `recipient:${recipient.name}`,
    name: recipient.name,
    executionLabel: execLabel,
    avatarColor: recipient.avatarColor ?? null,
    avatarUrl: recipient.avatarUrl ?? null,
    isCat: Boolean(recipient.catId),
    catId: recipient.catId ?? null,
    participantId: recipient.participantId ?? null,
  };
}

export function buildAudienceParticipantFromStackParticipant(
  participant: AudienceParticipantStackInput,
): DraftComposerStackParticipant {
  return {
    key: `participant:${participant.participantId}`,
    name: participant.label,
    executionLabel: participant.executionLabel,
    avatarColor: participant.avatarColor ?? null,
    avatarUrl: participant.avatarUrl ?? null,
    isCat: !participant.useNeutralAvatar,
    catId: null,
    participantId: participant.participantId,
  };
}

