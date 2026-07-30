import assert from 'node:assert/strict';
import test from 'node:test';

import { createDesktopUpdateManager } from '../build/desktop/updateManager.js';
import { withDesktopInstallHandoff } from '../build/desktop/updateInstallHandoff.js';

function createCapability(overrides = {}) {
  return {
    distribution: 'official_packaged',
    provider: 'github_release',
    channel: 'stable',
    currentVersion: '0.1.3',
    canCheck: true,
    canDownload: true,
    canInstall: true,
    unavailableReason: null,
    ...overrides,
  };
}

function createAdapter(options = {}) {
  const calls = [];
  return {
    calls,
    adapter: {
      async checkForUpdates() {
        calls.push('check');
        return { updateAvailable: true, version: '0.1.4', releaseSummary: null };
      },
      async downloadUpdate() {
        calls.push('download');
      },
      async quitAndInstall() {
        calls.push('quitAndInstall');
        if (options.installError) {
          throw options.installError;
        }
      },
    },
  };
}

function createHooks(options = {}) {
  const calls = [];
  return {
    calls,
    hooks: {
      drainManagedServices: async () => {
        calls.push('drain');
        if (options.drainError) {
          throw options.drainError;
        }
      },
      restartManagedServices: async () => {
        calls.push('restart');
        if (options.restartError) {
          throw options.restartError;
        }
      },
      logger: (message) => calls.push(`log:${message.split(';')[0]}`),
    },
  };
}

/** Drives a manager to `downloaded` so install is the legal next action. */
async function driveToDownloaded(adapter) {
  const manager = createDesktopUpdateManager({
    capability: createCapability(),
    adapter,
  });
  await manager.checkForUpdates();
  await manager.downloadUpdate();
  assert.equal(manager.getSnapshot().status, 'downloaded');
  return manager;
}

test('managed services drain before the installer is handed control', async () => {
  const { adapter, calls: adapterCalls } = createAdapter();
  const { hooks, calls: hookCalls } = createHooks();
  const order = [];
  const wrapped = withDesktopInstallHandoff(
    {
      ...adapter,
      quitAndInstall: async () => {
        order.push('quitAndInstall');
        adapterCalls.push('quitAndInstall');
      },
    },
    {
      ...hooks,
      drainManagedServices: async () => {
        order.push('drain');
        hookCalls.push('drain');
      },
    },
  );

  const manager = await driveToDownloaded(wrapped);
  await manager.restartAndInstall();

  // On Windows the upgrade runs the previous uninstaller first, so a sidecar
  // still holding files in the install directory can break the install.
  assert.deepEqual(order, ['drain', 'quitAndInstall']);
});

test('check and download are untouched by the handoff wrapper', async () => {
  const { adapter, calls: adapterCalls } = createAdapter();
  const { hooks, calls: hookCalls } = createHooks();
  const wrapped = withDesktopInstallHandoff(adapter, hooks);

  await driveToDownloaded(wrapped);

  assert.deepEqual(adapterCalls, ['check', 'download']);
  assert.equal(hookCalls.includes('drain'), false);
});

test('a drain failure abandons the install instead of racing the installer', async () => {
  const { adapter, calls: adapterCalls } = createAdapter();
  const { hooks, calls: hookCalls } = createHooks({
    drainError: new Error('service refused to stop'),
  });
  const wrapped = withDesktopInstallHandoff(adapter, hooks);

  const manager = await driveToDownloaded(wrapped);
  const snapshot = await manager.restartAndInstall();

  assert.equal(adapterCalls.includes('quitAndInstall'), false);
  assert.equal(hookCalls.includes('restart'), true);
  // Still installable, so the user can retry rather than being stranded.
  assert.equal(snapshot.status, 'downloaded');
  assert.equal(snapshot.error?.code, 'install_handoff_failed');
  assert.equal(snapshot.nextAction, 'restart_install');
});

test('a failed handoff brings the managed services back', async () => {
  const { adapter } = createAdapter({ installError: new Error('spawn failed') });
  const { hooks, calls: hookCalls } = createHooks();
  const wrapped = withDesktopInstallHandoff(adapter, hooks);

  const manager = await driveToDownloaded(wrapped);
  const snapshot = await manager.restartAndInstall();

  // The process survived, so leaving the sidecars down would be worse than the
  // state the user started in.
  assert.deepEqual(hookCalls.filter((c) => !c.startsWith('log:')), ['drain', 'restart']);
  assert.equal(snapshot.status, 'downloaded');
  assert.equal(snapshot.error?.code, 'install_handoff_failed');
});

test('a restart failure is logged and still leaves a recoverable state', async () => {
  const { adapter } = createAdapter({ installError: new Error('spawn failed') });
  const { hooks, calls: hookCalls } = createHooks({
    restartError: new Error('supervisor is gone'),
  });
  const wrapped = withDesktopInstallHandoff(adapter, hooks);

  const manager = await driveToDownloaded(wrapped);
  const snapshot = await manager.restartAndInstall();

  assert.equal(hookCalls.some((c) => c.startsWith('log:')), true);
  assert.equal(snapshot.status, 'downloaded');
  assert.equal(snapshot.error?.code, 'install_handoff_failed');
});

test('the wrapper never drains for an install the manager refuses', async () => {
  const { adapter } = createAdapter();
  const { hooks, calls: hookCalls } = createHooks();
  const wrapped = withDesktopInstallHandoff(adapter, hooks);

  const manager = createDesktopUpdateManager({
    capability: createCapability(),
    adapter: wrapped,
  });

  // Never checked, so nothing is downloaded and install is not a legal action.
  const snapshot = await manager.restartAndInstall();
  assert.equal(snapshot.status, 'idle');
  assert.deepEqual(hookCalls, []);
});

test('a build that cannot install never reaches the drain', async () => {
  const { adapter } = createAdapter();
  const { hooks, calls: hookCalls } = createHooks();
  const wrapped = withDesktopInstallHandoff(adapter, hooks);

  const manager = createDesktopUpdateManager({
    capability: createCapability({ canInstall: false }),
    adapter: wrapped,
  });
  await manager.checkForUpdates();
  await manager.downloadUpdate();
  await manager.restartAndInstall();

  assert.deepEqual(hookCalls, []);
});
