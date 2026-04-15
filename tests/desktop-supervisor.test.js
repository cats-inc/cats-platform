import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, posix } from 'node:path';
import { PassThrough } from 'node:stream';
import test from 'node:test';

import {
  DESKTOP_USER_DATA_DIR_NAME,
  resolveCatsHomeDir,
  resolveDesktopHostConfig,
  resolveDesktopUserDataDir,
} from '../build/desktop/config.js';
import {
  buildManagedServiceSpecs,
  ManagedServiceSupervisor,
  prepareManagedServiceLog,
  seedBundledRuntimeConfigTemplates,
  shouldRefreshManagedSeedTemplate,
} from '../build/desktop/processSupervisor.js';

class FakeChildProcess extends EventEmitter {
  constructor() {
    super();
    this.exitCode = null;
    this.signalCode = null;
    this.killCalls = [];
    this.stdinEnded = false;
    this.stdout = new PassThrough();
    this.stderr = new PassThrough();
    this.stdin = {
      destroyed: false,
      end: () => {
        this.stdinEnded = true;
      },
    };
  }

  kill(signal) {
    this.killCalls.push(signal);
    if (signal === 'SIGTERM') {
      setTimeout(() => {
        this.exitCode = 0;
        this.emit('exit', 0, null);
      }, 5);
    }
    return true;
  }
}

function splitManagedPathEntries(pathValue, platform) {
  const delimiter = platform === 'win32' ? ';' : ':';
  const segments = pathValue.split(delimiter);
  if (platform === 'win32') {
    return segments;
  }

  const entries = [];
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    const next = segments[index + 1];
    if (
      /^[A-Za-z]$/u.test(segment)
      && typeof next === 'string'
      && /^[\\/]/u.test(next)
    ) {
      entries.push(`${segment}:${next}`);
      index += 1;
      continue;
    }
    entries.push(segment);
  }
  return entries;
}

function normalizeUnixPath(value) {
  return value.replace(/\\/gu, '/');
}

test('desktop host config and managed service specs preserve the app/runtime process split', () => {
  const config = resolveDesktopHostConfig({
    env: {
      CATS_DESKTOP_APP_PORT: '48181',
      CATS_DESKTOP_RUNTIME_PORT: '43110',
      CATS_DESKTOP_APP_ENTRY: 'C:/repo/cats-platform/build/server/index.js',
      CATS_DESKTOP_RUNTIME_ENTRY: 'C:/repo/cats-runtime/build/runtime/index.js',
      CATS_DESKTOP_RUNTIME_ROOT: 'C:/repo/cats-runtime',
      CATS_DESKTOP_UPDATE_CHANNEL: 'beta',
      CATS_DESKTOP_UPDATE_MANIFEST_URL: 'https://updates.example.com/cats/beta.json',
    },
    userDataDir: 'C:/Users/test/AppData/Roaming/Cats',
    catsHomeDir: 'C:/Users/test/.cats',
  });

  const [runtimeSpec, appSpec] = buildManagedServiceSpecs(config, {}, 'win32');

  assert.equal(runtimeSpec.name, 'cats-runtime');
  assert.deepEqual(runtimeSpec.args.slice(1), [
    '--startup-mode=app-managed',
    '--managed-by=cats-electron',
    '--ready-output=json',
  ]);
  assert.equal(runtimeSpec.env.CATS_RUNTIME_PORT, '43110');
  assert.equal(runtimeSpec.env.CATS_RUNTIME_DIR, 'C:\\Users\\test\\.cats\\runtime');
  assert.equal(runtimeSpec.env.CATS_RUNTIME_WSL_DISCOVERY_POLICY, undefined);
  assert.equal(runtimeSpec.env.CATS_RUNTIME_DOCKER_DISCOVERY_POLICY, undefined);
  assert.equal(runtimeSpec.env.CATS_RUNTIME_NATIVE_DISCOVERY_INTERVAL_MS, undefined);
  assert.equal(runtimeSpec.cwd, 'C:\\repo\\cats-runtime');

  assert.equal(appSpec.name, 'cats-platform');
  assert.deepEqual(appSpec.args.slice(1), [
    '--startup-mode=app-managed',
    '--managed-by=cats-electron',
    '--ready-output=json',
  ]);
  assert.equal(appSpec.env.CATS_PORT, '48181');
  assert.equal(appSpec.env.CATS_RUNTIME_BASE_URL, 'http://127.0.0.1:43110');
  assert.equal(appSpec.env.CATS_PLATFORM_DIR, 'C:\\Users\\test\\.cats\\platform');
  assert.equal(appSpec.env.CATS_DESKTOP_DIR, 'C:\\Users\\test\\.cats\\desktop');
  assert.equal(appSpec.env.CATS_RUNTIME_DIR, 'C:\\Users\\test\\.cats\\runtime');
  assert.equal(appSpec.cwd, config.packageRoot);
  assert.equal(config.background.trayEnabled, true);
  assert.equal(config.background.keepServicesRunning, true);
  assert.equal(config.background.closeBehavior, 'minimize_to_tray');
  assert.equal(config.update.channel, 'beta');
  assert.equal(config.update.manifestUrl, 'https://updates.example.com/cats/beta.json');
  assert.equal(
    config.paths.hostStatePath,
    'C:\\Users\\test\\.cats\\desktop\\state.json',
  );
});

