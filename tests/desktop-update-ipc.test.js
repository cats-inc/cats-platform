import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
  DESKTOP_UPDATE_IPC_CHANNELS,
  createDesktopUpdateIpcHandlers,
  createDesktopUpdateSnapshotBroadcast,
  isDesktopUpdateIpcSenderTrusted,
} from '../build/desktop/updateIpc.js';
import {
  createDesktopUpdateCapability,
  createDesktopUpdateManager,
} from '../build/desktop/updateManager.js';

const OFFICIAL_IDENTITY = {
  distribution: 'official_packaged',
  provider: 'github_release',
  channel: 'stable',
  currentVersion: '0.2.0',
  repository: 'cats-inc/cats-platform',
  commit: 'd'.repeat(40),
  unavailableReason: null,
};

function createManager() {
  return createDesktopUpdateManager({
    capability: createDesktopUpdateCapability({
      identity: OFFICIAL_IDENTITY,
      nodePlatform: 'win32',
      releaseReadyPlatforms: ['windows'],
    }),
    adapter: {
      async checkForUpdates() {
        return { updateAvailable: true, version: '0.3.0', releaseSummary: 'Notes' };
      },
      async downloadUpdate() {},
      async quitAndInstall() {},
    },
  });
}

function createHarness() {
  const mainWindowWebContents = { id: 'main', sent: [], send(channel, payload) {
    this.sent.push([channel, payload]);
  } };
  const logs = [];
  const manager = createManager();
  const handlers = createDesktopUpdateIpcHandlers({
    manager,
    resolveMainWindowWebContents: () => mainWindowWebContents,
    logger: (message) => logs.push(message),
  });

  return { manager, handlers, mainWindowWebContents, logs };
}

test('update ipc channels are namespaced and distinct', () => {
  const values = Object.values(DESKTOP_UPDATE_IPC_CHANNELS);

  assert.equal(new Set(values).size, values.length);
  for (const channel of values) {
    assert.match(channel, /^cats-host:update-/u);
  }
});

test('a trusted sender is only the current main window web contents', () => {
  const mainWindow = { id: 'main' };

  assert.equal(isDesktopUpdateIpcSenderTrusted({ sender: mainWindow }, mainWindow), true);
  assert.equal(isDesktopUpdateIpcSenderTrusted({ sender: { id: 'other' } }, mainWindow), false);
  assert.equal(isDesktopUpdateIpcSenderTrusted({ sender: mainWindow }, null), false);
  assert.equal(isDesktopUpdateIpcSenderTrusted({ sender: mainWindow }, undefined), false);
  assert.equal(isDesktopUpdateIpcSenderTrusted({ sender: undefined }, undefined), false);
});

test('every update handler serves the main window', async () => {
  const { handlers, mainWindowWebContents } = createHarness();
  const event = { sender: mainWindowWebContents };

  const snapshot = await handlers[DESKTOP_UPDATE_IPC_CHANNELS.snapshot](event);
  assert.equal(snapshot.status, 'idle');

  const checked = await handlers[DESKTOP_UPDATE_IPC_CHANNELS.check](event);
  assert.equal(checked.status, 'update_available');

  const downloaded = await handlers[DESKTOP_UPDATE_IPC_CHANNELS.download](event);
  assert.equal(downloaded.status, 'downloaded');

  assert.equal(await handlers[DESKTOP_UPDATE_IPC_CHANNELS.install](event), undefined);
});

test('every update handler rejects a foreign sender without touching the manager', async () => {
  const { handlers, manager, logs } = createHarness();
  const foreign = { sender: { id: 'devtools' } };

  for (const channel of [
    DESKTOP_UPDATE_IPC_CHANNELS.snapshot,
    DESKTOP_UPDATE_IPC_CHANNELS.check,
    DESKTOP_UPDATE_IPC_CHANNELS.download,
    DESKTOP_UPDATE_IPC_CHANNELS.install,
  ]) {
    await assert.rejects(handlers[channel](foreign), /Update command rejected\./u, channel);
  }

  assert.equal(manager.getSnapshot().status, 'idle');
  assert.equal(logs.length, 4);
});

