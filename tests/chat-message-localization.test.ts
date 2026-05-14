import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  CHAT_MESSAGE_LOCALIZED_BODY_METADATA_KEY,
  resolveLocalizedChatMessageBody,
} from '../src/shared/chatMessageLocalization.ts';
import {
  createTranslator,
  messageKeys,
  parseMessageLocale,
} from '../src/shared/i18n/index.ts';

test('localized chat message bodies resolve through the active UI catalog', () => {
  const message = {
    body: 'Unable to import GitHub issue 99: the issue tracker fetch failed.',
    metadata: {
      [CHAT_MESSAGE_LOCALIZED_BODY_METADATA_KEY]: {
        key: messageKeys.workExternalImportFailureBody,
        values: {
          externalId: '99',
        },
        valueKeys: {
          providerLabel: messageKeys.workExternalImportProviderGithub,
          typeLabel: messageKeys.workExternalImportTypeIssue,
          reason: messageKeys.workExternalImportFailureReasonFetchFailed,
        },
      },
    },
  };

  assert.equal(
    resolveLocalizedChatMessageBody(message, createTranslator('en')),
    'Unable to import GitHub issue 99: the issue tracker fetch failed.',
  );
  assert.equal(
    resolveLocalizedChatMessageBody(message, createTranslator('zh-TW')),
    '無法匯入 GitHub 議題 99：無法讀取 issue tracker。',
  );
});

test('localized chat message bodies fall back to persisted body for unknown metadata', () => {
  const message = {
    body: 'Persisted fallback',
    metadata: {
      [CHAT_MESSAGE_LOCALIZED_BODY_METADATA_KEY]: {
        key: 'unknown.message.key',
      },
    },
  };

  assert.equal(
    resolveLocalizedChatMessageBody(message, createTranslator('zh-TW')),
    'Persisted fallback',
  );
});

test('localized chat message bodies reject message key property names', () => {
  const message = {
    body: 'Persisted fallback',
    metadata: {
      [CHAT_MESSAGE_LOCALIZED_BODY_METADATA_KEY]: {
        key: 'workExternalImportFailureBody',
        values: {
          externalId: '99',
        },
        valueKeys: {
          providerLabel: 'workExternalImportProviderGithub',
          typeLabel: 'workExternalImportTypeIssue',
          reason: 'workExternalImportFailureReasonFetchFailed',
        },
      },
    },
  };

  assert.equal(
    resolveLocalizedChatMessageBody(message, createTranslator('zh-TW')),
    'Persisted fallback',
  );
});

test('message locale parsing recognizes common Chinese owner hints centrally', () => {
  for (const locale of [
    'zh',
    'zh-CN',
    'zh-Hans-CN',
    'zh-HK',
    '中文',
    '繁體中文',
    'mandarin',
    '國語',
    '華語',
    'zh-TW,zh;q=0.9,en;q=0.8',
  ]) {
    assert.equal(parseMessageLocale(locale), 'zh-TW');
  }

  assert.equal(parseMessageLocale('en-US,en;q=0.9'), 'en');
  assert.equal(parseMessageLocale('klingon'), null);
});
