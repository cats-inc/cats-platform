import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { Worker } from 'node:worker_threads';
import { RuntimeImageError } from '../build/server/runtime/images.js';

import { CatImageLedger } from '../build/server/platform/multimedia/catImageLedger.js';
import { CatImageService } from '../build/server/platform/multimedia/catImages.js';
import { createCatImageDelivery } from '../build/server/platform/multimedia/catImageDelivery.js';
import { isImagePolicyTime } from '../build/server/platform/multimedia/catImagePolicy.js';

const at = new Date('2026-10-23T08:00:00Z');
const caller = { accountId: 'account-owner', ownerActorId: 'actor-owner', catId: 'cat-ordinary',
  conversationId: 'conversation-direct', runtimeSessionId: 'session-chat', trigger: 'heartbeat' };
const policy = (fields = {}) => ({ schemaVersion: 1, id: randomUUID(), revision: 1, ...caller,
  enabled: true, manual: true, proactive: true, targetId: 'grok/native', profileId: 'grok-generate',
  profileRevision: '1', agentConfigId: 'grok-4.7-xhigh', dailyLimit: 2, totalLimit: 4,
  minIntervalMinutes: 1, timeZone: 'UTC', windowStart: '00:00', windowEnd: '00:00',
  expiresAt: '2026-10-25T00:00:00Z', bindingId: 'binding-one', bindingRevision: 'revision-one',
  updatedAt: at.toISOString(), ...fields });
const request = (fields = {}) => ({ requestId: randomUUID(), prompt: 'A friendly good morning cat', caption: '早安！', ...fields });
const later = (minutes) => new Date(at.getTime() + minutes * 60000);

const deliveredOutput = { mimeType: 'image/jpeg', bytes: 4, width: 1, height: 1, transparency: 'opaque', sha256: 'a'.repeat(64) };

async function fixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'cats-media-ledger-'));
  const filename = path.join(root, 'media.sqlite');
  const ledger = new CatImageLedger(filename);
  const ledgers = [ledger];
  t.after(async () => {
    for (const entry of ledgers) entry.close();
    await rm(root, { recursive: true, force: true, maxRetries: 5 });
  });
  return { root, filename, ledger, track(entry) { ledgers.push(entry); },
    open() { const entry = new CatImageLedger(filename); ledgers.push(entry); return entry; } };
}

test('budget and request identity survive a second connection, policy changes and restart', async (t) => {
  const f = await fixture(t);
  const original = f.ledger.savePolicy(policy(), 0);
  const second = f.open();
  const input = request();
  const first = f.ledger.admit(caller, input, 1, at);
  assert.equal(first.created, true);
  const repeated = second.admit({ ...caller, runtimeSessionId: 'session-reconnected' }, input, 1, at);
  assert.equal(repeated.created, false);
  assert.equal(repeated.job.id, first.job.id);
  assert.equal(second.budget(caller, original, at).totalUsed, 1);
  assert.throws(() => second.admit(caller, { ...input, caption: 'Changed' }, 1, at), /image_request_conflict/);
  f.ledger.update(first.job.id, { status: 'failed', error: 'outcome_unknown' }, at);
  assert.throws(() => second.admit(caller, request(), 1, later(0.5)), /image_interval_active/);
  const next = second.admit(caller, request(), 1, later(2));
  second.update(next.job.id, { status: 'failed', error: 'outcome_unknown' }, later(2));
  const changed = second.savePolicy({ ...original, revision: 2, timeZone: 'Pacific/Kiritimati', updatedAt: later(3).toISOString() }, 1);
  const reopened = f.open();
  assert.equal(reopened.budget(caller, changed, later(4)).dailyUsed, 2);
  assert.throws(() => reopened.admit(caller, request(), 2, later(4)), /image_budget_exhausted/);
  assert.equal(reopened.list(caller).length, 2);
  assert.equal(reopened.list({ ...caller, accountId: 'other-account' }).length, 0);
});

