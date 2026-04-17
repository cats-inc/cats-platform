import { useMemo } from 'react';

import type { AppShellPayload, ChatCat } from '../../../api/workspaceContracts.js';
import type { SelectedChannelView } from '../../workspaceChatUtils.js';
import {
  type ExecutionTargetValue,
} from '../ExecutionTarget.js';
import { AudienceChip } from '../AudienceChip.js';
import {
  buildAudienceParticipantFromCat,
  buildAudienceParticipantFromModel,
} from '../../audienceParticipantBuilder.js';

export interface WorkspaceComposerTargetSlotProps {
  payload: AppShellPayload;
  composerBusy: boolean;
  selectedModel?: ExecutionTargetValue;
  directLaneCat: ChatCat | null;
  defaultRecipientCat: SelectedChannelView['assignedCats'][number] | null;
  assignedCatRecords: ChatCat[];
  leadCatRecord: ChatCat | null;
  isDirectLane: boolean;
  isSoloComposer: boolean;
  activeWorkflowShape?: 'sequential' | 'concurrent';
  onToggleActiveWorkflowShape?: () => void;
  activeAudienceKeys?: string[] | null;
  onSetActiveAudienceKeys?: (keys: string[]) => void;
  onOpenSection: (section: string) => void;
}

export function WorkspaceComposerTargetSlot({
  payload,
  composerBusy,
  selectedModel,
  directLaneCat,
  defaultRecipientCat,
  assignedCatRecords,
  leadCatRecord,
  isDirectLane,
  isSoloComposer,
  activeWorkflowShape = 'sequential',
  onToggleActiveWorkflowShape,
  activeAudienceKeys = null,
  onSetActiveAudienceKeys,
  onOpenSection,
}: WorkspaceComposerTargetSlotProps) {
  const groupParticipants = useMemo(() => {
    const cats = assignedCatRecords.length > 0
      ? assignedCatRecords
      : leadCatRecord ? [leadCatRecord] : [];
    const seen = new Set<string>();
    return cats
      .filter((cat) => {
        if (seen.has(cat.id)) {
          return false;
        }
        seen.add(cat.id);
        return true;
      })
      .map(buildAudienceParticipantFromCat);
  }, [assignedCatRecords, leadCatRecord]);
  const activeGroupParticipants = useMemo(
    () => activeAudienceKeys && activeAudienceKeys.length > 0
      ? activeAudienceKeys
        .map((key) => groupParticipants.find((participant) => participant.key === key) ?? null)
        .filter((participant): participant is (typeof groupParticipants)[number] => participant != null)
      : groupParticipants,
    [activeAudienceKeys, groupParticipants],
  );

  if (isDirectLane && directLaneCat) {
    return (
      <AudienceChip
        audienceParticipants={[buildAudienceParticipantFromCat(directLaneCat)]}
        onSingleClick={composerBusy ? undefined : () => onOpenSection('execution')}
        disabled={composerBusy}
      />
    );
  }

  if (isSoloComposer && selectedModel) {
    return (
      <AudienceChip
        audienceParticipants={[buildAudienceParticipantFromModel(selectedModel)]}
        onSingleClick={composerBusy ? undefined : () => onOpenSection('execution')}
        disabled={composerBusy}
      />
    );
  }

  if (!isSoloComposer && (defaultRecipientCat || groupParticipants.length > 0)) {
    if (groupParticipants.length === 0) {
      return null;
    }
    return (
      <AudienceChip
        audienceParticipants={
          activeGroupParticipants.length > 0
            ? activeGroupParticipants
            : [groupParticipants[0]!]
        }
        allParticipants={groupParticipants}
        onSetAudienceKeys={onSetActiveAudienceKeys}
        onSingleClick={composerBusy ? undefined : () => onOpenSection('execution')}
        disabled={composerBusy}
        maxSelectedParticipants={payload.chat.capabilities.maxAudienceParticipants}
        workflowShape={activeWorkflowShape}
        onToggleWorkflowShape={onToggleActiveWorkflowShape}
      />
    );
  }

  return null;
}

