import test from 'node:test';
import assert from 'node:assert/strict';
import { ChildProcess } from 'node:child_process';
import fs, { mkdtemp, rm, readFile } from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PlatformIngress } from '../src/platform/apps/platformIngress.ts';
import type { startAppProcess } from '../src/platform/apps/componentProcess.ts';
import { fixtureIngressSecrets } from './fixtures/ingressSecrets.ts';

const token = 'fixture-ngrok-private-token-123456';
async function fixture(t: { after(fn: () => Promise<unknown>): void }, start: typeof startAppProcess,
  retryDelaysMs: number[] = [5, 10]) {
  const root = await mkdtemp(path.join(tmpdir(), 'cats-managed-ingress-'));
  const options = { platformDir: root, ready: async () => true, dispatch: async () => {},
    secrets: fixtureIngressSecrets(), start, retryDelaysMs, cleanupTimeoutMs: 25, random: () => 0.5 };
  const ingress = new PlatformIngress(options);
  t.after(async () => { await ingress.close(); await rm(root, { recursive: true, force: true }); });
  return { root, ingress, options };
}
async function until(predicate: () => boolean) {
  for (let i = 0; i < 100; i++) { if (predicate()) return; await new Promise(resolve => setTimeout(resolve, 5)); }
  assert.fail('lifecycle condition did not settle');
}

test('auto-connect is explicit and restart reuses the protected credential and assigned origin', async t => {
  const starts: Parameters<typeof startAppProcess>[0][] = [];
  const { root, ingress, options } = await fixture(t, (async input => {
    starts.push(input);
    return { key: 'fixture', child: new ChildProcess(), publicUrl: 'https://assigned.example', stop: async () => {} };
  }) as typeof startAppProcess);
  await ingress.restore(); assert.equal(starts.length, 0);
  await ingress.configure({ enabled: true, autoConnect: false, authtoken: token });
  assert.equal(ingress.snapshot().state, 'connected');
  assert.equal(ingress.snapshot().publicVerification.state, 'unknown');
  const contents = await readFile(path.join(root, 'config', 'ingress.local.json'), 'utf8');
  assert.equal(contents.includes(token), false); assert.equal(JSON.parse(contents).schemaVersion, 3);
  await ingress.close();
  const manual = new PlatformIngress(options); t.after(() => manual.close());
  await manual.restore(); assert.equal(manual.snapshot().state, 'disconnected'); assert.equal(starts.length, 1);
  await manual.configure({ enabled: true, autoConnect: true }); await manual.close();
  const automatic = new PlatformIngress(options); t.after(() => automatic.close());
  await automatic.restore(); assert.equal(automatic.snapshot().state, 'connected');
  assert.equal(starts.length, 3); assert.equal(starts[2].context.ingress?.authtoken, token);
  assert.equal(starts[2].context.ingress?.url, 'https://assigned.example');
});

test('disable cancels a pending worker and a late result cannot publish or resurrect admission', async t => {
  let complete: (() => void) | undefined; let stopped = 0;
  const { ingress } = await fixture(t, (async () => {
    await new Promise<void>(resolve => { complete = resolve; });
    return { key: 'fixture', child: new ChildProcess(), publicUrl: 'https://late.example', stop: async () => { stopped++; } };
  }) as typeof startAppProcess);
  const enabling = ingress.configure({ enabled: true, authtoken: token });
  await until(() => !!complete);
  const disabling = ingress.configure({ enabled: false });
  assert.equal(ingress.publicOrigin(), undefined); assert.equal(ingress.snapshot().target, null);
  complete!(); await enabling; await disabling;
  assert.equal(stopped, 1); assert.equal(ingress.snapshot().state, 'off'); assert.equal(ingress.snapshot().enabled, false);
});

test('network and suspend transitions revoke admission, then reconnect only the intended session', async t => {
  let starts = 0; let stops = 0;
  const { ingress } = await fixture(t, (async () => {
    starts++; return { key: 'fixture', child: new ChildProcess(), publicUrl: 'https://assigned.example', stop: async () => { stops++; } };
  }) as typeof startAppProcess);
  await ingress.configure({ enabled: true, authtoken: token });
  await ingress.reconcile('offline'); assert.equal(stops, 1); assert.equal(ingress.publicOrigin(), undefined);
  await ingress.reconcile('online'); assert.equal(starts, 2); assert.equal(ingress.snapshot().state, 'connected');
  await ingress.reconcile('suspend'); assert.equal(stops, 2); assert.equal(ingress.snapshot().url, null);
  await ingress.reconcile('resume'); assert.equal(starts, 3);
  await ingress.configure({ enabled: false }); await ingress.reconcile('resume');
  assert.equal(starts, 3); assert.equal(ingress.snapshot().state, 'off');
});

