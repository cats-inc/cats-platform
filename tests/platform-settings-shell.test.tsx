import assert from 'node:assert/strict';
import test from 'node:test';

import { buildPlatformSettingsProductGroups } from '../src/app/renderer/settings/PlatformSettingsShell.tsx';
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

test('buildPlatformSettingsProductGroups hides only available products without losing in-progress settings entries', () => {
  const groups = buildPlatformSettingsProductGroups([
    createProduct({
      id: 'chat',
      productName: 'Cats Chat',
      settings: [
        {
          id: 'general',
          label: 'Chat',
          path: '/chat/settings/general',
        },
        {
          id: 'cats',
          label: 'Cats',
          path: '/chat/settings/cats',
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

  assert.deepEqual(groups, [
    {
      productId: 'chat',
      productName: 'Cats Chat',
      entries: [
        {
          id: 'general',
          label: 'Chat',
          path: '/chat/settings/general',
        },
        {
          id: 'cats',
          label: 'Cats',
          path: '/chat/settings/cats',
        },
      ],
    },
    {
      productId: 'invest',
      productName: 'Cats Invest',
      entries: [
        {
          id: 'general',
          label: 'Invest',
          path: '/invest/settings/general',
        },
      ],
    },
  ]);
});
