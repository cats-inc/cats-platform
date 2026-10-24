import test from 'node:test';
import assert from 'node:assert/strict';
import { ChildProcess } from 'node:child_process';
import fs, { mkdtemp, rm, readFile, writeFile, unlink } from 'node:fs/promises';
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
  assert.equal(starts[2].context.ingress?.url, '', 'automatic assignment must not pin an observed URL');
  assert.equal(automatic.snapshot().configuredOrigin, '');
  assert.equal(automatic.snapshot().url, 'https://assigned.example');
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

test('data reset stops forwarding and durably disarms startup/wake while retaining the protected credential', async t => {
  let starts = 0, stops = 0;
  const { root, ingress, options } = await fixture(t, (async () => {
    starts++; return { key: 'fixture', child: new ChildProcess(), publicUrl: 'https://assigned.example',
      stop: async () => { stops++; } };
  }) as typeof startAppProcess);
  await ingress.configure({ enabled: true, autoConnect: true, authtoken: token });
  const before = JSON.parse(await readFile(path.join(root, 'config', 'ingress.local.json'), 'utf8'));
  await ingress.resetForDataReset();
  assert.equal(stops, 1); assert.equal(ingress.snapshot().state, 'off');
  assert.equal(ingress.publicOrigin(), undefined);
  const after = JSON.parse(await readFile(path.join(root, 'config', 'ingress.local.json'), 'utf8'));
  assert.equal(after.enabled, false); assert.equal(after.autoConnect, false);
  assert.equal(after.credentialRef, before.credentialRef); assert.equal(after.publicOrigin, before.publicOrigin);
  await ingress.reconcile('resume'); await ingress.reconcile('online');
  assert.equal(starts, 1);
  const restarted = new PlatformIngress(options); t.after(() => restarted.close());
  await restarted.restore(); assert.equal(starts, 1); assert.equal(restarted.snapshot().state, 'off');
  await restarted.configure({ enabled: true }); assert.equal(starts, 2);
});

test('unconfirmed worker cleanup rejects data reset with durable disabled state and permits a safe retry', async t => {
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  const { root, ingress } = await fixture(t, (async () => ({ key: 'fixture', child: new ChildProcess(),
    publicUrl: 'https://assigned.example', stop: () => held })) as typeof startAppProcess);
  t.after(async () => { release(); await ingress.close(); });
  await ingress.configure({ enabled: true, autoConnect: true, authtoken: token });
  await assert.rejects(ingress.resetForDataReset(), /prepared for data reset/);
  assert.equal(ingress.snapshot().state, 'cleanup_pending'); assert.equal(ingress.publicOrigin(), undefined);
  const saved = JSON.parse(await readFile(path.join(root, 'config', 'ingress.local.json'), 'utf8'));
  assert.equal(saved.enabled, false); assert.equal(saved.autoConnect, false);
  release(); await ingress.resetForDataReset(); assert.equal(ingress.snapshot().state, 'off');
});

test('failed durable disarm still closes forwarding and requires a successful reset retry', async t => {
  let stops = 0;
  const { root, ingress } = await fixture(t, (async () => ({ key: 'fixture', child: new ChildProcess(),
    publicUrl: 'https://assigned.example', stop: async () => { stops++; } })) as typeof startAppProcess);
  await ingress.configure({ enabled: true, autoConnect: true, authtoken: token });
  const filename = path.join(root, 'config', 'ingress.local.json');
  const rename = fs.rename;
  const failure = t.mock.method(fs, 'rename', async (...args: Parameters<typeof rename>) => {
    if (args[1] === filename) throw new Error('fixture disk failure');
    return rename(...args);
  });
  syncBuiltinESMExports();
  try {
    await assert.rejects(ingress.resetForDataReset(), /prepared for data reset/);
    assert.equal(stops, 1); assert.equal(ingress.publicOrigin(), undefined);
    assert.equal(ingress.snapshot().state, 'unavailable');
    assert.equal(JSON.parse(await readFile(filename, 'utf8')).enabled, true, 'failed replacement preserves original config');
    await ingress.reconcile('resume'); assert.equal(ingress.publicOrigin(), undefined);
  } finally { failure.mock.restore(); syncBuiltinESMExports(); }
  await ingress.resetForDataReset();
  assert.equal(JSON.parse(await readFile(filename, 'utf8')).enabled, false);
});

test('reset fences a late worker acquisition and cancels its pending generation before resume', async t => {
  let entered!: () => void, release!: () => void;
  const acquiring = new Promise<void>(resolve => { entered = resolve; });
  const held = new Promise<void>(resolve => { release = resolve; });
  let starts = 0, stops = 0;
  const { ingress } = await fixture(t, (async () => {
    starts++; entered(); await held;
    return { key: 'fixture', child: new ChildProcess(), publicUrl: 'https://late.example',
      stop: async () => { stops++; } };
  }) as typeof startAppProcess);
  const enabling = ingress.configure({ enabled: true, autoConnect: true, authtoken: token });
  await acquiring;
  const resetting = ingress.resetForDataReset();
  release(); await enabling; await resetting;
  assert.equal(stops, 1); assert.equal(ingress.snapshot().state, 'off');
  await ingress.reconcile('resume'); await ingress.reconcile('online'); assert.equal(starts, 1);
});

