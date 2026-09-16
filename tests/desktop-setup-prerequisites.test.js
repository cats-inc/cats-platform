import assert from 'node:assert/strict';
import test from 'node:test';
import { DesktopPrerequisiteChecks } from '../build/desktop/setupPrerequisites.js';

const ready = { runState: 'completed', status: 'ready', summary: 'Ready', warnings: [], manualSteps: [], plannedActions: [] };

test('prerequisite observations are retained independently and passive reads do not run helpers', async () => {
  const checks = new DesktopPrerequisiteChecks('windows');
  assert.equal(checks.read().length, 3);
  assert.ok(checks.read().every((entry) => !entry.checking && entry.result === null));
  await checks.run('windows-node-host-installer', async () => ready);
  await checks.run('windows-github-cli-installer', async () => ({ ...ready, status: 'not_installed' }));
  await checks.run('windows-codex-native-installer', async () => ({ ...ready, status: 'failed' }));
  assert.equal(checks.read()[0].result.status, 'ready');
  assert.equal(checks.read()[1].result, null);
  assert.equal(checks.read()[2].result.status, 'not_installed');
});

test('a slow background check cannot overwrite a newer explicit prerequisite installation', async () => {
  const checks = new DesktopPrerequisiteChecks('linux');
  let finish;
  const gate = new Promise((resolve) => { finish = resolve; });
  const events = [];
  const check = checks.run('linux-node-host-installer', async () => {
    events.push('check'); await gate; return { ...ready, status: 'not_installed' };
  });
  const install = checks.run('linux-node-host-installer', async () => { events.push('install'); return ready; });
  await Promise.resolve();
  assert.deepEqual(events, ['check']);
  assert.equal(checks.read()[0].checking, true);
  finish(); await Promise.all([check, install]);
  assert.deepEqual(events, ['check', 'install']);
  assert.equal(checks.read()[0].checking, false);
  assert.equal(checks.read()[0].result.status, 'ready');
});

test('a failed check remains retryable without claiming a missing installation', async () => {
  const checks = new DesktopPrerequisiteChecks('macos');
  await assert.rejects(checks.run('macos-node-host-installer', async () => { throw new Error('Probe timeout'); }), /timeout/);
  assert.equal(checks.read()[0].result.runState, 'failed');
  assert.equal(checks.read()[0].checking, false);
  await checks.run('macos-node-host-installer', async () => ready);
  assert.equal(checks.read()[0].result.status, 'ready');
});
