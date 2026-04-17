import { ComposerCatStack } from '../../../shared/renderer/components/ComposerCatStack.js';
import type { WorkspaceNewChatDraftTargetSlotProps } from '../../../shared/renderer/components/WorkspaceNewChatDraftTargetSlot.js';

export function NewCodeDraftTargetSlot({
  payload,
  effectiveDefaultRecipientCat,
  nonLeadDraftCats,
  isDirectLaneContext,
  isSubmittingFirstTurn,
  onOpenExecution,
}: WorkspaceNewChatDraftTargetSlotProps) {
  if (!isDirectLaneContext || !effectiveDefaultRecipientCat) {
    return null;
  }

  return (
    <ComposerCatStack
      cats={[effectiveDefaultRecipientCat, ...nonLeadDraftCats]}
      bossCatId={payload.chat.bossCatId}
      defaultRecipientCatId={effectiveDefaultRecipientCat.id}
      onClick={isSubmittingFirstTurn ? undefined : onOpenExecution}
    />
  );
}
