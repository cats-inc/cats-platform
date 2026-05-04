import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildParallelChatRelayIncomingNote,
  buildParallelChatRelayOutgoingNote,
  buildParallelChatRelayPrompt,
  findParallelChatRelayCommand,
} from '../src/products/chat/shared/parallelChats.ts';

test('parallel chat relay command copy and notes localize to Traditional Chinese', () => {
  const command = findParallelChatRelayCommand('check_this', 'zh-TW');

  assert.equal(command.label, '檢查這則');
  assert.equal(command.shortLabel, '檢查');
  assert.equal(
    command.description,
    '針對另一則回覆壓力測試缺口、風險與錯誤假設。',
  );
  assert.equal(
    buildParallelChatRelayOutgoingNote({
      command: 'check_this',
      sourceMessageId: 'message-abcdef123456',
      targetMemberLabels: ['Claude Code', 'Codex', 'Gemini'],
      locale: 'zh-TW',
    }),
    '已透過「檢查這則」將回覆 #message- 分享給 Claude Code、Codex 和 Gemini。',
  );
  assert.equal(
    buildParallelChatRelayIncomingNote({
      command: 'check_this',
      sourceMessageId: 'message-abcdef123456',
      sourceMemberLabel: 'Claude Code',
      locale: 'zh-TW',
    }),
    '已收到 Claude Code 針對回覆 #message- 傳來的「檢查這則」。',
  );
});

test('parallel chat relay prompt localizes deterministic template and preserves source body', () => {
  const prompt = buildParallelChatRelayPrompt({
    command: 'improve_this',
    sourceMemberLabel: 'Codex',
    sourceBody: '@Mittens should stay escaped.',
    locale: 'zh-TW',
  });

  assert.match(prompt, /^\[平行轉送 - 改善這則\]/u);
  assert.match(prompt, /潤飾、擴充或強化引用的回覆。/u);
  assert.match(prompt, /來源：Codex/u);
  assert.match(prompt, /@\u200BMittens should stay escaped\./u);
});

test('parallel chat relay localization falls back to English for unknown locales', () => {
  assert.equal(
    buildParallelChatRelayOutgoingNote({
      command: 'synthesize_this',
      sourceMessageId: 'reply-1234567890',
      targetMemberLabels: ['Claude Code', 'Codex', 'Gemini'],
      locale: 'fr-FR',
    }),
    'Shared reply #reply-12 via Synthesize this to Claude Code, Codex, and Gemini.',
  );
});
