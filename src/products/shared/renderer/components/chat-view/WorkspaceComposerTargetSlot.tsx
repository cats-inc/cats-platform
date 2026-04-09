import type { AppShellPayload, ChatCat } from '../../../api/workspaceContracts.js';
import type { SelectedChannelView } from '../../workspaceChatUtils.js';
import { ComposerCatStack } from '../ComposerCatStack.js';
import {
  buildModelSelectorLabel,
  ModelSelectorChip,
  type ModelSelectorValue,
} from '../ModelSelector.js';

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
      <ComposerCatStack
        cats={[directLaneCat]}
        bossCatId={payload.chat.bossCatId}
        defaultRecipientCatId={directLaneCat.id}
        onClick={composerBusy ? undefined : () => onOpenSection('execution')}
      />
    );
  }

  if (isSoloComposer && selectedModel) {
    return (
      <div style={{ marginRight: 8 }}>
        <ModelSelectorChip
          label={buildModelSelectorLabel(selectedModel)}
          onClick={composerBusy ? undefined : () => onOpenSection('execution')}
        />
      </div>
    );
  }

  if (!isSoloComposer && defaultRecipientCat) {
    return (
      <ComposerCatStack
        cats={assignedCatRecords.length > 0
          ? assignedCatRecords
          : leadCatRecord ? [leadCatRecord] : []}
        bossCatId={payload.chat.bossCatId}
        defaultRecipientCatId={defaultRecipientCat.catId}
        onClick={composerBusy ? undefined : () => onOpenSection('execution')}
      />
    );
  }

  return null;
}
