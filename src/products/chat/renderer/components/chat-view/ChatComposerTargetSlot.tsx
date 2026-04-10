import type { AppShellPayload } from '../../../api/contracts.js';
import {
  ComposerParticipantStack,
  type ComposerStackParticipant,
} from '../ComposerParticipantStack.js';
import {
  ComposerRecipientChip,
  type RecipientChipTarget,
} from '../ComposerRecipientChip.js';
import {
  buildModelSelectorLabel,
  ModelSelectorChip,
} from '../ModelSelector.js';
import { ComposerCatStack } from '../../../../shared/renderer/components/ComposerCatStack.js';

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

export function ChatComposerTargetSlot({
  payload,
  composerBusy,
  composerRecipients,
  defaultRecipientParticipantId,
  composerStackParticipants,
  directLaneCat,
  isDirectLane,
  isSoloComposer,
  onOpenSection,
}: ChatComposerTargetSlotProps) {
  const implicitRecipient =
    composerRecipients.length === 1 && composerRecipients[0]?.kind === 'implicit'
      ? composerRecipients[0]
      : null;
  const implicitRecipientLabel = implicitRecipient
    ? buildModelSelectorLabel({
        provider: implicitRecipient.provider ?? '',
        instance: implicitRecipient.instance ?? null,
        model: implicitRecipient.model ?? null,
        modelSelection: null,
      })
    : null;

  if (directLaneCat) {
    return (
      <ComposerCatStack
        cats={[directLaneCat]}
        bossCatId={payload.chat.bossCatId}
        defaultRecipientCatId={directLaneCat.id}
        onClick={composerBusy ? undefined : () => onOpenSection('execution')}
      />
    );
  }

  if (!isSoloComposer && composerStackParticipants.length > 0) {
    return (
      <ComposerParticipantStack
        participants={composerStackParticipants}
        defaultParticipantId={defaultRecipientParticipantId}
        onClick={composerBusy ? undefined : () => onOpenSection('execution')}
      />
    );
  }

  if (implicitRecipient && implicitRecipientLabel) {
    return (
      <div style={{ marginRight: 8 }}>
        <ModelSelectorChip
          label={implicitRecipientLabel}
          onClick={composerBusy ? undefined : () => onOpenSection('execution')}
        />
      </div>
    );
  }

  if (composerRecipients.length > 0) {
    return (
      <ComposerRecipientChip
        recipients={composerRecipients}
        disabled={composerBusy}
        onClick={composerBusy ? undefined : () => onOpenSection(
          isDirectLane || isSoloComposer ? 'execution' : 'cats',
        )}
      />
    );
  }

  return null;
}
