import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
  configureElectronUpdater,
  createElectronUpdaterAdapter,
  resolveAutoUpdaterExport,
  resolveElectronUpdaterChannel,
  resolveGithubFeedOptions,
  resolveReleaseSummary,
  toDesktopUpdateProgress,
  toDesktopUpdaterCheckResult,
} from '../build/desktop/updaterAdapter.js';
import {
  DesktopInstallHandoffTimeoutError,
  withDesktopInstallHandoff,
} from '../build/desktop/updateInstallHandoff.js';

function createFakeAutoUpdater() {
  const listeners = new Map();
  const calls = { check: 0, download: 0, install: [] };

  return {
    autoDownload: true,
    autoInstallOnAppQuit: true,
    // electron-updater's own default. Started from false so a configuration
    // that stopped pinning it would fail rather than inherit the right answer.
    autoRunAppAfterInstall: false,
    allowPrerelease: true,
    // Mirrors the real electron-updater setter, which assigns
    // allowDowngrade = true whenever the channel changes.
    allowDowngrade: true,
    _channel: null,
    get channel() {
      return this._channel;
    },
    set channel(value) {
      this._channel = value;
      this.allowDowngrade = true;
    },
    feedUrl: null,
    calls,
    listenerCount() {
      let total = 0;
      for (const set of listeners.values()) {
        total += set.size;
      }
      return total;
    },
    emit(event, payload) {
      for (const listener of [...(listeners.get(event) ?? [])]) {
        listener(payload);
      }
    },
    setFeedURL(options) {
      this.feedUrl = options;
    },
    async checkForUpdates() {
      calls.check += 1;
    },
    async downloadUpdate() {
      calls.download += 1;
    },
    quitAndInstall(isSilent, isForceRunAfter) {
      calls.install.push([isSilent, isForceRunAfter]);
    },
    on(event, listener) {
      if (!listeners.has(event)) {
        listeners.set(event, new Set());
      }
      listeners.get(event).add(listener);
      return this;
    },
    removeListener(event, listener) {
      listeners.get(event)?.delete(listener);
      return this;
    },
  };
}

function createAdapterHarness(autoUpdater = createFakeAutoUpdater()) {
  const quitListeners = new Set();
  const timeoutListeners = new Set();
  const installHandoffObserver = {
    onQuit(listener) {
      quitListeners.add(listener);
      return () => quitListeners.delete(listener);
    },
    onTimeout(listener) {
      timeoutListeners.add(listener);
      return () => timeoutListeners.delete(listener);
    },
  };

  return {
    adapter: createElectronUpdaterAdapter(autoUpdater, installHandoffObserver),
    autoUpdater,
    emitQuit() {
      for (const listener of [...quitListeners]) {
        listener();
      }
    },
    emitTimeout() {
      for (const listener of [...timeoutListeners]) {
        listener();
      }
    },
    quitListenerCount() {
      return quitListeners.size;
    },
    timeoutListenerCount() {
      return timeoutListeners.size;
    },
  };
}

test('the autoUpdater export is read from either interop shape', () => {
  const instance = { autoDownload: true };

  // electron-updater is CommonJS and defines autoUpdater with a getter, which
  // Node's named-export detection misses, so the value arrives under default.
  assert.equal(resolveAutoUpdaterExport({ default: { autoUpdater: instance } }), instance);
  // Accepted too, in case a future Node or bundler does detect the name.
  assert.equal(resolveAutoUpdaterExport({ autoUpdater: instance }), instance);
});

test('a missing autoUpdater export fails loudly instead of undefined property writes', () => {
  // The original bug wrote to undefined and surfaced as
  // "Cannot set properties of undefined (setting 'autoDownload')".
  for (const namespace of [null, undefined, {}, { default: {} }, { autoUpdater: null }]) {
    assert.throws(
      () => resolveAutoUpdaterExport(namespace),
      /did not expose an autoUpdater instance/u,
      JSON.stringify(namespace ?? null),
    );
  }
});

test('github feed options are derived from the descriptor repository', () => {
  assert.deepEqual(resolveGithubFeedOptions('cats-inc/cats-platform'), {
    provider: 'github',
    owner: 'cats-inc',
    repo: 'cats-platform',
  });
  assert.throws(() => resolveGithubFeedOptions('cats-platform'), /owner\/name/u);
});

