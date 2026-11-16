// SPEC-145 Phase 3 host wiring: the shipped lock, the Electron transport, the
// pack IPC bridge, Linux voice exposure and the voice controller driving a
// scripted protocol-1 helper from an installed fixture pack (FR-C1, FR-C4,
// FR-D1-FR-D4, FR-D6, FR-D8).

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  createElectronFeaturePackTransport,
  featurePackPreloadArguments,
  hasLinuxVoicePack,
  loadDesktopFeaturePacks,
  registerFeaturePackIpc,
} from '../build/desktop/featurePackHost.js';
import {
  featurePackArchiveName,
  parseFeaturePackLock,
} from '../build/desktop/featurePacks/featurePackContract.js';
import {
  FEATURE_PACK_STATUSES as HOST_STATUSES,
} from '../build/desktop/featurePacks/featurePackManager.js';
import { isMainWindowMainFrameIpcSender } from '../build/desktop/ipcSecurity.js';
import {
  DesktopVoiceCaptureController,
  shouldAllowDesktopRendererPermission,
} from '../build/desktop/voiceCapture.js';
import {
  FEATURE_PACK_STATUSES as RENDERER_STATUSES,
} from '../build/server/shared/featurePackBridge.js';
import {
  buildFixturePack,
  createFixtureTransport,
  fixtureLock,
} from './fixtures/featurePackFixtures.mjs';

const ID = 'linux-stt';
const SUPPORTED = {
  glibcVersion: () => '2.39',
  hasLibrary: async () => true,
  freeBytes: async () => null,
};

async function packsFixture(t) {
  const base = await mkdtemp(join(tmpdir(), 'cats-feature-pack-host-'));
  // Windows may hold a killed helper's working directory for a moment.
  t.after(() => rm(base, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }));
  const archiveDirectory = join(base, 'archive');
  await mkdir(archiveDirectory);
  const pack = await buildFixturePack(archiveDirectory);
  const packageRoot = join(base, 'package');
  await mkdir(join(packageRoot, 'config'), { recursive: true });
  await writeFile(
    join(packageRoot, 'config', 'desktop-feature-packs.lock.json'),
    JSON.stringify(fixtureLock([pack.lockEntry])),
  );
  const transport = createFixtureTransport(new Map([[pack.lockEntry.url, pack.archiveBytes]]));
  const packs = await loadDesktopFeaturePacks({
    packageRoot,
    platformDir: join(base, 'platform'),
    platform: 'linux',
    arch: 'x64',
    transport,
    system: SUPPORTED,
    log: () => {},
  });
  await packs.ready;
  return { base, packs, transport };
}

