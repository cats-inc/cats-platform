import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DESKTOP_RELEASE_READY_PLATFORMS,
  createDesktopUpdateCapability,
  createDesktopUpdateManager,
  mapDesktopUpdateError,
  redactDesktopUpdateDiagnostic,
  resolveDesktopUpdateNextAction,
} from '../build/desktop/updateManager.js';

const OFFICIAL_IDENTITY = {
  distribution: 'official_packaged',
  provider: 'github_release',
  channel: 'stable',
  currentVersion: '0.2.0',
  repository: 'cats-inc/cats-platform',
  commit: 'c'.repeat(40),
  unavailableReason: null,
};

function readyCapability(overrides = {}) {
  return createDesktopUpdateCapability({
    identity: { ...OFFICIAL_IDENTITY, ...overrides },
    nodePlatform: 'win32',
    releaseReadyPlatforms: ['windows'],
  });
}

function createFakeAdapter(behaviour = {}) {
  const calls = { check: 0, download: 0, install: 0 };
  return {
    calls,
    async checkForUpdates() {
      calls.check += 1;
      if (behaviour.checkError) {
        throw behaviour.checkError;
      }
      return behaviour.checkResult
        ?? { updateAvailable: true, version: '0.3.0', releaseSummary: 'Notes' };
    },
    async downloadUpdate(onProgress) {
      calls.download += 1;
      for (const progress of behaviour.progressEvents ?? []) {
        onProgress(progress);
      }
      if (behaviour.downloadError) {
        throw behaviour.downloadError;
      }
    },
    async quitAndInstall() {
      calls.install += 1;
      if (behaviour.installError) {
        throw behaviour.installError;
      }
    },
  };
}

function progressEvent(percent) {
  return {
    percent,
    transferredBytes: percent * 10,
    totalBytes: 1000,
    bytesPerSecond: 500,
  };
}

test('no platform is release ready yet, so official builds do not advertise self-update', () => {
  assert.deepEqual([...DESKTOP_RELEASE_READY_PLATFORMS], []);

  const capability = createDesktopUpdateCapability({
    identity: OFFICIAL_IDENTITY,
    nodePlatform: 'win32',
  });

  assert.equal(capability.distribution, 'official_packaged');
  assert.equal(capability.canCheck, false);
  assert.equal(capability.canDownload, false);
  assert.equal(capability.canInstall, false);
  assert.equal(capability.unavailableReason, 'platform_not_release_ready');
});

test('capability opens once the running platform passes its release gate', () => {
  const capability = readyCapability();

  assert.equal(capability.canCheck, true);
  assert.equal(capability.canDownload, true);
  assert.equal(capability.canInstall, true);
  assert.equal(capability.provider, 'github_release');
  assert.equal(capability.unavailableReason, null);
});

test('capability stays closed for development and unofficial packages', () => {
  for (const identity of [
    { distribution: 'development', provider: 'none', unavailableReason: 'development_build' },
    {
      distribution: 'unofficial_packaged',
      provider: 'none',
      unavailableReason: 'descriptor_missing',
    },
  ]) {
    const capability = createDesktopUpdateCapability({
      identity: { ...OFFICIAL_IDENTITY, ...identity },
      nodePlatform: 'win32',
      releaseReadyPlatforms: ['windows'],
    });

    assert.equal(capability.canCheck, false, identity.distribution);
    assert.equal(capability.provider, 'none', identity.distribution);
    assert.equal(capability.unavailableReason, identity.unavailableReason);
  }
});

test('an unsigned preview can self-update before any platform passes its gate', () => {
  // This is how the signed upgrade test gets run at all: the preview build is
  // the vehicle for exercising check, download, and install.
  const capability = createDesktopUpdateCapability({
    identity: { ...OFFICIAL_IDENTITY, distribution: 'preview_packaged' },
    nodePlatform: 'win32',
    releaseReadyPlatforms: [],
  });

  assert.equal(capability.distribution, 'preview_packaged');
  assert.equal(capability.canCheck, true);
  assert.equal(capability.canDownload, true);
  assert.equal(capability.canInstall, true);
  assert.equal(capability.unavailableReason, null);
});

