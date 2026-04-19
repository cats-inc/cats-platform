import assert from 'node:assert/strict';
import test from 'node:test';

import {
  browseFolderWithHomeFallback,
  createDefaultFolderBrowsePreferences,
  readFolderBrowseRememberedPath,
  writeFolderBrowseRememberedPath,
} from '../src/products/shared/folderBrowsePreferences.ts';

test('folder browse preferences keep chat/work/code and chat direct lanes isolated', () => {
  let preferences = createDefaultFolderBrowsePreferences();
  preferences = writeFolderBrowseRememberedPath(
    preferences,
    { surface: 'chat' },
    'C:/repo/chat-root',
  );
  preferences = writeFolderBrowseRememberedPath(
    preferences,
    { surface: 'work' },
    'C:/repo/work-root',
  );
  preferences = writeFolderBrowseRememberedPath(
    preferences,
    { surface: 'code' },
    'C:/repo/code-root',
  );
  preferences = writeFolderBrowseRememberedPath(
    preferences,
    { surface: 'chat', directLaneCatId: 'cat-1' },
    'C:/repo/direct-cat-1',
  );
  preferences = writeFolderBrowseRememberedPath(
    preferences,
    { surface: 'chat', directLaneCatId: 'cat-2' },
    'C:/repo/direct-cat-2',
  );

  assert.equal(
    readFolderBrowseRememberedPath(preferences, { surface: 'chat' }),
    'C:/repo/chat-root',
  );
  assert.equal(
    readFolderBrowseRememberedPath(preferences, { surface: 'work' }),
    'C:/repo/work-root',
  );
  assert.equal(
    readFolderBrowseRememberedPath(preferences, { surface: 'code' }),
    'C:/repo/code-root',
  );
  assert.equal(
    readFolderBrowseRememberedPath(preferences, { surface: 'chat', directLaneCatId: 'cat-1' }),
    'C:/repo/direct-cat-1',
  );
  assert.equal(
    readFolderBrowseRememberedPath(preferences, { surface: 'chat', directLaneCatId: 'cat-2' }),
    'C:/repo/direct-cat-2',
  );
  assert.equal(
    readFolderBrowseRememberedPath(preferences, { surface: 'chat', directLaneCatId: 'cat-3' }),
    null,
  );
});

test('browseFolderWithHomeFallback falls back to the user home browse when remembered path is gone', async () => {
  const calls: Array<string | null> = [];
  const result = await browseFolderWithHomeFallback({
    requestedPath: null,
    rememberedPath: 'C:/missing/path',
    browse: async (targetPath?: string) => {
      calls.push(targetPath ?? null);
      if (targetPath) {
        return {
          current: targetPath,
          parent: 'C:/missing',
          entries: [],
          error: `Not a directory: ${targetPath}`,
        };
      }
      return {
        current: 'C:/Users/kenne',
        parent: 'C:/Users',
        entries: [],
      };
    },
  });

  assert.deepEqual(calls, ['C:/missing/path', null]);
  assert.equal(result.current, 'C:/Users/kenne');
  assert.equal(result.error, undefined);
});

test('browseFolderWithHomeFallback preserves explicit requested path errors', async () => {
  const calls: Array<string | null> = [];
  const result = await browseFolderWithHomeFallback({
    requestedPath: 'C:/missing/explicit',
    rememberedPath: 'C:/remembered/path',
    browse: async (targetPath?: string) => {
      calls.push(targetPath ?? null);
      return {
        current: targetPath ?? 'C:/Users/kenne',
        parent: 'C:/missing',
        entries: [],
        error: targetPath ? `Not a directory: ${targetPath}` : undefined,
      };
    },
  });

  assert.deepEqual(calls, ['C:/missing/explicit']);
  assert.equal(result.current, 'C:/missing/explicit');
  assert.equal(result.error, 'Not a directory: C:/missing/explicit');
});
