import type { AppShellPayload, ChatCat } from '../../../api/workspaceContracts.js';
import type { SelectedChannelView } from '../../workspaceChatUtils.js';
import {
  type ModelSelectorValue,
} from '../ModelSelector.js';
import { AudienceChip } from '../AudienceChip.js';
import {
  buildAudienceParticipantFromCat,
  buildAudienceParticipantFromModel,
} from '../../audienceParticipantBuilder.js';

export interface WorkspaceComposerTargetSlotProps {
  payload: AppShellPayload;
  composerBusy: boolean;
  selectedModel?: ModelSelectorValue;
  directLaneCat: ChatCat | null;
  defaultRecipientCat: SelectedChannelView['assignedCats'][number] | null;
  assignedCatRecords: ChatCat[];
  leadCatRecord: ChatCat | null;
  isDirectLane: boolean;
  isSoloComposer: boolean;
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
  onOpenSection,
}: WorkspaceComposerTargetSlotProps) {
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

  if (!isSoloComposer && defaultRecipientCat) {
    const cats = assignedCatRecords.length > 0
      ? assignedCatRecords
      : leadCatRecord ? [leadCatRecord] : [];
    const participants = cats.map(buildAudienceParticipantFromCat);
    if (participants.length === 0) return null;
    return (
      <AudienceChip
        audienceParticipants={participants}
        onSingleClick={composerBusy ? undefined : () => onOpenSection('execution')}
        disabled={composerBusy}
      />
    );
  }

  return null;
}
