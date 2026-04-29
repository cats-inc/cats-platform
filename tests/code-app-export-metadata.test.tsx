import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createCatsCodeAppExportMetadata,
} from '../src/products/code/shared/appExport.ts';
import type { CatsAppManifestV1 } from '../src/shared/catsAppManifest.ts';

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
