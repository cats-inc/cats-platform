import type { ReactNode } from 'react';

import { useI18n } from '../../../../app/renderer/i18n/index.js';
import { messageKeys } from '../../../../shared/i18n/messageKeys.js';
import { CompareIcon } from './DraftBuilderIcons.js';

export interface DraftComposerFooterProps {
  accessory?: ReactNode;
  /**
   * Legacy single-card layouts (`shared/renderer/components/NewChatDraft.tsx`,
   * used by Cats Work) still surface a +compare add button in the
   * footer. Chat / Code drafts have moved +compare to the carousel's
   * last-branch slot and per-branch remove to the composer's
   * top-right corner; those callers stop passing this prop.
   */
  showParallelAddButton?: boolean;
  hideParallelHint?: boolean;
  accentParallelAddButton?: boolean;
  disabled?: boolean;
  onAddParallelTarget?: () => void;
}

export function DraftComposerFooter({
  accessory = null,
  showParallelAddButton = false,
  hideParallelHint = false,
  accentParallelAddButton = false,
  disabled = false,
  onAddParallelTarget,
}: DraftComposerFooterProps) {
  const { t } = useI18n();
  const renderParallelAddButton =
    showParallelAddButton && onAddParallelTarget != null;
  if (!accessory && !renderParallelAddButton) {
    return null;
  }

  return (
    <div className="composerFooterRow">
      {accessory ? <div className="composerFooterAccessory">{accessory}</div> : null}
      {renderParallelAddButton ? (
        <div className="parallelAddRow parallelAddRowInline">
          {hideParallelHint ? null : (
            <span className={`parallelAddHint${accentParallelAddButton ? ' parallelAddHintAccent' : ''}`}>
              {t(messageKeys.chatNewChatDraftBranchAddCompareHint)}
            </span>
          )}
          <button
            type="button"
            className={`parallelAddButton${accentParallelAddButton ? ' parallelAddButtonAccent' : ''}`}
            disabled={disabled}
            onClick={onAddParallelTarget}
            aria-label={t(messageKeys.chatNewChatDraftBranchAddParallelAria)}
          >
            <CompareIcon />
          </button>
        </div>
      ) : null}
    </div>
  );
}
