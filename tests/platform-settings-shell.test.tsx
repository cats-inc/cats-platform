import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server.browser';
import { StaticRouter } from 'react-router-dom';

import { buildPlatformSettingsProductEntries } from '../src/app/renderer/settings/PlatformSettingsShell.tsx';
import { PlatformSettingsShell } from '../src/app/renderer/settings/PlatformSettingsShell.tsx';
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

test('PlatformSettingsShell places Desktop Startup between Code and Runtime in desktop mode', () => {
  const previousBridge = (globalThis as typeof globalThis & {
    catsDesktopHost?: object;
  }).catsDesktopHost;
  (globalThis as typeof globalThis & {
    catsDesktopHost?: object;
  }).catsDesktopHost = {};

  const markup = renderToStaticMarkup(
    <StaticRouter location="/settings/desktop-startup">
      <PlatformSettingsShell
        section="desktop-startup"
        title="Desktop Startup"
        products={[
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
            id: 'code',
            surface: 'code',
            routePrefix: '/code',
            productName: 'Cats Code',
            group: 'office',
            settings: [
              {
                id: 'code',
                label: 'Code',
                path: '/settings/code',
              },
            ],
          }),
        ]}
      >
        <div>Desktop startup body</div>
      </PlatformSettingsShell>
    </StaticRouter>,
  );

  try {
    const codeIndex = markup.indexOf('>Code<');
    const desktopStartupIndex = markup.indexOf('>Desktop Startup<');
    const runtimeIndex = markup.indexOf('>Runtime<');
    assert.ok(codeIndex >= 0, 'expected Code nav entry');
    assert.ok(desktopStartupIndex >= 0, 'expected Desktop Startup nav entry');
    assert.ok(runtimeIndex >= 0, 'expected Runtime nav entry');
    assert.ok(codeIndex < desktopStartupIndex, 'expected Desktop Startup after Code');
    assert.ok(desktopStartupIndex < runtimeIndex, 'expected Desktop Startup before Runtime');
  } finally {
    if (previousBridge === undefined) {
      delete (globalThis as typeof globalThis & { catsDesktopHost?: object }).catsDesktopHost;
    } else {
      (globalThis as typeof globalThis & { catsDesktopHost?: object }).catsDesktopHost = previousBridge;
    }
  }
});
