import assert from 'node:assert/strict';
import test from 'node:test';
import { DesktopProviderManager } from '../build/desktop/providerManager.js';
import { nativeSetupTarget, targetKey } from '../build/desktop/providerSelection.js';

const codex = nativeSetupTarget('codex');
const claude = nativeSetupTarget('claude');
const result = { status: 'ready', runState: 'completed', summary: 'Installed', warnings: [], manualSteps: [], plannedActions: [] };
function fixture(overrides = {}) {
  const calls = [];
  const runtime = { selection: { state: 'selected', revision: 'one', targets: [codex, claude],
    nativeSetupTargets: [codex, claude], diskChanged: false, error: null }, universe: [], observations: [],
    state: { status: 'ready', error: null }, scan: null };
  const helpers = ['codex-native-installer', 'claude-native-installer', 'node-host-installer', 'npm-prefix-helper']
    .map((suffix) => ({ id: `windows-${suffix}`, available: true, supported: true, supportsApply: true,
      supportsUpgrade: true, supportsForce: true, supportsUninstall: true }));
  const manager = new DesktopProviderManager({ platform: 'windows', helpers: async () => helpers,
    changed: async () => {}, wait: async () => {},
    request: async (path, init) => {
      const body = init?.body ? JSON.parse(init.body) : null;
      calls.push({ path, body });
      if (path === '/setup-state') return structuredClone(runtime);
      if (path === '/setup-selection') {
        runtime.selection = { ...runtime.selection, revision: 'two', targets: body.targets, state: body.targets.length ? 'selected' : 'empty' };
        return {};
      }
      if (path === '/setup-scan') {
        runtime.state = { status: 'ready', scanId: 'scan-1', error: null };
        return { scanId: 'scan-1' };
      }
      throw new Error(`Unexpected ${path}`);
    },
    helper: async (...args) => { calls.push({ helper: args }); return structuredClone(result); }, ...overrides });
  return { runtime, helpers, calls, manager };
}

test('passive reads and apply without detection spend no provider work', async () => {
  const f = fixture();
  await f.manager.read();
  await f.manager.apply({ targets: [codex], expectedRevision: 'one', detectAfter: false });
  assert.equal(f.calls.some((entry) => entry.path === '/setup-scan' || entry.helper), false);
  assert.deepEqual(f.runtime.selection.targets, [codex]);
});

test('one row install checks prerequisites and verifies exactly that target once with its revision', async () => {
  const f = fixture();
  await f.manager.run({ action: 'install', targets: [codex], expectedRevision: 'one' });
  assert.deepEqual(f.calls.filter((entry) => entry.helper).map((entry) => entry.helper), [
    ['windows-node-host-installer', 'check', false, 'one'], ['windows-npm-prefix-helper', 'check', false, 'one'],
    ['windows-codex-native-installer', 'apply', false, 'one'],
  ]);
  assert.deepEqual(f.calls.filter((entry) => entry.path === '/setup-scan').map((entry) => entry.body), [
    { targets: [codex], expectedRevision: 'one', manual: true, includeConnections: true },
  ]);
});

test('stale or unselected actions never reach helpers or scans', async () => {
  const f = fixture();
  await assert.rejects(f.manager.run({ action: 'install', targets: [codex], expectedRevision: 'old' }), /changed/);
  await assert.rejects(f.manager.run({ action: 'detect', targets: [nativeSetupTarget('pi')], expectedRevision: 'one' }), /Apply/);
  assert.equal(f.calls.some((entry) => entry.helper || entry.path === '/setup-scan'), false);
});

test('a prerequisite PATH change is checked in a fresh helper before provider install', async () => {
  const calls = [];
  let installed = false;
  const f = fixture({ helper: async (id, mode, dryRun, revision) => {
    calls.push([id, mode, revision]);
    if (id === 'windows-node-host-installer') {
      if (mode === 'apply') { installed = true; return { ...result, status: 'relaunch_required' }; }
      if (!installed) return { ...result, status: 'not_installed' };
    }
    return result;
  } });
  await f.manager.run({ action: 'install', targets: [codex], expectedRevision: 'one' });
  assert.deepEqual(calls.slice(0, 3), [
    ['windows-node-host-installer', 'check', 'one'],
    ['windows-node-host-installer', 'apply', 'one'],
    ['windows-node-host-installer', 'check', 'one'],
  ]);
  assert.equal(calls.at(-1)[0], 'windows-codex-native-installer');
});

test('uninstall preview is read-only, bound to the selection revision, and does not scan', async () => {
  const f = fixture();
  const snapshot = await f.manager.run({ action: 'preview_uninstall', targets: [codex], expectedRevision: 'one' });
  assert.equal(snapshot.preview.revision, 'one');
  assert.deepEqual(f.calls.find((entry) => entry.helper).helper, ['windows-codex-native-installer', 'uninstall', true, 'one']);
  assert.equal(f.calls.some((entry) => entry.path === '/setup-scan'), false);
});

test('failed upgrades remain visible after detecting the still-installed previous version', async () => {
  const f = fixture({ helper: async () => ({ ...result, status: 'failed', runState: 'failed', summary: 'Upgrade failed', manualSteps: ['Retry upgrade'] }) });
  await f.manager.run({ action: 'upgrade', targets: [claude], expectedRevision: 'one' });
  const next = await f.manager.run({ action: 'detect', targets: [claude], expectedRevision: 'one' });
  assert.equal(next.outcomes[targetKey(claude)].summary, 'Upgrade failed');
  assert.deepEqual(next.outcomes[targetKey(claude)].manualSteps, ['Retry upgrade']);
});

test('old completed scan cannot hide a failed or replaced new scan', async () => {
  for (const [state, pattern] of [[{ status: 'error', scanId: 'new', error: 'Check failed' }, /Check failed/],
    [{ status: 'ready', scanId: 'old', error: null }, /replaced/]]) {
    const base = fixture();
    const f = fixture({ request: async (path) => path === '/setup-scan' ? { scanId: 'new' }
      : { ...base.runtime, state, scan: { revision: 'one', providers: [{ ...codex, available: true }] } } });
    await assert.rejects(f.manager.run({ action: 'detect', targets: [codex], expectedRevision: 'one' }), pattern);
  }
});
