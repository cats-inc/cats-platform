import assert from 'node:assert/strict';
import test from 'node:test';

import { deleteCatMemory } from '../src/products/shared/renderer/api/memory.ts';
import {
  formatSettingsCatsMemoryMutationError,
  localizeSettingsCatsMemoryErrorMessage,
} from '../src/products/shared/renderer/hooks/settingsCatsMemoryErrorLabels.ts';
import { createTranslator } from '../src/shared/i18n/index.ts';

test('settings cats memory localizes known memory mutation errors', () => {
  const t = createTranslator('zh-TW');

  assert.equal(
    localizeSettingsCatsMemoryErrorMessage('Memory content is required.', t),
    '請輸入記憶內容。',
  );
  assert.equal(
    localizeSettingsCatsMemoryErrorMessage('Memory content must be a non-empty string.', t),
    '請輸入記憶內容。',
  );
  assert.equal(
    localizeSettingsCatsMemoryErrorMessage('Invalid memory category.', t),
    '記憶分類無效。',
  );
  assert.equal(
    localizeSettingsCatsMemoryErrorMessage('Cat memory not found: memory-1', t),
    '找不到這筆記憶。',
  );
  assert.equal(
    formatSettingsCatsMemoryMutationError(new Error('cat memory create returned 500'), 'fallback', t),
    'fallback',
  );
});

test('deleteCatMemory rejects non-ok responses so localized feedback can run', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(JSON.stringify({
      error: {
        code: 'memory_not_found',
        message: 'Cat memory not found: memory-1',
      },
    }), {
      status: 404,
      headers: { 'content-type': 'application/json' },
    });

  try {
    await assert.rejects(
      () => deleteCatMemory('cat-1', 'memory-1'),
      /Cat memory not found: memory-1/u,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
