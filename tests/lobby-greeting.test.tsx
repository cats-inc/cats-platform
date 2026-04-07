import assert from 'node:assert/strict';
import test from 'node:test';

import { pickLobbyGreeting } from '../src/app/renderer/lobbyModel.ts';
import { pickDraftGreeting } from '../src/products/chat/renderer/chatUtils.tsx';

test('lobby greeting uses a separate default pool from fresh chat drafts', () => {
  const draftGreeting = pickDraftGreeting({ random: () => 0 });
  const lobbyGreeting = pickLobbyGreeting(undefined, () => 0);

  assert.equal(draftGreeting, 'Meow. Ready when you are.');
  assert.equal(lobbyGreeting, 'Choose a surface and get moving.');
  assert.notEqual(lobbyGreeting, draftGreeting);
});

test('lobby greeting picker honors an explicit override pool', () => {
  assert.equal(
    pickLobbyGreeting(['Lobby One', 'Lobby Two'], () => 0.99),
    'Lobby Two',
  );
});
