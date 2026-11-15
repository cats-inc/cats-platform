import { messageKeys, type MessageKey } from '../../../shared/i18n/index.js';
import type { ProductScope } from '../../../shared/productScope.js';

/**
 * What a conversation's working folder (its participants' `cwd`) is called on each surface
 * (docs/terminology.md, decided 2026-11-16): a Filespace in Chat, a Codespace in Code and a
 * Workspace in Work; zh-TW 檔案空間, 程式空間 and 工作空間.
 */
export interface WorkingFolderCopy {
  title: string;
  emptyState: string;
  chooseAction: string;
  /** Accessible names of the draft's remove button and a parallel branch's own folder buttons. */
  removeAction: string;
  chooseBranchAction: string;
  relinkBranchAction: string;
}

const WORKING_FOLDER_KEYS: Record<ProductScope, Record<keyof WorkingFolderCopy, MessageKey>> = {
  chat: {
    title: messageKeys.chatNewChatDraftSidePanelFolderTitle,
    emptyState: messageKeys.chatNewChatDraftSidePanelFolderEmptyState,
    chooseAction: messageKeys.chatNewChatDraftFolderActionLabel,
    removeAction: messageKeys.chatNewChatDraftRemoveFolderAria,
    chooseBranchAction: messageKeys.chatNewChatDraftBranchFolderChooseAria,
    relinkBranchAction: messageKeys.chatNewChatDraftBranchFolderRelinkAria,
  },
  code: {
    title: messageKeys.codeNewDraftFolderTitle,
    emptyState: messageKeys.codeNewDraftFolderEmpty,
    chooseAction: messageKeys.codeNewDraftFolderAction,
    removeAction: messageKeys.codeNewDraftFolderRemove,
    chooseBranchAction: messageKeys.codeNewDraftFolderChooseBranch,
    relinkBranchAction: messageKeys.codeNewDraftFolderRelinkBranch,
  },
  work: {
    title: messageKeys.workNewChatDraftFolderTitle,
    emptyState: messageKeys.workNewChatDraftFolderEmpty,
    chooseAction: messageKeys.workNewChatDraftFolderAction,
    removeAction: messageKeys.workNewChatDraftFolderRemove,
    chooseBranchAction: messageKeys.workNewChatDraftFolderChooseBranch,
    relinkBranchAction: messageKeys.workNewChatDraftFolderRelinkBranch,
  },
};

export function workingFolderCopy(surface: ProductScope, t: (key: MessageKey) => string): WorkingFolderCopy {
  const keys = WORKING_FOLDER_KEYS[surface];
  return Object.fromEntries(Object.entries(keys).map(([name, key]) => [name, t(key)])) as unknown as WorkingFolderCopy;
}
