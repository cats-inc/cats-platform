import type { ReactNode } from 'react';

import { useI18n } from '../../../../app/renderer/i18n/index.js';
import { messageKeys } from '../../../../shared/i18n/messageKeys.js';
import { CompareIcon } from './DraftBuilderIcons.js';

export interface DraftComposerFooterBranchRemove {
  /** Disable when the branch count is at `minParallelTargetCount`. */
  disabled?: boolean;
  branchIndex: number;
  onRemove: () => void;
}

export interface DraftComposerFooterProps {
  accessory?: ReactNode;
  showParallelAddButton?: boolean;
  hideParallelHint?: boolean;
  accentParallelAddButton?: boolean;
  disabled?: boolean;
  onAddParallelTarget?: () => void;
  /**
   * Owner directive (2026-05-01): once the parallel carousel is active
   * (count >= 2), every branch's footer slot below the Send button
   * surfaces a "-" remove button instead of a +compare. The +compare
   * affordance moves to the carousel's last-branch slot. Pass this
   * prop on multi-branch lead/shadow footers; the button stays
   * visible-but-disabled when the branch count equals the parallel
   * preset's minimum so the user keeps the affordance even at the cap.
   */
  branchRemove?: DraftComposerFooterBranchRemove;
}

export function DraftComposerFooter({
  accessory = null,
  showParallelAddButton = false,
  hideParallelHint = false,
  accentParallelAddButton = false,
  disabled = false,
  onAddParallelTarget,
  branchRemove,
}: DraftComposerFooterProps) {
  const { t } = useI18n();
  const renderParallelAddButton =
    showParallelAddButton && onAddParallelTarget != null && !branchRemove;
  const renderBranchRemove = branchRemove != null;
  if (!accessory && !renderParallelAddButton && !renderBranchRemove) {
    return null;
  }

  return (
    <div className="composerFooterRow">
      {accessory ? <div className="composerFooterAccessory">{accessory}</div> : null}
      {renderBranchRemove ? (
        <div className="parallelAddRow parallelAddRowInline">
          <button
            type="button"
            className="parallelStubRemove"
            disabled={disabled || Boolean(branchRemove.disabled)}
            onClick={branchRemove.onRemove}
            aria-label={t(messageKeys.chatNewChatDraftBranchRemoveAria, {
              branchIndex: branchRemove.branchIndex + 1,
            })}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
              <path d="M4 8h8" />
            </svg>
          </button>
        </div>
      ) : renderParallelAddButton ? (
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