test('an official build is still gated even where a preview is not', () => {
  const preview = createDesktopUpdateCapability({
    identity: { ...OFFICIAL_IDENTITY, distribution: 'preview_packaged' },
    nodePlatform: 'win32',
    releaseReadyPlatforms: [],
  });
  const official = createDesktopUpdateCapability({
    identity: OFFICIAL_IDENTITY,
    nodePlatform: 'win32',
    releaseReadyPlatforms: [],
  });

  assert.equal(preview.canCheck, true);
  assert.equal(official.canCheck, false);
  assert.equal(official.unavailableReason, 'platform_not_release_ready');
});

test('a preview still refuses an unsupported host platform', () => {
  const capability = createDesktopUpdateCapability({
    identity: { ...OFFICIAL_IDENTITY, distribution: 'preview_packaged' },
    nodePlatform: 'freebsd',
    releaseReadyPlatforms: [],
  });

  assert.equal(capability.canCheck, false);
  assert.equal(capability.unavailableReason, 'platform_not_release_ready');
});

test('capability refuses a platform that has not passed its own gate', () => {
  const capability = createDesktopUpdateCapability({
    identity: OFFICIAL_IDENTITY,
    nodePlatform: 'darwin',
    releaseReadyPlatforms: ['windows'],
  });

  assert.equal(capability.canCheck, false);
  assert.equal(capability.unavailableReason, 'platform_not_release_ready');
});

test('next action follows the lifecycle only while the capability is open', () => {
  const open = readyCapability();

  assert.equal(resolveDesktopUpdateNextAction('idle', open), 'check');
  assert.equal(resolveDesktopUpdateNextAction('up_to_date', open), 'check');
  assert.equal(resolveDesktopUpdateNextAction('failed', open), 'check');
  assert.equal(resolveDesktopUpdateNextAction('update_available', open), 'download');
  assert.equal(resolveDesktopUpdateNextAction('downloaded', open), 'restart_install');
  assert.equal(resolveDesktopUpdateNextAction('checking', open), 'none');
  assert.equal(resolveDesktopUpdateNextAction('downloading', open), 'none');
  assert.equal(resolveDesktopUpdateNextAction('installing', open), 'none');
  assert.equal(resolveDesktopUpdateNextAction('unavailable', open), 'none');

  const closed = createDesktopUpdateCapability({
    identity: OFFICIAL_IDENTITY,
    nodePlatform: 'win32',
  });
  for (const status of ['idle', 'update_available', 'downloaded', 'failed']) {
    assert.equal(resolveDesktopUpdateNextAction(status, closed), 'none', status);
  }
});

test('a manager without capability starts unavailable and ignores every command', async () => {
  const adapter = createFakeAdapter();
  const manager = createDesktopUpdateManager({
    capability: createDesktopUpdateCapability({
      identity: OFFICIAL_IDENTITY,
      nodePlatform: 'win32',
    }),
    adapter,
  });

  assert.equal(manager.getSnapshot().status, 'unavailable');
  assert.equal(manager.getSnapshot().nextAction, 'none');

  await manager.checkForUpdates();
  await manager.downloadUpdate();
  await manager.restartAndInstall();

  assert.deepEqual(adapter.calls, { check: 0, download: 0, install: 0 });
  assert.equal(manager.getSnapshot().status, 'unavailable');
});

test('a check that finds nothing reports up_to_date and stamps the check time', async () => {
  const adapter = createFakeAdapter({
    checkResult: { updateAvailable: false, version: null, releaseSummary: null },
  });
  const manager = createDesktopUpdateManager({
    capability: readyCapability(),
    adapter,
    now: () => new Date('2026-07-29T10:00:00.000Z'),
  });

  const snapshot = await manager.checkForUpdates();

  assert.equal(snapshot.status, 'up_to_date');
  assert.equal(snapshot.availableVersion, null);
  assert.equal(snapshot.lastCheckedAt, '2026-07-29T10:00:00.000Z');
  assert.equal(snapshot.nextAction, 'check');
});