async function waitFor(check, label = 'condition') {
  for (let attempt = 0; attempt < 300; attempt += 1) {
    if (check()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.fail(`timed out waiting for ${label}`);
}

function linuxController(events, featurePack, { env = {}, ...options } = {}) {
  const baseEnv = { ...process.env };
  delete baseEnv.CATS_VOICE_CAPTURE_HELPER;
  return new DesktopVoiceCaptureController({
    config: { packaged: false, packageRoot: tmpdir() },
    platform: 'linux',
    env: { ...baseEnv, ...env },
    sendEvent: (event) => events.push(event),
    // The pack's entry is a Node script; Windows cannot run it by its shebang.
    spawnProcess: (command, args, spawnOptions) => (
      spawn(process.execPath, [command, ...args], spawnOptions)
    ),
    ...(featurePack ? { featurePack } : {}),
    logLine: () => {},
    ...options,
  });
}

function packHelper(packs) {
  return { acquireHelper: (onRevoke) => packs.manager.acquireHelper(ID, onRevoke) };
}

const ended = (events) => () => events.some((event) => event.type === 'end');

test('the shipped lock pins the released linux-stt 0.1.0 for Linux x64 and arm64 only', async (t) => {
  const lock = parseFeaturePackLock(JSON.parse(await readFile(
    new URL('../config/desktop-feature-packs.lock.json', import.meta.url),
    'utf8',
  )));
  assert.deepEqual(
    lock.packs.map((entry) => [entry.id, entry.version, entry.os, entry.arch, entry.sha256]),
    [
      [ID, '0.1.0', 'linux', 'x64', 'e1b41aec59f36305bab3b65518f863f27b426781c360b07b670954ea29614d23'],
      [ID, '0.1.0', 'linux', 'arm64', '91b2d15a0350b300fb505bb8257b2d3ad79cb1b77bf4dd92edc85a067278e236'],
    ],
  );
  for (const entry of lock.packs) {
    assert.equal(
      entry.url,
      `https://github.com/cats-inc/cats-plugins/releases/download/linux-stt-v0.1.0/${featurePackArchiveName(entry)}`,
    );
  }

  const load = async (platform, arch) => {
    const platformDir = await mkdtemp(join(tmpdir(), 'cats-feature-pack-shipped-'));
    t.after(() => rm(platformDir, { recursive: true, force: true }));
    const packs = await loadDesktopFeaturePacks({
      packageRoot: fileURLToPath(new URL('..', import.meta.url)),
      platformDir,
      platform,
      arch,
      transport: createFixtureTransport(new Map()),
      system: SUPPORTED,
      log: () => {},
    });
    await packs.ready;
    return { packs, platformDir };
  };
  for (const arch of ['x64', 'arm64']) {
    const { packs } = await load('linux', arch);
    assert.deepEqual(packs.entries.map((entry) => entry.arch), [arch]);
    assert.deepEqual(featurePackPreloadArguments(packs), ['--cats-feature-packs=linux-stt']);
    assert.equal(hasLinuxVoicePack(packs, 'linux'), true);
    const [snapshot] = await packs.manager.list();
    assert.equal(snapshot.status, 'not_installed', 'nothing downloads until the owner asks');
  }
  for (const [platform, arch] of [['darwin', 'arm64'], ['darwin', 'x64'], ['win32', 'x64'], ['win32', 'arm64']]) {
    const { packs, platformDir } = await load(platform, arch);
    assert.deepEqual(packs.entries, []);
    assert.deepEqual(featurePackPreloadArguments(packs), []);
    assert.equal(hasLinuxVoicePack(packs, platform), false);
    assert.deepEqual(await readdir(platformDir), [], 'nothing is created without a pack');
  }
});

test('a lock entry exposes the pack bridge, and Linux voice only for linux-stt', async (t) => {
  const { packs } = await packsFixture(t);
  assert.deepEqual(featurePackPreloadArguments(packs), ['--cats-feature-packs=linux-stt']);
  assert.equal(hasLinuxVoicePack(packs, 'linux'), true);
  assert.equal(hasLinuxVoicePack(packs, 'darwin'), false);
  assert.equal(hasLinuxVoicePack({ entries: [{ id: 'other-pack' }] }, 'linux'), false);
});

test('the renderer bridge lists the same statuses as the manager', () => {
  assert.deepEqual([...RENDERER_STATUSES], [...HOST_STATUSES]);
});

test('pack IPC accepts only the main window main frame', () => {
  const mainFrame = { processId: 4, routingId: 1 };
  const mainWindow = { webContents: { mainFrame } };
  const event = (frame, sender = mainWindow.webContents) => ({ sender, senderFrame: frame });

  const allowed = (sender, window = mainWindow) => isMainWindowMainFrameIpcSender(sender, window);

  assert.equal(allowed(event({ processId: 4, routingId: 1 })), true);
  assert.equal(allowed(event({ processId: 4, routingId: 7 })), false, 'a subframe');
  assert.equal(allowed(event({ processId: 5, routingId: 1 })), false, 'another process');
  assert.equal(allowed(event(null)), false, 'a destroyed frame');
  assert.equal(allowed(event(mainFrame, {})), false, 'another window');
  assert.equal(allowed(event(mainFrame), null), false, 'no window');
});

test('the pack bridge lists, downloads, checks and removes by lock id only', async (t) => {
  const { packs } = await packsFixture(t);
  const handlers = new Map();
  const ipcMain = { handle: (channel, listener) => handlers.set(channel, listener) };
  const mainWindow = { webContents: { mainFrame: { processId: 1, routingId: 1 } } };
  const fromMain = { sender: mainWindow.webContents, senderFrame: { processId: 1, routingId: 1 } };
  const fromSubframe = {
    sender: mainWindow.webContents,
    senderFrame: { processId: 1, routingId: 2 },
  };
  const sent = [];
  const unsubscribe = registerFeaturePackIpc({
    ipcMain,
    packs,
    mainWindow: () => mainWindow,
    sendEvent: (channel, change) => sent.push({ channel, change }),
  });
  t.after(unsubscribe);
  const invoke = (name, event, ...args) => (
    handlers.get(`cats-host:feature-pack-${name}`)(event, ...args)
  );

  assert.deepEqual(
    [...handlers.keys()].sort(),
    ['cancel', 'check', 'download', 'get', 'list', 'pause', 'remove', 'resume']
      .map((name) => `cats-host:feature-pack-${name}`),
  );
  const [listed] = await invoke('list', fromMain);
  assert.equal(listed.status, 'not_installed');
  await assert.rejects(invoke('list', fromSubframe), /only available to the main Cats window/u);
  await assert.rejects(invoke('get', fromMain, 'other-pack'), /Unknown optional download/u);
  await assert.rejects(invoke('download', fromMain, { id: ID }), /Unknown optional download/u);

  assert.equal(await invoke('download', fromMain, ID), undefined, 'returns once started');
  await waitFor(
    () => sent.some(({ change }) => change.snapshot.status === 'installed'),
    'installed',
  );
  assert.ok(sent.every(({ channel }) => channel === 'cats-host:feature-pack-event'));
  assert.equal((await invoke('check', fromMain, ID)).status, 'installed');
  await invoke('remove', fromMain, ID);
  assert.equal((await invoke('get', fromMain, ID)).status, 'not_installed');
});

function fakeNet(respond) {
  const requests = [];
  return {
    requests,
    request(options) {
      const emitter = new EventEmitter();
      const request = {
        options,
        headers: {},
        aborted: false,
        setHeader(name, value) {
          this.headers[name] = value;
        },
        on(name, listener) {
          emitter.on(name, listener);
          return this;
        },
        abort() {
          this.aborted = true;
        },
        end() {
          setImmediate(() => respond(emitter, request));
        },
      };
      requests.push(request);
      return request;
    },
  };
}

test('the Electron transport returns redirects, streams responses and aborts', async () => {
  const redirecting = fakeNet((emitter) => {
    emitter.emit('redirect', 302, 'GET', 'http://mirror.invalid/pack');
  });
  const redirect = await createElectronFeaturePackTransport(redirecting).request({
    url: 'https://example.invalid/pack',
    headers: { range: 'bytes=10-' },
    signal: new AbortController().signal,
  });
  assert.equal(redirect.status, 302);
  assert.equal(redirect.headers.location, 'http://mirror.invalid/pack');
  assert.deepEqual(redirecting.requests[0].options, {
    url: 'https://example.invalid/pack',
    method: 'GET',
    redirect: 'manual',
  });
  assert.equal(redirecting.requests[0].headers.range, 'bytes=10-');
  assert.equal(redirecting.requests[0].aborted, true);

  const streaming = fakeNet((emitter) => {
    emitter.emit('response', Object.assign(Readable.from([Buffer.from('ab'), Buffer.from('c')]), {
      statusCode: 206,
      headers: { 'Content-Range': 'bytes 10-12/13', 'X-Many': ['a', 'b'] },
    }));
  });
  const response = await createElectronFeaturePackTransport(streaming).request({
    url: 'https://example.invalid/pack',
    headers: {},
    signal: new AbortController().signal,
  });
  assert.equal(response.status, 206);
  assert.equal(response.headers['content-range'], 'bytes 10-12/13');
  assert.equal(response.headers['x-many'], 'a, b');
  const chunks = [];
  for await (const chunk of response.body) {
    chunks.push(Buffer.from(chunk));
  }
  assert.equal(Buffer.concat(chunks).toString(), 'abc');

  const opaque = fakeNet((emitter) => {
    emitter.emit('response', { statusCode: 200, headers: {} });
  });
  await assert.rejects(
    createElectronFeaturePackTransport(opaque).request({
      url: 'https://example.invalid/pack',
      headers: {},
      signal: new AbortController().signal,
    }),
    /not a readable stream/u,
  );

  const failing = fakeNet((emitter) => {
    emitter.emit('error', new Error('net::ERR_CONNECTION_RESET'));
  });
  await assert.rejects(
    createElectronFeaturePackTransport(failing).request({
      url: 'https://example.invalid/pack',
      headers: {},
      signal: new AbortController().signal,
    }),
    /ERR_CONNECTION_RESET/u,
  );

  const silent = fakeNet(() => {});
  const controller = new AbortController();
  const pending = createElectronFeaturePackTransport(silent).request({
    url: 'https://example.invalid/pack',
    headers: {},
    signal: controller.signal,
  });
  controller.abort(new Error('paused'));
  await assert.rejects(pending, /paused/u);
  assert.equal(silent.requests[0].aborted, true);
});

test('Linux voice without a usable pack reports pack_required', async (t) => {
  const withoutPack = [];
  await linuxController(withoutPack, null).startVoiceCapture({ sessionId: 's1' });
  assert.deepEqual(withoutPack, [
    { type: 'error', sessionId: 's1', reason: 'pack_required' },
    { type: 'end', sessionId: 's1' },
  ]);

  const { packs } = await packsFixture(t);
  const notInstalled = [];
  await linuxController(notInstalled, packHelper(packs)).startVoiceCapture({ sessionId: 's2' });
  assert.deepEqual(notInstalled, [
    { type: 'error', sessionId: 's2', reason: 'pack_required' },
    { type: 'end', sessionId: 's2' },
  ]);
});

test('a stop while the pack check runs ends the session without a helper', async () => {
  const events = [];
  let released = false;
  const featurePack = {
    acquireHelper: () => new Promise((resolve) => {
      setTimeout(() => resolve({
        entryPath: join(tmpdir(), 'cats-missing-helper'),
        release: () => {
          released = true;
        },
      }), 20);
    }),
  };
  const controller = linuxController(events, featurePack);
  const starting = controller.startVoiceCapture({ sessionId: 's1' });
  await controller.stopVoiceCapture('s1');
  await starting;
  assert.deepEqual(events, [{ type: 'end', sessionId: 's1' }]);
  assert.equal(released, true);
});

test('a newer start supersedes one waiting for the pack check', async () => {
  const events = [];
  const released = [];
  const featurePack = {
    acquireHelper: () => new Promise((resolve) => {
      setTimeout(() => resolve({
        entryPath: join(tmpdir(), 'cats-missing-helper'),
        release: () => {
          released.push(true);
        },
      }), 20);
    }),
  };
  const controller = linuxController(events, featurePack);

  await Promise.all([
    controller.startVoiceCapture({ sessionId: 's1' }),
    controller.startVoiceCapture({ sessionId: 's2' }),
  ]);

  assert.deepEqual(events, [
    { type: 'end', sessionId: 's1' },
    { type: 'error', sessionId: 's2', reason: 'engine_unavailable' },
    { type: 'end', sessionId: 's2' },
  ]);
  assert.equal(released.length, 2, 'both leases are released');
});

test('the pack helper dictates, ignores the renderer locale and reports processing', async (t) => {
  const { packs } = await packsFixture(t);
  await packs.manager.download(ID);
  const events = [];
  const controller = linuxController(events, packHelper(packs));

  await controller.startVoiceCapture({ sessionId: 's1', locale: 'en-US' });
  await waitFor(() => events.some((event) => event.type === 'ready'), 'ready');
  await controller.stopVoiceCapture('s1');
  await waitFor(ended(events), 'end');

  assert.deepEqual(events, [
    { type: 'ready', sessionId: 's1', locale: 'auto', mode: 'on-device' },
    { type: 'processing', sessionId: 's1' },
    { type: 'final', sessionId: 's1', text: 'fixture transcript' },
    { type: 'end', sessionId: 's1' },
  ]);
});

test('a saved subtag reaches the pack helper, and one the pack lacks runs as Automatic', async (t) => {
  // SPEC-145 FR-C5, SPEC-146 FR-5: the host reads the setting at each start and
  // checks it against the leased version's manifest languages.
  const { packs } = await packsFixture(t);
  await packs.manager.download(ID);
  let saved = 'zh';
  const readyLocale = async (sessionId) => {
    const events = [];
    const controller = linuxController(events, packHelper(packs), {
      dictationLanguage: async () => saved,
    });
    await controller.startVoiceCapture({ sessionId, locale: 'en-US' });
    await waitFor(() => events.some((event) => event.type === 'ready'), 'ready');
    await controller.cancelVoiceCapture(sessionId);
    await waitFor(ended(events), 'end');
    return events.find((event) => event.type === 'ready').locale;
  };

  assert.equal(await readyLocale('saved'), 'zh');
  saved = 'de';
  assert.equal(await readyLocale('unlisted'), 'auto', 'a subtag the manifest lacks detects instead');
  saved = 'auto';
  assert.equal(await readyLocale('automatic'), 'auto');
});

test('every FR-D6 helper outcome reaches the renderer through the host', async (t) => {
  const { packs } = await packsFixture(t);
  await packs.manager.download(ID);
  const cases = [
    {
      scenario: 'mic_unavailable',
      expected: [{ type: 'error', reason: 'mic_unavailable' }, { type: 'end' }],
    },
    {
      scenario: 'engine_unavailable',
      expected: [{ type: 'error', reason: 'engine_unavailable' }, { type: 'end' }],
    },
    {
      scenario: 'overrun',
      expected: [
        { type: 'ready', locale: 'auto', mode: 'on-device' },
        { type: 'error', reason: 'aborted' },
        { type: 'end' },
      ],
    },
    {
      scenario: 'final',
      cancel: true,
      expected: [
        { type: 'ready', locale: 'auto', mode: 'on-device' },
        { type: 'error', reason: 'cancelled' },
        { type: 'end' },
      ],
    },
    {
      scenario: 'exit_before_ready',
      expected: [{ type: 'error', reason: 'helper_crashed' }, { type: 'end' }],
    },
    {
      scenario: 'no_ready',
      options: { readyTimeoutMs: 200 },
      expected: [{ type: 'error', reason: 'engine_unavailable' }, { type: 'end' }],
    },
    {
      scenario: 'hang_on_stop',
      stop: true,
      options: { stopCleanupTimeoutMs: 200 },
      expected: [
        { type: 'ready', locale: 'auto', mode: 'on-device' },
        { type: 'processing' },
        { type: 'error', reason: 'engine_unavailable' },
        { type: 'end' },
      ],
    },
  ];
  for (const { scenario, cancel, stop, options = {}, expected } of cases) {
    const events = [];
    const controller = linuxController(events, packHelper(packs), {
      env: { CATS_STT_FIXTURE_SCENARIO: scenario },
      ...options,
    });
    await controller.startVoiceCapture({ sessionId: 's1' });
    if (cancel || stop) {
      await waitFor(() => events.some((event) => event.type === 'ready'), `${scenario} ready`);
      await (cancel ? controller.cancelVoiceCapture('s1') : controller.stopVoiceCapture('s1'));
    }
    await waitFor(ended(events), `${scenario} end`);
    assert.deepEqual(events, expected.map((event) => ({ ...event, sessionId: 's1' })), scenario);
  }
});

test('the recording cap warns, then stops as the owner would', async (t) => {
  const { packs } = await packsFixture(t);
  await packs.manager.download(ID);
  const events = [];
  const controller = linuxController(events, packHelper(packs), {
    recordingWarningMs: 100,
    recordingLimitMs: 1_100,
  });

  await controller.startVoiceCapture({ sessionId: 's1' });
  await waitFor(ended(events), 'end');

  assert.deepEqual(events, [
    { type: 'ready', sessionId: 's1', locale: 'auto', mode: 'on-device' },
    { type: 'limit_warning', sessionId: 's1', secondsRemaining: 1 },
    { type: 'processing', sessionId: 's1' },
    { type: 'final', sessionId: 's1', text: 'fixture transcript' },
    { type: 'end', sessionId: 's1' },
  ]);
});

test('removing the pack stops a running helper first', async (t) => {
  const { packs } = await packsFixture(t);
  await packs.manager.download(ID);
  const events = [];
  const controller = linuxController(events, packHelper(packs));
  await controller.startVoiceCapture({ sessionId: 's1' });
  await waitFor(() => events.some((event) => event.type === 'ready'), 'ready');

  await packs.manager.remove(ID);

  assert.deepEqual(events.slice(1), [
    { type: 'error', sessionId: 's1', reason: 'aborted' },
    { type: 'end', sessionId: 's1' },
  ]);
  assert.equal((await packs.manager.get(ID)).status, 'not_installed');
});

test('the renderer stays denied the microphone (FR-D8)', () => {
  assert.equal(shouldAllowDesktopRendererPermission('media'), false);
  assert.equal(shouldAllowDesktopRendererPermission('audioCapture'), false);
});