test('desktop host resolves the packaged userData directory to Cats', () => {
  assert.equal(DESKTOP_USER_DATA_DIR_NAME, 'Cats');
  assert.equal(
    resolveDesktopUserDataDir('C:/Users/test/AppData/Roaming'),
    'C:\\Users\\test\\AppData\\Roaming\\Cats',
  );
});

test('resolveCatsHomeDir returns ~/.cats', () => {
  const home = resolveCatsHomeDir();
  assert.ok(home.endsWith('.cats'), `expected ${home} to end with .cats`);
});

test('desktop host config keeps Electron userData separate from cats home', () => {
  const config = resolveDesktopHostConfig({
    env: {},
    userDataDir: 'C:/Users/test/AppData/Roaming/Cats',
    catsHomeDir: 'C:/Users/test/.cats',
  });

  assert.equal(config.userDataDir, 'C:\\Users\\test\\AppData\\Roaming\\Cats');
  assert.equal(config.catsHomeDir, 'C:\\Users\\test\\.cats');
  assert.equal(config.paths.appStatePath, 'C:\\Users\\test\\.cats\\platform\\state\\chat-state.local.json');
  assert.equal(config.paths.runtimeDataDir, 'C:\\Users\\test\\.cats\\runtime\\data');
  assert.equal(config.paths.runtimeSessionBaseDir, 'C:\\Users\\test\\.cats\\runtime\\sessions');
  assert.equal(config.paths.runtimeConfigPath, 'C:\\Users\\test\\.cats\\runtime\\config\\providers.yaml');
  assert.equal(config.paths.runtimeManagementConfigPath, 'C:\\Users\\test\\.cats\\runtime\\config\\management.yaml');
  assert.equal(config.paths.runtimeCuratedModelCatalogPath, 'C:\\Users\\test\\.cats\\runtime\\config\\curated-model-catalogs.yaml');
  assert.equal(config.paths.hostStatePath, 'C:\\Users\\test\\.cats\\desktop\\state.json');
  assert.equal(config.paths.hostLogsDir, 'C:\\Users\\test\\.cats\\desktop\\logs');
});

test('desktop host config supports force quit-on-close deployment override', () => {
  const config = resolveDesktopHostConfig({
    env: {
      CATS_DESKTOP_FORCE_QUIT_ON_CLOSE: 'true',
    },
    userDataDir: 'C:/Users/test/AppData/Roaming/Cats',
    catsHomeDir: 'C:/Users/test/.cats',
  });

  assert.equal(config.background.trayEnabled, false);
  assert.equal(config.background.keepServicesRunning, false);
  assert.equal(config.background.closeBehavior, 'quit');
});

test('desktop host config resolves bundled sidecar paths in packaged mode', () => {
  const config = resolveDesktopHostConfig({
    env: {},
    userDataDir: 'C:/Users/test/AppData/Roaming/Cats',
    packaged: true,
    resourcesPath: 'C:/Program Files/Cats/resources',
    catsHomeDir: 'C:/Users/test/.cats',
  });

  assert.equal(
    config.paths.appEntryScript,
    'C:\\Program Files\\Cats\\resources\\app-sidecar\\build\\server\\index.js',
  );
  assert.equal(
    config.paths.runtimeEntryScript,
    'C:\\Program Files\\Cats\\resources\\cats-runtime\\build\\runtime\\index.js',
  );
  assert.equal(
    config.packageRoot,
    'C:\\Program Files\\Cats\\resources\\app-sidecar',
  );
  assert.equal(
    config.paths.preloadScript,
    'C:\\Program Files\\Cats\\resources\\app.asar\\build\\desktop\\preload.cjs',
  );
  assert.equal(config.packaged, true);
});

