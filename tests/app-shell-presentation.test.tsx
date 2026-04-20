import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildFolderBrowserContentProps,
  resolveVisibleChatChannel,
  resolveVisibleChatChannelId,
} from '../src/products/shared/renderer/appShellPresentation.ts';

test('visible chat helpers prefer the selected room and fall back to direct lanes only when needed', () => {
  const selectedChannel = { id: 'channel-selected', title: 'Selected' };
  const directLane = { id: 'channel-direct', title: 'Direct' };

  assert.equal(
    resolveVisibleChatChannelId(selectedChannel, directLane),
    'channel-selected',
  );
  assert.equal(
    resolveVisibleChatChannelId(null, directLane),
    'channel-direct',
  );
  assert.equal(resolveVisibleChatChannelId(null, null), null);

  assert.equal(resolveVisibleChatChannel(selectedChannel, directLane), selectedChannel);
  assert.equal(resolveVisibleChatChannel(null, directLane), directLane);
  assert.equal(resolveVisibleChatChannel(null, null), null);
});

test('folder browser presentation props normalize nullable paths and forward callbacks without leaking the source array', async () => {
  const entries = [{ path: 'C:/repo/a' }, { path: 'C:/repo/b' }];
  const pathChanges: string[] = [];
  const browseCalls: string[] = [];
  let selected = 0;

  const props = buildFolderBrowserContentProps({
    folderBrowsePath: 'C:/repo',
    folderBrowseCurrentPath: null,
    folderBrowseParentPath: null,
    folderBrowseEntries: entries,
    folderBrowseLoading: true,
    folderBrowseError: 'failed',
    onPathChange: (path) => {
      pathChanges.push(path);
    },
    browseFolder: async (path) => {
      browseCalls.push(path);
    },
    selectCurrentFolder: () => {
      selected += 1;
    },
  });

  assert.equal(props.folderBrowsePath, 'C:/repo');
  assert.equal(props.folderBrowseCurrentPath, '');
  assert.equal(props.folderBrowseParentPath, '');
  assert.notEqual(props.folderBrowseEntries, entries);
  assert.deepEqual(props.folderBrowseEntries, entries);
  assert.equal(props.folderBrowseLoading, true);
  assert.equal(props.folderBrowseError, 'failed');

  props.onPathChange('D:/next');
  assert.deepEqual(pathChanges, ['D:/next']);

  await props.onBrowse('D:/browse');
  assert.deepEqual(browseCalls, ['D:/browse']);

  props.onSelect();
  assert.equal(selected, 1);
});
