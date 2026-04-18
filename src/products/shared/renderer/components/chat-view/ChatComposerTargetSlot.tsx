import { useMemo } from 'react';

import type { AppShellPayload } from '../../../api/workspaceContracts.js';
import type { ComposerStackParticipant } from '../ComposerParticipantStack.js';
import type { RecipientChipTarget } from '../ComposerRecipientChip.js';
import { AudienceChip } from '../AudienceChip.js';
import {
  buildAudienceParticipantFromCat,
  buildAudienceParticipantFromExecutionTarget,
  buildAudienceParticipantFromRecipient,
  buildAudienceParticipantFromStackParticipant,
} from '../../audienceParticipantBuilder.js';

export interface ChatComposerTargetSlotProps {
  payload: AppShellPayload;
  composerBusy: boolean;
  composerRecipients: RecipientChipTarget[];
  defaultRecipientParticipantId: string | null;
  composerStackParticipants: ComposerStackParticipant[];
  directLaneCat: AppShellPayload['chat']['cats'][number] | null;
  isDirectLane: boolean;
  isSoloComposer: boolean;
  activeWorkflowShape: 'sequential' | 'concurrent';
  onToggleActiveWorkflowShape?: () => void;
  activeAudienceKeys: string[] | null;
  onSetActiveAudienceKeys?: (keys: string[]) => void;
  onOpenSection: (section: string) => void;
}

function ChatComposerAudienceChip({
  composerStackParticipants,
  composerBusy,
  activeWorkflowShape,
  onToggleActiveWorkflowShape,
  activeAudienceKeys,
  onSetActiveAudienceKeys,
  maxAudienceParticipants,
  onOpenSection,
}: {
  composerStackParticipants: ComposerStackParticipant[];
  composerBusy: boolean;
  activeWorkflowShape: 'sequential' | 'concurrent';
  onToggleActiveWorkflowShape?: () => void;
  activeAudienceKeys: string[] | null;
  onSetActiveAudienceKeys?: (keys: string[]) => void;
  maxAudienceParticipants?: number;
  onOpenSection: (section: string) => void;
}) {
  const allParticipants = useMemo(
    () => composerStackParticipants.map(buildAudienceParticipantFromStackParticipant),
    [composerStackParticipants],
  );
  const audienceParticipants = useMemo(() => {
    if (!activeAudienceKeys || activeAudienceKeys.length === 0) {
      return allParticipants;
    }
    const byKey = new Map(allParticipants.map((p) => [p.key, p]));
    const resolved = activeAudienceKeys
      .map((k) => byKey.get(k))
      .filter(Boolean) as typeof allParticipants;
    return resolved.length > 0 ? resolved : allParticipants.length > 0 ? [allParticipants[0]] : [];
  }, [activeAudienceKeys, allParticipants]);

  return (
    <AudienceChip
      audienceParticipants={audienceParticipants}
      allParticipants={allParticipants}
      onSetAudienceKeys={onSetActiveAudienceKeys}
      onSingleClick={() => onOpenSection('execution')}
      disabled={composerBusy}
      maxSelectedParticipants={maxAudienceParticipants}
      workflowShape={activeWorkflowShape}
      onToggleWorkflowShape={onToggleActiveWorkflowShape}
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
  activeWorkflowShape,
  onToggleActiveWorkflowShape,
  activeAudienceKeys,
  onSetActiveAudienceKeys,
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
        activeWorkflowShape={activeWorkflowShape}
        onToggleActiveWorkflowShape={onToggleActiveWorkflowShape}
        activeAudienceKeys={activeAudienceKeys}
        onSetActiveAudienceKeys={onSetActiveAudienceKeys}
        maxAudienceParticipants={payload.chat.capabilities.maxAudienceParticipants}
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
        audienceParticipants={[buildAudienceParticipantFromExecutionTarget({
          provider: implicitRecipient.provider ?? '',
          instance: implicitRecipient.instance ?? null,
          model: implicitRecipient.model ?? null,
          modelSelection: implicitRecipient.modelSelection ?? null,
          executionLabel: implicitRecipient.executionLabel ?? implicitRecipient.name,
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
