import type { AppShellPayload } from '../../api/workspaceContracts.js';
import {
  buildModelSelectorLabel,
  ModelSelectorChip,
  type ModelSelectorValue,
} from './ModelSelector.js';
import { ComposerCatStack } from './ComposerCatStack.js';

export interface WorkspaceNewChatDraftTargetSlotProps {
  payload: AppShellPayload;
  effectiveDefaultRecipientCat: AppShellPayload['chat']['cats'][number] | null;
  nonLeadDraftCats: AppShellPayload['chat']['cats'];
  activePanelModel: ModelSelectorValue | null;
  isSubmittingFirstTurn: boolean;
  onOpenExecution: () => void;
}

export function WorkspaceNewChatDraftTargetSlot({
  payload,
  effectiveDefaultRecipientCat,
  nonLeadDraftCats,
  activePanelModel,
  isSubmittingFirstTurn,
  onOpenExecution,
}: WorkspaceNewChatDraftTargetSlotProps) {
  if (effectiveDefaultRecipientCat) {
    return (
      <ComposerCatStack
        cats={[effectiveDefaultRecipientCat, ...nonLeadDraftCats]}
        bossCatId={payload.chat.bossCatId}
        defaultRecipientCatId={effectiveDefaultRecipientCat.id}
        onClick={isSubmittingFirstTurn ? undefined : onOpenExecution}
      />
    );
  }

  if (activePanelModel) {
    return (
      <div style={{ marginRight: 8 }}>
        <ModelSelectorChip
          label={buildModelSelectorLabel(activePanelModel)}
          onClick={isSubmittingFirstTurn ? undefined : onOpenExecution}
        />
      </div>
    );
  }

  return null;
}
