import {
  NewChatDraft as ChatNewChatDraft,
  type NewChatDraftProps,
} from '../../../shared/renderer/components/ChatNewChatDraft.js';
import {
  NewChatDraft as WorkspaceNewChatDraft,
  type WorkspaceNewChatDraftCopy,
} from '../../../shared/renderer/components/NewChatDraft.js';

export const NEW_CODE_DRAFT_COPY: WorkspaceNewChatDraftCopy = {
  composerPlaceholder: 'What should this code session build, fix, or investigate?',
  sidePanelTitle: 'New Code Setup',
  participantsSectionTitle: 'Participants',
  executionSectionTitle: 'Execution',
  folderSectionTitle: 'Workspace',
  folderActionLabel: 'Choose workspace',
  folderEmptyState: 'No workspace selected yet.',
};

export type {
  NewChatDraftProps,
} from '../../../shared/renderer/components/ChatNewChatDraft.js';

export function NewChatDraft(props: NewChatDraftProps) {
  if (props.entryMode === 'group' || props.entryMode === 'parallel') {
    return <ChatNewChatDraft {...props} />;
  }

  return (
    <WorkspaceNewChatDraft
      payload={props.payload}
      composerDraft={props.composerDraft}
      busy={props.busy}
      greeting={props.greeting ?? 'Ready to code.'}
      draftFiles={props.draftFiles}
      draftCwd={props.draftCwd}
      draftCatIds={props.draftCatIds}
      plusMenuOpen={props.plusMenuOpen}
      plusMenuRef={props.plusMenuRef}
      fileInputRef={props.fileInputRef}
      bossCatName={props.bossCatName}
      bossCatAvatarColor={props.bossCatAvatarColor}
      onComposerChange={props.onComposerChange}
      onComposerKeyDown={props.onComposerKeyDown}
      onSendMessage={props.onSendMessage}
      onTogglePlusMenu={props.onTogglePlusMenu}
      onFileSelect={props.onFileSelect}
      onPickFolder={props.onPickFolder}
      onOpenAddCat={props.onOpenAddCat}
      onDraftFilesChange={props.onDraftFilesChange}
      onDraftCwdClear={props.onDraftCwdClear}
      onToggleDraftCat={props.onToggleDraftCat}
      autoResize={props.autoResize}
      draftDefaultRecipientCatId={props.draftDefaultRecipientCatId}
      onDraftDefaultRecipientChange={props.onDraftDefaultRecipientChange}
      allowAddCat={props.allowAddCat}
      selectedModel={props.selectedModel}
      onModelChange={props.onModelChange}
      draftHighlightedCatId={props.draftHighlightedCatId}
      onHighlightDraftCat={props.onHighlightDraftCat}
      draftCatModelOverrides={props.draftCatModelOverrides}
      onDraftCatModelOverride={props.onDraftCatModelOverride}
      onDirectLaneModelChange={props.onDirectLaneModelChange}
      folderBrowsePath={props.folderBrowsePath}
      folderBrowseCurrentPath={props.folderBrowseCurrentPath}
      folderBrowseParentPath={props.folderBrowseParentPath}
      folderBrowseEntries={props.folderBrowseEntries}
      folderBrowseLoading={props.folderBrowseLoading}
      folderBrowseError={props.folderBrowseError}
      onFolderBrowsePathChange={props.onFolderBrowsePathChange}
      onFolderBrowse={props.onFolderBrowse}
      onFolderBrowseSelect={props.onFolderBrowseSelect}
      copy={NEW_CODE_DRAFT_COPY}
    />
  );
}
