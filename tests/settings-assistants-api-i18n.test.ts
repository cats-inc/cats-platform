import assert from 'node:assert/strict';
import test from 'node:test';

import {
  localizeSettingsAssistantsApiErrorMessage,
  readSettingsAssistantsApiErrorMessage,
} from '../src/app/renderer/settings/settingsAssistantsApiErrors.ts';
import { createTranslator } from '../src/shared/i18n/index.ts';

function jsonResponse(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

test('settings assistants API error presenter localizes known validation messages', async () => {
  const t = createTranslator('zh-TW');

  assert.equal(
    localizeSettingsAssistantsApiErrorMessage('Assistant name is required', t),
    '請輸入助理名稱。',
  );
  assert.equal(
    localizeSettingsAssistantsApiErrorMessage('Assistant provider is required', t),
    '請選擇助理供應器。',
  );
  assert.equal(
    localizeSettingsAssistantsApiErrorMessage('Assistant model is required', t),
    '請選擇助理模型。',
  );
  assert.equal(
    localizeSettingsAssistantsApiErrorMessage('Assistant not found', t),
    '找不到助理。',
  );
  assert.equal(
    localizeSettingsAssistantsApiErrorMessage('No Guide Cat exists', t),
    '尚未建立導覽貓。',
  );
});

test('settings assistants API error reader avoids raw coded server messages', async () => {
  const t = createTranslator('zh-TW');

  assert.equal(
    await readSettingsAssistantsApiErrorMessage(
      jsonResponse({
        error: {
          code: 'bad_request',
          message: 'status must be active or dismissed',
        },
      }, 400),
      t,
      'fallback',
    ),
    '導覽貓狀態必須是啟用或已停用。',
  );

  assert.equal(
    await readSettingsAssistantsApiErrorMessage(
      jsonResponse({
        error: {
          code: 'future_error',
          message: 'future raw English message',
        },
      }, 500),
      t,
      'fallback',
    ),
    'fallback',
  );

  assert.equal(
    await readSettingsAssistantsApiErrorMessage(
      jsonResponse({ error: { message: 'Uncoded transport failure' } }, 502),
      t,
      'fallback',
    ),
    'Uncoded transport failure',
  );
});