test('no implicit Boss, App or caller permission; scope, time and revision are checked before reservation', async (t) => {
  const f = await fixture(t);
  assert.throws(() => f.ledger.admit(caller, request(), 1, at), /image_not_authorized/);
  const original = f.ledger.savePolicy(policy({ proactive: false }), 0);
  assert.throws(() => f.ledger.admit(caller, request(), 1, at), /image_not_authorized/);
  assert.throws(() => f.ledger.admit({ ...caller, trigger: 'manual', conversationId: 'foreign' }, request(), 1, at), /image_not_authorized/);
  assert.throws(() => f.ledger.admit({ ...caller, trigger: 'manual' }, request(), 0, at), /image_policy_changed/);
  assert.throws(() => f.ledger.savePolicy({ ...original, revision: 3 }, 1), /image_policy_changed/);
  assert.throws(() => f.ledger.admit({ ...caller, trigger: 'manual' }, request(), 1, new Date('2026-10-26T00:00:00Z')), /image_policy_outside_window/);
  assert.equal(f.ledger.budget(caller, original, at).totalUsed, 0);
  const overnight = policy({ windowStart: '23:00', windowEnd: '07:00' });
  assert.equal(isImagePolicyTime(overnight, new Date('2026-10-23T23:30:00Z')), true);
  assert.equal(isImagePolicyTime(overnight, new Date('2026-10-24T06:59:00Z')), true);
  assert.equal(isImagePolicyTime(overnight, new Date('2026-10-24T07:00:00Z')), false);
});

test('a failed reservation write rolls back both the work and allowance', async (t) => {
  const f = await fixture(t);
  const original = f.ledger.savePolicy(policy(), 0);
  const database = new DatabaseSync(f.filename);
  f.track(database);
  database.exec("CREATE TRIGGER reject_reservation BEFORE INSERT ON reservations BEGIN SELECT RAISE(ABORT, 'fixture disk refusal'); END;");
  const input = request();
  assert.throws(() => f.ledger.admit(caller, input, 1, at), /fixture disk refusal/);
  assert.equal(f.ledger.list(caller).length, 0);
  assert.equal(f.ledger.budget(caller, original, at).totalUsed, 0);
  database.exec('DROP TRIGGER reject_reservation;');
  assert.equal(f.ledger.admit(caller, input, 1, at).created, true);
});

test('cancel intent wins late success and survives recovery without a new reservation', async (t) => {
  const f = await fixture(t);
  const original = f.ledger.savePolicy(policy(), 0);
  const { job } = f.ledger.admit(caller, request(), 1, at);
  f.ledger.update(job.id, { status: 'cancelling' }, at);
  assert.equal(f.ledger.update(job.id, { status: 'succeeded' }, at).status, 'cancelling');
  f.ledger.update(job.id, { status: 'interrupted', error: 'execution_interrupted' }, at);
  const reopened = f.open();
  assert.equal(reopened.recover(job.id, later(1)).status, 'cancelling');
  assert.equal(reopened.budget(caller, original, later(1)).totalUsed, 1);
});

test('unknown database versions and malformed jobs are preserved and refused', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'cats-media-unknown-'));
  t.after(() => rm(root, { recursive: true, force: true, maxRetries: 5 }));
  const filename = path.join(root, 'future.sqlite');
  const future = new DatabaseSync(filename);
  future.exec('PRAGMA user_version=99; CREATE TABLE sentinel(value TEXT); INSERT INTO sentinel VALUES (\'preserve\');');
  assert.throws(() => new CatImageLedger(filename), /media_state_unsupported/);
  assert.equal(future.prepare('SELECT value FROM sentinel').get().value, 'preserve');
  future.close();
  const f = await fixture(t);
  f.ledger.savePolicy(policy(), 0);
  const { job } = f.ledger.admit(caller, request(), 1, at);
  const database = new DatabaseSync(f.filename);
  database.prepare('UPDATE jobs SET document=? WHERE id=?').run('{"schemaVersion":999}', job.id);
  database.close();
  assert.throws(() => f.ledger.get(job.id), /media_state_invalid/);
});

