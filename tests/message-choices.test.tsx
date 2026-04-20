import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildChoiceResponseBody,
  extractChatMessageChoicesFromBody,
  normalizeChatMessageChoiceResponse,
  normalizeChatMessageChoices,
} from '../src/products/shared/messageChoices.ts';

test('message choice normalization drops malformed choices and options while preserving valid flags', () => {
  assert.deepEqual(
    normalizeChatMessageChoices([
      {
        question: 'Choose a provider',
        options: [
          { id: 'claude', label: 'Claude', style: 'primary' },
          { id: '', label: 'Invalid' },
          { id: 'codex', label: 'Codex', style: 'danger' },
        ],
        multiSelect: true,
        allowCustom: false,
        allowSkip: true,
      },
      {
        question: '',
        options: [{ id: 'bad', label: 'Bad' }],
      },
    ]),
    [
      {
        question: 'Choose a provider',
        options: [
          { id: 'claude', label: 'Claude', description: undefined, style: 'primary' },
          { id: 'codex', label: 'Codex', description: undefined, style: 'danger' },
        ],
        multiSelect: true,
        allowCustom: false,
        allowSkip: true,
      },
    ],
  );
  assert.equal(normalizeChatMessageChoices('nope'), undefined);
});

test('message choice response normalization rejects incomplete payloads and keeps valid answers', () => {
  assert.deepEqual(
    normalizeChatMessageChoiceResponse({
      sourceMessageId: 'message-1',
      status: 'submitted',
      submittedAt: '2026-04-20T13:00:00.000Z',
      answers: [
        {
          question: 'Choose a provider',
          selectedOptionIds: ['claude', 5, 'codex'],
          customText: 'Use the faster path',
        },
        {
          question: '',
          selectedOptionIds: ['bad'],
        },
      ],
    }),
    {
      sourceMessageId: 'message-1',
      status: 'submitted',
      submittedAt: '2026-04-20T13:00:00.000Z',
      answers: [
        {
          question: 'Choose a provider',
          selectedOptionIds: ['claude', 'codex'],
          customText: 'Use the faster path',
          skipped: undefined,
        },
      ],
    },
  );
  assert.equal(
    normalizeChatMessageChoiceResponse({
      sourceMessageId: 'message-1',
      status: 'unknown',
      submittedAt: '2026-04-20T13:00:00.000Z',
      answers: [],
    }),
    null,
  );
});

test('message choice extraction prefers explicit choices, then full payload JSON, then fenced JSON blocks', () => {
  const explicit = extractChatMessageChoicesFromBody(
    '  Keep this body.  ',
    [{
      question: 'Explicit choice',
      options: [{ id: 'yes', label: 'Yes' }],
    }],
  );
  assert.deepEqual(explicit, {
    body: 'Keep this body.',
    choices: [
      {
        question: 'Explicit choice',
        options: [{ id: 'yes', label: 'Yes', description: undefined, style: undefined }],
        multiSelect: undefined,
        allowCustom: undefined,
        allowSkip: undefined,
      },
    ],
  });

  const fullPayload = extractChatMessageChoicesFromBody(JSON.stringify({
    choices: [
      {
        question: 'JSON choice',
        options: [{ id: 'claude', label: 'Claude' }],
      },
    ],
  }));
  assert.deepEqual(fullPayload, {
    body: '',
    choices: [
      {
        question: 'JSON choice',
        options: [{ id: 'claude', label: 'Claude', description: undefined, style: undefined }],
        multiSelect: undefined,
        allowCustom: undefined,
        allowSkip: undefined,
      },
    ],
  });

  const fencedPayload = extractChatMessageChoicesFromBody([
    'Please choose one option.',
    '```json',
    JSON.stringify([
      {
        question: 'Fenced choice',
        options: [{ id: 'codex', label: 'Codex' }],
      },
    ]),
    '```',
  ].join('\n'));
  assert.deepEqual(fencedPayload, {
    body: 'Please choose one option.',
    choices: [
      {
        question: 'Fenced choice',
        options: [{ id: 'codex', label: 'Codex', description: undefined, style: undefined }],
        multiSelect: undefined,
        allowCustom: undefined,
        allowSkip: undefined,
      },
    ],
  });
});

test('message choice response body uses source labels when available and reports skipped responses', () => {
  assert.equal(
    buildChoiceResponseBody({
      sourceMessageId: 'message-1',
      status: 'submitted',
      submittedAt: '2026-04-20T13:00:00.000Z',
      answers: [
        {
          question: 'Choose a provider',
          selectedOptionIds: ['claude', 'custom-id'],
          customText: 'Need local execution',
        },
        {
          question: 'Pick one action',
          selectedOptionIds: [],
        },
      ],
    }, [
      {
        question: 'Choose a provider',
        options: [
          { id: 'claude', label: 'Claude' },
          { id: 'codex', label: 'Codex' },
        ],
      },
    ]),
    [
      'Q: Choose a provider',
      'A: Claude, custom-id, Need local execution',
      '',
      'Q: Pick one action',
      'A: Skipped',
    ].join('\n'),
  );

  assert.equal(
    buildChoiceResponseBody({
      sourceMessageId: 'message-1',
      status: 'skipped',
      submittedAt: '2026-04-20T13:00:00.000Z',
      answers: [],
    }),
    'Skipped requested choices.',
  );
});
