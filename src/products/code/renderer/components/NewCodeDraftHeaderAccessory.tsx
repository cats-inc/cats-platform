import {
  ModelSelectorChip,
  buildModelSelectorLabel,
} from '../../../shared/renderer/components/ModelSelector.js';
import type { WorkspaceNewChatDraftHeaderAccessoryProps } from '../../../shared/renderer/components/NewChatDraft.js';
import { truncatePath } from '../../../shared/renderer/workspaceChatUtils.js';

export function NewCodeDraftHeaderAccessory({
  copy,
  draftCwd,
  selectedModel,
  disabled,
  onOpenSection,
}: WorkspaceNewChatDraftHeaderAccessoryProps) {
  const hasWorkspace = Boolean(draftCwd);
  const workspaceLabel = draftCwd ? truncatePath(draftCwd, 26) : copy.folderActionLabel;
  const executionLabel = selectedModel
    ? buildModelSelectorLabel(selectedModel)
    : copy.executionActionLabel;

  return (
    <div className="draftHeaderAccessoryRow chipRow">
      <button
        type="button"
        className={`draftContextChip draftContextChipClickable${hasWorkspace ? '' : ' draftContextChipEmpty'}`}
        disabled={disabled}
        onClick={() => onOpenSection('cwd')}
        data-tooltip={draftCwd ?? undefined}
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2 4v9a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1H8L6.5 3H3a1 1 0 0 0-1 1z" />
        </svg>
        <span className="draftContextChipLabel">{workspaceLabel}</span>
      </button>
      <ModelSelectorChip
        label={executionLabel}
        onClick={disabled ? undefined : () => onOpenSection('execution')}
      />
    </div>
  );
}