test('packaged desktop host seeds bundled runtime config templates into cats home without overwriting user files', async () => {
  const resourcesRoot = await mkdtemp(join(tmpdir(), 'cats-desktop-packaged-resources-'));
  const userDataDir = await mkdtemp(join(tmpdir(), 'cats-desktop-packaged-userdata-'));
  const catsHomeDir = join(userDataDir, 'cats-home');
  const managementExample = join(resourcesRoot, 'cats-runtime', 'config', 'management.yaml.example');
  const curatedExample = join(resourcesRoot, 'cats-runtime', 'config', 'curated-model-catalogs.yaml.example');

  try {
    await mkdir(join(resourcesRoot, 'cats-runtime', 'config'), { recursive: true });
    await writeFile(managementExample, 'version: 1\nadapters: {}\n', 'utf8');
    await writeFile(curatedExample, 'schema_version: 1\ncatalogs: []\n', 'utf8');

    const config = resolveDesktopHostConfig({
      env: {},
      userDataDir,
      catsHomeDir,
      packaged: true,
      resourcesPath: resourcesRoot,
    });
    await mkdir(dirname(config.paths.runtimeManagementConfigPath), { recursive: true });
    await writeFile(config.paths.runtimeManagementConfigPath, 'version: 1\nadapters:\n  review:\n    default: github\n    instances: {}\n', 'utf8');

    await seedBundledRuntimeConfigTemplates(config);

    assert.equal(
      await readFile(config.paths.runtimeManagementConfigPath, 'utf8'),
      'version: 1\nadapters:\n  review:\n    default: github\n    instances: {}\n',
    );
    assert.equal(
      await readFile(config.paths.runtimeCuratedModelCatalogPath, 'utf8'),
      'schema_version: 1\ncatalogs: []\n',
    );
  } finally {
    await rm(resourcesRoot, { recursive: true, force: true });
    await rm(userDataDir, { recursive: true, force: true });
  }
});

test('shouldRefreshManagedSeedTemplate only refreshes managed curated copies', () => {
  assert.equal(
    shouldRefreshManagedSeedTemplate({
      allowManagedRefresh: true,
      currentHash: 'legacy-hash',
      sourceHash: 'current-hash',
      recordedSourceHash: null,
      legacyManagedSourceHashes: ['legacy-hash'],
    }),
    true,
  );
  assert.equal(
    shouldRefreshManagedSeedTemplate({
      allowManagedRefresh: true,
      currentHash: 'seeded-hash',
      sourceHash: 'current-hash',
      recordedSourceHash: 'seeded-hash',
    }),
    true,
  );
  assert.equal(
    shouldRefreshManagedSeedTemplate({
      allowManagedRefresh: false,
      currentHash: 'legacy-hash',
      sourceHash: 'current-hash',
      recordedSourceHash: 'legacy-hash',
      legacyManagedSourceHashes: ['legacy-hash'],
    }),
    false,
  );
  assert.equal(
    shouldRefreshManagedSeedTemplate({
      allowManagedRefresh: true,
      currentHash: 'user-edited-hash',
      sourceHash: 'current-hash',
      recordedSourceHash: null,
      legacyManagedSourceHashes: ['legacy-hash'],
    }),
    false,
  );
});

