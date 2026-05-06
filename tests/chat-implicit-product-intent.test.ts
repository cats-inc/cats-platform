import assert from 'node:assert/strict';
import test from 'node:test';

import {
  IMPLICIT_PRODUCT_INTENT_CANDIDATE_METADATA_KEY,
  IMPLICIT_PRODUCT_INTENT_COMMAND_TOKEN,
  IMPLICIT_PRODUCT_INTENT_TRANSITION_METADATA_KEY,
  buildImplicitProductIntentCandidateId,
  buildImplicitProductIntentCandidateMetadata,
  buildImplicitProductIntentTransitionMetadata,
  detectImplicitProductIntent,
  shouldAppendImplicitProductIntentCandidateSegment,
} from '../src/products/chat/shared/implicitProductIntent.js';

test('detectImplicitProductIntent detects code work in direct messages', () => {
  const result = detectImplicitProductIntent({
    rawText: 'Please fix the parser tests before the next commit',
    channelKind: 'direct_message',
  });

  assert.equal(result.kind, 'candidate');
  assert.equal(result.targetProduct, 'code');
  assert.equal(result.confidence, 'high');
  assert.match(result.reasonCode, /^code_high_/u);
  assert.ok(result.matchedActionCues.length > 0);
  assert.ok(result.matchedProductCues.length > 0);
});

test('detectImplicitProductIntent detects work planning in direct messages', () => {
  const result = detectImplicitProductIntent({
    rawText: 'Help me plan the milestone scope and requirements',
    channelKind: 'direct_message',
  });

  assert.equal(result.kind, 'candidate');
  assert.equal(result.targetProduct, 'work');
  assert.equal(result.confidence, 'high');
  assert.match(result.reasonCode, /^work_high_/u);
});

test('detectImplicitProductIntent stays conservative for casual chat', () => {
  for (const rawText of [
    'hello',
    'how are you doing today?',
    'I ate a bug burger yesterday',
    'please try the bug burger',
    'can you believe the weather',
    '請 修復 這 個 問題 今天 先 看看',
    'please refactor',
  ]) {
    const result = detectImplicitProductIntent({
      rawText,
      channelKind: 'direct_message',
    });

    assert.equal(result.kind, 'none', rawText);
  }
});

test('detectImplicitProductIntent ignores slash commands and non-direct channels', () => {
  assert.deepEqual(
    detectImplicitProductIntent({
      rawText: '/work fix parser tests',
      channelKind: 'direct_message',
    }),
    {
      kind: 'none',
      targetProduct: null,
      confidence: null,
      reasonCode: 'slash_command',
      normalizedText: '/work fix parser tests',
    },
  );

  assert.deepEqual(
    detectImplicitProductIntent({
      rawText: 'please fix parser tests',
      channelKind: 'chat_channel',
    }),
    {
      kind: 'none',
      targetProduct: null,
      confidence: null,
      reasonCode: 'non_direct_channel',
      normalizedText: 'please fix parser tests',
    },
  );
});

test('implicit product intent metadata builders pin candidate and transition contracts', () => {
  assert.equal(IMPLICIT_PRODUCT_INTENT_CANDIDATE_METADATA_KEY, 'implicitProductIntentCandidate');
  assert.equal(IMPLICIT_PRODUCT_INTENT_TRANSITION_METADATA_KEY, 'implicitProductIntentTransition');

  const now = new Date('2026-05-06T00:00:00.000Z');
  const candidateId = buildImplicitProductIntentCandidateId({
    messageId: 'message-1',
    targetProduct: 'code',
  });
  const candidate = buildImplicitProductIntentCandidateMetadata({
    messageId: 'message-1',
    channelId: 'channel-1',
    conversationId: 'conversation-1',
    transport: 'web',
    targetProduct: 'code',
    confidence: 'high',
    reasonCode: 'code_high_action_product_cue',
    now,
  });

  assert.equal(candidate.candidateId, candidateId);
  assert.equal(candidate.event, 'suggested');
  assert.equal(candidate.source.messageId, 'message-1');
  assert.equal(candidate.candidate.targetProduct, 'code');
  assert.equal(candidate.expiresAt, '2026-05-06T00:15:00.000Z');
});

test('confirmed implicit product intent transition uses sentinel command metadata', () => {
  const transition = buildImplicitProductIntentTransitionMetadata({
    candidateId: 'implicit-product-intent:v1:message-1:work',
    event: 'confirmed',
    sourceMessageId: 'message-1',
    targetProduct: 'work',
    originalMessageBody: '  help me plan the release scope  ',
  });

  assert.equal(
    transition.idempotencyKey,
    'implicit-product-intent-transition:v1:implicit-product-intent:v1:message-1:work:confirmed',
  );
  assert.deepEqual(transition.confirmedCommand, {
    sourceKind: 'implicit_confirmation',
    command: 'work',
    argumentText: 'help me plan the release scope',
    rawCommandToken: IMPLICIT_PRODUCT_INTENT_COMMAND_TOKEN,
    botSuffix: null,
    implicitConfirmed: true,
    originalCandidateId: 'implicit-product-intent:v1:message-1:work',
    originalMessageId: 'message-1',
  });
});

test('non-confirmed implicit product intent transitions do not synthesize commands', () => {
  const transition = buildImplicitProductIntentTransitionMetadata({
    candidateId: 'implicit-product-intent:v1:message-1:code',
    event: 'declined',
    sourceMessageId: 'message-1',
    targetProduct: 'code',
  });

  assert.equal(transition.event, 'declined');
  assert.equal(transition.confirmedCommand, undefined);
});

test('candidate write guard rejects repeated segments for the same message and target', () => {
  const candidate = buildImplicitProductIntentCandidateMetadata({
    messageId: 'message-1',
    channelId: 'channel-1',
    conversationId: 'conversation-1',
    transport: 'web',
    targetProduct: 'work',
    confidence: 'high',
    reasonCode: 'work_high_action_product_cue',
    now: new Date('2026-05-06T00:00:00.000Z'),
  });
  const records = [
    {
      metadata: {
        implicitProductIntentCandidate: candidate,
      },
    },
  ];

  assert.equal(
    shouldAppendImplicitProductIntentCandidateSegment({
      messages: records,
      candidateId: candidate.candidateId,
    }),
    false,
  );
  assert.equal(
    shouldAppendImplicitProductIntentCandidateSegment({
      messages: records,
      candidateId: buildImplicitProductIntentCandidateId({
        messageId: 'message-1',
        targetProduct: 'code',
      }),
    }),
    true,
  );
});
