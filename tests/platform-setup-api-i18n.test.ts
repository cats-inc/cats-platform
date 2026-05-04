import assert from 'node:assert/strict';
import test from 'node:test';

import { readSetupApiErrorMessage } from '../src/app/renderer/setup/api.ts';
import { createTranslator, messageKeys } from '../src/shared/i18n/index.ts';

function createSetupApiI18nOptions() {
  const t = createTranslator('zh-TW');

  return {
    fallbackMessageForStatus: (status: number) =>
      t(messageKeys.setupWizardFailedWithStatus, { status }),
    errorMessagesByCode: {
      already_complete: t(messageKeys.setupWizardAlreadyCompleteError),
      bad_request: t(messageKeys.setupWizardInvalidRequestError),
      internal_error: t(messageKeys.setupWizardServerError),
    },
  };
}

function jsonResponse(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

test('platform setup API maps coded server errors to localized onboarding copy', async () => {
  const options = createSetupApiI18nOptions();

  assert.equal(
    await readSetupApiErrorMessage(
      jsonResponse({
        error: {
          code: 'bad_request',
          message: 'Unexpected name field. Guide Cat name is system-managed.',
        },
      }, 400),
      options,
    ),
    '設定請求無效。',
  );

  assert.equal(
    await readSetupApiErrorMessage(
      jsonResponse({
        error: {
          code: 'internal_error',
          message: 'disk full',
        },
      }, 500),
      options,
    ),
    '無法完成設定，請稍後再試。',
  );
});

test('platform setup API falls back locally for unmapped coded errors', async () => {
  const options = createSetupApiI18nOptions();

  assert.equal(
    await readSetupApiErrorMessage(
      jsonResponse({
        error: {
          code: 'future_server_code',
          message: 'future raw English message',
        },
      }, 503),
      options,
    ),
    '設定失敗（503）',
  );

  assert.equal(
    await readSetupApiErrorMessage(
      jsonResponse({ error: { message: 'Uncoded transport failure' } }, 502),
      options,
    ),
    'Uncoded transport failure',
  );
});