test('the stable channel maps to the electron-updater latest feed', () => {
  assert.equal(resolveElectronUpdaterChannel('stable'), 'latest');
  assert.equal(resolveElectronUpdaterChannel('beta'), 'beta');
  assert.equal(resolveElectronUpdaterChannel('alpha'), 'alpha');
});

test('configuration disables automatic download and install-on-quit', () => {
  const autoUpdater = createFakeAutoUpdater();

  configureElectronUpdater(autoUpdater, {
    repository: 'cats-inc/cats-platform',
    channel: 'stable',
    distribution: 'official_packaged',
  });

  assert.equal(autoUpdater.autoDownload, false);
  assert.equal(autoUpdater.autoInstallOnAppQuit, false);
  assert.equal(autoUpdater.allowPrerelease, false);
  assert.equal(autoUpdater.autoRunAppAfterInstall, true);
  assert.equal(autoUpdater.channel, 'latest');
  assert.deepEqual(autoUpdater.feedUrl, {
    provider: 'github',
    owner: 'cats-inc',
    repo: 'cats-platform',
  });
});

/**
 * Coming back up after an install is the contract, and quitAndInstall's
 * isForceRunAfter argument cannot carry it: electron-updater's BaseUpdater
 * reads that argument only in silent mode and substitutes
 * autoRunAppAfterInstall otherwise. This host installs non-silently so the
 * user can see the platform installer, so the field is the only thing that
 * decides whether Cats comes back.
 */
test('the relaunch after install is pinned rather than inherited', () => {
  const autoUpdater = createFakeAutoUpdater();

  configureElectronUpdater(autoUpdater, {
    repository: 'cats-inc/cats-platform',
    channel: 'stable',
    distribution: 'preview_packaged',
  });

  assert.equal(autoUpdater.autoRunAppAfterInstall, true);
});

test('a preview resolves updates through the prerelease feed it publishes to', () => {
  // A preview ships as a GitHub prerelease that never becomes `latest`. With
  // allowPrerelease off, the provider resolves through /releases/latest, which
  // excludes prereleases -- so a preview could never find its successor and the
  // whole point of the preview path (exercising the update client before signing
  // exists) would be lost.
  const autoUpdater = createFakeAutoUpdater();

  configureElectronUpdater(autoUpdater, {
    repository: 'cats-inc/cats-platform',
    channel: 'stable',
    distribution: 'preview_packaged',
  });

  assert.equal(autoUpdater.allowPrerelease, true);
  // Unset on purpose: a channel makes the provider require it as a semver
  // prerelease component of the tag, and preview tags are plain versions.
  assert.equal(autoUpdater.channel, null);
  // The safety rails do not relax for a preview.
  assert.equal(autoUpdater.autoDownload, false);
  assert.equal(autoUpdater.autoInstallOnAppQuit, false);
  assert.equal(autoUpdater.allowDowngrade, false);
});

test('an official build stays on the stable feed and refuses prereleases', () => {
  const autoUpdater = createFakeAutoUpdater();

  configureElectronUpdater(autoUpdater, {
    repository: 'cats-inc/cats-platform',
    channel: 'stable',
    distribution: 'official_packaged',
  });

  assert.equal(autoUpdater.allowPrerelease, false);
  assert.equal(autoUpdater.channel, 'latest');
});

test('downgrade stays disabled even though the channel setter re-enables it', () => {
  const autoUpdater = createFakeAutoUpdater();

  // Sanity-check the fake reproduces the real setter side effect first, so
  // this regression test cannot pass for the wrong reason.
  autoUpdater.allowDowngrade = false;
  autoUpdater.channel = 'latest';
  assert.equal(autoUpdater.allowDowngrade, true);

  configureElectronUpdater(autoUpdater, {
    repository: 'cats-inc/cats-platform',
    channel: 'stable',
    distribution: 'official_packaged',
  });

  assert.equal(autoUpdater.allowDowngrade, false);
  assert.equal(autoUpdater.channel, 'latest');
});

