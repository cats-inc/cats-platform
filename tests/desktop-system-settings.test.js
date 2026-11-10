import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DESKTOP_LOGIN_ITEM_APPROVAL_CHANNEL,
  DESKTOP_SYSTEM_SETTINGS_OPEN_CHANNEL,
  DESKTOP_SYSTEM_SETTINGS_PANES,
} from '../build/desktop/contracts.js';
import {
  MACOS_SYSTEM_SETTINGS_URLS,
  createScreenCaptureAccessRequester,
  loginItemNeedsApproval,
  parseScreenCaptureRequestOutput,
  resolveMacosSystemSettingsUrl,
} from '../build/desktop/systemSettings.js';

// ADR-147: the host opens a fixed set of System Settings panes, by name.

test('each pane has one constant macOS URL, and nothing else resolves', () => {
  assert.equal(DESKTOP_SYSTEM_SETTINGS_OPEN_CHANNEL, 'cats-host:open-system-settings');
  assert.equal(DESKTOP_LOGIN_ITEM_APPROVAL_CHANNEL, 'cats-host:login-item-needs-approval');
  assert.deepEqual(Object.keys(MACOS_SYSTEM_SETTINGS_URLS), [...DESKTOP_SYSTEM_SETTINGS_PANES]);
  assert.equal(resolveMacosSystemSettingsUrl('microphone'),
    'x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone');
  assert.equal(resolveMacosSystemSettingsUrl('speech_recognition'),
    'x-apple.systempreferences:com.apple.preference.security?Privacy_SpeechRecognition');
  assert.equal(resolveMacosSystemSettingsUrl('screen_recording'),
    'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture');
  assert.equal(resolveMacosSystemSettingsUrl('login_items'),
    'x-apple.systempreferences:com.apple.LoginItems-Settings.extension');
  for (const value of ['accessibility', 'x-apple.systempreferences:com.apple.preference.security', '', null, 7, {}]) {
    assert.throws(() => resolveMacosSystemSettingsUrl(value), /Unknown System Settings pane/u);
  }
});

test('the login item needs approval only for a packaged macOS app that macOS says so for', () => {
  const app = (status, isPackaged = true) => ({ isPackaged, getLoginItemSettings: () => ({ status }) });
  assert.equal(loginItemNeedsApproval(app('requires-approval'), { platform: 'darwin' }), true);
  for (const status of ['enabled', 'not-registered', 'not-found', undefined]) {
    assert.equal(loginItemNeedsApproval(app(status), { platform: 'darwin' }), false, String(status));
  }
  assert.equal(loginItemNeedsApproval(app('requires-approval', false), { platform: 'darwin' }), false, 'a dev run');
  assert.equal(loginItemNeedsApproval(app('requires-approval'), { platform: 'darwin', candidate: true }), false);
  assert.equal(loginItemNeedsApproval(app('requires-approval'), { platform: 'win32' }), false);
  const throwing = { isPackaged: true, getLoginItemSettings: () => { throw new Error('unavailable'); } };
  assert.equal(loginItemNeedsApproval(throwing, { platform: 'darwin' }), false);
});

test('Screen Recording access is requested once per run, through the helper, and never blocks the capture', async () => {
  const calls = [];
  const logged = [];
  const request = createScreenCaptureAccessRequester({
    resolveHelperPath: () => '/Applications/Cats.app/Contents/Resources/native/macos-stt/cats-stt-macos',
    run: async (helperPath, args) => {
      calls.push([helperPath, ...args]);
      return '{"type":"screen_capture","granted":false}\n';
    },
    log: (fields) => logged.push(fields),
  });
  assert.equal(await request(), true);
  assert.equal(await request(), false, 'a second capture in the same run does not ask again');
  assert.deepEqual(calls, [[
    '/Applications/Cats.app/Contents/Resources/native/macos-stt/cats-stt-macos',
    '--request-screen-capture',
  ]]);
  assert.deepEqual(logged, [{ granted: false }]);

  const failing = createScreenCaptureAccessRequester({
    resolveHelperPath: () => '/missing/helper',
    run: async () => { throw Object.assign(new Error('spawn ENOENT'), { code: 'ENOENT' }); },
    log: (fields) => logged.push(fields),
  });
  assert.equal(await failing(), true);
  assert.deepEqual(logged.at(-1), { error: 'ENOENT' });

  let ran = false;
  const noHelper = createScreenCaptureAccessRequester({
    resolveHelperPath: () => null,
    run: async () => { ran = true; return ''; },
  });
  assert.equal(await noHelper(), false);
  assert.equal(ran, false);
});

test('the helper reply is read strictly', () => {
  assert.equal(parseScreenCaptureRequestOutput('{"type":"screen_capture","granted":true}\n'), true);
  assert.equal(parseScreenCaptureRequestOutput('{"type":"screen_capture","granted":false}'), false);
  assert.equal(parseScreenCaptureRequestOutput('{"type":"ready","granted":true}'), undefined);
  assert.equal(parseScreenCaptureRequestOutput('not json'), undefined);
});
