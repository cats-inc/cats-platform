import assert from 'node:assert/strict';
import test from 'node:test';

import { shouldRebuildBouncingCats } from '../src/app/renderer/LobbyBouncingCats.tsx';

test('shouldRebuildBouncingCats rebuilds when the lobby roster membership changes', () => {
  const currentCats = [
    {
      id: 'cat-active',
      color: '#7A5B3A',
      isBoss: false,
      avatarUrl: null,
    },
    {
      id: 'cat-archived',
      color: '#2B9CF0',
      isBoss: false,
      avatarUrl: null,
    },
  ];

  const nextCats = [
    {
      id: 'cat-active',
      name: 'Active Cat',
      avatarColor: '#7A5B3A',
      avatarUrl: null,
      isBoss: false,
      executionLabel: null,
    },
  ];

  assert.equal(shouldRebuildBouncingCats(currentCats, nextCats), true);
});

test('shouldRebuildBouncingCats keeps the current animation state when the lobby roster signature matches', () => {
  const currentCats = [
    {
      id: 'cat-active',
      color: '#7A5B3A',
      isBoss: true,
      avatarUrl: 'https://example.com/active.png',
    },
  ];

  const nextCats = [
    {
      id: 'cat-active',
      name: 'Active Cat',
      avatarColor: '#7A5B3A',
      avatarUrl: 'https://example.com/active.png',
      isBoss: true,
      executionLabel: null,
    },
  ];

  assert.equal(shouldRebuildBouncingCats(currentCats, nextCats), false);
});
