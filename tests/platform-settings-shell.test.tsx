import assert from 'node:assert/strict';
import test from 'node:test';

import { buildPlatformSettingsProductEntries } from '../src/app/renderer/settings/PlatformSettingsShell.tsx';
import type { PlatformProductDescriptor } from '../src/shared/platform-contract.ts';

function createProduct(overrides: Partial<PlatformProductDescriptor>): PlatformProductDescriptor {
  return {
    id: 'chat',
    surface: 'chat',
    routePrefix: '/chat',
    productName: 'Cats Chat',
    subtitle: 'Conversations with companions and personal agents',
    group: 'home',
    installPolicy: 'required',
    installState: 'installed',
    maturity: 'active',
    setup: {
      selectable: true,
    },
    ...overrides,
  };
}

test('buildPlatformSettingsProductEntries flattens visible product settings entries', () => {
  const entries = buildPlatformSettingsProductEntries([
    createProduct({
      id: 'chat',
      productName: 'Cats Chat',
      settings: [
        {
          id: 'chat',
          label: 'Chat',
          path: '/settings/chat',
        },
      ],
    }),
    createProduct({
      id: 'invest',
      surface: null,
      routePrefix: '/invest',
      productName: 'Cats Invest',
      group: 'office',
      installPolicy: 'optional',
      installState: 'attention',
      settings: [
        {
          id: 'general',
          label: 'Invest',
          path: '/invest/settings/general',
        },
      ],
    }),
    createProduct({
      id: 'learn',
      surface: null,
      routePrefix: '/learn',
      productName: 'Cats Learn',
      group: 'home',
      installPolicy: 'optional',
      installState: 'available',
      settings: [
        {
          id: 'general',
          label: 'Learn',
          path: '/learn/settings/general',
        },
      ],
    }),
    createProduct({
      id: 'work',
      surface: 'work',
      routePrefix: '/work',
      productName: 'Cats Work',
      group: 'office',
      maturity: 'preview',
    }),
  ]);

  assert.deepEqual(entries, [
    {
      productId: 'chat',
      id: 'chat',
      label: 'Chat',
      path: '/settings/chat',
    },
    {
      productId: 'invest',
      id: 'general',
      label: 'Invest',
      path: '/invest/settings/general',
    },
  ]);
});