test('a check that finds a release exposes the version and the download action', async () => {
  const manager = createDesktopUpdateManager({
    capability: readyCapability(),
    adapter: createFakeAdapter(),
  });

  const snapshot = await manager.checkForUpdates();

  assert.equal(snapshot.status, 'update_available');
  assert.equal(snapshot.availableVersion, '0.3.0');
  assert.equal(snapshot.releaseSummary, 'Notes');
  assert.equal(snapshot.nextAction, 'download');
});

test('an available update without a version is treated as invalid metadata', async () => {
  const manager = createDesktopUpdateManager({
    capability: readyCapability(),
    adapter: createFakeAdapter({
      checkResult: { updateAvailable: true, version: null, releaseSummary: null },
    }),
  });

  const snapshot = await manager.checkForUpdates();

  assert.equal(snapshot.status, 'failed');
  assert.equal(snapshot.error.code, 'unknown');
  assert.equal(snapshot.nextAction, 'check');
});

test('the full lifecycle runs check, download, and install in order', async () => {
  const adapter = createFakeAdapter({ progressEvents: [progressEvent(25), progressEvent(80)] });
  const observed = [];
  const manager = createDesktopUpdateManager({ capability: readyCapability(), adapter });
  manager.subscribe((snapshot) => observed.push(snapshot.status));

  await manager.checkForUpdates();
  const downloaded = await manager.downloadUpdate();
  assert.equal(downloaded.status, 'downloaded');
  assert.equal(downloaded.progress, null);
  assert.equal(downloaded.nextAction, 'restart_install');

  await manager.restartAndInstall();

  assert.deepEqual(adapter.calls, { check: 1, download: 1, install: 1 });
  assert.deepEqual(observed, [
    'checking',
    'update_available',
    'downloading',
    'downloading',
    'downloading',
    'downloaded',
    'installing',
  ]);
});

test('download progress reaches subscribers while downloading', async () => {
  const percents = [];
  const manager = createDesktopUpdateManager({
    capability: readyCapability(),
    adapter: createFakeAdapter({ progressEvents: [progressEvent(10), progressEvent(90)] }),
  });
  manager.subscribe((snapshot) => {
    if (snapshot.status === 'downloading' && snapshot.progress !== null) {
      percents.push(snapshot.progress.percent);
    }
  });

  await manager.checkForUpdates();
  await manager.downloadUpdate();

  assert.deepEqual(percents, [0, 10, 90]);
});

test('download is refused unless an update is actually available', async () => {
  const adapter = createFakeAdapter();
  const manager = createDesktopUpdateManager({ capability: readyCapability(), adapter });

  const snapshot = await manager.downloadUpdate();

  assert.equal(snapshot.status, 'idle');
  assert.equal(adapter.calls.download, 0);
});

test('install is refused unless the update has finished downloading', async () => {
  const adapter = createFakeAdapter();
  const manager = createDesktopUpdateManager({ capability: readyCapability(), adapter });

  await manager.checkForUpdates();
  const snapshot = await manager.restartAndInstall();

  assert.equal(snapshot.status, 'update_available');
  assert.equal(adapter.calls.install, 0);
});

test('concurrent checks join the in-flight operation instead of starting a second one', async () => {
  let release = () => {};
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const calls = { check: 0 };
  const adapter = {
    async checkForUpdates() {
      calls.check += 1;
      await gate;
      return { updateAvailable: false, version: null, releaseSummary: null };
    },
    async downloadUpdate() {},
    async quitAndInstall() {},
  };
  const manager = createDesktopUpdateManager({ capability: readyCapability(), adapter });

  const first = manager.checkForUpdates();
  const second = manager.checkForUpdates();
  const third = manager.checkForUpdates();
  release();
  const results = await Promise.all([first, second, third]);

  assert.equal(calls.check, 1);
  for (const result of results) {
    assert.equal(result.status, 'up_to_date');
  }
});

