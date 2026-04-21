export interface ShouldBrowseFolderOnDraftSidePanelSectionOpenInput {
  section: string;
  folderBrowseCurrentPath: string;
  folderBrowseLoading: boolean;
  skipSectionAction?: boolean;
}

export function shouldBrowseFolderOnDraftSidePanelSectionOpen(
  input: ShouldBrowseFolderOnDraftSidePanelSectionOpenInput,
): boolean {
  return input.section === 'cwd'
    && !input.skipSectionAction
    && !input.folderBrowseCurrentPath
    && !input.folderBrowseLoading;
}
