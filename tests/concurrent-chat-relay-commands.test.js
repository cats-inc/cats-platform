import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildConcurrentRelayIncomingNote,
  buildConcurrentRelayOutgoingNote,
  buildConcurrentRelayPrompt,
  normalizeConcurrentRelayCommand,
} from '../build/server/products/chat/shared/concurrentChats.js';

test('normalizeConcurrentRelayCommand accepts current supported relay commands', () => {
  assert.equal(normalizeConcurrentRelayCommand('improve_this'), 'improve_this');
});

test('normalizeConcurrentRelayCommand rejects unsupported relay commands', () => {
  assert.equal(normalizeConcurrentRelayCommand('build_on_this'), null);
  assert.equal(normalizeConcurrentRelayCommand('bogus_command'), null);
  assert.equal(normalizeConcurrentRelayCommand(''), null);
});

test('buildConcurrentRelayPrompt throws for unsupported relay commands', () => {
  assert.throws(
    () => buildConcurrentRelayPrompt({
      command: 'bogus_command',
      sourceMemberLabel: 'Claude · opus',
      sourceBody: 'Test body',
    }),
    /Unsupported concurrent relay command/u,
  );
});

test('buildConcurrentRelayPrompt escapes quoted mentions so relay routing does not parse them', () => {
  const prompt = buildConcurrentRelayPrompt({
    command: 'check_this',
    sourceMemberLabel: 'Claude · opus',
    sourceBody: 'Check what @anthropic-ai suggested and compare with @OpenAI.',
  });

  assert.equal(prompt.includes('@anthropic-ai'), false);
  assert.equal(prompt.includes('@OpenAI'), false);
  assert.equal(prompt.includes('@\u200Banthropic-ai'), true);
  assert.equal(prompt.includes('@\u200BOpenAI'), true);
});

test('buildConcurrentRelayOutgoingNote records which reply, command, and targets were shared', () => {
  assert.equal(
    buildConcurrentRelayOutgoingNote({
      command: 'improve_this',
      sourceMessageId: '1234567890abcdef',
      targetMemberLabels: ['Gemini-CLI', 'Codex-CLI'],
    }),
    'Shared reply #12345678 via Improve this to Gemini-CLI and Codex-CLI.',
  );
});

test('buildConcurrentRelayIncomingNote records which command was received from which source', () => {
  assert.equal(
    buildConcurrentRelayIncomingNote({
      command: 'synthesize_this',
      sourceMessageId: '1234567890abcdef',
      sourceMemberLabel: 'Claude-CLI',
    }),
    'Received Synthesize this from Claude-CLI for reply #12345678.',
  );
});

