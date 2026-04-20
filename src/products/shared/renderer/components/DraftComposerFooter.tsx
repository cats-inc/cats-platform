import type { ReactNode } from 'react';

import { CompareIcon } from './DraftBuilderIcons.js';

export interface DraftComposerFooterProps {
  accessory?: ReactNode;
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
  const renderParallelAddButton = showParallelAddButton && onAddParallelTarget != null;
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
              Add another model to compare
            </span>
          )}
          <button
            type="button"
            className={`parallelAddButton${accentParallelAddButton ? ' parallelAddButtonAccent' : ''}`}
            disabled={disabled}
            onClick={onAddParallelTarget}
            aria-label="Add parallel chat"
          >
            <CompareIcon />
          </button>
        </div>
      ) : null}
    </div>
  );
}