test('an ordinary Cat without Studio uses the common execution service once and reads the retained bytes', async (t) => {
  const f = await fixture(t);
  f.ledger.savePolicy(policy(), 0);
  const bytes = Buffer.from([255, 216, 255, 217]);
  const output = { mimeType: 'image/jpeg', bytes: bytes.length, width: 1024, height: 1024,
    sha256: createHash('sha256').update(bytes).digest('hex'), transparency: 'opaque' };
  const records = new Map(); let submissions = 0; let callerEnabled = true;
  const runtimeClient = {
    async getImageCapabilities() { return { schemaVersion: 2, sourceSessionYield: true, revision: 'r1', maxPromptLength: 2000, maxImageBytes: 8388608,
      targets: [{ id: 'grok/native', provider: 'grok', instance: 'native' }],
      profiles: [{ id: 'grok-generate', revision: 1, operation: 'image.generate', targetIds: ['grok/native'],
        agentConfigs: [{ id: 'grok-4.7-xhigh', model: 'grok-4.7', effort: 'xhigh' }],
        inputs: { min: 0, max: 0 }, aspectRatio: { mode: 'native', options: ['1:1'] } }] }; },
    async submitImageJob(input) {
      submissions++;
      const job = { ...input, schemaVersion: 2, provider: 'grok', instance: 'native', status: 'succeeded',
        agentModel: 'grok-4.7', agentEffort: 'xhigh', createdAt: at.toISOString(), updatedAt: at.toISOString(),
        error: null, warnings: [], executionOutcome: 'completed', output };
      records.set(input.id, job); return job;
    },
    async getImageJob(id) { return records.get(id); },
    async getImageBytes() { return bytes; },
  };
  const dependencies = { ledger: f.ledger, runtimeClient, assetsDir: path.join(f.root, 'assets'), now: () => at,
    async authorizeCaller(current) { assert.equal(current.catId, caller.catId); if (!callerEnabled) throw new Error('Cat disabled'); } };
  const service = new CatImageService(dependencies);
  const input = request();
  const [first, duplicate] = await Promise.all([service.submit(caller, input), service.submit(caller, input)]);
  assert.equal(first.id, duplicate.id);
  for (let count = 0; count < 100 && f.ledger.get(first.id).status !== 'succeeded'; count++) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.equal(f.ledger.get(first.id).status, 'succeeded');
  assert.equal(submissions, 1);
  assert.ok((await service.image(caller, first.id)).bytes.equals(bytes));
  const restarted = new CatImageService(dependencies);
  restarted.reconcile();
  assert.ok((await restarted.image(caller, first.id)).bytes.equals(bytes));
  assert.equal(submissions, 1);
  await assert.rejects(service.get({ ...caller, accountId: 'other' }, first.id), /image_not_found/);
  await assert.rejects(service.submit(caller, { ...input, appId: 'cats.studio' }), /invalid_image_request/);
  callerEnabled = false;
  await assert.rejects(service.image(caller, first.id), /Cat disabled/);
});


test('normal calendar midnight resets daily allowance and timezone edits wait for the previous day to end', async (t) => {
  const f = await fixture(t);
  const original = f.ledger.savePolicy(policy({ dailyLimit: 1, updatedAt: '2026-10-23T23:50:00Z' }), 0);
  const first = f.ledger.admit(caller, request(), 1, new Date('2026-10-23T23:50:00Z'));
  f.ledger.update(first.job.id, { status: 'failed', error: 'fixture_finished' }, new Date('2026-10-23T23:51:00Z'));
  assert.equal(f.ledger.budget(caller, original, new Date('2026-10-23T23:59:00Z')).dailyUsed, 1);
  assert.equal(f.ledger.budget(caller, original, new Date('2026-10-24T00:00:00Z')).dailyUsed, 0);
  const changed = f.ledger.savePolicy({ ...original, revision: 2, timeZone: 'Pacific/Kiritimati', updatedAt: '2026-10-24T00:01:00Z' }, 1);
  const snapshot = f.ledger.budget(caller, changed, new Date('2026-10-24T00:02:00Z'));
  assert.equal(snapshot.timeZone, 'UTC'); assert.equal(snapshot.timeZonePending, true);
  assert.equal(f.ledger.budget(caller, changed, new Date('2026-10-25T00:00:00Z')).timeZone, 'Pacific/Kiritimati');
});

