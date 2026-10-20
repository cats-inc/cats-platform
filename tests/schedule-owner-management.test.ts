import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, writeFile, mkdir, rm, readdir } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { createDefaultCoreState, upsertCoreRun } from '../src/core/model/index.ts';
import { MemoryCoreStore } from '../src/core/store.ts';
import { createSchedulerService, createScheduleRule, MemoryScheduleStore, FileBackedScheduleStore } from '../src/platform/scheduler/index.ts';
import { previewScheduleOwner, applyScheduleOwner } from '../src/platform/scheduler/ownerManagement.ts';
import { executionSource } from '../src/products/work/state/historyManagement.ts';

const now = new Date('2026-10-20T00:00:00Z');
const ruleInput = { title: 'Daily work', enabled: false, timezone: 'Asia/Taipei', schedule: { kind: 'daily', time: '09:00' }, createdByActorId: 'actor-owner', missionTemplate: { target: { kind: 'agent', id: 'actor-owner' }, originSurface: 'schedule', intent: 'Review work', approvalPolicy: { required: true }, toolScopes: ['review'] } };
const rule = createScheduleRule({ ...ruleInput, id: 'rule' }, now);

test('schedule owner preview protects active/claimed work, retains provenance and prevents stale resurrection', async () => {
  const store = new MemoryScheduleStore({ version: 1, updatedAt: now.toISOString(), rules: [rule], triggerReceipts: [] });
  let core = createDefaultCoreState();
  let preview = previewScheduleOwner(await store.readState(), core, rule.id, 'rule');
  const claim = await store.claimTriggerReceipt({ ruleId: rule.id, ruleRevision: 1, scheduledFireAt: now.toISOString(), actualFireAt: now.toISOString(), idempotencyKey: 'once', reason: 'due' });
  await assert.rejects(store.ownerUpdate(state => applyScheduleOwner(state, core, rule.id, { scope: 'rule', token: preview.token })), /changed/);
  preview = previewScheduleOwner(await store.readState(), core, rule.id, 'receipts');
  assert.ok(preview.blockers.some(reason => reason.includes('admitted')));
  await store.updateTriggerReceipt(claim.receipt.id, { status: 'admitted', runId: 'run', message: 'secret execution detail', metadata: { response: 'long detail' } });
  core = upsertCoreRun(core, { id: 'run', title: 'Scheduled attempt', status: 'running', metadata: { source: 'schedule_rule', scheduleTrigger: { ruleId: rule.id } } }).core;
  assert.equal(executionSource(core.runs[0]), 'schedule');
  preview = previewScheduleOwner(await store.readState(), core, rule.id, 'rule');
  assert.ok(preview.blockers.some(reason => reason.includes('active')));
  core = upsertCoreRun(core, { id: 'run', title: 'Scheduled attempt', status: 'completed' }).core;
  preview = previewScheduleOwner(await store.readState(), core, rule.id, 'rule');
  const result = await store.ownerUpdate(state => applyScheduleOwner(state, core, rule.id, { scope: 'rule', token: preview.token }));
  assert.equal(result.rules.length, 0); assert.equal(result.triggerReceipts[0].runId, 'run');
  assert.equal(result.triggerReceipts[0].idempotencyKey, 'once'); assert.equal(result.triggerReceipts[0].message, null);
  await assert.rejects(store.upsertRule(rule), /stale tick/);
  await assert.rejects(store.claimTriggerReceipt({ ruleId: rule.id, ruleRevision: 1, scheduledFireAt: now.toISOString(), actualFireAt: now.toISOString(), idempotencyKey: 'new', reason: 'due' }), /removed/);
});

test('checked schedule editing preserves permissions and rejects a stale form', async () => {
  const store = new MemoryScheduleStore({ version: 1, updatedAt: now.toISOString(), rules: [rule], triggerReceipts: [] });
  const service = createSchedulerService({ scheduleStore: store, coreStore: new MemoryCoreStore(createDefaultCoreState()), now: () => now });
  const original = (await service.getRule(rule.id))!;
  const updated = await service.updateRule(rule.id, { title: 'Renamed', expectedRule: original });
  assert.deepEqual(updated.missionTemplate.approvalPolicy, { required: true });
  assert.deepEqual(updated.missionTemplate.toolScopes, ['review']);
  await assert.rejects(service.updateRule(rule.id, { enabled: true, expectedRule: original }), /changed/);
});

test('schedule deletion and receipt compaction survive restart/recovery; failed backups preserve input and future data stays untouched', async t => {
  const dir = await mkdtemp(path.join(tmpdir(), 'cats-schedule-owner-')); t.after(() => rm(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'schedules.json');
  const store = new FileBackedScheduleStore(file, () => now);
  await store.upsertRule(rule);
  const claim = await store.claimTriggerReceipt({ ruleId: rule.id, ruleRevision: 1, scheduledFireAt: now.toISOString(), actualFireAt: now.toISOString(), idempotencyKey: 'receipt', reason: 'due' });
  await store.updateTriggerReceipt(claim.receipt.id, { status: 'failed', message: 'purge-me', metadata: { detail: 'purge-me' } });
  const core = createDefaultCoreState();
  const preview = previewScheduleOwner(await store.readState(), core, rule.id, 'rule');
  const original = await readFile(file, 'utf8');
  await rm(file + '.bak'); await mkdir(file + '.bak');
  await assert.rejects(store.ownerUpdate(state => applyScheduleOwner(state, core, rule.id, { scope: 'rule', token: preview.token })));
  assert.equal(await readFile(file, 'utf8'), original);
  assert.equal((await readdir(dir)).some(name => name.endsWith('.tmp')), false);
  await rm(file + '.bak', { recursive: true });
  await store.ownerUpdate(state => applyScheduleOwner(state, core, rule.id, { scope: 'rule', token: preview.token }));
  assert.equal((await readFile(file + '.bak', 'utf8')).includes('purge-me'), false);
  await writeFile(file, '{damaged');
  const recovered = await new FileBackedScheduleStore(file, () => now).readState();
  assert.equal(recovered.rules.length, 0); assert.deepEqual(recovered.deletedRuleIds, [rule.id]);
  const future = JSON.stringify({ ...recovered, version: 999 }); await writeFile(file, future);
  await assert.rejects(new FileBackedScheduleStore(file).readState(), /Unsupported/);
  assert.equal(await readFile(file, 'utf8'), future);
});