test('packaged desktop host refreshes unchanged curated template copies that were previously auto-seeded', async () => {
  const resourcesRoot = await mkdtemp(join(tmpdir(), 'cats-desktop-packaged-refresh-resources-'));
  const userDataDir = await mkdtemp(join(tmpdir(), 'cats-desktop-packaged-refresh-userdata-'));
  const catsHomeDir = join(userDataDir, 'cats-home');
  const managementExample = join(resourcesRoot, 'cats-runtime', 'config', 'management.yaml.example');
  const curatedExample = join(resourcesRoot, 'cats-runtime', 'config', 'curated-model-catalogs.yaml.example');

  try {
    await mkdir(join(resourcesRoot, 'cats-runtime', 'config'), { recursive: true });
    await writeFile(managementExample, 'version: 1\nadapters: {}\n', 'utf8');
    await writeFile(curatedExample, 'schema_version: 1\ncatalogs: []\n', 'utf8');

    const config = resolveDesktopHostConfig({
      env: {},
      userDataDir,
      catsHomeDir,
      packaged: true,
      resourcesPath: resourcesRoot,
    });

    await seedBundledRuntimeConfigTemplates(config);
    assert.equal(
      await readFile(config.paths.runtimeCuratedModelCatalogPath, 'utf8'),
      'schema_version: 1\ncatalogs: []\n',
    );

    await writeFile(
      curatedExample,
      'schema_version: 1\ncatalogs:\n  - cli: Claude\n',
      'utf8',
    );

    await seedBundledRuntimeConfigTemplates(config);

    assert.equal(
      await readFile(config.paths.runtimeCuratedModelCatalogPath, 'utf8'),
      'schema_version: 1\ncatalogs:\n  - cli: Claude\n',
    );
  } finally {
    await rm(resourcesRoot, { recursive: true, force: true });
    await rm(userDataDir, { recursive: true, force: true });
  }
});

test('packaged desktop host preserves curated copies once the user edits them after seeding', async () => {
  const resourcesRoot = await mkdtemp(join(tmpdir(), 'cats-desktop-packaged-user-edits-resources-'));
  const userDataDir = await mkdtemp(join(tmpdir(), 'cats-desktop-packaged-user-edits-userdata-'));
  const catsHomeDir = join(userDataDir, 'cats-home');
  const managementExample = join(resourcesRoot, 'cats-runtime', 'config', 'management.yaml.example');
  const curatedExample = join(resourcesRoot, 'cats-runtime', 'config', 'curated-model-catalogs.yaml.example');

  try {
    await mkdir(join(resourcesRoot, 'cats-runtime', 'config'), { recursive: true });
    await writeFile(managementExample, 'version: 1\nadapters: {}\n', 'utf8');
    await writeFile(curatedExample, 'schema_version: 1\ncatalogs: []\n', 'utf8');

    const config = resolveDesktopHostConfig({
      env: {},
      userDataDir,
      catsHomeDir,
      packaged: true,
      resourcesPath: resourcesRoot,
    });

    await seedBundledRuntimeConfigTemplates(config);
    await writeFile(
      config.paths.runtimeCuratedModelCatalogPath,
      'schema_version: 1\ncatalogs:\n  - cli: User Override\n',
      'utf8',
    );
    await writeFile(
      curatedExample,
      'schema_version: 1\ncatalogs:\n  - cli: Bundled Update\n',
      'utf8',
    );

    await seedBundledRuntimeConfigTemplates(config);

    assert.equal(
      await readFile(config.paths.runtimeCuratedModelCatalogPath, 'utf8'),
      'schema_version: 1\ncatalogs:\n  - cli: User Override\n',
    );
  } finally {
    await rm(resourcesRoot, { recursive: true, force: true });
    await rm(userDataDir, { recursive: true, force: true });
  }
});

test('managed desktop services augment PATH for macOS packaged CLI discovery', () => {
  const env = {
    HOME: '/Users/tester',
    PATH: '/usr/bin:/bin:/usr/sbin:/sbin',
  };
  const config = resolveDesktopHostConfig({
    env,
    userDataDir: '/Users/tester/Library/Application Support/Cats',
    catsHomeDir: '/Users/tester/.cats',
  });

  const [runtimeSpec, appSpec] = buildManagedServiceSpecs(config, env, 'darwin');
  const runtimePathEntries = splitManagedPathEntries(runtimeSpec.env.PATH, 'darwin');
  const appPathEntries = splitManagedPathEntries(appSpec.env.PATH, 'darwin');

  assert.deepEqual(
    runtimePathEntries.slice(0, 4),
    ['/usr/bin', '/bin', '/usr/sbin', '/sbin'],
  );
  assert.ok(runtimePathEntries.includes('/opt/homebrew/bin'));
  assert.ok(runtimePathEntries.includes('/opt/homebrew/sbin'));
  assert.ok(runtimePathEntries.includes('/usr/local/bin'));
  assert.ok(runtimePathEntries.includes('/usr/local/sbin'));
  assert.ok(runtimePathEntries.includes('/Users/tester/.local/bin'));
  assert.ok(runtimePathEntries.includes('/Users/tester/.npm-global/bin'));
  assert.ok(runtimePathEntries.includes('/Users/tester/bin'));
  assert.ok(runtimePathEntries.includes('/bin'));
  assert.ok(runtimePathEntries.includes('/usr/sbin'));
  assert.ok(runtimePathEntries.includes('/sbin'));
  assert.deepEqual(appPathEntries, runtimePathEntries);
});