test('concurrent first opens initialize one complete ledger without resetting or losing data', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'cats-media-open-race-'));
  t.after(() => rm(root, { recursive: true, force: true, maxRetries: 5 }));
  const module = new URL('../build/server/platform/multimedia/catImageLedger.js', import.meta.url).href;
  for (let trial = 0; trial < 5; trial++) {
    const filename = path.join(root, 'race-' + trial + '.sqlite');
    const barrier = new SharedArrayBuffer(4);
    await Promise.all([0, 1].map(() => new Promise((resolve, reject) => {
      const worker = new Worker(`
        const {parentPort,workerData}=require('node:worker_threads');
        (async()=>{
          const {CatImageLedger}=await import(workerData.module);
          const ready=new Int32Array(workerData.barrier);
          Atomics.add(ready,0,1); Atomics.notify(ready,0);
          while(Atomics.load(ready,0)<2) Atomics.wait(ready,0,1,100);
          const ledger=new CatImageLedger(workerData.filename); ledger.close();
          parentPort.postMessage('ok');
        })().catch(error=>{throw error;});
      `, { eval: true, workerData: { module, filename, barrier } });
      let acknowledged = false;
      worker.on('message', (value) => { acknowledged = value === 'ok'; });
      worker.on('error', reject);
      worker.on('exit', (code) => code === 0 && acknowledged ? resolve() : reject(new Error('Ledger opener failed: ' + code)));
    })));
    const ledger = new CatImageLedger(filename);
    assert.equal(ledger.list().length, 0); ledger.close();
  }
});

test('a lost POST with three missing reads keeps the slot and restart collects the same late receipt', async (t) => {
  const f = await fixture(t);
  f.ledger.savePolicy(policy(), 0);
  const bytes = Buffer.from([255, 216, 255, 217]);
  const output = { mimeType: 'image/jpeg', bytes: bytes.length, width: 1024, height: 1024,
    sha256: createHash('sha256').update(bytes).digest('hex'), transparency: 'opaque' };
  let posted = 0, reads = 0, remote;
  let now = at;
  const runtimeClient = {
    async getImageCapabilities() { return { schemaVersion: 2, sourceSessionYield: true, revision: 'r1', maxPromptLength: 2000, maxImageBytes: 8388608,
      targets: [{ id: 'grok/native', provider: 'grok', instance: 'native' }],
      profiles: [{ id: 'grok-generate', revision: 1, operation: 'image.generate', targetIds: ['grok/native'],
        agentConfigs: [{ id: 'grok-4.7-xhigh', model: 'grok-4.7', effort: 'xhigh' }], inputs: { min: 0, max: 0 }, aspectRatio: { mode: 'native', options: ['1:1'] } }] }; },
    async submitImageJob(input) { posted++; remote = { ...input, schemaVersion: 2, provider: 'grok', instance: 'native', status: 'succeeded',
      agentModel: 'grok-4.7', agentEffort: 'xhigh', createdAt: at.toISOString(), updatedAt: at.toISOString(),
      error: null, warnings: [], executionOutcome: 'completed', output }; throw new Error('Lost acknowledgement'); },
    async getImageJob() { if (++reads <= 3) throw new RuntimeImageError('image_not_found'); return remote; },
    async getImageBytes() { return bytes; },
  };
  const dependencies = { ledger: f.ledger, runtimeClient, assetsDir: path.join(f.root, 'assets'), now: () => now, async authorizeCaller() {} };
  const service = new CatImageService(dependencies);
  const job = await service.submit(caller, request());
  for (let attempt = 0; attempt < 700 && f.ledger.get(job.id).status !== 'interrupted'; attempt++) await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(f.ledger.get(job.id).status, 'interrupted');
  now = later(2);
  await assert.rejects(service.submit(caller, request()), /image_service_busy/);
  const restarted = new CatImageService(dependencies); restarted.reconcile();
  for (let attempt = 0; attempt < 100 && f.ledger.get(job.id).status !== 'succeeded'; attempt++) await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(f.ledger.get(job.id).status, 'succeeded');
  assert.ok((await restarted.image(caller, job.id)).bytes.equals(bytes));
  assert.equal(posted, 1);
  await rm(path.join(f.root, 'assets', job.id + '.jpg'));
  assert.ok((await restarted.image(caller, job.id)).bytes.equals(bytes), 'missing asset is recollected, never regenerated');
  assert.equal(posted, 1);
});


