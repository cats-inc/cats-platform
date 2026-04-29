import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import type { CatsAppManifestV1 } from '../src/shared/catsAppManifest.ts';
import {
  resolveCatsAppDataDir,
  resolveCatsAppPackageInstallDir,
  resolveCatsAppStoragePaths,
  resolveCatsAppStoragePathsFromChatState,
} from '../src/platform/apps/paths.ts';
import {
  readPlatformInstalledAppDescriptors,
  readPlatformProductDescriptors,
  toPlatformInstalledAppDescriptor,
} from '../src/platform/apps/envelope.ts';
import { FileCatsAppRegistry } from '../src/platform/apps/registry.ts';

function createManifest(id = 'user.pomodoro'): CatsAppManifestV1 {
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
          routePath: `/apps/${id}`,
        },
      ],
    },
    permissions: ['ui.route', 'ui.lobby'],
  };
}

function createProductModuleManifest(id = 'system.learn'): CatsAppManifestV1 {
  return {
    ...createManifest(id),
    displayName: 'Cats Learn',
    category: 'product-module',
    trustTier: 'system',
    publisher: {
      name: 'Cats',
    },
    contributions: {
      products: [
        {
          productId: 'learn',
          productName: 'Cats Learn',
          subtitle: 'Courses, flashcards, and study companions',
          routePrefix: '/learn',
          group: 'home',
          installPolicy: 'optional',
          maturity: 'preview',
        },
      ],
    },
    permissions: [],
  };
}

async function createTempPlatformDir(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), 'cats-app-registry-'));
}

test('resolveCatsAppStoragePaths keeps app state outside chat/core state', async () => {
  const platformDir = await createTempPlatformDir();
  const chatStatePath = path.join(platformDir, 'state', 'chat-state.local.json');
  const paths = resolveCatsAppStoragePathsFromChatState(chatStatePath);

  assert.deepEqual(paths, {
    appsDir: path.join(platformDir, 'apps'),
    packagesDir: path.join(platformDir, 'apps', 'packages'),
    dataDir: path.join(platformDir, 'apps', 'data'),
    registryPath: path.join(platformDir, 'apps', 'registry.json'),
  });
  assert.equal(
    resolveCatsAppPackageInstallDir(paths, 'user.pomodoro', '0.1.0'),
    path.join(platformDir, 'apps', 'packages', 'user.pomodoro', '0.1.0'),
  );
  assert.equal(
    resolveCatsAppDataDir(paths, 'user.pomodoro'),
    path.join(platformDir, 'apps', 'data', 'user.pomodoro'),
  );
});

test('FileCatsAppRegistry returns empty state when registry file is missing', async () => {
  const platformDir = await createTempPlatformDir();
  const registry = new FileCatsAppRegistry({
    registryPath: resolveCatsAppStoragePaths(platformDir).registryPath,
  });

  assert.deepEqual(await registry.listInstalledApps(), []);
});

test('FileCatsAppRegistry installs, updates, and soft-uninstalls apps', async () => {
  const platformDir = await createTempPlatformDir();
  const registryPath = resolveCatsAppStoragePaths(platformDir).registryPath;
  let tick = 0;
  const registry = new FileCatsAppRegistry({
    registryPath,
    now: () => new Date(Date.UTC(2026, 3, 29, 0, 0, tick++)),
  });

  const installed = await registry.installApp({
    manifest: createManifest(),
    packagePath: path.join(platformDir, 'apps', 'packages', 'user.pomodoro', '0.1.0'),
  });

  assert.equal(installed.id, 'user.pomodoro');
  assert.equal(installed.installState, 'installed');
  assert.equal(installed.enabled, false);

  const enabled = await registry.updateAppState('user.pomodoro', {
    installState: 'enabled',
  });
  assert.equal(enabled.installState, 'enabled');
  assert.equal(enabled.enabled, true);

  const disabled = await registry.updateAppState('user.pomodoro', {
    installState: 'disabled',
    lastError: 'Disabled by test',
  });
  assert.equal(disabled.installState, 'disabled');
  assert.equal(disabled.enabled, false);
  assert.equal(disabled.lastError, 'Disabled by test');

  const uninstalled = await registry.uninstallApp('user.pomodoro');
  assert.equal(uninstalled?.installState, 'uninstalled');
  assert.equal(uninstalled?.enabled, false);
  assert.deepEqual(await registry.listInstalledApps(), []);

  const raw = JSON.parse(await readFile(registryPath, 'utf8')) as {
    apps: Array<{ id: string; installState: string }>;
  };
  assert.deepEqual(raw.apps.map((entry) => [entry.id, entry.installState]), [
    ['user.pomodoro', 'uninstalled'],
  ]);
});

test('FileCatsAppRegistry purges app records when requested', async () => {
  const platformDir = await createTempPlatformDir();
  const registry = new FileCatsAppRegistry({
    registryPath: resolveCatsAppStoragePaths(platformDir).registryPath,
  });

  await registry.installApp({
    manifest: createManifest(),
    packagePath: path.join(platformDir, 'apps', 'packages', 'user.pomodoro', '0.1.0'),
  });
  const purged = await registry.uninstallApp('user.pomodoro', { purge: true });

  assert.equal(purged?.installState, 'uninstalled');
  assert.deepEqual(await registry.readState(), {
    schemaVersion: 1,
    apps: [],
  });
});