test('a check requested during a download joins the download instead of racing it', async () => {
  let release = () => {};
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const adapter = createFakeAdapter();
  adapter.downloadUpdate = async () => {
    adapter.calls.download += 1;
    await gate;
  };
  const manager = createDesktopUpdateManager({ capability: readyCapability(), adapter });

  await manager.checkForUpdates();
  const download = manager.downloadUpdate();
  const joined = manager.checkForUpdates();
  release();

  const [downloadResult, joinedResult] = await Promise.all([download, joined]);

  assert.equal(adapter.calls.check, 1);
  assert.equal(adapter.calls.download, 1);
  assert.equal(downloadResult.status, 'downloaded');
  assert.equal(joinedResult.status, 'downloaded');
});

test('a failed check leaves the app usable and offers another check', async () => {
  const manager = createDesktopUpdateManager({
    capability: readyCapability(),
    adapter: createFakeAdapter({ checkError: Object.assign(new Error('getaddrinfo ENOTFOUND'), { code: 'ENOTFOUND' }) }),
  });

  const snapshot = await manager.checkForUpdates();

  assert.equal(snapshot.status, 'failed');
  assert.equal(snapshot.error.code, 'offline');
  assert.equal(snapshot.nextAction, 'check');
});

test('a failed download keeps the installed app and clears stale progress', async () => {
  const manager = createDesktopUpdateManager({
    capability: readyCapability(),
    adapter: createFakeAdapter({
      progressEvents: [progressEvent(40)],
      downloadError: new Error('sha512 checksum mismatch'),
    }),
  });

  await manager.checkForUpdates();
  const snapshot = await manager.downloadUpdate();

  assert.equal(snapshot.status, 'failed');
  assert.equal(snapshot.error.code, 'checksum_mismatch');
  assert.equal(snapshot.progress, null);
});

test('a failed install handoff returns to the recoverable downloaded state', async () => {
  const manager = createDesktopUpdateManager({
    capability: readyCapability(),
    adapter: createFakeAdapter({ installError: new Error('spawn failed') }),
  });

  await manager.checkForUpdates();
  await manager.downloadUpdate();
  const snapshot = await manager.restartAndInstall();

  assert.equal(snapshot.status, 'downloaded');
  assert.equal(snapshot.error.code, 'install_handoff_failed');
  assert.equal(snapshot.nextAction, 'restart_install');
});

test('subscribers can unsubscribe deterministically', async () => {
  const seen = [];
  const manager = createDesktopUpdateManager({
    capability: readyCapability(),
    adapter: createFakeAdapter(),
  });
  const unsubscribe = manager.subscribe((snapshot) => seen.push(snapshot.status));

  await manager.checkForUpdates();
  const countAfterFirst = seen.length;
  unsubscribe();
  await manager.checkForUpdates();

  assert.equal(seen.length, countAfterFirst);
});