test('a definite preflight refusal releases once; unknown and cancelling work retain their reservation', async (t) => {
  const f = await fixture(t); const original = f.ledger.savePolicy(policy({ dailyLimit: 1, totalLimit: 1 }), 0);
  const first = f.ledger.admit(caller, request(), 1, at);
  f.ledger.update(first.job.id, { status: 'failed', error: 'image_profile_changed' }, at);
  assert.equal(f.ledger.budget(caller, original, at).totalUsed, 0);
  assert.equal(f.ledger.releaseReservation(first.job.id), false, 'the state transition already released it');
  const next = f.ledger.admit(caller, request(), 1, at);
  f.ledger.update(next.job.id, { status: 'interrupted', error: 'execution_interrupted' }, at);
  assert.equal(f.ledger.releaseReservation(next.job.id), false);
  assert.equal(f.ledger.budget(caller, original, at).totalUsed, 1);
  f.ledger.recover(next.job.id, later(1));
  f.ledger.update(next.job.id, { status: 'cancelling' }, later(1));
  assert.equal(f.ledger.releaseReservation(next.job.id), false);
});


function controlledRuntime(status, options = {}) {
  let calls = 0, cancelled = 0; const records = new Map();
  return {
    calls: () => calls, cancelled: () => cancelled,
    async getImageCapabilities() { return { schemaVersion: 2, sourceSessionYield: true, revision: 'r1', maxPromptLength: 2000, maxImageBytes: 8388608,
      targets: [{ id: 'grok/native', provider: 'grok', instance: 'native' }],
      profiles: [{ id: 'grok-generate', revision: 1, operation: 'image.generate', targetIds: ['grok/native'],
        agentConfigs: [{ id: 'grok-4.7-xhigh', model: 'grok-4.7', effort: 'xhigh' }], inputs: { min: 0, max: 0 }, aspectRatio: { mode: 'native', options: ['1:1'] } }] }; },
    async submitImageJob(input) {
      calls++; if (options.refusal) throw new RuntimeImageError(options.refusal);
      const record = { ...input, schemaVersion: 2, provider: 'grok', instance: 'native', status,
        agentModel: 'grok-4.7', agentEffort: 'xhigh', createdAt: at.toISOString(), updatedAt: at.toISOString(),
        error: status === 'interrupted' ? 'execution_interrupted' : null, warnings: [], executionOutcome: null, output: null };
      records.set(input.id, record); return record;
    },
    async getImageJob(id) { return records.get(id); },
    async cancelImageJob(id) {
      cancelled++;
      const record = { ...records.get(id), status: options.cancelling && cancelled === 1 ? 'cancelling' : status === 'interrupted' ? 'interrupted' : 'cancelled' };
      records.set(id, record); return record;
    },
  };
}

test('matching terminal interruption frees the slot for an explicit new request and keeps used allowance', async (t) => {
  const f = await fixture(t); const original = f.ledger.savePolicy(policy(), 0);
  const runtimeClient = controlledRuntime('interrupted'); let now = at;
  const service = new CatImageService({ ledger: f.ledger, runtimeClient, assetsDir: path.join(f.root, 'assets'),
    now: () => now, async authorizeCaller() {} });
  const first = await service.submit(caller, request());
  for (let count = 0; count < 100 && f.ledger.get(first.id).status !== 'interrupted'; count++) await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(f.ledger.get(first.id).runtimeTerminalObserved, true);
  assert.equal((await service.cancel(caller, first.id)).status, 'interrupted');
  service.reconcile();
  assert.equal(f.ledger.get(first.id).status, 'interrupted', 'confirmed terminal receipt is not endlessly recovered');
  now = later(2);
  const second = await service.submit(caller, request());
  assert.notEqual(second.id, first.id);
  for (let count = 0; count < 100 && f.ledger.get(second.id).status !== 'interrupted'; count++) await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(runtimeClient.calls(), 2);
  assert.equal(f.ledger.budget(caller, original, now).totalUsed, 2);
});

