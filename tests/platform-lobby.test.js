import assert from 'node:assert/strict';
import test from 'node:test';

import { buildPlatformLobbyEntries } from '../build/server/app/renderer/lobbyModel.js';
import { listPlatformProductDescriptors } from '../build/server/shared/platformProducts.js';

test('buildPlatformLobbyEntries projects platform products into lobby cards', () => {
  const entries = buildPlatformLobbyEntries({
    products: listPlatformProductDescriptors(),
    lastUsedSurface: 'work',
  });

  assert.deepEqual(
    entries.map((entry) => ({
      productId: entry.productId,
      surface: entry.surface,
      routePrefix: entry.routePrefix,
      lastUsed: entry.lastUsed,
      available: entry.available,
    })),
    [
      {
        productId: 'chat',
        surface: 'chat',
        routePrefix: '/chat',
        lastUsed: false,
        available: false,
      },
      {
        productId: 'code',
        surface: 'code',
        routePrefix: '/code',
        lastUsed: false,
        available: false,
      },
      {
        productId: 'work',
        surface: 'work',
        routePrefix: '/work',
        lastUsed: true,
        available: false,
      },
    ],
  );
});
