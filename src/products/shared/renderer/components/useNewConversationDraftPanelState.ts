import { useState } from 'react';

import { shouldBrowseFolderOnDraftSidePanelSectionOpen } from './newConversationDraftSidePanelState.js';

export function useNewConversationDraftPanelState(input: {
  folderBrowseCurrentPath: string;
  folderBrowseLoading: boolean;
  onPickFolder: () => void;
}) {
  const [sidePanelOpen, setSidePanelOpen] = useState(false);
  const [sidePanelSection, setSidePanelSection] = useState<string | null>('cwd');

  function switchSection(section: string): void {
    setSidePanelSection(section);
    if (shouldBrowseFolderOnDraftSidePanelSectionOpen({
      section,
      folderBrowseCurrentPath: input.folderBrowseCurrentPath,
      folderBrowseLoading: input.folderBrowseLoading,
    })) {
      input.onPickFolder();
    }
  }

  function openSidePanelTo(section: string, options?: { skipSectionAction?: boolean }): void {
    setSidePanelOpen(true);
    if (options?.skipSectionAction) {
      setSidePanelSection(section);
      return;
    }
    switchSection(section);
  }

  return {
    sidePanelOpen,
    setSidePanelOpen,
    sidePanelSection,
    switchSection,
    openSidePanelTo,
  };
}