test('a nonterminal cancellation acknowledgement keeps polling until Runtime confirms stop', async (t) => {
  const f = await fixture(t); f.ledger.savePolicy(policy(), 0);
  const runtimeClient = controlledRuntime('running', { cancelling: true });
  const service = new CatImageService({ ledger: f.ledger, runtimeClient, assetsDir: path.join(f.root, 'assets'), now: () => at, async authorizeCaller() {} });
  const job = await service.submit(caller, request());
  for (let count = 0; count < 100 && runtimeClient.calls() === 0; count++) await new Promise((resolve) => setTimeout(resolve, 10));
  await service.cancel(caller, job.id);
  for (let count = 0; count < 500 && f.ledger.get(job.id).status !== 'cancelled'; count++) await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(f.ledger.get(job.id).status, 'cancelled');
  assert.ok(runtimeClient.cancelled() >= 2);
  assert.equal(runtimeClient.calls(), 1);
});

test('Runtime receipt-storage refusal releases allowance and repeated submit never posts again', async (t) => {
  const f = await fixture(t); const original = f.ledger.savePolicy(policy({ dailyLimit: 1, totalLimit: 1 }), 0);
  const runtimeClient = controlledRuntime('running', { refusal: 'image_storage_limit' });
  const service = new CatImageService({ ledger: f.ledger, runtimeClient, assetsDir: path.join(f.root, 'assets'), now: () => at, async authorizeCaller() {} });
  const input = request(); const job = await service.submit(caller, input);
  for (let count = 0; count < 100 && f.ledger.get(job.id).status !== 'failed'; count++) await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(f.ledger.get(job.id).error, 'image_storage_limit');
  assert.equal(f.ledger.budget(caller, original, at).totalUsed, 0);
  assert.equal((await service.submit(caller, input)).id, job.id);
  assert.equal(runtimeClient.calls(), 1);
  assert.equal(f.ledger.releaseReservation(job.id), false);
});


for (const remoteStatus of ['succeeded', 'failed']) test('restart cancellation wins a Runtime ' + remoteStatus + ' receipt without collecting', async (t) => {
  const f = await fixture(t); const original = f.ledger.savePolicy(policy(), 0);
  const { job } = f.ledger.admit(caller, request(), 1, at);
  f.ledger.update(job.id, { status: 'cancelling' }, at);
  let submissions = 0, reads = 0;
  const remote = { ...job, sourceSessionId: job.runtimeSessionId, schemaVersion: 2, status: remoteStatus, sourceIds: [], options: {} };
  const runtimeClient = { async submitImageJob() { submissions++; throw new Error('Unexpected generation'); },
    async cancelImageJob() { return remote; }, async getImageBytes() { reads++; throw new Error('Unexpected collection'); } };
  const service = new CatImageService({ ledger: f.ledger, runtimeClient, assetsDir: path.join(f.root, 'assets'), now: () => at, async authorizeCaller() {} });
  service.reconcile();
  for (let count = 0; count < 100 && f.ledger.get(job.id).status !== 'cancelled'; count++) await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(f.ledger.get(job.id).status, 'cancelled');
  assert.equal(f.ledger.get(job.id).runtimeTerminalObserved, true);
  assert.equal(f.ledger.budget(caller, original, at).totalUsed, 1);
  assert.equal(submissions, 0); assert.equal(reads, 0);
  assert.equal(f.ledger.admit(caller, request(), 1, later(2)).created, true);
});


test('deferred work is claimed once across connections, and never-dispatched cancellation refunds its reservation', async t => {
  const f = await fixture(t); const saved = f.ledger.savePolicy(policy(), 0); const second = f.open();
  const job = f.ledger.admit(caller, request(), 1, at, true).job;
  assert.equal(second.claimDispatch(job.id, at), false);
  assert.equal(f.ledger.releaseTurn(caller.runtimeSessionId, at).length, 1);
  assert.equal(second.claimDispatch(job.id, at), true); assert.equal(f.ledger.claimDispatch(job.id, at), false);
  f.ledger.update(job.id, { status: 'failed', error: 'image_source_busy' }, at);
  const held = second.admit(caller, request(), 1, later(2), true).job;
  assert.equal(f.ledger.cancelUndispatched(held.id, later(2)), true);
  assert.equal(second.claimDispatch(held.id, later(2)), false);
  assert.equal(second.budget(caller, saved, later(2)).totalUsed, 0);
});