test('the rejection message reveals nothing about host window topology', async () => {
  const { handlers } = createHarness();

  await assert.rejects(
    handlers[DESKTOP_UPDATE_IPC_CHANNELS.check]({ sender: { id: 'devtools' } }),
    (error) => {
      assert.equal(error.message, 'Update command rejected.');
      assert.equal(/window|webContents|sender|main/u.test(error.message), false);
      return true;
    },
  );
});

test('handlers reject once the main window is gone', async () => {
  const manager = createManager();
  let webContents = { id: 'main' };
  const handlers = createDesktopUpdateIpcHandlers({
    manager,
    resolveMainWindowWebContents: () => webContents,
  });
  const event = { sender: webContents };

  assert.equal((await handlers[DESKTOP_UPDATE_IPC_CHANNELS.snapshot](event)).status, 'idle');

  webContents = null;
  await assert.rejects(handlers[DESKTOP_UPDATE_IPC_CHANNELS.snapshot](event));
});

test('snapshots broadcast to the main window and stop when unsubscribed', async () => {
  const { manager, mainWindowWebContents } = createHarness();
  const unsubscribe = createDesktopUpdateSnapshotBroadcast({
    manager,
    resolveMainWindowWebContents: () => mainWindowWebContents,
  });

  await manager.checkForUpdates();
  const sentDuringCheck = mainWindowWebContents.sent.length;
  assert.ok(sentDuringCheck >= 2);
  for (const [channel, payload] of mainWindowWebContents.sent) {
    assert.equal(channel, DESKTOP_UPDATE_IPC_CHANNELS.event);
    assert.equal(typeof payload.status, 'string');
  }

  unsubscribe();
  await manager.downloadUpdate();
  assert.equal(mainWindowWebContents.sent.length, sentDuringCheck);
});

test('broadcasting skips a destroyed or missing window instead of throwing', async () => {
  const manager = createManager();
  let webContents = null;
  createDesktopUpdateSnapshotBroadcast({
    manager,
    resolveMainWindowWebContents: () => webContents,
  });

  await manager.checkForUpdates();

  const destroyed = {
    isDestroyed: () => true,
    sent: [],
    send(channel, payload) {
      this.sent.push([channel, payload]);
    },
  };
  webContents = destroyed;
  await manager.downloadUpdate();

  assert.deepEqual(destroyed.sent, []);
});

test('the preload update bridge exposes only no-argument commands', async () => {
  const preload = await readFile(join(process.cwd(), 'desktop', 'host', 'preload.cts'), 'utf8');

  for (const method of [
    'getUpdateSnapshot',
    'checkForUpdates',
    'downloadUpdate',
    'restartAndInstall',
  ]) {
    const pattern = new RegExp(`${method}\\(\\):`, 'u');
    assert.match(preload, pattern, `${method} must take no arguments`);
  }

  // The invoke calls for update commands must not forward any payload.
  for (const channel of [
    'DESKTOP_UPDATE_SNAPSHOT_CHANNEL',
    'DESKTOP_UPDATE_CHECK_CHANNEL',
    'DESKTOP_UPDATE_DOWNLOAD_CHANNEL',
    'DESKTOP_UPDATE_INSTALL_CHANNEL',
  ]) {
    assert.match(
      preload,
      new RegExp(`ipcRenderer\\.invoke\\(${channel}\\)`, 'u'),
      `${channel} must be invoked without a payload`,
    );
  }
});

test('the preload update subscription detaches deterministically', async () => {
  const preload = await readFile(join(process.cwd(), 'desktop', 'host', 'preload.cts'), 'utf8');

  const subscription = preload.slice(preload.indexOf('onUpdateSnapshot'));
  assert.match(subscription, /ipcRenderer\.on\(DESKTOP_UPDATE_EVENT_CHANNEL, handler\)/u);
  assert.match(subscription, /ipcRenderer\.off\(DESKTOP_UPDATE_EVENT_CHANNEL, handler\)/u);
});
