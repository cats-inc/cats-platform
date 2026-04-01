import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildConcurrentRelayPrompt,
  normalizeConcurrentRelayCommand,
} from '../dist-server/products/chat/shared/concurrentChats.js';

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
