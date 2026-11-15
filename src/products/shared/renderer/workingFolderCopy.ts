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
}

const WORKING_FOLDER_KEYS: Record<ProductScope, { title: MessageKey; emptyState: MessageKey; chooseAction: MessageKey }> = {
  chat: {
    title: messageKeys.chatNewChatDraftSidePanelFolderTitle,
    emptyState: messageKeys.chatNewChatDraftSidePanelFolderEmptyState,
    chooseAction: messageKeys.chatNewChatDraftFolderActionLabel,
  },
  code: {
    title: messageKeys.codeNewDraftFolderTitle,
    emptyState: messageKeys.codeNewDraftFolderEmpty,
    chooseAction: messageKeys.codeNewDraftFolderAction,
  },
  work: {
    title: messageKeys.workNewChatDraftFolderTitle,
    emptyState: messageKeys.workNewChatDraftFolderEmpty,
    chooseAction: messageKeys.workNewChatDraftFolderAction,
  },
};

export function workingFolderCopy(surface: ProductScope, t: (key: MessageKey) => string): WorkingFolderCopy {
  const keys = WORKING_FOLDER_KEYS[surface];
  return { title: t(keys.title), emptyState: t(keys.emptyState), chooseAction: t(keys.chooseAction) };
}