test('progress translation normalizes missing and out-of-range provider fields', () => {
  assert.deepEqual(
    toDesktopUpdateProgress({ percent: 42.126, transferred: 100, total: 240, bytesPerSecond: 55.9 }),
    { percent: 42.13, transferredBytes: 100, totalBytes: 240, bytesPerSecond: 55 },
  );
  assert.deepEqual(
    toDesktopUpdateProgress({}),
    { percent: 0, transferredBytes: 0, totalBytes: 0, bytesPerSecond: 0 },
  );
  assert.deepEqual(
    toDesktopUpdateProgress({ transferred: 50, total: 200 }),
    { percent: 25, transferredBytes: 50, totalBytes: 200, bytesPerSecond: 0 },
  );
  assert.equal(toDesktopUpdateProgress({ percent: 140 }).percent, 100);
  assert.equal(toDesktopUpdateProgress({ percent: -5 }).percent, 0);
  assert.equal(toDesktopUpdateProgress({ percent: Number.NaN }).percent, 0);
});

test('check translation reports no version when nothing is available', () => {
  assert.deepEqual(toDesktopUpdaterCheckResult(false, { version: '9.9.9' }), {
    updateAvailable: false,
    version: null,
    releaseSummary: null,
  });
});

test('check translation carries the version and a bounded release summary', () => {
  assert.deepEqual(
    toDesktopUpdaterCheckResult(true, { version: ' 0.3.0 ', releaseName: 'Cats 0.3.0' }),
    { updateAvailable: true, version: '0.3.0', releaseSummary: 'Cats 0.3.0' },
  );
});

test('release summaries drop html notes and truncate very long plain text', () => {
  assert.equal(resolveReleaseSummary({ releaseNotes: '<p>Fancy notes</p>' }), null);
  assert.equal(resolveReleaseSummary({ releaseNotes: 'Plain notes' }), 'Plain notes');
  assert.equal(resolveReleaseSummary({ releaseName: '', releaseNotes: '' }), null);
  assert.equal(resolveReleaseSummary(null), null);

  const long = resolveReleaseSummary({ releaseNotes: 'x'.repeat(900) });
  assert.equal(long.length, 500);
  assert.equal(long.endsWith('…'), true);
});

test('release name wins over release notes', () => {
  assert.equal(
    resolveReleaseSummary({ releaseName: 'Named', releaseNotes: 'Noted' }),
    'Named',
  );
});

test('adapter check resolves from the update-available event', async () => {
  const { adapter, autoUpdater } = createAdapterHarness();

  const pending = adapter.checkForUpdates();
  autoUpdater.emit('update-available', { version: '0.3.0', releaseName: 'Cats 0.3.0' });
  const result = await pending;

  assert.deepEqual(result, {
    updateAvailable: true,
    version: '0.3.0',
    releaseSummary: 'Cats 0.3.0',
  });
  assert.equal(autoUpdater.calls.check, 1);
  assert.equal(autoUpdater.listenerCount(), 0);
});

test('adapter check resolves from the update-not-available event', async () => {
  const { adapter, autoUpdater } = createAdapterHarness();

  const pending = adapter.checkForUpdates();
  autoUpdater.emit('update-not-available', { version: '0.2.0' });

  assert.deepEqual(await pending, {
    updateAvailable: false,
    version: null,
    releaseSummary: null,
  });
  assert.equal(autoUpdater.listenerCount(), 0);
});

test('adapter check rejects on the provider error event and detaches listeners', async () => {
  const { adapter, autoUpdater } = createAdapterHarness();

  const pending = adapter.checkForUpdates();
  autoUpdater.emit('error', new Error('HTTP 403'));

  await assert.rejects(pending, /HTTP 403/u);
  assert.equal(autoUpdater.listenerCount(), 0);
});

test('adapter check rejects when the provider call itself throws', async () => {
  const autoUpdater = createFakeAutoUpdater();
  autoUpdater.checkForUpdates = async () => {
    throw new Error('ENOTFOUND api.github.com');
  };
  const { adapter } = createAdapterHarness(autoUpdater);

  await assert.rejects(adapter.checkForUpdates(), /ENOTFOUND/u);
  assert.equal(autoUpdater.listenerCount(), 0);
});

test('adapter download streams progress and resolves on update-downloaded', async () => {
  const { adapter, autoUpdater } = createAdapterHarness();
  const seen = [];

  const pending = adapter.downloadUpdate((progress) => seen.push(progress.percent));
  autoUpdater.emit('download-progress', { percent: 10, transferred: 1, total: 10 });
  autoUpdater.emit('download-progress', { percent: 75, transferred: 7, total: 10 });
  autoUpdater.emit('update-downloaded', { version: '0.3.0' });
  await pending;

  assert.deepEqual(seen, [10, 75]);
  assert.equal(autoUpdater.calls.download, 1);
  assert.equal(autoUpdater.listenerCount(), 0);
});

