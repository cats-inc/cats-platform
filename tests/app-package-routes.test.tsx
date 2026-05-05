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

function createProductModuleManifest(
  id: string,
  productId: string,
  routePrefix: `/${string}`,
): CatsAppManifestV1 {
  return createManifest({
    id,
    displayName: productId === 'learn' ? 'Cats Learn' : 'Other Product',
    category: 'product-module',
    trustTier: 'system',
    publisher: {
      name: 'Cats',
    },
    contributions: {
      products: [
        {
          productId,
          productName: productId === 'learn' ? 'Cats Learn' : 'Other Product',
          subtitle: 'System product module',
          routePrefix,
          group: 'home',
          installPolicy: 'optional',
          maturity: 'preview',
        },
      ],
    },
    permissions: [],
  });
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

test('POST /api/apps/validate accepts the Pomodoro fixture package', async () => {
  const platformDir = await createTempPlatformDir();
  const packagePath = path.join(process.cwd(), 'tests', 'fixtures', 'cats-apps', 'pomodoro');

  const validate = await routeJson(platformDir, 'POST', '/api/apps/validate', { packagePath });

  assert.equal(validate.statusCode, 200);
  assert.equal((validate.payload as { ok: boolean }).ok, true);
  assert.equal(
    (validate.payload as { manifest: { id: string; entrypoints?: { renderer?: string } } })
      .manifest.entrypoints?.renderer,
    'renderer/index.html',
  );
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
  const inspect = await routeJson(platformDir, 'GET', '/api/apps/user.pomodoro/inspect');

  assert.equal(install.statusCode, 201);
  assert.equal((install.payload as { app: { id: string } }).app.id, 'user.pomodoro');
  assert.deepEqual(
    (list.payload as { apps: Array<{ id: string; lobbyEntries: Array<{ routePath: string }> }> })
      .apps.map((app) => [app.id, app.lobbyEntries.map((entry) => entry.routePath)]),
    [['user.pomodoro', ['/apps/user.pomodoro']]],
  );
  assert.equal((detail.payload as { app: { enabled: boolean } }).app.enabled, true);
  const inspectRecord = (inspect.payload as {
    record: { manifest: { id: string }; packagePath: string };
  }).record;
  assert.equal(inspectRecord.manifest.id, 'user.pomodoro');
  assert.equal(inspectRecord.packagePath, packagePath);
});

test('app package enable, disable, and uninstall update launch visibility', async () => {
  const platformDir = await createTempPlatformDir();
  const packagePath = await createPackage(platformDir);

  await routeJson(platformDir, 'POST', '/api/apps/install', { packagePath, enable: true });
  const disabled = await routeJson(platformDir, 'POST', '/api/apps/user.pomodoro/disable');
  const enabled = await routeJson(platformDir, 'POST', '/api/apps/user.pomodoro/enable');
  const uninstalled = await routeJson(platformDir, 'DELETE', '/api/apps/user.pomodoro');
  const list = await routeJson(platformDir, 'GET', '/api/apps');

  assert.equal(disabled.statusCode, 200);
  const disabledApp = (disabled.payload as {
    app: { installState: string; enabled: boolean; lobbyEntries: unknown[] };
  }).app;
  assert.equal(disabledApp.installState, 'disabled');
  assert.equal(disabledApp.enabled, false);
  assert.deepEqual(disabledApp.lobbyEntries, []);
  assert.equal(enabled.statusCode, 200);
  const enabledApp = (enabled.payload as {
    app: { installState: string; enabled: boolean; lobbyEntries: unknown[] };
  }).app;
  assert.equal(enabledApp.installState, 'enabled');
  assert.equal(enabledApp.enabled, true);
  assert.deepEqual(enabledApp.lobbyEntries, [
    {
      id: 'timer',
      title: 'Pomodoro',
      subtitle: 'Focus timer',
      routePath: '/apps/user.pomodoro',
    },
  ]);
  assert.equal(uninstalled.statusCode, 200);
  assert.deepEqual((list.payload as { apps: unknown[] }).apps, []);
});

test('app package scoped API routes are reserved under the app namespace only', async () => {
  const platformDir = await createTempPlatformDir();
  const packagePath = await createPackage(platformDir, createManifest({
    permissions: ['ui.route', 'ui.lobby', 'core.read'],
    contributions: {
      lobbyApps: [
        {
          id: 'timer',
          title: 'Pomodoro',
          routePath: '/apps/user.pomodoro',
        },
      ],
      apiRoutes: [
        {
          routeKey: 'status',
          method: 'GET',
          path: '/status',
          permission: 'core.read',
        },
      ],
    },
  }));

  await routeJson(platformDir, 'POST', '/api/apps/install', { packagePath, enable: true });
  const declared = await routeJson(platformDir, 'GET', '/api/apps/user.pomodoro/scoped/status');
  const undeclared = await routeJson(platformDir, 'GET', '/api/apps/user.pomodoro/scoped/missing');

  assert.equal(declared.statusCode, 501);
  assert.equal(
    (declared.payload as { error: { code: string } }).error.code,
    'cats_app_scoped_route_not_implemented',
  );
  assert.equal(undeclared.statusCode, 404);
  assert.equal(
    (undeclared.payload as { error: { code: string } }).error.code,
    'cats_app_scoped_route_not_found',
  );
});

test('POST /api/apps/install rejects app ids reserved by management routes', async () => {
  const platformDir = await createTempPlatformDir();
  const packagePath = await createPackage(platformDir, createManifest({
    id: 'install',
    contributions: {
      lobbyApps: [
        {
          id: 'bad',
          title: 'Bad',
          routePath: '/apps/install',
        },
      ],
    },
  }));

  const install = await routeJson(platformDir, 'POST', '/api/apps/install', {
    packagePath,
    enable: true,
  });

  assert.equal(install.statusCode, 400);
  assert.ok(
    (install.payload as { issues: Array<{ code: string }> }).issues
      .some((issue) => issue.code === 'reserved_cats_app_id'),
  );
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

test('POST /api/apps/install rejects product modules that shadow platform entity routes', async () => {
  const platformDir = await createTempPlatformDir();
  const packagePath = await createPackage(
    platformDir,
    createProductModuleManifest('system.cats-shadow', 'cats-shadow', '/entities'),
  );

  const install = await routeJson(platformDir, 'POST', '/api/apps/install', {
    packagePath,
    enable: true,
  });
  const list = await routeJson(platformDir, 'GET', '/api/apps');

  assert.equal(install.statusCode, 400);
  assert.ok(
    (install.payload as { issues: Array<{ code: string }> }).issues
      .some((issue) => issue.code === 'cats_app_product_route_collision'),
  );
  assert.deepEqual((list.payload as { apps: unknown[] }).apps, []);
});

test('POST /api/apps/install rejects product modules that shadow installed product modules', async () => {
  const platformDir = await createTempPlatformDir();
  const learnPackagePath = await createPackage(
    platformDir,
    createProductModuleManifest('system.learn', 'learn', '/learn'),
  );
  const otherPackagePath = await createPackage(
    platformDir,
    createProductModuleManifest('system.other-learn', 'other-learn', '/learn'),
  );

  const learnInstall = await routeJson(platformDir, 'POST', '/api/apps/install', {
    packagePath: learnPackagePath,
    enable: false,
  });
  const otherInstall = await routeJson(platformDir, 'POST', '/api/apps/install', {
    packagePath: otherPackagePath,
    enable: true,
  });

  assert.equal(learnInstall.statusCode, 201);
  assert.equal(otherInstall.statusCode, 400);
  assert.ok(
    (otherInstall.payload as { issues: Array<{ code: string }> }).issues
      .some((issue) => issue.code === 'cats_app_product_route_collision'),
  );
});
