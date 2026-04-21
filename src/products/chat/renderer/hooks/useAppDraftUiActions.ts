import { useWorkspaceAppDraftUiActions } from '../../../shared/renderer/hooks/useWorkspaceAppDraftUiActions.js';
import { CHAT_PREFIX } from '../../shared/channelPaths.js';
import type {
  Dispatch,
  RefObject,
  SetStateAction,
} from 'react';
import type { NavigateFunction } from 'react-router-dom';

import {
  resolveDraftRouteContext,
  resolveDraftRoutePath,
} from '../draftParticipants.js';
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
  showingMyCatDirectLane: boolean;
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
  onDraftScreenshotCapture?: () => void;
  onChannelScreenshotCapture?: () => void;
}) {
  const {
    addCatOpen,
    channelPlusMenuOpen,
    plusMenuOpen,
    draftCwd,
    draftDefaultRecipientCatId,
    showingMyCatDirectLane,
    navigate,
    setAddCatOpen,
    setAddCatTab,
    setFeedback,
    setCatForm,
    setPlusMenuOpen,
    setChannelPlusMenuOpen,
    channelFileInputRef,
    fileInputRef,
    openFolderBrowser,
    onDraftScreenshotCapture,
    onChannelScreenshotCapture,
  } = options;
  return useWorkspaceAppDraftUiActions({
    addCatOpen,
    channelPlusMenuOpen,
    plusMenuOpen,
    draftCwd,
    draftDefaultRecipientCatId,
    navigate,
    chatPrefix: CHAT_PREFIX,
    emptyCatForm,
    resolveDraftDefaultRecipientPath: (catId) =>
      resolveDraftRoutePath({
        route: resolveDraftRouteContext({
          draftDefaultRecipientCatId,
          showingMyCatDirectLane,
        }),
        nextDefaultRecipientCatId: catId,
      }),
    setAddCatOpen,
    setAddCatTab,
    setFeedback,
    setCatForm,
    setPlusMenuOpen,
    setChannelPlusMenuOpen,
    channelFileInputRef,
    fileInputRef,
    openFolderBrowser,
    onDraftScreenshotCapture,
    onChannelScreenshotCapture,
  });
}
