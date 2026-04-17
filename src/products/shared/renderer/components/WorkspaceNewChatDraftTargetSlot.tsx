import type { AppShellPayload } from '../../api/workspaceContracts.js';
import type { ExecutionTargetValue } from './ExecutionTarget.js';
import { AudienceChip } from './AudienceChip.js';
import { ComposerCatStack } from './ComposerCatStack.js';
import { buildAudienceParticipantFromModel } from '../audienceParticipantBuilder.js';

export interface WorkspaceNewChatDraftTargetSlotProps {
  payload: AppShellPayload;
  effectiveDefaultRecipientCat: AppShellPayload['chat']['cats'][number] | null;
  nonLeadDraftCats: AppShellPayload['chat']['cats'];
  isDirectLaneContext: boolean;
  activePanelModel: ExecutionTargetValue | null;
  isSubmittingFirstTurn: boolean;
  onOpenExecution: () => void;
}

export function WorkspaceNewChatDraftTargetSlot({
  payload,
  effectiveDefaultRecipientCat,
  nonLeadDraftCats,
  isDirectLaneContext,
  activePanelModel,
  isSubmittingFirstTurn,
  onOpenExecution,
}: WorkspaceNewChatDraftTargetSlotProps) {
  if (isDirectLaneContext && effectiveDefaultRecipientCat) {
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
        <AudienceChip
          audienceParticipants={[buildAudienceParticipantFromModel(activePanelModel)]}
          onSingleClick={isSubmittingFirstTurn ? undefined : onOpenExecution}
          disabled={isSubmittingFirstTurn}
        />
      </div>
    );
  }

  return null;
}

