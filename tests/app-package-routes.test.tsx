import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import test from 'node:test';

import {
  routeAppPackageApi,
  type AppPackageRouteContext,
} from '../src/app/server/appPackageRoutes.ts';
import type { CatsAppManifestV1 } from '../src/shared/catsAppManifest.ts';

class TestResponse {
  statusCode = 0;
  headers: Record<string, string> = {};
  body = '';

  writeHead(statusCode: number, headers: Record<string, string> = {}): void {
    this.statusCode = statusCode;
    this.headers = headers;
  }

  end(body = ''): void {
    this.body = body.toString();
  }
}

function createManifest(overrides: Partial<CatsAppManifestV1> = {}): CatsAppManifestV1 {
  const id = overrides.id ?? 'user.pomodoro';
  return {
    schemaVersion: 1,
    id,
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
    contributions: {
      lobbyApps: [
        {
          id: 'timer',
          title: 'Pomodoro',
          subtitle: 'Focus timer',
          routePath: `/apps/${id}`,
        },
      ],
    },
    permissions: ['ui.route', 'ui.lobby'],
    ...overrides,
  };
}

async function createTempPlatformDir(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), 'cats-app-package-routes-'));
}

async function createPackage(
  platformDir: string,
  manifest: CatsAppManifestV1 | Record<string, unknown> = createManifest(),
): Promise<string> {
  const packagePath = path.join(platformDir, 'fixtures', String(manifest.id ?? 'invalid'));
  await mkdir(packagePath, { recursive: true });
  await writeFile(path.join(packagePath, 'cats.app.json'), `${JSON.stringify(manifest)}\n`, 'utf8');
  return packagePath;
}

async function routeJson(
  platformDir: string,
  method: string,
  pathname: string,
  body?: unknown,
): Promise<{ statusCode: number; payload: unknown }> {
  const request = body === undefined
    ? Readable.from([])
    : Readable.from([Buffer.from(JSON.stringify(body))]);
  const response = new TestResponse();
  const context: AppPackageRouteContext = {
    request: request as never,
    response: response as never,
    url: new URL(`http://localhost${pathname}`),
    method,
    dependencies: {
      config: {
        chatStatePath: path.join(platformDir, 'state', 'chat-state.local.json'),
      },
      now: () => new Date('2026-04-29T00:00:00.000Z'),
    },
  };

  const handled = await routeAppPackageApi(context);
  assert.equal(handled, true);
  return {
    statusCode: response.statusCode,
    payload: response.body ? JSON.parse(response.body) as unknown : null,
  };
}

test('POST /api/apps/validate validates a local cats.app.json without installing it', async () => {
  const platformDir = await createTempPlatformDir();
  const packagePath = await createPackage(platformDir);

  const validate = await routeJson(platformDir, 'POST', '/api/apps/validate', { packagePath });
  const list = await routeJson(platformDir, 'GET', '/api/apps');

  assert.equal(validate.statusCode, 200);
  assert.equal((validate.payload as { ok: boolean }).ok, true);
  assert.deepEqual((list.payload as { apps: unknown[] }).apps, []);
});

test('POST /api/apps/install installs an enabled app into the registry', async () => {
  const platformDir = await createTempPlatformDir();
  const packagePath = await createPackage(platformDir);

  const install = await routeJson(platformDir, 'POST', '/api/apps/install', {
    packagePath,
    enable: true,
  });
  const list = await routeJson(platformDir, 'GET', '/api/apps');
  const detail = await routeJson(platformDir, 'GET', '/api/apps/user.pomodoro');

  assert.equal(install.statusCode, 201);
  assert.equal((install.payload as { app: { id: string } }).app.id, 'user.pomodoro');
  assert.deepEqual(
    (list.payload as { apps: Array<{ id: string; lobbyEntries: Array<{ routePath: string }> }> })
      .apps.map((app) => [app.id, app.lobbyEntries.map((entry) => entry.routePath)]),
    [['user.pomodoro', ['/apps/user.pomodoro']]],
  );
  assert.equal((detail.payload as { app: { enabled: boolean } }).app.enabled, true);
});

test('app package disable and uninstall update launch visibility', async () => {
  const platformDir = await createTempPlatformDir();
  const packagePath = await createPackage(platformDir);

  await routeJson(platformDir, 'POST', '/api/apps/install', { packagePath, enable: true });
  const disabled = await routeJson(platformDir, 'POST', '/api/apps/user.pomodoro/disable');
  const uninstalled = await routeJson(platformDir, 'DELETE', '/api/apps/user.pomodoro');
  const list = await routeJson(platformDir, 'GET', '/api/apps');

  assert.equal(disabled.statusCode, 200);
  assert.deepEqual(
    (disabled.payload as { app: { installState: string; lobbyEntries: unknown[] } }).app,
    {
      id: 'user.pomodoro',
      displayName: 'Pomodoro',
      publisher: 'Local User',
      version: '0.1.0',
      category: 'user-app',
      trustTier: 'local-user',
      installState: 'disabled',
      enabled: false,
      lobbyEntries: [],
    },
  );
  assert.equal(uninstalled.statusCode, 200);
  assert.deepEqual((list.payload as { apps: unknown[] }).apps, []);
});

test('POST /api/apps/install rejects manifests that shadow product routes', async () => {
  const platformDir = await createTempPlatformDir();
  const packagePath = await createPackage(platformDir, createManifest({
    contributions: {
      lobbyApps: [
        {
          id: 'bad',
          title: 'Bad',
          routePath: '/chat',
        },
      ],
    },
  }));

  const install = await routeJson(platformDir, 'POST', '/api/apps/install', {
    packagePath,
    enable: true,
  });
  const list = await routeJson(platformDir, 'GET', '/api/apps');

  assert.equal(install.statusCode, 400);
  assert.ok(
    (install.payload as { issues: Array<{ code: string }> }).issues
      .some((issue) => issue.code === 'cats_app_route_collision'),
  );
  assert.deepEqual((list.payload as { apps: unknown[] }).apps, []);
});