test('transient retry is bounded and successful reconnect preserves truthful public-verification status', async t => {
  let starts = 0;
  const { ingress } = await fixture(t, (async () => {
    if (++starts < 3) throw new Error('fixture_transient_failure');
    return { key: 'fixture', child: new ChildProcess(), publicUrl: 'https://assigned.example', stop: async () => {} };
  }) as typeof startAppProcess);
  await ingress.configure({ enabled: true, authtoken: token });
  await until(() => ingress.snapshot().state === 'connected'); assert.equal(starts, 3);
  assert.equal(ingress.snapshot().publicVerification.state, 'unknown');
  let failures = 0;
  const failed = await fixture(t, (async () => { failures++; throw new Error('fixture_transient_failure'); }) as typeof startAppProcess);
  await failed.ingress.configure({ enabled: true, authtoken: token });
  await until(() => failed.ingress.snapshot().state === 'unavailable');
  assert.equal(failures, 3); assert.equal(failed.ingress.snapshot().retryCount, 2);
});

test('network recovery cannot override suspension and resume cannot override offline', async t => {
  let starts = 0;
  const { ingress } = await fixture(t, (async () => {
    starts++; return { key: 'fixture', child: new ChildProcess(), publicUrl: 'https://assigned.example', stop: async () => {} };
  }) as typeof startAppProcess);
  await ingress.configure({ enabled: true, authtoken: token });
  await ingress.reconcile('suspend'); await ingress.reconcile('offline');
  await ingress.reconcile('online'); assert.equal(starts, 1); assert.equal(ingress.publicOrigin(), undefined);
  await ingress.reconcile('resume'); assert.equal(starts, 2);
  await ingress.reconcile('offline'); await ingress.reconcile('suspend');
  await ingress.reconcile('resume'); assert.equal(starts, 2); assert.equal(ingress.publicOrigin(), undefined);
  await ingress.reconcile('online'); assert.equal(starts, 3);
});

test('an explicit provider rejection needs user action instead of retrying account errors', async t => {
  let starts = 0;
  const { ingress } = await fixture(t, (async () => { starts++; throw new Error('ERR_NGROK_105'); }) as typeof startAppProcess);
  await ingress.configure({ enabled: true, authtoken: token });
  assert.equal(ingress.snapshot().state, 'needs_action'); assert.equal(ingress.snapshot().errorCode, 'ERR_NGROK_105');
  await new Promise(resolve => setTimeout(resolve, 30)); assert.equal(starts, 1);
});

test('unknown worker cleanup prevents replacement until the retained cleanup completes', async t => {
  let starts = 0; let release!: () => void;
  const cleanup = new Promise<void>(resolve => { release = resolve; });
  const { ingress } = await fixture(t, (async () => {
    starts++; return { key: 'fixture', child: new ChildProcess(), publicUrl: 'https://assigned.example', stop: () => cleanup };
  }) as typeof startAppProcess);
  await ingress.configure({ enabled: true, authtoken: token });
  await ingress.configure({ enabled: false }); assert.equal(ingress.snapshot().state, 'cleanup_pending');
  await ingress.configure({ enabled: true }); assert.equal(starts, 1);
  assert.equal(ingress.snapshot().url, null);
  release(); await ingress.configure({ enabled: false }); assert.equal(ingress.snapshot().state, 'off');
});

test('disable during an atomic settings commit cannot start the superseded provider', async t => {
  let starts = 0;
  const { root, ingress } = await fixture(t, (async () => {
    starts++; return { key: 'fixture', child: new ChildProcess(), publicUrl: 'https://stale.example', stop: async () => {} };
  }) as typeof startAppProcess);
  const filename = path.join(root, 'config', 'ingress.local.json');
  const rename = fs.rename;
  let entered = false; let release!: () => void;
  const saving = new Promise<void>(resolve => { release = resolve; });
  const gate = t.mock.method(fs, 'rename', async (...args: Parameters<typeof rename>) => {
    if (args[1] === filename && !entered) { entered = true; await saving; }
    return rename(...args);
  });
  syncBuiltinESMExports();
  try {
    const enabling = ingress.configure({ enabled: true, authtoken: token });
    await until(() => entered);
    const disabling = ingress.configure({ enabled: false });
    release(); await enabling; await disabling;
    assert.equal(starts, 0); assert.equal(ingress.snapshot().state, 'off');
    assert.equal(JSON.parse(await readFile(filename, 'utf8')).enabled, false);
  } finally { release(); gate.mock.restore(); syncBuiltinESMExports(); }
});
