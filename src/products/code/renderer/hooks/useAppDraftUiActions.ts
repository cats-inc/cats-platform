import type {
  Dispatch,
  RefObject,
  SetStateAction,
} from 'react';
import type { NavigateFunction } from 'react-router-dom';

import { useWorkspaceAppDraftUiActions } from '../../../shared/renderer/hooks/useWorkspaceAppDraftUiActions.js';
import { CHAT_PREFIX } from '../../shared/channelPaths.js';
import {
  emptyCatForm,
  type CatFormState,
} from '../chatUtils.js';

export function useAppDraftUiActions(options: {
  addCatOpen: boolean;
  channelPlusMenuOpen: boolean;
  plusMenuOpen: boolean;
  draftCwd: string | null;
  draftDefaultRecipientCatId: string | null;
  navigate: NavigateFunction;
  setAddCatOpen: Dispatch<SetStateAction<boolean>>;
  setAddCatTab: Dispatch<SetStateAction<'existing' | 'new'>>;
  setFeedback: Dispatch<SetStateAction<string>>;
  setCatForm: Dispatch<SetStateAction<CatFormState>>;
  setPlusMenuOpen: Dispatch<SetStateAction<boolean>>;
  setChannelPlusMenuOpen: Dispatch<SetStateAction<boolean>>;
  channelFileInputRef: RefObject<HTMLInputElement | null>;
  fileInputRef: RefObject<HTMLInputElement | null>;
  openFolderBrowser: (path?: string | null) => Promise<void>;
}) {
  return useWorkspaceAppDraftUiActions<CatFormState>({
    ...options,
    chatPrefix: CHAT_PREFIX,
    emptyCatForm,
  });
}
