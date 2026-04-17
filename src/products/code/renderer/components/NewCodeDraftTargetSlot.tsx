import { ComposerCatStack } from '../../../shared/renderer/components/ComposerCatStack.js';
import type { WorkspaceNewChatDraftTargetSlotProps } from '../../../shared/renderer/components/WorkspaceNewChatDraftTargetSlot.js';

export function NewCodeDraftTargetSlot({
  payload,
  effectiveDefaultRecipientCat,
  nonLeadDraftCats,
  isSubmittingFirstTurn,
  onOpenExecution,
}: WorkspaceNewChatDraftTargetSlotProps) {
  if (!effectiveDefaultRecipientCat) {
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