test('toPlatformInstalledAppDescriptor exposes active Lobby entries only for enabled apps', async () => {
  const platformDir = await createTempPlatformDir();
  const registry = new FileCatsAppRegistry({
    registryPath: resolveCatsAppStoragePaths(platformDir).registryPath,
  });
  const enabled = await registry.installApp({
    manifest: createManifest(),
    packagePath: path.join(platformDir, 'apps', 'packages', 'user.pomodoro', '0.1.0'),
    installState: 'enabled',
  });
  const disabled = await registry.installApp({
    manifest: createManifest('user.pomodoro-disabled'),
    packagePath: path.join(platformDir, 'apps', 'packages', 'user.pomodoro-disabled', '0.1.0'),
    installState: 'disabled',
  });

  assert.equal(toPlatformInstalledAppDescriptor(enabled).lobbyEntries.length, 1);
  assert.deepEqual(toPlatformInstalledAppDescriptor(disabled).lobbyEntries, []);
});

test('readPlatformInstalledAppDescriptors reads the registry from the platform host state path', async () => {
  const platformDir = await createTempPlatformDir();
  const chatStatePath = path.join(platformDir, 'state', 'chat-state.local.json');
  const paths = resolveCatsAppStoragePathsFromChatState(chatStatePath);
  const registry = new FileCatsAppRegistry({
    registryPath: paths.registryPath,
  });

  await registry.installApp({
    manifest: createManifest('user.zebra'),
    packagePath: resolveCatsAppPackageInstallDir(paths, 'user.zebra', '0.1.0'),
    installState: 'enabled',
  });
  await registry.installApp({
    manifest: {
      ...createManifest('connector.calendar'),
      displayName: 'Calendar Connector',
      category: 'capability-connector',
      contributions: {
        connectors: [
          {
            id: 'calendar',
            service: 'calendar',
            capabilities: ['calendar.read'],
          },
        ],
        tools: [
          {
            name: 'connector.calendar.search',
            title: 'Search calendar',
            description: 'Search calendar events.',
            inputSchema: {},
            runtimeBridge: 'cats-runtime',
          },
        ],
      },
      permissions: ['agent.tools.register'],
    },
    packagePath: resolveCatsAppPackageInstallDir(paths, 'connector.calendar', '0.1.0'),
    installState: 'enabled',
  });

  const descriptors = await readPlatformInstalledAppDescriptors(chatStatePath);

  assert.deepEqual(
    descriptors.map((descriptor) => ({
      id: descriptor.id,
      displayName: descriptor.displayName,
      lobbyEntries: descriptor.lobbyEntries.map((entry) => entry.routePath),
      connectors: descriptor.connectors.map((connector) => connector.service),
      toolCount: descriptor.tools.length,
    })),
    [
      {
        id: 'connector.calendar',
        displayName: 'Calendar Connector',
        lobbyEntries: [],
        connectors: ['calendar'],
        toolCount: 1,
      },
      {
        id: 'user.zebra',
        displayName: 'Pomodoro',
        lobbyEntries: ['/apps/user.zebra'],
        connectors: [],
        toolCount: 0,
      },
    ],
  );
});

test('readPlatformProductDescriptors merges enabled system product modules only', async () => {
  const platformDir = await createTempPlatformDir();
  const chatStatePath = path.join(platformDir, 'state', 'chat-state.local.json');
  const paths = resolveCatsAppStoragePathsFromChatState(chatStatePath);
  const registry = new FileCatsAppRegistry({
    registryPath: paths.registryPath,
  });

  await registry.installApp({
    manifest: createProductModuleManifest(),
    packagePath: resolveCatsAppPackageInstallDir(paths, 'system.learn', '0.1.0'),
    installState: 'enabled',
  });
  await registry.installApp({
    manifest: {
      ...createProductModuleManifest('system.disabled-learn'),
      contributions: {
        products: [
          {
            productId: 'disabled-learn',
            productName: 'Disabled Learn',
            subtitle: 'Hidden while disabled',
            routePrefix: '/disabled-learn',
            group: 'home',
            installPolicy: 'optional',
            maturity: 'preview',
          },
        ],
      },
    },
    packagePath: resolveCatsAppPackageInstallDir(paths, 'system.disabled-learn', '0.1.0'),
    installState: 'disabled',
  });
  await registry.installApp({
    manifest: {
      ...createProductModuleManifest('user.fake-learn'),
      category: 'user-app',
      trustTier: 'local-user',
      contributions: {
        products: [
          {
            productId: 'fake-learn',
            productName: 'Fake Learn',
            subtitle: 'Should never reach Products',
            routePrefix: '/fake-learn',
            group: 'home',
            installPolicy: 'optional',
            maturity: 'preview',
          },
        ],
      },
    },
    packagePath: resolveCatsAppPackageInstallDir(paths, 'user.fake-learn', '0.1.0'),
    installState: 'enabled',
  });

  const products = await readPlatformProductDescriptors(chatStatePath);

  assert.equal(products.some((product) => product.id === 'chat'), true);
  assert.deepEqual(
    products
      .filter((product) => ['learn', 'disabled-learn', 'fake-learn'].includes(product.id))
      .map((product) => ({
        id: product.id,
        surface: product.surface,
        productName: product.productName,
        routePrefix: product.routePrefix,
        installState: product.installState,
      })),
    [
      {
        id: 'learn',
        surface: null,
        productName: 'Cats Learn',
        routePrefix: '/learn',
        installState: 'installed',
      },
    ],
  );
});
