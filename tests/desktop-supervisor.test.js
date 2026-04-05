import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import test from 'node:test';

import {
  DESKTOP_USER_DATA_DIR_NAME,
  resolveCatsHomeDir,
  resolveDesktopHostConfig,
  resolveDesktopUserDataDir,
} from '../dist-electron/config.js';
import {
  buildManagedServiceSpecs,
  ManagedServiceSupervisor,
  prepareManagedServiceLog,
} from '../dist-electron/processSupervisor.js';

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

test('desktop host config and managed service specs preserve the app/runtime process split', () => {
  const config = resolveDesktopHostConfig({
    env: {
      CATS_DESKTOP_APP_PORT: '48181',
      CATS_DESKTOP_RUNTIME_PORT: '43110',
      CATS_DESKTOP_STATE_PATH: 'C:/Cats/chat-state.local.json',
      CATS_DESKTOP_RUNTIME_DATA_DIR: 'C:/Cats/runtime/data',
      CATS_DESKTOP_RUNTIME_SESSION_BASE_DIR: 'C:/Cats/runtime/sessions',
      CATS_DESKTOP_RUNTIME_CONFIG_PATH: 'C:/Cats/runtime/config/providers.yaml',
      CATS_DESKTOP_APP_ENTRY: 'C:/repo/cats-platform/dist-server/index.js',
      CATS_DESKTOP_RUNTIME_ENTRY: 'C:/repo/cats-runtime/dist/index.js',
      CATS_DESKTOP_RUNTIME_ROOT: 'C:/repo/cats-runtime',
      CATS_DESKTOP_TRAY_ENABLED: 'true',
      CATS_DESKTOP_KEEP_SERVICES_RUNNING: 'true',
      CATS_DESKTOP_CLOSE_BEHAVIOR: 'minimize_to_tray',
      CATS_DESKTOP_UPDATE_CHANNEL: 'beta',
      CATS_DESKTOP_UPDATE_MANIFEST_URL: 'https://updates.example.com/cats/beta.json',
    },
    userDataDir: 'C:/Users/test/AppData/Roaming/Cats',
    catsHomeDir: 'C:/Users/test/.cats',
  });

  const [runtimeSpec, appSpec] = buildManagedServiceSpecs(config, {});

  assert.equal(runtimeSpec.name, 'cats-runtime');
  assert.deepEqual(runtimeSpec.args.slice(1), [
    '--startup-mode=app-managed',
    '--managed-by=cats-electron',
    '--ready-output=json',
  ]);
  assert.equal(runtimeSpec.env.CATS_RUNTIME_PORT, '43110');
  assert.equal(runtimeSpec.env.CATS_RUNTIME_DIR, 'C:\\Users\\test\\.cats\\runtime');
  assert.equal(runtimeSpec.env.CATS_RUNTIME_CONFIG_PATH, 'C:\\Cats\\runtime\\config\\providers.yaml');
  assert.equal(runtimeSpec.env.CATS_RUNTIME_WSL_DISCOVERY_POLICY, undefined);
  assert.equal(runtimeSpec.env.CATS_RUNTIME_DOCKER_DISCOVERY_POLICY, undefined);
  assert.equal(runtimeSpec.env.CATS_RUNTIME_NATIVE_DISCOVERY_INTERVAL_MS, undefined);
  assert.equal(runtimeSpec.cwd, 'C:\\repo\\cats-runtime');

  assert.equal(appSpec.name, 'cats');
  assert.deepEqual(appSpec.args.slice(1), [
    '--startup-mode=app-managed',
    '--managed-by=cats-electron',
    '--ready-output=json',
  ]);
  assert.equal(appSpec.env.CATS_PORT, '48181');
  assert.equal(appSpec.env.CATS_RUNTIME_BASE_URL, 'http://127.0.0.1:43110');
  assert.equal(appSpec.env.CATS_PLATFORM_DIR, 'C:\\Users\\test\\.cats\\platform');
  assert.equal(appSpec.env.CATS_STATE_PATH, 'C:\\Cats\\chat-state.local.json');
  assert.equal(appSpec.cwd, config.packageRoot);
  assert.equal(config.background.trayEnabled, true);
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
  assert.equal(config.paths.hostStatePath, 'C:\\Users\\test\\.cats\\desktop\\state.json');
  assert.equal(config.paths.hostLogsDir, 'C:\\Users\\test\\.cats\\desktop\\logs');
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
    'C:\\Program Files\\Cats\\resources\\app-sidecar\\dist-server\\index.js',
  );
  assert.equal(
    config.paths.runtimeEntryScript,
    'C:\\Program Files\\Cats\\resources\\cats-runtime\\dist\\index.js',
  );
  assert.equal(
    config.packageRoot,
    'C:\\Program Files\\Cats\\resources\\app-sidecar',
  );
  assert.equal(
    config.paths.preloadScript,
    'C:\\Program Files\\Cats\\resources\\app.asar\\dist-electron\\preload.cjs',
  );
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
  const runtimePathEntries = runtimeSpec.env.PATH.split(':');
  const appPathEntries = appSpec.env.PATH.split(':');

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
  assert.deepEqual(shutdownOrder, ['cats', 'cats-runtime']);
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
  const handle = supervisor.handles.get('cats');

  assert.ok(handle);
  handle.child = child;
  handle.snapshot.status = 'ready';
  handle.snapshot.ready = true;
  handle.snapshot.pid = 4321;

  await supervisor.stopService('cats');

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
          service: 'cats',
          phase: 'ready',
          ready: true,
          host: '127.0.0.1',
          port: 8181,
          healthUrl: 'http://127.0.0.1:8181/health',
        })}\n`,
      );
    }, 10);

    await startPromise;

    const appSnapshot = supervisor.getSnapshots().find((snapshot) => snapshot.name === 'cats');
    assert.ok(appSnapshot);
    assert.equal(appSnapshot.status, 'ready');
    assert.equal(appSnapshot.ready, true);
  } finally {
    await rm(userDataDir, { recursive: true, force: true });
  }
});
