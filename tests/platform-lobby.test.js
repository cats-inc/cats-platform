import assert from 'node:assert/strict';
import test from 'node:test';

import { buildPlatformLobbySections } from '../dist-server/app/renderer/lobbyModel.js';
import { listPlatformProductDescriptors } from '../dist-server/shared/platformProducts.js';

test('buildPlatformLobbySections groups platform products into Home and Office', () => {
  const sections = buildPlatformLobbySections({
    products: listPlatformProductDescriptors(),
    lastUsedSurface: 'work',
  });

  assert.deepEqual(
    sections.map((section) => ({
      id: section.id,
      entries: section.entries.map((entry) => ({
        surface: entry.surface,
        installPolicy: entry.installPolicy,
        installState: entry.installState,
        maturity: entry.maturity,
        lastUsed: entry.lastUsed,
      })),
    })),
    [
      {
        id: 'home',
        entries: [
          {
            surface: 'chat',
            installPolicy: 'required',
            installState: 'installed',
            maturity: 'active',
            lastUsed: false,
          },
        ],
      },
      {
        id: 'office',
        entries: [
          {
            surface: 'work',
            installPolicy: 'required',
            installState: 'installed',
            maturity: 'preview',
            lastUsed: true,
          },
          {
            surface: 'code',
            installPolicy: 'required',
            installState: 'installed',
            maturity: 'preview',
            lastUsed: false,
          },
        ],
      },
    ],
  );
});