test('reset cancels a scheduled transient retry and leaves wake unable to reconnect', async t => {
  let starts = 0;
  const { ingress } = await fixture(t, (async () => { starts++; throw new Error('transient fixture'); }) as typeof startAppProcess, [100]);
  await ingress.configure({ enabled: true, autoConnect: true, authtoken: token });
  assert.equal(ingress.snapshot().state, 'retrying');
  await ingress.resetForDataReset();
  await ingress.reconcile('resume'); await ingress.reconcile('online');
  await new Promise(resolve => setTimeout(resolve, 120));
  assert.equal(starts, 1); assert.equal(ingress.snapshot().state, 'off');
});

test('reset preserves durable credentials when a failed restore left only constructor defaults in memory', async t => {
  const { root, ingress, options } = await fixture(t, (async () => ({ key: 'fixture', child: new ChildProcess(),
    publicUrl: 'https://assigned.example', stop: async () => {} })) as typeof startAppProcess);
  await ingress.configure({ enabled: true, autoConnect: true, authtoken: token }); await ingress.close();
  const filename = path.join(root, 'config', 'ingress.local.json');
  const before = await readFile(filename, 'utf8');
  await writeFile(filename + '.migration.json', '{"schemaVersion":99}');
  const restarted = new PlatformIngress(options); t.after(() => restarted.close());
  await restarted.restore(); assert.equal(restarted.snapshot().state, 'unavailable');
  await assert.rejects(restarted.resetForDataReset(), /prepared for data reset/);
  assert.equal(await readFile(filename, 'utf8'), before);
  await unlink(filename + '.migration.json'); await restarted.resetForDataReset();
  const after = JSON.parse(await readFile(filename, 'utf8'));
  assert.equal(after.credentialRef, JSON.parse(before).credentialRef);
  assert.equal(after.publicOrigin, 'https://assigned.example'); assert.equal(after.enabled, false);
});

test('automatic reconnect can receive a new URL without requesting the previous ephemeral domain', async t => {
  let starts = 0;
  const { ingress } = await fixture(t, (async input => {
    starts++;
    if (input.context.ingress?.url) throw new Error('ERR_NGROK_313');
    return { key: 'fixture', child: new ChildProcess(), publicUrl: `https://assigned-${starts}.example`, stop: async () => {} };
  }) as typeof startAppProcess);
  await ingress.configure({ enabled: true, autoConnect: true, authtoken: token, publicOrigin: '' });
  assert.equal(ingress.snapshot().url, 'https://assigned-1.example');
  await ingress.reconcile('offline'); await ingress.reconcile('online');
  assert.equal(ingress.snapshot().url, 'https://assigned-2.example');
  assert.equal(ingress.snapshot().configuredOrigin, ''); assert.equal(starts, 2);
});

test('an explicit domain remains pinned across restart and provider rejection never falls back silently', async t => {
  const requested: Array<string | undefined> = [];
  const { ingress, options } = await fixture(t, (async input => {
    requested.push(input.context.ingress?.url);
    return { key: 'fixture', child: new ChildProcess(), publicUrl: 'https://fixed.example', stop: async () => {} };
  }) as typeof startAppProcess);
  await ingress.configure({ enabled: true, autoConnect: true, authtoken: token, publicOrigin: 'https://fixed.example' });
  await ingress.close();
  options.start = (async input => { requested.push(input.context.ingress?.url); throw new Error('ERR_NGROK_313'); }) as typeof startAppProcess;
  const restarted = new PlatformIngress(options); t.after(() => restarted.close()); await restarted.restore();
  assert.deepEqual(requested, ['https://fixed.example', 'https://fixed.example']);
  assert.equal(restarted.snapshot().state, 'needs_action'); assert.equal(restarted.snapshot().configuredOrigin, 'https://fixed.example');
  assert.equal(restarted.snapshot().url, null);
});

test('pre-field schema-3 settings retain their existing domain until automatic assignment is explicitly chosen', async t => {
  const requested: Array<string | undefined> = [];
  const { root, ingress, options } = await fixture(t, (async input => {
    requested.push(input.context.ingress?.url);
    return { key: 'fixture', child: new ChildProcess(), publicUrl: 'https://fixed.example', stop: async () => {} };
  }) as typeof startAppProcess);
  await ingress.configure({ enabled: true, autoConnect: true, authtoken: token, publicOrigin: 'https://fixed.example' });
  await ingress.close();
  const filename = path.join(root, 'config', 'ingress.local.json');
  const legacy = JSON.parse(await readFile(filename, 'utf8')); delete legacy.requestedOrigin;
  await writeFile(filename, JSON.stringify(legacy));
  const restarted = new PlatformIngress(options); t.after(() => restarted.close());
  await restarted.restore(); assert.equal(requested.at(-1), 'https://fixed.example');
  assert.equal(restarted.snapshot().configuredOrigin, 'https://fixed.example');
  await restarted.configure({ enabled: true, publicOrigin: '' });
  assert.equal(requested.at(-1), ''); assert.equal(restarted.snapshot().configuredOrigin, '');
  assert.equal(JSON.parse(await readFile(filename, 'utf8')).credentialRef, legacy.credentialRef);
});