test('adapter download rejects on the provider error event', async () => {
  const { adapter, autoUpdater } = createAdapterHarness();

  const pending = adapter.downloadUpdate(() => {});
  autoUpdater.emit('error', new Error('sha512 mismatch'));

  await assert.rejects(pending, /sha512/u);
  assert.equal(autoUpdater.listenerCount(), 0);
});

test('a late event after settlement does not resolve the operation twice', async () => {
  const { adapter, autoUpdater } = createAdapterHarness();

  const pending = adapter.checkForUpdates();
  autoUpdater.emit('update-not-available', {});
  await pending;

  // Listeners are already detached, so this must be a no-op rather than a
  // second settlement attempt.
  autoUpdater.emit('update-available', { version: '9.9.9' });
  assert.equal(autoUpdater.listenerCount(), 0);
});

test('the compiled adapter never imports electron-updater at runtime', async () => {
  const compiled = await readFile(
    join(process.cwd(), 'build', 'desktop', 'updaterAdapter.js'),
    'utf8',
  );

  // The module only references electron-updater through a type-only import so
  // it stays loadable in a plain node process. A value import would drag in
  // electron and break every test that touches this file.
  assert.equal(/^\s*import .*['"]electron-updater['"]/mu.test(compiled), false);
  assert.equal(/require\(['"]electron-updater['"]\)/u.test(compiled), false);
  assert.equal(/^\s*import .*['"]electron['"]/mu.test(compiled), false);
});

test('adapter install uses the visible installer path and relaunches afterwards', async () => {
  const {
    adapter,
    autoUpdater,
    emitQuit,
    quitListenerCount,
    timeoutListenerCount,
  } = createAdapterHarness();

  const pending = adapter.quitAndInstall();
  let settled = false;
  void pending.finally(() => {
    settled = true;
  });
  await Promise.resolve();

  assert.deepEqual(autoUpdater.calls.install, [[false, true]]);
  assert.equal(quitListenerCount(), 1);
  assert.equal(timeoutListenerCount(), 1);
  assert.equal(autoUpdater.listenerCount(), 1);
  assert.equal(settled, false);

  emitQuit();
  await pending;

  assert.equal(quitListenerCount(), 0);
  assert.equal(timeoutListenerCount(), 0);
  assert.equal(autoUpdater.listenerCount(), 0);
});

test('adapter install rejects an updater error before the app starts quitting', async () => {
  const {
    adapter,
    autoUpdater,
    quitListenerCount,
    timeoutListenerCount,
  } = createAdapterHarness();

  const pending = adapter.quitAndInstall();
  autoUpdater.emit('error', new Error('dpkg cancelled'));

  await assert.rejects(pending, /dpkg cancelled/u);
  assert.equal(quitListenerCount(), 0);
  assert.equal(timeoutListenerCount(), 0);
  assert.equal(autoUpdater.listenerCount(), 0);
});

test('adapter install rejects a stalled handoff when the host watchdog expires', async () => {
  const {
    adapter,
    autoUpdater,
    emitTimeout,
    quitListenerCount,
    timeoutListenerCount,
  } = createAdapterHarness();

  const pending = adapter.quitAndInstall();
  emitTimeout();

  await assert.rejects(
    pending,
    (error) => error instanceof DesktopInstallHandoffTimeoutError,
  );
  assert.equal(quitListenerCount(), 0);
  assert.equal(timeoutListenerCount(), 0);
  assert.equal(autoUpdater.listenerCount(), 0);
});

test('an updater install error restores services before reporting a failed handoff', async () => {
  const {
    adapter,
    autoUpdater,
  } = createAdapterHarness();
  const state = {
    exitingAfterShutdown: false,
    restarted: false,
  };
  const wrapped = withDesktopInstallHandoff(adapter, {
    async drainManagedServices() {
      state.exitingAfterShutdown = true;
    },
    async restartManagedServices() {
      state.exitingAfterShutdown = false;
      state.restarted = true;
    },
    async exitAfterUncertainHandoff() {
      throw new Error('unexpected uncertain handoff');
    },
  });

  const pending = wrapped.quitAndInstall();
  await Promise.resolve();
  autoUpdater.emit('error', new Error('elevation cancelled'));

  await assert.rejects(pending, /elevation cancelled/u);
  assert.deepEqual(state, {
    exitingAfterShutdown: false,
    restarted: true,
  });
});
