import assert from 'node:assert/strict';
import test from 'node:test';

import {
  shouldBrowseFolderOnDraftSidePanelSectionOpen,
} from '../src/products/shared/renderer/components/chatNewChatDraftSidePanelState.ts';

test('draft side panel folder section opens the browser only when needed', () => {
  assert.equal(
    shouldBrowseFolderOnDraftSidePanelSectionOpen({
      section: 'cwd',
      folderBrowseCurrentPath: '',
      folderBrowseLoading: false,
    }),
    true,
  );
  assert.equal(
    shouldBrowseFolderOnDraftSidePanelSectionOpen({
      section: 'cwd',
      folderBrowseCurrentPath: 'C:/repo/cats-platform',
      folderBrowseLoading: false,
    }),
    false,
  );
  assert.equal(
    shouldBrowseFolderOnDraftSidePanelSectionOpen({
      section: 'cwd',
      folderBrowseCurrentPath: '',
      folderBrowseLoading: true,
    }),
    false,
  );
  assert.equal(
    shouldBrowseFolderOnDraftSidePanelSectionOpen({
      section: 'cats',
      folderBrowseCurrentPath: '',
      folderBrowseLoading: false,
    }),
    false,
  );
});

test('draft side panel skipSectionAction suppresses folder browse side effects', () => {
  assert.equal(
    shouldBrowseFolderOnDraftSidePanelSectionOpen({
      section: 'cwd',
      folderBrowseCurrentPath: '',
      folderBrowseLoading: false,
      skipSectionAction: true,
    }),
    false,
  );
});