test('managed desktop services resolve the default nvm bin for macOS packaged CLI discovery', async () => {
  const homeDir = await mkdtemp(join(tmpdir(), 'cats-desktop-nvm-home-'));
  const nvmDir = join(homeDir, '.nvm');
  const expectedNvmBin = posix.join(
    normalizeUnixPath(nvmDir),
    'versions',
    'node',
    'v24.14.1',
    'bin',
  );

  try {
    await mkdir(join(nvmDir, 'alias'), { recursive: true });
    await mkdir(expectedNvmBin, { recursive: true });
    await writeFile(join(nvmDir, 'alias', 'default'), 'node\n', 'utf8');
    await writeFile(join(nvmDir, 'alias', 'node'), 'v24.14.1\n', 'utf8');

    const env = {
      HOME: homeDir,
      PATH: '/usr/bin:/bin:/usr/sbin:/sbin',
    };
    const config = resolveDesktopHostConfig({
      env,
      userDataDir: join(homeDir, 'Library', 'Application Support', 'Cats'),
      catsHomeDir: join(homeDir, '.cats'),
    });

    const [runtimeSpec, appSpec] = buildManagedServiceSpecs(config, env, 'darwin');
    const runtimePathEntries = splitManagedPathEntries(runtimeSpec.env.PATH, 'darwin');
    const appPathEntries = splitManagedPathEntries(appSpec.env.PATH, 'darwin');

    assert.ok(runtimePathEntries.includes(expectedNvmBin));
    assert.deepEqual(appPathEntries, runtimePathEntries);
  } finally {
    await rm(homeDir, { recursive: true, force: true });
  }
});

test('desktop host config rejects invalid host overrides', () => {
  assert.throws(() => resolveDesktopHostConfig({
    env: {
      CATS_DESKTOP_APP_HOST: '127.0.0.1/bad-path',
    },
    userDataDir: 'C:/Users/test/AppData/Roaming/Cats',
    catsHomeDir: 'C:/Users/test/.cats',
  }), /Invalid desktop host value/);
});

test('stopAll preserves the app-before-runtime shutdown order', async () => {
  const config = resolveDesktopHostConfig({
    env: {},
    userDataDir: 'C:/Users/test/AppData/Roaming/Cats',
    catsHomeDir: 'C:/Users/test/.cats',
  });
  const supervisor = new ManagedServiceSupervisor(config);
  const shutdownOrder = [];

  supervisor.stopService = async (name) => {
    shutdownOrder.push(name);
  };

  await supervisor.stopAll();
  assert.deepEqual(shutdownOrder, ['cats-platform', 'cats-runtime']);
});

test('stopService gives SIGTERM its own grace window before SIGKILL', async () => {
  const config = resolveDesktopHostConfig({
    env: {
      CATS_DESKTOP_GRACEFUL_SHUTDOWN_MS: '20',
    },
    userDataDir: 'C:/Users/test/AppData/Roaming/Cats',
    catsHomeDir: 'C:/Users/test/.cats',
  });
  const supervisor = new ManagedServiceSupervisor(config);
  const child = new FakeChildProcess();
  const handle = supervisor.handles.get('cats-platform');

  assert.ok(handle);
  handle.child = child;
  handle.snapshot.status = 'ready';
  handle.snapshot.ready = true;
  handle.snapshot.pid = 4321;

  await supervisor.stopService('cats-platform');

  assert.equal(child.stdinEnded, true);
  assert.deepEqual(child.killCalls, ['SIGTERM']);
});

