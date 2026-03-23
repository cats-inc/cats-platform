import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createAppStartupState,
  formatAppReadyMessage,
  getAppHelpText,
  getAppReadinessSnapshot,
  parseAppCliOptions,
  resolveAppStartupState,
} from '../dist-server/app/server/startup.js';

test('parseAppCliOptions accepts app-managed lifecycle flags', () => {
  const options = parseAppCliOptions([
    '--startup-mode=app-managed',
    '--managed-by',
    'cats-electron',
    '--ready-output',
    'json',
  ]);

  assert.equal(options.startupMode, 'app-managed');
  assert.equal(options.managedBy, 'cats-electron');
  assert.equal(options.readyOutput, 'json');
});

test('resolveAppStartupState prefers explicit app-managed settings', () => {
  const startup = resolveAppStartupState(
    {
      startupMode: 'app-managed',
      managedBy: 'cats-electron',
    },
    {},
  );

  assert.equal(startup.mode, 'app-managed');
  assert.equal(startup.managedBy, 'cats-electron');
  assert.equal(startup.readyOutput, 'json');
});

test('app startup readiness snapshot only flips true when the phase is ready', () => {
  const startup = createAppStartupState({
    mode: 'app-managed',
    ready: true,
    phase: 'starting',
  });

  assert.equal(getAppReadinessSnapshot(startup).ready, false);

  startup.phase = 'ready';
  assert.equal(getAppReadinessSnapshot(startup).ready, true);
});

test('formatAppReadyMessage emits structured json when the app is host-managed', () => {
  const startup = createAppStartupState({
    mode: 'app-managed',
    managedBy: 'cats-electron',
    readyOutput: 'json',
    ready: true,
    phase: 'ready',
  });

  const line = formatAppReadyMessage(startup, {
    host: '127.0.0.1',
    port: 8181,
    healthUrl: 'http://127.0.0.1:8181/health',
  });
  assert.ok(line);

  const payload = JSON.parse(line);
  assert.equal(payload.event, 'app.ready');
  assert.equal(payload.mode, 'app-managed');
  assert.equal(payload.managedBy, 'cats-electron');
  assert.equal(payload.healthUrl, 'http://127.0.0.1:8181/health');
});

test('getAppHelpText documents the startup contract flags', () => {
  const help = getAppHelpText();
  assert.match(help, /--startup-mode <standalone\|app-managed>/);
  assert.match(help, /--managed-by <name>/);
  assert.match(help, /--ready-output <plain\|json\|silent>/);
});
