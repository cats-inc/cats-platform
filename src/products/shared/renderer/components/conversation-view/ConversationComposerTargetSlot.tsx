import { useMemo } from 'react';

import type { AppShellPayload } from '../../../api/workspaceContracts.js';
import type { RecipientChipTarget } from '../ComposerRecipientChip.js';
import { useSavedSelectionAttention } from '../../../../../app/renderer/savedSelectionAttention.js';
import { AudienceChip, type AudienceTargetEditor } from '../AudienceChip.js';
import type { DraftComposerStackParticipant } from '../newConversationDraftSupport.js';
import type { ChatComposerStackParticipantView } from './conversationViewSupport.js';
import {
  buildAudienceParticipantFromCat,
  buildAudienceParticipantFromExecutionTarget,
  buildAudienceParticipantFromRecipient,
  buildAudienceParticipantFromStackParticipant,
} from '../../audienceParticipantBuilder.js';

export interface ConversationComposerTargetSlotProps {
  payload: AppShellPayload;
  composerBusy: boolean;
  composerRecipients: RecipientChipTarget[];
  defaultRecipientParticipantId: string | null;
  composerStackParticipants: ChatComposerStackParticipantView[];
  directLaneCat: AppShellPayload['chat']['cats'][number] | null;
  isDirectLane: boolean;
  isDefaultChatComposer: boolean;
  activeWorkflowShape: 'sequential' | 'concurrent';
  onToggleActiveWorkflowShape?: () => void;
  activeAudienceKeys: string[] | null;
  onSetActiveAudienceKeys?: (keys: string[]) => void;
  resolveTargetEditor?: (participant: DraftComposerStackParticipant) => AudienceTargetEditor | null;
}

function ChatComposerAudienceChip({
  composerStackParticipants,
  composerBusy,
  activeWorkflowShape,
  onToggleActiveWorkflowShape,
  activeAudienceKeys,
  onSetActiveAudienceKeys,
  maxAudienceParticipants,
  resolveTargetEditor,
}: {
  composerStackParticipants: ChatComposerStackParticipantView[];
  composerBusy: boolean;
  activeWorkflowShape: 'sequential' | 'concurrent';
  onToggleActiveWorkflowShape?: () => void;
  activeAudienceKeys: string[] | null;
  onSetActiveAudienceKeys?: (keys: string[]) => void;
  maxAudienceParticipants?: number;
  resolveTargetEditor?: (participant: DraftComposerStackParticipant) => AudienceTargetEditor | null;
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
      resolveTargetEditor={resolveTargetEditor}
      disabled={composerBusy}
      maxSelectedParticipants={maxAudienceParticipants}
      workflowShape={activeWorkflowShape}
      onToggleWorkflowShape={onToggleActiveWorkflowShape}
    />
  );
}

export function ConversationComposerTargetSlot({
  payload,
  composerBusy,
  composerRecipients,
  composerStackParticipants,
  directLaneCat,
  isDirectLane,
  isDefaultChatComposer,
  activeWorkflowShape,
  onToggleActiveWorkflowShape,
  activeAudienceKeys,
  onSetActiveAudienceKeys,
  resolveTargetEditor,
}: ConversationComposerTargetSlotProps) {
  // Implicit recipient (model-only)
  const implicitRecipient =
    composerRecipients.length === 1 && composerRecipients[0]?.kind === 'implicit'
      ? composerRecipients[0]
      : null;
  const implicitAttention = useSavedSelectionAttention(
    !directLaneCat && isDefaultChatComposer && implicitRecipient?.provider
      ? {
          provider: implicitRecipient.provider,
          instance: implicitRecipient.instance ?? null,
          modelSelection: implicitRecipient.modelSelection ?? null,
        }
      : null,
  );

  // Direct lane: single cat
  if (directLaneCat) {
    return (
      <AudienceChip
        audienceParticipants={[buildAudienceParticipantFromCat(directLaneCat)]}
        resolveTargetEditor={resolveTargetEditor}
        disabled={composerBusy}
      />
    );
  }

  // Group chat: multiple participants with audience selection
  if (!isDefaultChatComposer && composerStackParticipants.length > 0) {
    return (
      <ChatComposerAudienceChip
        composerStackParticipants={composerStackParticipants}
        composerBusy={composerBusy}
        activeWorkflowShape={activeWorkflowShape}
        onToggleActiveWorkflowShape={onToggleActiveWorkflowShape}
        activeAudienceKeys={activeAudienceKeys}
        onSetActiveAudienceKeys={onSetActiveAudienceKeys}
        maxAudienceParticipants={payload.chat.capabilities.maxAudienceParticipants}
        resolveTargetEditor={resolveTargetEditor}
      />
    );
  }

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
        resolveTargetEditor={resolveTargetEditor}
        disabled={composerBusy}
        attention={implicitAttention}
      />
    );
  }

  // Named recipients
  if (composerRecipients.length > 0) {
    const participants = composerRecipients.map(buildAudienceParticipantFromRecipient);
    return (
      <AudienceChip
        audienceParticipants={participants}
        resolveTargetEditor={resolveTargetEditor}
        disabled={composerBusy}
      />
    );
  }

  return null;
}