test('prepareManagedServiceLog rotates the previous attempt log into a bounded backup', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'cats-managed-log-'));
  const logPath = join(tempDir, 'cats-runtime.log');
  const previousPath = `${logPath}.previous`;

  try {
    await writeFile(previousPath, 'older log\n', 'utf8');
    await writeFile(logPath, 'current log\n', 'utf8');

    await prepareManagedServiceLog(logPath);

    assert.equal(await readFile(logPath, 'utf8'), '');
    assert.equal(await readFile(previousPath, 'utf8'), 'current log\n');
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('startService hides Windows child consoles for managed services', async () => {
  const userDataDir = await mkdtemp(join(tmpdir(), 'cats-desktop-supervisor-'));
  const config = resolveDesktopHostConfig({
    env: {},
    userDataDir,
    catsHomeDir: join(userDataDir, '..', 'cats-home'),
  });
  const spawnCalls = [];
  const supervisor = new ManagedServiceSupervisor(config, {
    spawn: (command, args, options) => {
      spawnCalls.push({ command, args, options });
      return new FakeChildProcess();
    },
    waitForServiceReadiness: async () => ({ ok: true }),
  });
  const [runtimeSpec] = buildManagedServiceSpecs(config);

  try {
    await supervisor.startService(runtimeSpec);

    assert.equal(spawnCalls.length, 1);
    assert.equal(spawnCalls[0].options.windowsHide, true);
  } finally {
    await rm(userDataDir, { recursive: true, force: true });
  }
});

test('startService accepts app-managed ready lifecycle events before health polling succeeds', async () => {
  const userDataDir = await mkdtemp(join(tmpdir(), 'cats-desktop-supervisor-ready-'));
  const config = resolveDesktopHostConfig({
    env: {
      CATS_DESKTOP_READINESS_TIMEOUT_MS: '5',
    },
    userDataDir,
    catsHomeDir: join(userDataDir, '..', 'cats-home'),
  });
  const child = new FakeChildProcess();
  const supervisor = new ManagedServiceSupervisor(config, {
    spawn: () => child,
    waitForServiceReadiness: async () => {
      await new Promise((resolve) => setTimeout(resolve, 1));
      throw new Error('fetch failed');
    },
  });
  const [, appSpec] = buildManagedServiceSpecs(config);

  try {
    const startPromise = supervisor.startService(appSpec);
    setTimeout(() => {
      child.stdout.write(
        `${JSON.stringify({
          event: 'app.ready',
          service: 'cats-platform',
          phase: 'ready',
          ready: true,
          host: '127.0.0.1',
          port: 8181,
          healthUrl: 'http://127.0.0.1:8181/health',
        })}\n`,
      );
    }, 10);

    await startPromise;

    const appSnapshot = supervisor.getSnapshots().find((snapshot) => snapshot.name === 'cats-platform');
    assert.ok(appSnapshot);
    assert.equal(appSnapshot.status, 'ready');
    assert.equal(appSnapshot.ready, true);
  } finally {
    await rm(userDataDir, { recursive: true, force: true });
  }
});

test('Windows runtime startup tolerates slower late-ready lifecycle events', async () => {
  const userDataDir = await mkdtemp(join(tmpdir(), 'cats-desktop-supervisor-runtime-ready-'));
  const config = resolveDesktopHostConfig({
    env: {
      CATS_DESKTOP_READINESS_TIMEOUT_MS: '5',
    },
    userDataDir,
    catsHomeDir: join(userDataDir, '..', 'cats-home'),
  });
  const child = new FakeChildProcess();
  const supervisor = new ManagedServiceSupervisor(config, {
    platform: 'win32',
    spawn: () => child,
    waitForServiceReadiness: async () => {
      await new Promise((resolve) => setTimeout(resolve, 1));
      throw new Error('fetch failed');
    },
  });
  const [runtimeSpec] = buildManagedServiceSpecs(config, process.env, 'win32');

  try {
    const startPromise = supervisor.startService(runtimeSpec);
    setTimeout(() => {
      child.stdout.write(
        `${JSON.stringify({
          event: 'runtime.ready',
          service: 'cats-runtime',
          phase: 'ready',
          ready: true,
          host: '127.0.0.1',
          port: 3110,
          healthUrl: 'http://127.0.0.1:3110/health',
        })}\n`,
      );
    }, 10);

    await startPromise;

    const runtimeSnapshot = supervisor.getSnapshots().find((snapshot) => snapshot.name === 'cats-runtime');
    assert.ok(runtimeSnapshot);
    assert.equal(runtimeSnapshot.status, 'ready');
    assert.equal(runtimeSnapshot.ready, true);
  } finally {
    await rm(userDataDir, { recursive: true, force: true });
  }
});
