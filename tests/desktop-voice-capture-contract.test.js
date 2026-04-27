import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';

import {
  DESKTOP_VOICE_CAPTURE_CANCEL_CHANNEL,
  DESKTOP_VOICE_CAPTURE_EVENT_CHANNEL,
  DESKTOP_VOICE_CAPTURE_START_CHANNEL,
  DESKTOP_VOICE_CAPTURE_STOP_CHANNEL,
  VOICE_CAPTURE_ERROR_REASONS,
  VOICE_CAPTURE_MODES,
} from '../build/desktop/contracts.js';
import {
  DesktopVoiceCaptureController,
  LINUX_STOP_CLEANUP_TIMEOUT_MS,
  isMainWindowVoiceCaptureIpcSender,
  parseVoiceCaptureHelperEvent,
  parseVoiceCaptureSessionId,
  parseVoiceCaptureStartOptions,
  resolveVoiceCaptureHelperPath,
  shouldAllowDesktopRendererPermission,
} from '../build/desktop/voiceCapture.js';

test('desktop voice capture contract exposes channels, modes, and closed errors', () => {
  assert.equal(DESKTOP_VOICE_CAPTURE_START_CHANNEL, 'cats-host:voice-start');
  assert.equal(DESKTOP_VOICE_CAPTURE_STOP_CHANNEL, 'cats-host:voice-stop');
  assert.equal(DESKTOP_VOICE_CAPTURE_CANCEL_CHANNEL, 'cats-host:voice-cancel');
  assert.equal(DESKTOP_VOICE_CAPTURE_EVENT_CHANNEL, 'cats-host:voice-event');
  assert.deepEqual(VOICE_CAPTURE_MODES, ['on-device', 'cloud', 'unknown']);
  assert.deepEqual(VOICE_CAPTURE_ERROR_REASONS, [
    'permission_denied',
    'permission_not_determined',
    'mic_unavailable',
    'language_not_supported',
    'engine_unavailable',
    'helper_crashed',
    'cancelled',
    'aborted',
  ]);
});

test('desktop voice capture validates renderer payloads and sender identity', () => {
  assert.deepEqual(
    parseVoiceCaptureStartOptions({ sessionId: ' session-1 ', locale: ' en-US ' }),
    { sessionId: 'session-1', locale: 'en-US' },
  );
  assert.deepEqual(
    parseVoiceCaptureStartOptions({ sessionId: 'session-1' }),
    { sessionId: 'session-1' },
  );
  assert.equal(parseVoiceCaptureSessionId(' session-1 '), 'session-1');
  assert.throws(() => parseVoiceCaptureStartOptions({ sessionId: '' }), /Invalid/u);
  assert.throws(() => parseVoiceCaptureStartOptions({ sessionId: 'x', locale: '' }), /Invalid/u);
  assert.throws(() => parseVoiceCaptureSessionId(''), /Invalid/u);

  const mainWebContents = {};
  assert.equal(
    isMainWindowVoiceCaptureIpcSender({ sender: mainWebContents }, { webContents: mainWebContents }),
    true,
  );
  assert.equal(
    isMainWindowVoiceCaptureIpcSender({ sender: {} }, { webContents: mainWebContents }),
    false,
  );
  assert.equal(isMainWindowVoiceCaptureIpcSender({ sender: mainWebContents }, null), false);
});

test('desktop renderer permission policy denies media and allows display capture only', () => {
  assert.equal(shouldAllowDesktopRendererPermission('display-capture'), true);
  assert.equal(shouldAllowDesktopRendererPermission('media'), false);
  assert.equal(shouldAllowDesktopRendererPermission('microphone'), false);
  assert.equal(shouldAllowDesktopRendererPermission('camera'), false);
  assert.equal(shouldAllowDesktopRendererPermission('notifications'), false);
});

test('desktop voice capture helper path honors platform and env overrides', () => {
  const config = {
    packaged: false,
    packageRoot: '/repo/cats-platform',
  };

  assert.equal(
    resolveVoiceCaptureHelperPath({
      config,
      platform: 'darwin',
      env: {},
    }),
    '/repo/cats-platform/desktop/native/macos-stt/.build/release/cats-stt-macos',
  );
  assert.equal(
    resolveVoiceCaptureHelperPath({
      config,
      platform: 'win32',
      env: { CATS_STT_WINDOWS_HELPER: 'C:\\cats\\stt.exe' },
    }),
    'C:\\cats\\stt.exe',
  );
  assert.equal(
    resolveVoiceCaptureHelperPath({
      config,
      platform: 'linux',
      env: {},
    }),
    '/repo/cats-platform/desktop/native/linux-stt/build/cats-stt-linux',
  );
  assert.equal(
    resolveVoiceCaptureHelperPath({
      config,
      platform: 'linux',
      env: { CATS_STT_LINUX_HELPER: '/opt/custom/cats-stt-linux' },
    }),
    '/opt/custom/cats-stt-linux',
  );
  assert.equal(
    resolveVoiceCaptureHelperPath({
      config: { packaged: true, packageRoot: '/repo/cats-platform' },
      platform: 'linux',
      env: {},
      resourcesPath: '/opt/Cats/resources',
    }),
    '/opt/Cats/resources/native/linux-stt/cats-stt-linux',
  );
  assert.equal(
    resolveVoiceCaptureHelperPath({
      config,
      platform: 'freebsd',
      env: {},
    }),
    null,
  );
});

