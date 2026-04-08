import {
  WorkspaceNewChatDraft,
  type WorkspaceNewChatDraftProps,
} from '../../../shared/renderer/components/NewChatDraft.js';
import { ComposerCatStack } from './ComposerCatStack.js';
import { FolderBrowserContent } from './FolderBrowser.js';
import { ModelSelectorChip } from './ModelSelector.js';
import { ProviderModelFields } from './ProviderModelFields.js';
import { CatAvatarRow } from './CatAvatarRow.js';

export interface NewChatDraftProps extends Omit<
  WorkspaceNewChatDraftProps,
  | 'ComposerCatStackComponent'
  | 'ModelSelectorChipComponent'
  | 'ProviderModelFieldsComponent'
  | 'CatAvatarRowComponent'
  | 'FolderBrowserContentComponent'
> {}

export function NewChatDraft(props: NewChatDraftProps) {
  return (
    <WorkspaceNewChatDraft
      {...props}
      ComposerCatStackComponent={ComposerCatStack}
      ModelSelectorChipComponent={ModelSelectorChip}
      ProviderModelFieldsComponent={ProviderModelFields}
      CatAvatarRowComponent={CatAvatarRow}
      FolderBrowserContentComponent={FolderBrowserContent}
    />
  );
}
