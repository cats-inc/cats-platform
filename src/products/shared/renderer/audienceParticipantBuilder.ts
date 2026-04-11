import type { ChatCat } from '../api/workspaceContracts.js';
import type { DraftTemporaryParticipant } from './draftChatUtils.js';
import type { RecipientChipTarget } from './components/ComposerRecipientChip.js';
import { buildModelSelectorLabel, type ModelSelectorValue } from './components/ModelSelector.js';
import type { DraftComposerStackParticipant } from './components/chatNewChatDraftSupport.js';
import {
  buildCatExecutionLabel,
  buildExecutionLabel,
  resolveControlDisplayLabels,
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
      ? buildExecutionLabel(
          tp.provider,
          tp.instance ?? null,
          tp.model ?? null,
          null,
          resolveControlDisplayLabels(tp.modelSelection?.controls),
        )
      : null,
    avatarColor: null,
    avatarUrl: null,
    isCat: false,
    catId: null,
    participantId: tp.participantId,
  };
}

export function buildAudienceParticipantFromModel(
  model: ModelSelectorValue,
  keyOverride?: string,
): DraftComposerStackParticipant {
  const label = buildModelSelectorLabel(model);
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
    ? buildExecutionLabel(
        recipient.provider,
        recipient.instance ?? null,
        recipient.model ?? null,
      )
    : null;
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