test('desktop voice capture stop cleanup window defaults to 60s on Linux', () => {
  const linuxController = new DesktopVoiceCaptureController({
    config: { packaged: false, packageRoot: '/tmp' },
    platform: 'linux',
    env: {},
    sendEvent: () => {},
    logLine: () => {},
  });
  assert.equal(linuxController.stopCleanupTimeoutMs, LINUX_STOP_CLEANUP_TIMEOUT_MS);
  assert.equal(linuxController.stopCleanupTimeoutMs, 60_000);

  const darwinController = new DesktopVoiceCaptureController({
    config: { packaged: false, packageRoot: '/tmp' },
    platform: 'darwin',
    env: {},
    sendEvent: () => {},
    logLine: () => {},
  });
  assert.equal(darwinController.stopCleanupTimeoutMs, 5_000);

  const win32Controller = new DesktopVoiceCaptureController({
    config: { packaged: false, packageRoot: '/tmp' },
    platform: 'win32',
    env: {},
    sendEvent: () => {},
    logLine: () => {},
  });
  assert.equal(win32Controller.stopCleanupTimeoutMs, 5_000);

  // Explicit overrides still win on Linux.
  const overriddenLinux = new DesktopVoiceCaptureController({
    config: { packaged: false, packageRoot: '/tmp' },
    platform: 'linux',
    env: {},
    sendEvent: () => {},
    logLine: () => {},
    stopCleanupTimeoutMs: 200,
  });
  assert.equal(overriddenLinux.stopCleanupTimeoutMs, 200);

  // Cancel cleanup default is unaffected by platform — cancel is always 1 s.
  assert.equal(linuxController.cancelCleanupTimeoutMs, 1_000);
  assert.equal(darwinController.cancelCleanupTimeoutMs, 1_000);
});

test('desktop voice capture parses helper events defensively', () => {
  assert.deepEqual(
    parseVoiceCaptureHelperEvent(JSON.stringify({
      type: 'ready',
      sessionId: 's1',
      locale: 'en-US',
      mode: 'on-device',
    })),
    { type: 'ready', sessionId: 's1', locale: 'en-US', mode: 'on-device' },
  );
  assert.deepEqual(
    parseVoiceCaptureHelperEvent(JSON.stringify({ type: 'final', sessionId: 's1', text: 'hello' })),
    { type: 'final', sessionId: 's1', text: 'hello' },
  );
  assert.deepEqual(
    parseVoiceCaptureHelperEvent(JSON.stringify({
      type: 'error',
      sessionId: 's1',
      reason: 'permission_denied',
    })),
    { type: 'error', sessionId: 's1', reason: 'permission_denied' },
  );
  assert.equal(
    parseVoiceCaptureHelperEvent(JSON.stringify({ type: 'ready', sessionId: 's1', mode: 'local' })),
    null,
  );
  assert.equal(
    parseVoiceCaptureHelperEvent(JSON.stringify({ type: 'error', sessionId: 's1', reason: 'bad' })),
    null,
  );
  assert.equal(parseVoiceCaptureHelperEvent('not json'), null);
});

test('desktop voice capture reports unavailable when the helper is missing', async () => {
  const events = [];
  const controller = new DesktopVoiceCaptureController({
    config: {
      packaged: false,
      packageRoot: '/tmp/missing-cats-platform',
    },
    platform: 'darwin',
    env: {},
    sendEvent: (event) => events.push(event),
    logLine: () => {},
  });

  await controller.startVoiceCapture({ sessionId: 's1', locale: 'en-US' });

  assert.deepEqual(events, [
    { type: 'error', sessionId: 's1', reason: 'engine_unavailable' },
    { type: 'end', sessionId: 's1' },
  ]);
});

test('desktop voice capture ready timeout reports unavailable and kills the helper', async () => {
  const workingDir = await mkdtemp(join(tmpdir(), 'cats-voice-helper-'));
  const helperPath = join(workingDir, 'helper');
  await writeFile(helperPath, '#!/bin/sh\n', 'utf8');
  const events = [];
  const child = createFakeChildProcess();
  const controller = new DesktopVoiceCaptureController({
    config: {
      packaged: false,
      packageRoot: workingDir,
    },
    platform: 'darwin',
    env: { CATS_VOICE_CAPTURE_HELPER: helperPath },
    sendEvent: (event) => events.push(event),
    spawnProcess: () => child,
    readyTimeoutMs: 5,
    logLine: () => {},
  });

  await controller.startVoiceCapture({ sessionId: 's1', locale: 'en-US' });
  await new Promise((resolve) => {
    setTimeout(resolve, 25);
  });

  assert.deepEqual(events, [
    { type: 'error', sessionId: 's1', reason: 'engine_unavailable' },
    { type: 'end', sessionId: 's1' },
  ]);
  assert.equal(child.killed, true);
});

