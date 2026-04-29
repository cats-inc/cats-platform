import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CATS_CODE_USER_APP_TEMPLATE_PACKAGE_PATH,
  CATS_CODE_USER_APP_TEMPLATE_RENDERER_ENTRYPOINT,
  createCatsCodeAppExportMetadata,
  createCatsCodeUserAppTemplateManifest,
} from '../src/products/code/shared/appExport.ts';
import type { CatsAppManifestV1 } from '../src/shared/catsAppManifest.ts';
import { parseCatsAppManifestV1 } from '../src/shared/catsAppValidation.ts';

function createManifest(): CatsAppManifestV1 {
  return {
    schemaVersion: 1,
    id: 'user.pomodoro',
    displayName: 'Pomodoro',
    version: '0.1.0',
    category: 'user-app',
    trustTier: 'local-user',
    publisher: {
      name: 'Local User',
    },
    compatibility: {
      catsPlatform: '^0.1.0',
      appSdk: '1.x',
    },
    entrypoints: {
      renderer: 'renderer/index.html',
      server: 'server/index.js',
    },
    contributions: {
      lobbyApps: [
        {
          id: 'timer',
          title: 'Pomodoro',
          routePath: '/apps/user.pomodoro',
        },
      ],
    },
    permissions: ['ui.route', 'ui.lobby'],
  };
}

test('createCatsCodeAppExportMetadata maps manifest entrypoints to package artifacts', () => {
  const metadata = createCatsCodeAppExportMetadata({
    manifest: createManifest(),
    packagePath: '/tmp/cats-code-export/user.pomodoro',
    createdAt: new Date('2026-04-30T00:00:00.000Z'),
  });

  assert.deepEqual(metadata, {
    schemaVersion: 1,
    appId: 'user.pomodoro',
    appVersion: '0.1.0',
    packagePath: '/tmp/cats-code-export/user.pomodoro',
    manifestPath: 'cats.app.json',
    artifacts: [
      {
        kind: 'manifest',
        path: 'cats.app.json',
        entrypoint: true,
      },
      {
        kind: 'renderer',
        path: 'renderer/index.html',
        entrypoint: true,
      },
      {
        kind: 'server',
        path: 'server/index.js',
        entrypoint: true,
      },
    ],
    createdAt: '2026-04-30T00:00:00.000Z',
  });
});

test('createCatsCodeUserAppTemplateManifest creates a valid local user app manifest', () => {
  const manifest = createCatsCodeUserAppTemplateManifest({
    appId: 'user.timer',
    displayName: 'Timer',
    description: 'Local timer created from Cats Code.',
    lobbyIcon: 'timer',
  });

  const parsed = parseCatsAppManifestV1(manifest, {
    productRoutePrefixes: ['/chat', '/work', '/code'],
  });

  assert.equal(parsed.ok, true);
  if (!parsed.ok) {
    assert.fail(JSON.stringify(parsed.issues));
  }
  assert.equal(manifest.category, 'user-app');
  assert.equal(manifest.trustTier, 'local-user');
  assert.equal(manifest.entrypoints?.renderer, CATS_CODE_USER_APP_TEMPLATE_RENDERER_ENTRYPOINT);
  assert.equal(manifest.contributions.lobbyApps?.[0]?.routePath, '/apps/user.timer');
  assert.deepEqual(manifest.permissions, [
    'ui.route',
    'ui.lobby',
    'storage.appData',
  ]);
});

test('createCatsCodeUserAppTemplateManifest exports through the user app template path', () => {
  const manifest = createCatsCodeUserAppTemplateManifest({
    appId: 'user.notes',
    displayName: 'Notes',
  });
  const metadata = createCatsCodeAppExportMetadata({
    manifest,
    packagePath: CATS_CODE_USER_APP_TEMPLATE_PACKAGE_PATH,
    createdAt: new Date('2026-04-30T00:00:00.000Z'),
  });

  assert.equal(metadata.packagePath, 'src/products/code/templates/user-app');
  assert.deepEqual(metadata.artifacts, [
    {
      kind: 'manifest',
      path: 'cats.app.json',
      entrypoint: true,
    },
    {
      kind: 'renderer',
      path: 'dist/renderer/index.html',
      entrypoint: true,
    },
  ]);
});
