import type { AppShellPayload, ChatCat } from '../../../api/workspaceContracts.js';
import type { SelectedChannelView } from '../../workspaceChatUtils.js';
import {
  buildModelSelectorLabel,
  type ModelSelectorValue,
} from '../ModelSelector.js';
import { AudienceChip } from '../AudienceChip.js';
import type { DraftComposerStackParticipant } from '../chatNewChatDraftSupport.js';

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

function catToAudienceParticipant(cat: ChatCat): DraftComposerStackParticipant {
  return {
    key: `cat:${cat.id}`,
    name: cat.name,
    executionLabel: null,
    avatarColor: cat.avatarColor ?? null,
    avatarUrl: cat.avatarUrl ?? null,
    isCat: true,
    catId: cat.id,
    participantId: null,
  };
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
        audienceParticipants={[catToAudienceParticipant(directLaneCat)]}
        onSingleClick={composerBusy ? undefined : () => onOpenSection('execution')}
        disabled={composerBusy}
      />
    );
  }

  if (isSoloComposer && selectedModel) {
    const label = buildModelSelectorLabel(selectedModel);
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
        onSingleClick={composerBusy ? undefined : () => onOpenSection('execution')}
        disabled={composerBusy}
      />
    );
  }

  if (!isSoloComposer && defaultRecipientCat) {
    const cats = assignedCatRecords.length > 0
      ? assignedCatRecords
      : leadCatRecord ? [leadCatRecord] : [];
    const participants = cats.map(catToAudienceParticipant);
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