test('a recovered old delivery claim cannot send after another process completed an explicit retry', async t => {
  const f = await fixture(t); f.ledger.savePolicy(policy(), 0); const second = f.open();
  const job = f.ledger.admit(caller, request(), 1, at).job;
  f.ledger.update(job.id, { status: 'succeeded', output: deliveredOutput }, at);
  let releaseAppend, entered = false, oldSends = 0, newSends = 0;
  const first = createCatImageDelivery({ ledger: f.ledger, now: () => at, async authorize() {},
    async append() { entered = true; await new Promise(resolve => { releaseAppend = resolve; }); return 'same-message'; },
    async deliver() { oldSends++; return { status: 'sent' }; } });
  const oldSweep = first.tick();
  while (!entered) await new Promise(resolve => setTimeout(resolve, 1));
  second.recoverDeliveries(later(3)); assert.equal(second.delivery(job.id).status, 'uncertain');
  second.retryDelivery(job.id, later(3));
  const next = createCatImageDelivery({ ledger: second, now: () => later(3), async authorize() {},
    async append() { return 'same-message'; }, async deliver() { newSends++; return { status: 'sent' }; } });
  await next.tick(); releaseAppend(); await oldSweep;
  assert.equal(oldSends, 0); assert.equal(newSends, 1); assert.equal(f.ledger.delivery(job.id).status, 'sent');
});

test('global reset refuses another process sending claim and fences all new admission until completion', async t => {
  const f = await fixture(t); f.ledger.savePolicy(policy(), 0); const second = f.open();
  const job = f.ledger.admit(caller, request(), 1, at).job;
  f.ledger.update(job.id, { status: 'succeeded', output: deliveredOutput }, at);
  f.ledger.ensureDelivery(job.id, at); const claim = f.ledger.claimDelivery(job.id, at);
  assert.throws(() => second.beginReset(), /image_service_busy/);
  assert.equal(second.get(job.id).id, job.id);
  f.ledger.finishDelivery(job.id, claim.attemptId, { status: 'sent' }, at);
  second.beginReset();
  assert.throws(() => f.ledger.admit(caller, request(), 1, later(2)), /media_reset_in_progress/);
  assert.throws(() => f.ledger.claimDelivery(job.id, later(2)), /media_reset_in_progress/);
  second.clearForReset(); assert.equal(f.ledger.get(job.id), undefined); assert.equal(f.ledger.policies().length, 0);
});

test('a second process temporarily missing the receipt cannot cancel the late matching POST acknowledgement', async t => {
  const f = await fixture(t); f.ledger.savePolicy(policy(), 0); const second = f.open();
  const base = controlledRuntime('running'); let acknowledge; let reads = 0;
  const bytes = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
  const output = { ...deliveredOutput, sha256: createHash('sha256').update(bytes).digest('hex') };
  const runtimeClient = { ...base, async submitImageJob(input) {
    const receipt = await base.submitImageJob(input); await new Promise(resolve => { acknowledge = resolve; }); return receipt;
  }, async getImageJob(id) {
    if (++reads <= 3) throw new RuntimeImageError('image_not_found');
    return { ...await base.getImageJob(id), status: 'succeeded', executionOutcome: 'completed', output };
  }, async getImageBytes() { return bytes; } };
  const options = { runtimeClient, assetsDir: path.join(f.root, 'assets'), now: () => at, async authorizeCaller() {} };
  const first = new CatImageService({ ...options, ledger: f.ledger });
  const observer = new CatImageService({ ...options, ledger: second });
  const job = await first.submit(caller, request());
  while (!acknowledge) await new Promise(resolve => setTimeout(resolve, 1));
  observer.reconcile();
  for (let n = 0; n < 1000 && f.ledger.get(job.id).status !== 'interrupted'; n++) await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(f.ledger.get(job.id).status, 'interrupted'); acknowledge();
  for (let n = 0; n < 200 && f.ledger.get(job.id).status !== 'succeeded'; n++) await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(f.ledger.get(job.id).status, 'succeeded'); assert.equal(base.cancelled(), 0); assert.equal(base.calls(), 1);
  await first.close(); await observer.close();
});
