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
  } = options;

  function toggleAddCatPanel(): void {
    setAddCatOpen(!addCatOpen);
    setAddCatTab('existing');
    setFeedback('');
    setCatForm(emptyCatForm());
  }

  function toggleChannelPlusMenu(): void {
    setChannelPlusMenuOpen(!channelPlusMenuOpen);
  }

  function openChannelFilePicker(): void {
    channelFileInputRef.current?.click();
    setChannelPlusMenuOpen(false);
  }

  function toggleDraftPlusMenu(): void {
    setPlusMenuOpen(!plusMenuOpen);
  }

  function openDraftFilePicker(): void {
    fileInputRef.current?.click();
    setPlusMenuOpen(false);
  }

  function openDraftFolderPicker(): void {
    void openFolderBrowser(draftCwd);
    setPlusMenuOpen(false);
  }

  function openDraftAddCatPanel(): void {
    setPlusMenuOpen(false);
    setAddCatOpen(true);
    setAddCatTab('existing');
    setCatForm(emptyCatForm());
    setFeedback('');
  }

  function changeDraftDefaultRecipient(catId: string | null): void {
    if (catId === draftDefaultRecipientCatId) {
      return;
    }

    navigate(
      resolveDraftRoutePath({
        route: resolveDraftRouteContext({
          draftDefaultRecipientCatId,
          showingMyCatDirectLane,
        }),
        nextDefaultRecipientCatId: catId,
      }),
      { replace: true },
    );
  }

  return {
    toggleAddCatPanel,
    toggleChannelPlusMenu,
    openChannelFilePicker,
    toggleDraftPlusMenu,
    openDraftFilePicker,
    openDraftFolderPicker,
    openDraftAddCatPanel,
    changeDraftDefaultRecipient,
  };
}