test('the snapshot never carries a feed url, download url, or installer path', async () => {
  const manager = createDesktopUpdateManager({
    capability: readyCapability(),
    adapter: createFakeAdapter(),
  });

  await manager.checkForUpdates();
  const serialized = JSON.stringify(manager.getSnapshot());

  assert.equal(/https?:\/\//u.test(serialized), false);
  assert.equal(/\.exe|\.dmg|\.AppImage|\.nupkg/u.test(serialized), false);
  assert.deepEqual(Object.keys(manager.getSnapshot()).sort(), [
    'availableVersion',
    'capability',
    'currentVersion',
    'error',
    'lastCheckedAt',
    'nextAction',
    'progress',
    'releaseSummary',
    'status',
  ]);
});

test('provider errors map to stable codes with renderer-safe copy', () => {
  const cases = [
    [Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }), 'offline'],
    [new Error('socket ETIMEDOUT'), 'timeout'],
    [new Error('sha512 mismatch'), 'checksum_mismatch'],
    [new Error('publisherName did not match'), 'signature_rejected'],
    [new Error('Download cancelled by user'), 'download_cancelled'],
    [new Error('Update is not supported for this package'), 'unsupported_package'],
    [new Error('Cannot parse latest.yml'), 'metadata_invalid'],
    [new Error('HTTP 403 rate limit exceeded'), 'provider_rejected'],
    [new Error('something else entirely'), 'unknown'],
    ['plain string failure', 'unknown'],
  ];

  for (const [cause, expected] of cases) {
    const mapped = mapDesktopUpdateError(cause);
    assert.equal(mapped.code, expected, String(cause));
    assert.equal(typeof mapped.summary, 'string');
    assert.equal(mapped.summary.length > 0, true);
    assert.equal(mapped.summary.includes('ECONNREFUSED'), false);
  }
});

test('diagnostics redact tokens before they reach the desktop host log', () => {
  const redacted = redactDesktopUpdateDiagnostic(
    'failed with authorization: ghp_abcdefghijklmnopqrstuvwxyz012345 and token=secretvalue',
  );

  assert.equal(redacted.includes('ghp_abcdefghijklmnopqrstuvwxyz012345'), false);
  assert.equal(redacted.includes('secretvalue'), false);
  assert.equal(redacted.includes('[redacted]'), true);
});

test('failure diagnostics reach the injected logger with secrets removed', async () => {
  const logs = [];
  const manager = createDesktopUpdateManager({
    capability: readyCapability(),
    adapter: createFakeAdapter({
      checkError: new Error('HTTP 401 for token=ghp_abcdefghijklmnopqrstuvwxyz012345'),
    }),
    logger: (message) => logs.push(message),
  });

  await manager.checkForUpdates();

  assert.equal(logs.length, 1);
  assert.equal(logs[0].includes('ghp_abcdefghijklmnopqrstuvwxyz012345'), false);
  assert.match(logs[0], /provider_rejected/u);
});

test('a download survives the window hiding to tray and reports truthful state', async () => {
  // Closing the window only hides it to tray, so the renderer detaches while the
  // main-process download continues. The state a returning surface reads has to
  // be the live one, not a stale snapshot from before it left.
  let releaseDownload = () => {};
  let reportProgress = () => {};
  const manager = createDesktopUpdateManager({
    capability: readyCapability(),
    adapter: {
      calls: {},
      async checkForUpdates() {
        return { updateAvailable: true, version: '0.3.0', releaseSummary: null };
      },
      async downloadUpdate(onProgress) {
        reportProgress = onProgress;
        await new Promise((resolve) => {
          releaseDownload = resolve;
        });
      },
      async quitAndInstall() {},
    },
  });

  await manager.checkForUpdates();
  const seen = [];
  const unsubscribe = manager.subscribe((snapshot) => seen.push(snapshot.status));

  const download = manager.downloadUpdate();
  await Promise.resolve();
  reportProgress(progressEvent(25));

  // The renderer goes away, exactly as it does when the window hides.
  unsubscribe();
  const seenCount = seen.length;
  reportProgress(progressEvent(75));

  assert.equal(seen.length, seenCount, 'a detached subscriber still received events');
  assert.equal(manager.getSnapshot().status, 'downloading');
  assert.equal(manager.getSnapshot().progress?.percent, 75);
  assert.equal(manager.getSnapshot().nextAction, 'none');

  releaseDownload();
  await download;

  // A surface that comes back reads the finished state, not the one it left.
  assert.equal(manager.getSnapshot().status, 'downloaded');
  assert.equal(manager.getSnapshot().progress, null);
  assert.equal(manager.getSnapshot().nextAction, 'restart_install');
});