test('desktop voice capture forwards current-session helper events and stop commands', async () => {
  const workingDir = await mkdtemp(join(tmpdir(), 'cats-voice-helper-'));
  const helperPath = join(workingDir, 'helper');
  await writeFile(helperPath, '#!/bin/sh\n', 'utf8');
  const events = [];
  const child = createFakeChildProcess();
  const controller = new DesktopVoiceCaptureController({
    config: {
      packaged: false,
      packageRoot: workingDir,
    },
    platform: 'darwin',
    env: { CATS_VOICE_CAPTURE_HELPER: helperPath },
    sendEvent: (event) => events.push(event),
    spawnProcess: () => child,
    logLine: () => {},
  });

  await controller.startVoiceCapture({ sessionId: 's1', locale: 'en-US' });
  child.stdout.emit('data', Buffer.from(`${JSON.stringify({
    type: 'ready',
    sessionId: 's1',
    locale: 'en-US',
    mode: 'unknown',
  })}\n`));
  child.stdout.emit('data', Buffer.from(`${JSON.stringify({
    type: 'partial',
    sessionId: 'stale',
    text: 'ignored',
  })}\n`));
  child.stdout.emit('data', Buffer.from(`${JSON.stringify({
    type: 'final',
    sessionId: 's1',
    text: 'hello',
  })}\n`));
  await controller.stopVoiceCapture('s1');
  child.stdout.emit('data', Buffer.from(`${JSON.stringify({ type: 'end', sessionId: 's1' })}\n`));

  assert.deepEqual(events, [
    { type: 'ready', sessionId: 's1', locale: 'en-US', mode: 'unknown' },
    { type: 'final', sessionId: 's1', text: 'hello' },
    { type: 'end', sessionId: 's1' },
  ]);
  assert.deepEqual(child.stdin.writes, [
    `${JSON.stringify({ type: 'stop', sessionId: 's1' })}\n`,
  ]);
});

test('desktop voice capture uses different cleanup windows for stop vs cancel', async () => {
  const workingDir = await mkdtemp(join(tmpdir(), 'cats-voice-helper-'));
  const helperPath = join(workingDir, 'helper');
  await writeFile(helperPath, '#!/bin/sh\n', 'utf8');

  async function startReadySession({ stopCleanupTimeoutMs, cancelCleanupTimeoutMs, sessionId }) {
    const events = [];
    const child = createFakeChildProcess();
    const controller = new DesktopVoiceCaptureController({
      config: { packaged: false, packageRoot: workingDir },
      platform: 'darwin',
      env: { CATS_VOICE_CAPTURE_HELPER: helperPath },
      sendEvent: (event) => events.push(event),
      spawnProcess: () => child,
      stopCleanupTimeoutMs,
      cancelCleanupTimeoutMs,
      logLine: () => {},
    });
    await controller.startVoiceCapture({ sessionId });
    child.stdout.emit('data', Buffer.from(`${JSON.stringify({
      type: 'ready',
      sessionId,
      locale: 'en-US',
      mode: 'on-device',
    })}\n`));
    return { child, controller, events };
  }

  // Cancel honors the short cleanup window and kills the helper inside it.
  const cancelRun = await startReadySession({
    stopCleanupTimeoutMs: 1_000,
    cancelCleanupTimeoutMs: 10,
    sessionId: 'cancel-window',
  });
  await cancelRun.controller.cancelVoiceCapture('cancel-window');
  await new Promise((resolve) => { setTimeout(resolve, 60); });
  assert.equal(
    cancelRun.child.killed,
    true,
    'cancel should kill the helper within cancelCleanupTimeoutMs',
  );

  // Stop uses the longer cleanup window — the helper must still be alive past
  // the cancel window so buffered finals can flush.
  const stopRun = await startReadySession({
    stopCleanupTimeoutMs: 200,
    cancelCleanupTimeoutMs: 10,
    sessionId: 'stop-window',
  });
  await stopRun.controller.stopVoiceCapture('stop-window');
  await new Promise((resolve) => { setTimeout(resolve, 60); });
  assert.equal(
    stopRun.child.killed,
    false,
    'stop should still be inside its cleanup window after the cancel window has elapsed',
  );
  await new Promise((resolve) => { setTimeout(resolve, 200); });
  assert.equal(
    stopRun.child.killed,
    true,
    'stop should eventually kill the helper after stopCleanupTimeoutMs',
  );
});

function createFakeChildProcess() {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.killed = false;
  child.kill = () => {
    child.killed = true;
    return true;
  };
  child.stdin = {
    writes: [],
    write(value) {
      this.writes.push(value);
      return true;
    },
  };
  return child;
}
