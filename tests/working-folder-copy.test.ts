import assert from 'node:assert/strict';
import test from 'node:test';

import { createTranslator } from '../src/shared/i18n/index.ts';
import { workingFolderCopy } from '../src/products/shared/renderer/workingFolderCopy.ts';

// docs/terminology.md (2026-11-16): one cwd, named for the surface that shows it.
test('a working folder is a Filespace in Chat, a Codespace in Code and a Workspace in Work', () => {
  const en = createTranslator('en');
  assert.deepEqual(workingFolderCopy('chat', en), {
    title: 'Filespace', emptyState: 'No filespace selected yet.', chooseAction: 'Choose filespace',
  });
  assert.deepEqual(workingFolderCopy('code', en), {
    title: 'Codespace', emptyState: 'No codespace selected yet.', chooseAction: 'Choose codespace',
  });
  assert.deepEqual(workingFolderCopy('work', en), {
    title: 'Workspace', emptyState: 'No workspace selected yet.', chooseAction: 'Choose workspace',
  });
});

test('zh-TW names them 檔案空間, 程式空間 and 工作空間, never 工作區', () => {
  const zh = createTranslator('zh-TW');
  assert.deepEqual(['chat', 'code', 'work'].map((surface) => workingFolderCopy(surface as 'chat' | 'code' | 'work', zh).title),
    ['檔案空間', '程式空間', '工作空間']);
  for (const surface of ['chat', 'code', 'work'] as const) {
    assert.doesNotMatch(Object.values(workingFolderCopy(surface, zh)).join(' '), /工作區/u);
  }
});
