import { useMemo, useState } from 'react';

import type { AppShellPayload } from '../../../api/contracts.js';
import type { ComposerStackParticipant } from '../ComposerParticipantStack.js';
import type { RecipientChipTarget } from '../ComposerRecipientChip.js';
import { AudienceChip } from '../../../../shared/renderer/components/AudienceChip.js';
import {
  buildAudienceParticipantFromCat,
  buildAudienceParticipantFromModel,
  buildAudienceParticipantFromRecipient,
  buildAudienceParticipantFromStackParticipant,
} from '../../../../shared/renderer/audienceParticipantBuilder.js';

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

function ChatComposerAudienceChip({
  composerStackParticipants,
  composerBusy,
  onOpenSection,
}: {
  composerStackParticipants: ComposerStackParticipant[];
  composerBusy: boolean;
  onOpenSection: (section: string) => void;
}) {
  const allParticipants = useMemo(
    () => composerStackParticipants.map(buildAudienceParticipantFromStackParticipant),
    [composerStackParticipants],
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
    return (
      <AudienceChip
        audienceParticipants={[buildAudienceParticipantFromCat(directLaneCat)]}
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
    return (
      <AudienceChip
        audienceParticipants={[buildAudienceParticipantFromModel({
          provider: implicitRecipient.provider ?? '',
          instance: implicitRecipient.instance ?? null,
          model: implicitRecipient.model ?? null,
          modelSelection: null,
        })]}
        onSingleClick={() => onOpenSection('execution')}
        disabled={composerBusy}
      />
    );
  }

  // Named recipients
  if (composerRecipients.length > 0) {
    const participants = composerRecipients.map(buildAudienceParticipantFromRecipient);
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
