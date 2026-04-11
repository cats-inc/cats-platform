import { useMemo, useState } from 'react';

import type { AppShellPayload } from '../../../api/contracts.js';
import type { ComposerStackParticipant } from '../ComposerParticipantStack.js';
import type { RecipientChipTarget } from '../ComposerRecipientChip.js';
import {
  buildModelSelectorLabel,
} from '../ModelSelector.js';
import { buildCatExecutionLabel, buildExecutionLabel, resolveControlDisplayLabels } from '../../../../../shared/executionLabel.js';
import { AudienceChip } from '../../../../shared/renderer/components/AudienceChip.js';
import type { DraftComposerStackParticipant } from '../../../../shared/renderer/components/chatNewChatDraftSupport.js';

export interface ChatComposerTargetSlotProps {
  payload: AppShellPayload;
  composerBusy: boolean;
  composerRecipients: RecipientChipTarget[];
  defaultRecipientParticipantId: string | null;
  composerStackParticipants: ComposerStackParticipant[];
  directLaneCat: AppShellPayload['chat']['cats'][number] | null;
  isDirectLane: boolean;
  isSoloComposer: boolean;
  onOpenSection: (section: string) => void;
}

function recipientToAudienceParticipant(recipient: RecipientChipTarget): DraftComposerStackParticipant {
  const controlLabels = resolveControlDisplayLabels(null);
  const execLabel = recipient.provider
    ? buildExecutionLabel(recipient.provider, recipient.instance ?? null, recipient.model ?? null, null, controlLabels)
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

function stackParticipantToAudienceParticipant(
  participant: ComposerStackParticipant,
  cats: AppShellPayload['chat']['cats'],
): DraftComposerStackParticipant {
  const isCat = !participant.useNeutralAvatar;
  const catRecord = isCat
    ? cats.find((cat) => cat.name === participant.label) ?? null
    : null;
  return {
    key: `participant:${participant.participantId}`,
    name: participant.label,
    executionLabel: catRecord?.defaultExecutionTarget
      ? buildCatExecutionLabel(catRecord as Parameters<typeof buildCatExecutionLabel>[0])
      : null,
    avatarColor: participant.avatarColor ?? null,
    avatarUrl: participant.avatarUrl ?? null,
    isCat,
    catId: catRecord?.id ?? null,
    participantId: participant.participantId,
  };
}

function ChatComposerAudienceChip({
  composerStackParticipants,
  cats,
  composerBusy,
  onOpenSection,
}: {
  composerStackParticipants: ComposerStackParticipant[];
  cats: AppShellPayload['chat']['cats'];
  composerBusy: boolean;
  onOpenSection: (section: string) => void;
}) {
  const allParticipants = useMemo(
    () => composerStackParticipants.map((p) => stackParticipantToAudienceParticipant(p, cats)),
    [composerStackParticipants, cats],
  );
  const [audienceKeys, setAudienceKeys] = useState<string[] | null>(null);
  const [workflowShape, setWorkflowShape] = useState<'sequential' | 'concurrent'>('sequential');
  const audienceParticipants = useMemo(() => {
    if (!audienceKeys) return allParticipants;
    const byKey = new Map(allParticipants.map((p) => [p.key, p]));
    const resolved = audienceKeys.map((k) => byKey.get(k)).filter(Boolean) as typeof allParticipants;
    return resolved.length > 0 ? resolved : allParticipants.length > 0 ? [allParticipants[0]] : [];
  }, [audienceKeys, allParticipants]);

  return (
    <AudienceChip
      audienceParticipants={audienceParticipants}
      allParticipants={allParticipants}
      onSetAudienceKeys={setAudienceKeys}
      onSingleClick={() => onOpenSection('execution')}
      disabled={composerBusy}
      workflowShape={workflowShape}
      onToggleWorkflowShape={() => setWorkflowShape((prev) => prev === 'concurrent' ? 'sequential' : 'concurrent')}
    />
  );
}

export function ChatComposerTargetSlot({
  payload,
  composerBusy,
  composerRecipients,
  composerStackParticipants,
  directLaneCat,
  isDirectLane,
  isSoloComposer,
  onOpenSection,
}: ChatComposerTargetSlotProps) {
  // Direct lane: single cat
  if (directLaneCat) {
    const participant: DraftComposerStackParticipant = {
      key: `cat:${directLaneCat.id}`,
      name: directLaneCat.name,
      executionLabel: directLaneCat.defaultExecutionTarget
        ? buildCatExecutionLabel(directLaneCat as Parameters<typeof buildCatExecutionLabel>[0])
        : null,
      avatarColor: directLaneCat.avatarColor ?? null,
      avatarUrl: directLaneCat.avatarUrl ?? null,
      isCat: true,
      catId: directLaneCat.id,
      participantId: null,
    };
    return (
      <AudienceChip
        audienceParticipants={[participant]}
        onSingleClick={() => onOpenSection('execution')}
        disabled={composerBusy}
      />
    );
  }

  // Group chat: multiple participants with audience selection
  if (!isSoloComposer && composerStackParticipants.length > 0) {
    return (
      <ChatComposerAudienceChip
        composerStackParticipants={composerStackParticipants}
        cats={payload.chat.cats}
        composerBusy={composerBusy}
        onOpenSection={onOpenSection}
      />
    );
  }

  // Implicit recipient (model-only)
  const implicitRecipient =
    composerRecipients.length === 1 && composerRecipients[0]?.kind === 'implicit'
      ? composerRecipients[0]
      : null;
  if (implicitRecipient) {
    const label = buildModelSelectorLabel({
      provider: implicitRecipient.provider ?? '',
      instance: implicitRecipient.instance ?? null,
      model: implicitRecipient.model ?? null,
      modelSelection: null,
    });
    const participant: DraftComposerStackParticipant = {
      key: 'implicit:model',
      name: label,
      executionLabel: label,
      avatarColor: null,
      avatarUrl: null,
      isCat: false,
      catId: null,
      participantId: null,
    };
    return (
      <AudienceChip
        audienceParticipants={[participant]}
        onSingleClick={() => onOpenSection('execution')}
        disabled={composerBusy}
      />
    );
  }

  // Named recipients
  if (composerRecipients.length > 0) {
    const participants = composerRecipients.map(recipientToAudienceParticipant);
    return (
      <AudienceChip
        audienceParticipants={participants}
        onSingleClick={() => onOpenSection(
          isDirectLane || isSoloComposer ? 'execution' : 'cats',
        )}
        disabled={composerBusy}
      />
    );
  }

  return null;
}
