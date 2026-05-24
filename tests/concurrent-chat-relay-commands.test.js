import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildParallelChatRelayIncomingNote,
  buildParallelChatRelayOutgoingNote,
  buildParallelChatRelayPrompt,
  normalizeParallelChatRelayCommand,
} from '../build/server/products/chat/shared/parallelChats.js';

test('normalizeParallelChatRelayCommand accepts current supported relay commands', () => {
  assert.equal(normalizeParallelChatRelayCommand('improve_this'), 'improve_this');
});

test('normalizeParallelChatRelayCommand rejects unsupported relay commands', () => {
  assert.equal(normalizeParallelChatRelayCommand('build_on_this'), null);
  assert.equal(normalizeParallelChatRelayCommand('bogus_command'), null);
  assert.equal(normalizeParallelChatRelayCommand(''), null);
});

test('buildParallelChatRelayPrompt throws for unsupported relay commands', () => {
  assert.throws(
    () => buildParallelChatRelayPrompt({
      command: 'bogus_command',
      sourceMemberLabel: 'Claude · opus',
      sourceBody: 'Test body',
    }),
    /Unsupported concurrent relay command/u,
  );
});

test('buildParallelChatRelayPrompt escapes quoted mentions so relay routing does not parse them', () => {
  const prompt = buildParallelChatRelayPrompt({
    command: 'check_this',
    sourceMemberLabel: 'Claude · opus',
    sourceBody: 'Check what @anthropic-ai suggested and compare with @OpenAI.',
  });

  assert.equal(prompt.includes('@anthropic-ai'), false);
  assert.equal(prompt.includes('@OpenAI'), false);
  assert.equal(prompt.includes('@\u200Banthropic-ai'), true);
  assert.equal(prompt.includes('@\u200BOpenAI'), true);
});

test('buildParallelChatRelayOutgoingNote records which reply, command, and targets were shared', () => {
  assert.equal(
    buildParallelChatRelayOutgoingNote({
      command: 'improve_this',
      sourceMessageId: '1234567890abcdef',
      targetMemberLabels: ['Antigravity-CLI', 'Codex-CLI'],
    }),
    'Shared reply #12345678 via Improve this to Antigravity-CLI and Codex-CLI.',
  );
});

test('buildParallelChatRelayIncomingNote records which command was received from which source', () => {
  assert.equal(
    buildParallelChatRelayIncomingNote({
      command: 'synthesize_this',
      sourceMessageId: '1234567890abcdef',
      sourceMemberLabel: 'Claude-CLI',
    }),
    'Received Synthesize this from Claude-CLI for reply #12345678.',
  );
});

