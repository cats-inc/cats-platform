import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, mkdtemp, readdir, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { encodeAppPackage } from '#cats-app-encode';
import { PLATFORM_VERSION } from '#cats-app-package';
import { AppImageService, imageContractFor, presentImageJob } from '../build/server/platform/apps/images.js';
import { MemoryCoreStore } from '../build/server/core/store.js';
import { installRendererPackage } from '../build/server/platform/apps/packageInstaller.js';
import { FileCatsAppRegistry } from '../build/server/platform/apps/registry.js';
import { resolveCatsAppStoragePathsFromChatState } from '../build/server/platform/apps/paths.js';
import { routeAppPackageApi } from '../build/server/app/server/appPackageRoutes.js';
import { RuntimeImageError, projectImageCapabilities, projectImageJob, readImageResponse } from '../build/server/runtime/images.js';
import { CatsRuntimeClient } from '../build/server/runtime/client.js';

const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const GROK = { id: 'grok-generate', revision: 1, operation: 'image.generate', targetIds: ['grok/native'], inputs: { min: 0, max: 0 },
  agentConfigs: [{ id: 'grok-4.7-xhigh', model: 'grok-4.7', effort: 'xhigh' }], aspectRatio: { mode: 'native', options: ['1:1'] } };
const MUSE = { id: 'muse-generate', revision: 1, operation: 'image.generate', targetIds: ['muse/native'], inputs: { min: 0, max: 0 },
  agentConfigs: [{ id: 'muse-spark-1.3-xhigh', model: 'muse-spark-1.3', effort: 'xhigh' }], aspectRatio: { mode: 'service' } };
const CURSOR = { id: 'cursor-generate', revision: 1, operation: 'image.generate', targetIds: ['cursor/native'], inputs: { min: 0, max: 0 },
  agentConfigs: [{ id: 'cursor-glm-5.3-max', model: 'glm-5p3[reasoning=max]', effort: 'max' }], aspectRatio: { mode: 'native', options: ['1:1'] } };
const CAPABILITIES = { schemaVersion: 2, revision: 'fixture-revision', maxPromptLength: 2000, maxImageBytes: 8388608,
  targets: [{ id: 'grok/native', provider: 'grok', instance: 'native' }, { id: 'muse/native', provider: 'muse', instance: 'native' }], profiles: [GROK, MUSE] };
async function install(chatStatePath, version, appSdk) {
  const manifest = { schemaVersion: 1, id: 'cats.studio', displayName: 'Studio', version,
    category: 'user-app', trustTier: 'local-user', publisher: { name: 'Cats' },
    compatibility: { catsPlatform: PLATFORM_VERSION, appSdk }, entrypoints: { renderer: 'renderer/index.html' },
    permissions: ['ui.route', 'ui.lobby', 'media.images'], contributions: { lobbyApps: [{ id: 'studio', title: 'Studio', routePath: '/apps/cats.studio' }] } };
  const archive = encodeAppPackage({ manifest,
    files: [{ path: 'renderer/index.html', data: Buffer.from('<html><head></head><body>Studio</body></html>') }] });
  await installRendererPackage({ chatStatePath, bytes: archive, pin: { id: manifest.id, version: manifest.version, sha256: digest(archive) }, source: 'local-package', enable: true });
}
async function setup(t, { appSdk = '^1.3.0' } = {}) {
  const root = await mkdtemp(path.join(tmpdir(), 'cats-app-images-'));
  t.after(() => rm(root, { recursive: true, force: true, maxRetries: 5 }));
  const chatStatePath = path.join(root, 'state', 'chat-state.local.json');
  await install(chatStatePath, '0.1.0', appSdk);
  const image = Buffer.from([255, 216, 255, 217]); // Runtime stub owns decoding; host asserts digest/transfer only.
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2]);
  const output = { mimeType: 'image/jpeg', bytes: image.length, width: 1024, height: 1024, sha256: digest(image), transparency: 'opaque' };
  const pngOutput = { mimeType: 'image/png', bytes: png.length, width: 1920, height: 1280, sha256: digest(png), transparency: 'opaque' };
  const records = new Map(); const requests = []; let submissions = 0; let cancellations = 0; let failReads = 0; let running = false;
  let holdSubmit; let releaseSubmit;
  const client = {
    async getImageCapabilities() { return structuredClone(CAPABILITIES); },
    async submitImageJob(input) {
      submissions++; requests.push(input); if (holdSubmit) await holdSubmit;
      const now = new Date().toISOString();
      const [provider, instance] = input.targetId.split('/');
      const config = CAPABILITIES.profiles.find((profile) => profile.id === input.profileId).agentConfigs[0];
      const record = { schemaVersion: 2, id: input.id, targetId: input.targetId, provider, instance, profileId: input.profileId,
        profileRevision: input.profileRevision, agentConfigId: input.agentConfigId, agentModel: config.model, agentEffort: config.effort,
        operation: input.operation, prompt: input.prompt, sourceIds: [], options: {}, status: running ? 'running' : 'succeeded',
        createdAt: now, updatedAt: now, error: null, warnings: [], executionOutcome: running ? null : provider === 'muse' ? 'stopped_after_image' : 'completed',
        output: running ? null : provider === 'muse' ? pngOutput : output };
      records.set(input.id, record); return record;
    },
    async getImageJob(id) { if (failReads-- > 0) throw new Error('Transient connection failure');
      if (!records.has(id)) throw new RuntimeImageError('image_not_found'); return records.get(id); },
    async cancelImageJob(id) { cancellations++; if (!records.has(id)) throw new RuntimeImageError('image_not_found');
      const record = { ...records.get(id), status: 'cancelled', output: null }; records.set(id, record); return record; },
    async getImageBytes(id) { return records.get(id)?.output?.mimeType === 'image/png' ? png : image; },
    async deleteImageJob(id) { deletions.push(id); records.delete(id); },
  };
  const deletions = [];
  const coreStore = new MemoryCoreStore();
  const deps = { coreStore, runtimeClient: client, chatStatePath };
  const service = new AppImageService(deps);
  const scope = { appId: 'cats.studio', version: '0.1.0', accountId: 'user-one' };
  const registry = new FileCatsAppRegistry({ registryPath: resolveCatsAppStoragePathsFromChatState(chatStatePath).registryPath });
  return { root, deps, client, service, scope, registry, image, png, records, requests, output, pngOutput, deletions,
    submissions: () => submissions, cancellations: () => cancellations,
    run: () => { running = true; }, failReads: (count) => { failReads = count; },
    hold: () => { holdSubmit = new Promise((resolve) => { releaseSubmit = resolve; }); }, release: () => releaseSubmit(),
  };
}
async function waitFor(f, id, status = 'succeeded') {
  for (let n = 0; n < 250; n++) {
    const job = (await f.service.list(f.scope)).find((entry) => entry.id === id);
    if (job?.status === status) return job;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Job did not become ${status}`);
}
const input = () => ({ requestId: randomUUID(), instance: 'native', prompt: 'A cat' });
const inputTwo = (profile = MUSE, fields = {}) => ({ requestId: randomUUID(), targetId: profile.targetIds[0], profileId: profile.id,
  profileRevision: String(profile.revision), agentConfigId: profile.agentConfigs[0].id, operation: 'image.generate', prompt: 'A cat',
  sourceIds: [], options: {}, ...fields });

test('Cursor contract 2 preserves the pinned configuration and accepts a JPEG job through the shared host', async (t) => {
  const f = await setup(t, { appSdk: '^1.7.0' });
  const cursorCapabilities = { ...CAPABILITIES,
    targets: [...CAPABILITIES.targets, { id: 'cursor/native', provider: 'cursor', instance: 'native' }], profiles: [...CAPABILITIES.profiles, CURSOR] };
  assert.equal(projectImageCapabilities(cursorCapabilities).targets.at(-1).provider, 'cursor');
  f.client.getImageCapabilities = async () => structuredClone(cursorCapabilities);
  f.client.submitImageJob = async (input) => {
    f.requests.push(input);
    const now = new Date().toISOString();
    const job = { ...input, schemaVersion: 2, provider: 'cursor', instance: 'native', agentModel: 'glm-5p3[reasoning=max]', agentEffort: 'max',
      status: 'succeeded', createdAt: now, updatedAt: now, error: null, warnings: [], executionOutcome: 'stopped_after_image', output: f.output };
    f.records.set(input.id, job); return projectImageJob(job);
  };
  assert.equal((await f.service.capabilities(f.scope)).targets.at(-1).provider, 'cursor');
  const job = await f.service.submit(f.scope, inputTwo(CURSOR));
  const saved = await waitFor(f, job.id);
  assert.equal(saved.provider, 'cursor'); assert.equal(saved.agentEffort, 'max');
  assert.equal(f.requests[0].agentConfigId, 'cursor-glm-5.3-max');
  assert.ok((await f.service.image(f.scope, job.id)).bytes.equals(f.image));
});

test('idempotent submit uses existing Core task/run/artifact, retains images across service restart and rejects cross-app/account access', async (t) => {
  const f = await setup(t); const request = input();
  const [a, b] = await Promise.all([f.service.submit(f.scope, request), f.service.submit(f.scope, request)]);
  assert.equal(a.id, b.id); await waitFor(f, a.id); assert.equal(f.submissions(), 1);
  await assert.rejects(f.service.submit(f.scope, { ...request, prompt: 'Different' }), /image_request_conflict/);
  const core = await f.deps.coreStore.readCore();
  assert.equal(core.tasks.length, 1); assert.equal(core.runs.length, 1); assert.equal(core.artifacts.length, 1);
  assert.equal(core.artifacts[0].runId, core.runs[0].id); assert.equal(core.artifacts[0].status, 'ready');
  const restarted = new AppImageService(f.deps);
  assert.ok((await restarted.image(f.scope, a.id)).bytes.equals(f.image));
  // A schema 1 App's request runs Runtime contract 2 with the Grok instance's current native 1:1 profile.
  assert.deepEqual(f.requests[0], { id: a.id, targetId: 'grok/native', profileId: 'grok-generate', profileRevision: '1',
    agentConfigId: 'grok-4.7-xhigh', operation: 'image.generate', prompt: 'A cat', sourceIds: [], options: {} });
  await assert.rejects(restarted.image({ ...f.scope, accountId: 'user-two' }, a.id), /image_not_found/);
  await assert.rejects(restarted.image({ ...f.scope, appId: 'cats.usage' }, a.id), /app_context_revoked/);
  assert.equal((await restarted.list({ ...f.scope, accountId: 'user-two' })).length, 0);
  await f.registry.updateAppState('cats.studio', { installState: 'disabled' });
  await assert.rejects(restarted.image(f.scope, a.id), /app_context_revoked/);
  assert.equal(f.submissions(), 1);
});

test('owner deletion removes a finished job, its Core records, the saved file and the Runtime receipt, never an active one', async (t) => {
  const f = await setup(t);
  const request = input();
  const saved = await f.service.submit(f.scope, request); await waitFor(f, saved.id);
  const file = path.join(resolveCatsAppStoragePathsFromChatState(f.deps.chatStatePath).dataDir, 'cats.studio', 'images',
    createHash('sha256').update('user-one').digest('hex'), `${saved.id}.jpg`);
  assert.ok((await readFile(file)).equals(f.image));
  await assert.rejects(f.service.remove({ ...f.scope, accountId: 'user-two' }, saved.id), /image_not_found/);
  // A Work link to the job's task blocks deletion; owner archive/pin state of the job's records is cleaned up.
  const link = { id: 'link-studio', kind: 'related', sourceRecordFamily: 'task', sourceRecordId: `task-app-image-${saved.id}`, targetRecordFamily: 'project', targetRecordId: 'project-x' };
  await f.deps.coreStore.updateCore((core) => ({ ...core, workGraphLinks: [...core.workGraphLinks, link],
    ownerLifecycle: { version: 1, revision: 3, receipts: [], retention: { enabled: false, days: 30, lastCleanupAt: null, lastError: null },
      entries: { [`artifact:artifact-app-image-${saved.id}`]: { listing: 'archived', pinned: true, label: null, updatedAt: new Date().toISOString() } } } }));
  await assert.rejects(f.service.remove(f.scope, saved.id), /image_in_use/);
  assert.ok((await readFile(file)).equals(f.image), 'a refused deletion keeps the original');
  await f.deps.coreStore.updateCore((core) => ({ ...core, workGraphLinks: core.workGraphLinks.filter((entry) => entry.id !== link.id) }));
  assert.deepEqual(await f.service.remove(f.scope, saved.id), { deleted: true });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(f.deletions, [saved.id]);
  const core = await f.deps.coreStore.readCore();
  assert.equal(core.tasks.length + core.runs.length + core.artifacts.length, 0);
  assert.deepEqual(core.ownerLifecycle.entries, {}); assert.equal(core.ownerLifecycle.revision, 4);
  await assert.rejects(readFile(file), /ENOENT/);
  assert.equal((await f.service.list(f.scope)).length, 0);
  await assert.rejects(f.service.remove(f.scope, saved.id), /image_not_found/);
  // The deleted requestId stays reserved, also for a fresh service after restart: no second generation.
  await assert.rejects(f.service.submit(f.scope, request), /image_request_conflict/);
  await assert.rejects(new AppImageService(f.deps).submit(f.scope, request), /image_request_conflict/);
  assert.equal(f.submissions(), 1);
  f.run(); const active = await f.service.submit(f.scope, input()); await waitFor(f, active.id, 'running');
  await assert.rejects(f.service.remove(f.scope, active.id), /image_not_deletable/);
  await f.service.cancel(f.scope, active.id); await waitFor(f, active.id, 'cancelled');
  assert.deepEqual(await f.service.remove(f.scope, active.id), { deleted: true });
  f.client.deleteImageJob = async () => { throw new Error('Runtime offline'); };
  const offline = await f.service.submit(f.scope, input()); await f.service.cancel(f.scope, offline.id); await waitFor(f, offline.id, 'cancelled');
  assert.deepEqual(await f.service.remove(f.scope, offline.id), { deleted: true }, 'an unreachable Runtime does not block deletion');
  assert.equal(f.submissions(), 3);
});

test('concurrent deletions keep every request ID reserved; unknown reservation data is never overwritten', async (t) => {
  const f = await setup(t); f.run();
  const requests = [input(), input()]; const created = [];
  for (const request of requests) {
    const job = await f.service.submit(f.scope, request); await f.service.cancel(f.scope, job.id); await waitFor(f, job.id, 'cancelled'); created.push(job);
  }
  await Promise.all(created.map((job) => f.service.remove(f.scope, job.id)));
  const restarted = new AppImageService(f.deps);
  for (const request of requests) await assert.rejects(restarted.submit(f.scope, request), /image_request_conflict/);
  assert.equal(f.submissions(), 2);
  const reservations = path.join(resolveCatsAppStoragePathsFromChatState(f.deps.chatStatePath).dataDir, 'image-deletions.json');
  const newer = JSON.stringify({ schemaVersion: 2, entries: [] });
  await writeFile(reservations, newer);
  const downgraded = new AppImageService(f.deps);
  await assert.rejects(downgraded.submit(f.scope, input()), /image_service_unavailable/);
  const left = await f.service.submit(f.scope, input()); await f.service.cancel(f.scope, left.id); await waitFor(f, left.id, 'cancelled');
  await assert.rejects(downgraded.remove(f.scope, left.id), /image_service_unavailable/);
  assert.equal(await readFile(reservations, 'utf8'), newer, 'unknown reservation data is preserved');
  assert.equal((await downgraded.list(f.scope)).length, 1, 'a refused deletion keeps the job');
});

test('transient Runtime read failure recovers the same attempt; no generating POST on restart', async (t) => {
  const f = await setup(t); f.run(); f.failReads(1);
  const job = await f.service.submit(f.scope, input());
  while (!f.records.has(job.id)) await new Promise((resolve) => setTimeout(resolve, 10));
  f.records.set(job.id, { ...f.records.get(job.id), status: 'succeeded', output: f.output });
  await waitFor(f, job.id); assert.equal(f.submissions(), 1);
});

test('reopening recollects a repaired source failure into the original task without resubmission', async (t) => {
  const f = await setup(t);
  const submit = f.client.submitImageJob;
  f.client.submitImageJob = async (request) => {
    const result = { ...await submit(request), status: 'failed', error: 'invalid_image_source', output: null };
    f.records.set(request.id, result); return result;
  };
  const job = await f.service.submit(f.scope, input());
  await waitFor(f, job.id, 'failed');
  assert.equal((await f.deps.coreStore.readCore()).artifacts.length, 0);
  f.service = new AppImageService(f.deps);
  const remote = f.records.get(job.id);
  // An unrelated receipt cannot repair this work.
  f.records.set(job.id, { ...remote, status: 'succeeded', prompt: 'Foreign work', output: f.output });
  await f.service.list(f.scope); await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal((await f.deps.coreStore.readCore()).tasks[0].metadata.appImage.status, 'failed');
  f.records.set(job.id, { ...remote, status: 'succeeded', error: null, output: f.output });
  await waitFor(f, job.id); assert.equal(f.submissions(), 1);
  assert.ok((await f.service.image(f.scope, job.id)).bytes.equals(f.image));
  const core = await f.deps.coreStore.readCore();
  assert.equal(core.tasks.length, 1); assert.equal(core.runs.length, 1); assert.equal(core.artifacts.length, 1);
  assert.equal(core.tasks[0].metadata.appImage.id, job.id);
});

test('cancel while submission is awaiting acknowledgement also cancels its late Runtime admission', async (t) => {
  const f = await setup(t); f.run(); f.hold();
  const job = await f.service.submit(f.scope, input());
  while (!f.submissions()) await new Promise((resolve) => setTimeout(resolve, 10));
  await f.service.cancel(f.scope, job.id); f.release();
  for (let n = 0; n < 100 && f.records.get(job.id)?.status !== 'cancelled'; n++) await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(f.records.get(job.id).status, 'cancelled');
  assert.notEqual((await f.service.list(f.scope))[0].status, 'succeeded');
  assert.equal(f.submissions(), 1); assert.ok(f.cancellations() >= 2);
});

test('transient cancellation failure retains intent and retries only cancellation', async (t) => {
  const f = await setup(t); f.run();
  const job = await f.service.submit(f.scope, input());
  while (!f.records.has(job.id)) await new Promise((resolve) => setTimeout(resolve, 10));
  const cancel = f.client.cancelImageJob; let attempts = 0;
  f.client.cancelImageJob = async (id) => { if (++attempts === 1) throw new Error('Disconnected'); return cancel(id); };
  const result = await f.service.cancel(f.scope, job.id);
  assert.equal(result.status, 'cancelling');
  await waitFor(f, job.id, 'cancelled'); assert.equal(f.submissions(), 1); assert.ok(attempts >= 2);
});

test('image routes bind package version and identity, restrict verbs/body, and project no owner bookkeeping', async (t) => {
  const f = await setup(t);
  async function call(route, method = 'GET', body, accountId = 'user-one', version = '0.1.0') {
    const request = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))]);
    let result;
    const response = { writeHead(status, headers) { result = { status, headers }; }, end(bytes) { result.body = Buffer.from(bytes ?? ''); } };
    await routeAppPackageApi({ request, response, url: new URL(`http://localhost/api/apps/cats.studio/images/${route}?version=${version}`), method,
      auth: { principal: { account: { id: accountId } } },
      dependencies: { config: { chatStatePath: f.deps.chatStatePath }, coreStore: f.deps.coreStore, runtimeClient: f.client } });
    return result;
  }
  assert.equal((await call('capabilities')).status, 200);
  assert.equal((await call('jobs', 'DELETE')).status, 405);
  assert.equal((await call('jobs', 'POST', { ...input(), command: 'bad' })).status, 400);
  assert.equal((await call('jobs', 'GET', undefined, 'user-one', '0.2.0')).status, 409);
  const submitted = await call('jobs', 'POST', input()); assert.equal(submitted.status, 202);
  const publicJob = JSON.parse(submitted.body); assert.equal(publicJob.accountId, undefined);
  // Route service shares Core with the fixture service, so projection exercises real persistence.
  await waitFor(f, publicJob.id);
  assert.equal((await call(`jobs/${publicJob.id}/image`, 'GET', undefined, 'user-two')).status, 404);
  const image = await call(`jobs/${publicJob.id}/image`); assert.equal(image.status, 200); assert.ok(image.body.equals(f.image));
  assert.equal(image.headers['content-type'], 'image/jpeg');
  assert.deepEqual(Object.keys(publicJob).sort(), ['agentModel', 'createdAt', 'error', 'id', 'instance', 'output', 'prompt', 'provider',
    'requestId', 'schemaVersion', 'status', 'updatedAt']);
  assert.equal(JSON.parse((await call('capabilities')).body).schemaVersion, 1);
  assert.equal((await call(`jobs/${publicJob.id}/delete`)).status, 405);
  assert.equal((await call(`jobs/${publicJob.id}/delete`, 'POST', {}, 'user-two')).status, 404);
  const deleted = await call(`jobs/${publicJob.id}/delete`, 'POST', {});
  assert.equal(deleted.status, 200); assert.deepEqual(JSON.parse(deleted.body), { deleted: true });
  assert.equal((await call(`jobs/${publicJob.id}/image`)).status, 404);
});

test('Runtime projection rejects unbounded or malformed images and redacts arbitrary errors', async () => {
  await assert.rejects(readImageResponse(new Response('X'.repeat(33000))), /image_output_limit/);
  const now = new Date().toISOString();
  const job = { schemaVersion: 2, id: randomUUID(), targetId: 'muse/native', provider: 'muse', instance: 'native', profileId: 'muse-generate',
    profileRevision: '1', agentConfigId: 'muse-spark-1.3-xhigh', agentModel: 'muse-spark-1.3', agentEffort: 'xhigh', operation: 'image.generate',
    prompt: 'A cat', sourceIds: [], options: {}, status: 'succeeded', createdAt: now, updatedAt: now, error: null, warnings: [], executionOutcome: 'stopped_after_image',
    output: { mimeType: 'image/png', bytes: 10, width: 1920, height: 1280, sha256: 'a'.repeat(64), transparency: 'has-transparency' } };
  assert.equal(projectImageJob(job).output.height, 1280);
  for (const invalid of [{ schemaVersion: 1 }, { provider: 'claude' }, { targetId: 'grok/native' }, { operation: 'image.edit' }, { warnings: 'x' }]) {
    assert.throws(() => projectImageJob({ ...job, ...invalid }), /image_service_unavailable/);
  }
  for (const output of [{ mimeType: 'image/gif' }, { width: 5000 }, { mimeType: 'image/jpeg', transparency: 'has-transparency' }, { transparency: 'maybe' }]) {
    assert.throws(() => projectImageJob({ ...job, output: { ...job.output, ...output } }), /invalid_image/);
  }
  assert.throws(() => projectImageJob({ ...job, output: null }), /invalid_image/);
  assert.equal(projectImageCapabilities(CAPABILITIES).profiles[1].aspectRatio.mode, 'service');
  for (const invalid of [{ schemaVersion: 1 }, { targets: [{ id: 'grok/other', provider: 'grok', instance: 'native' }] }]) {
    assert.throws(() => projectImageCapabilities({ ...CAPABILITIES, ...invalid }), /image_service_unavailable/);
  }
  // Profiles this host cannot offer are skipped, so the rest stay usable.
  const later = projectImageCapabilities({ ...CAPABILITIES, profiles: [...CAPABILITIES.profiles,
    { ...MUSE, id: 'muse-edit', operation: 'image.edit', inputs: { min: 1, max: 1 } },
    { ...MUSE, id: 'muse-choose', aspectRatio: { mode: 'choose', options: ['3:2'] } }, { ...MUSE, id: 'orphan', targetIds: ['codex/native'] }] });
  assert.deepEqual(later.profiles.map((profile) => profile.id), ['grok-generate', 'muse-generate']);
  const newer = projectImageCapabilities({ ...CAPABILITIES, targets: [...CAPABILITIES.targets, { id: 'future/native', provider: 'future', instance: 'native' }],
    profiles: [...CAPABILITIES.profiles, { ...MUSE, id: 'future-generate', targetIds: ['future/native'] }] });
  assert.deepEqual(newer.targets.map((target) => target.id), ['grok/native', 'muse/native']);
  assert.deepEqual(newer.profiles.map((profile) => profile.id), ['grok-generate', 'muse-generate']);
  await assert.rejects(readImageResponse(new Response(JSON.stringify({ error: 'SECRET /private/path' }), { status: 500 })), /image_service_unavailable/);
});

test('Runtime image client authenticates fixed routes and decodes UTF-8 JSON and binary bytes', async (t) => {
  const f = await setup(t);
  const request = { id: randomUUID(), targetId: 'grok/native', profileId: 'grok-generate', profileRevision: '1', agentConfigId: 'grok-4.7-xhigh',
    operation: 'image.generate', prompt: '一隻貓', sourceIds: [], options: {} };
  const now = new Date().toISOString();
  const job = { ...request, schemaVersion: 2, provider: 'grok', instance: 'native', agentModel: 'grok-4.7', agentEffort: 'xhigh', status: 'succeeded',
    createdAt: now, updatedAt: now, output: f.output, error: null, warnings: [], executionOutcome: 'completed' };
  const calls = []; const methods = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push(url); methods.push(options.method ?? 'GET'); assert.equal(options.headers.Authorization, 'Bearer fixture-key'); assert.ok(options.signal);
    if (options.method === 'DELETE') return new Response(JSON.stringify({ deleted: true }));
    if (url.endsWith('/image')) return new Response(f.image, { headers: { 'Content-Type': 'image/jpeg' } });
    if (url.endsWith('/capabilities')) return new Response(JSON.stringify(await f.client.getImageCapabilities()));
    return new Response(JSON.stringify(job));
  });
  const client = new CatsRuntimeClient('http://runtime.test', { apiKey: 'fixture-key' });
  assert.equal((await client.getImageCapabilities()).targets[0].id, 'grok/native');
  assert.equal((await client.submitImageJob(request)).prompt, '一隻貓');
  assert.equal((await client.getImageJob(request.id)).id, request.id);
  await client.cancelImageJob(request.id);
  assert.deepEqual(Buffer.from(await client.getImageBytes(request.id)), f.image);
  await client.deleteImageJob(request.id);
  assert.equal(calls.length, 6); assert.ok(calls.every((url) => url.startsWith('http://runtime.test/media/images/')));
  assert.equal(calls.at(-1), `http://runtime.test/media/images/jobs/${request.id}`); assert.equal(methods.at(-1), 'DELETE');
});

test('the App SDK floor selects the image contract; contract 2 runs Muse PNG work with measured output', async (t) => {
  assert.equal(imageContractFor('^1.3.0'), 1); assert.equal(imageContractFor('1.6.x'), 1); assert.equal(imageContractFor('1.x'), 1);
  assert.equal(imageContractFor('^1.7.0'), 2); assert.equal(imageContractFor('1.7.x'), 2); assert.equal(imageContractFor('2.x'), 2);
  assert.equal(imageContractFor('>=1.7.0'), 1, 'unsupported grammar never widens the contract');
  const f = await setup(t, { appSdk: '^1.7.0' });
  const capabilities = await f.service.capabilities(f.scope);
  assert.deepEqual(capabilities.targets, [{ id: 'grok/native', provider: 'grok', instanceLabel: 'native', availability: 'available' },
    { id: 'muse/native', provider: 'muse', instanceLabel: 'native', availability: 'available' }]);
  assert.deepEqual(capabilities.profiles.map((profile) => profile.id), ['grok-generate', 'muse-generate']);
  await assert.rejects(f.service.submit(f.scope, input()), /invalid_image_request/, 'contract 2 Apps do not send schema 1 requests');
  for (const invalid of [{ sourceIds: ['x'] }, { options: { aspectRatio: '3:2' } }, { targetId: 'claude/native' }, { operation: 'image.edit' }]) {
    await assert.rejects(f.service.submit(f.scope, inputTwo(MUSE, invalid)), /invalid_image_request/);
  }
  const request = inputTwo();
  const job = await f.service.submit(f.scope, request); const saved = await waitFor(f, job.id);
  assert.equal(f.requests[0].targetId, 'muse/native'); assert.equal(f.requests[0].agentConfigId, 'muse-spark-1.3-xhigh');
  assert.deepEqual(presentImageJob(saved, 2), { schemaVersion: 2, id: job.id, requestId: request.requestId, provider: 'muse', targetId: 'muse/native',
    instanceLabel: 'native', operation: 'image.generate', profileId: 'muse-generate', profileRevision: '1', agentConfigId: 'muse-spark-1.3-xhigh',
    agentModel: 'muse-spark-1.3', agentEffort: 'xhigh', prompt: 'A cat', sources: [], options: {}, status: 'succeeded', error: null, warnings: [],
    executionOutcome: 'stopped_after_image', output: f.pngOutput, createdAt: saved.createdAt, updatedAt: saved.updatedAt });
  const read = await f.service.image(f.scope, job.id);
  assert.equal(read.mimeType, 'image/png'); assert.ok(read.bytes.equals(f.png));
  const file = path.join(resolveCatsAppStoragePathsFromChatState(f.deps.chatStatePath).dataDir, 'cats.studio', 'images',
    createHash('sha256').update('user-one').digest('hex'), `${job.id}.png`);
  assert.ok((await readFile(file)).equals(f.png));
  assert.equal((await f.deps.coreStore.readCore()).artifacts[0].mimeType, 'image/png');
  // The same request is idempotent; another configuration for it is a conflict, never a second run.
  assert.equal((await f.service.submit(f.scope, request)).id, job.id);
  await assert.rejects(f.service.submit(f.scope, { ...request, profileRevision: '2' }), /image_request_conflict/);
  assert.equal(f.submissions(), 1);
  // Runtime refusing a stale profile fails the work at once, without polling for an attempt that never started.
  f.client.submitImageJob = async () => { throw new RuntimeImageError('image_profile_changed'); };
  const stale = await f.service.submit(f.scope, inputTwo(GROK));
  assert.equal((await waitFor(f, stale.id, 'failed')).error, 'image_profile_changed');
  // A later package that declares an older SDK sees only what schema 1 can describe: the PNG stays, hidden.
  await install(f.deps.chatStatePath, '0.2.0', '^1.3.0');
  const older = { ...f.scope, version: '0.2.0' };
  const visible = await f.service.list(older);
  assert.deepEqual(visible.map((entry) => entry.id), [stale.id]);
  await assert.rejects(f.service.image(older, job.id), /image_not_found/);
  assert.equal((await f.service.capabilities(older)).schemaVersion, 1);
  await install(f.deps.chatStatePath, '0.3.0', '^1.7.0');
  assert.ok((await f.service.image({ ...f.scope, version: '0.3.0' }, job.id)).bytes.equals(f.png));
  assert.deepEqual(await f.service.remove({ ...f.scope, version: '0.3.0' }, job.id), { deleted: true });
  await assert.rejects(readFile(file), /ENOENT/, 'deleting PNG work removes its .png original');
});

test('a cancellation that wins while a PNG is collected leaves no file behind', async (t) => {
  const f = await setup(t, { appSdk: '^1.7.0' });
  let release; let requested;
  const asked = new Promise((resolve) => { requested = resolve; });
  const bytes = f.client.getImageBytes;
  f.client.getImageBytes = async (id) => { requested(); await new Promise((resolve) => { release = resolve; }); return bytes(id); };
  const job = await f.service.submit(f.scope, inputTwo());
  await asked;
  await f.service.cancel(f.scope, job.id); release();
  await waitFor(f, job.id, 'cancelled');
  await new Promise((resolve) => setTimeout(resolve, 50));
  const folder = path.join(resolveCatsAppStoragePathsFromChatState(f.deps.chatStatePath).dataDir, 'cats.studio', 'images',
    createHash('sha256').update('user-one').digest('hex'));
  assert.deepEqual((await readdir(folder).catch(() => [])).filter((name) => name.startsWith(job.id)), []);
});

test('schema 1 Core records read as their schema 2 equivalent, keep their JPEG and are rewritten only on change', async (t) => {
  const f = await setup(t, { appSdk: '^1.7.0' });
  const id = randomUUID(); const now = new Date().toISOString();
  const legacy = { schemaVersion: 1, id, requestId: randomUUID(), appId: 'cats.studio', appVersion: '0.1.0', accountId: 'user-one', prompt: 'Old cat',
    instance: 'native', provider: 'grok', agentModel: 'grok-4.7-build-fast', status: 'succeeded', createdAt: now, updatedAt: now, error: null,
    output: { mimeType: 'image/jpeg', bytes: f.image.length, width: 1024, height: 1024, sha256: digest(f.image) } };
  await f.deps.coreStore.updateCore((core) => ({ ...core, tasks: [...core.tasks, { id: `task-app-image-${id}`, title: 'Studio · Old cat', status: 'completed',
    orchestratorActorId: null, createdAt: now, updatedAt: now, metadata: { appImage: legacy } }] }));
  const file = path.join(resolveCatsAppStoragePathsFromChatState(f.deps.chatStatePath).dataDir, 'cats.studio', 'images',
    createHash('sha256').update('user-one').digest('hex'), `${id}.jpg`);
  await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, f.image);
  const [job] = await f.service.list(f.scope);
  assert.deepEqual({ ...job, createdAt: undefined, updatedAt: undefined }, { schemaVersion: 2, id, requestId: legacy.requestId, appId: 'cats.studio',
    appVersion: '0.1.0', accountId: 'user-one', prompt: 'Old cat', targetId: 'grok/native', provider: 'grok', instance: 'native',
    profileId: 'grok-generate', profileRevision: '1', agentConfigId: null, operation: 'image.generate', agentModel: 'grok-4.7-build-fast',
    agentEffort: null, status: 'succeeded', createdAt: undefined, updatedAt: undefined, error: null, warnings: [], executionOutcome: 'completed',
    output: { ...legacy.output, transparency: 'opaque' } });
  assert.ok((await f.service.image(f.scope, id)).bytes.equals(f.image));
  assert.deepEqual((await f.deps.coreStore.readCore()).tasks.find((task) => task.id === `task-app-image-${id}`).metadata.appImage, legacy,
    'reading does not rewrite the stored record');
  assert.equal(presentImageJob(job, 1).output.mimeType, 'image/jpeg');
  assert.equal(presentImageJob(job, 1).output.transparency, undefined);
});


test('multimedia routes require the declared SDK and preserve App/account isolation', async (t) => {
  const f = await setup(t, { appSdk: '^1.8.0' });
  let version = '0.1.0';
  async function call(route, method = 'GET', body, accountId = 'user-one') {
    const request = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))]);
    let result;
    const response = { writeHead(status, headers) { result = { status, headers }; }, end(bytes) { result.body = Buffer.from(bytes ?? ''); } };
    const handled = await routeAppPackageApi({ request, response,
      url: new URL('http://localhost/api/apps/cats.studio/media/images/' + route + '?version=' + version), method,
      auth: { principal: { account: { id: accountId } } },
      dependencies: { config: { chatStatePath: f.deps.chatStatePath }, coreStore: f.deps.coreStore, runtimeClient: f.client } });
    assert.equal(handled, true);
    return result;
  }
  const capabilities = await call('capabilities');
  assert.equal(capabilities.status, 200);
  assert.equal(JSON.parse(capabilities.body).schemaVersion, 2);
  assert.equal((await call('jobs', 'POST', input())).status, 400, 'typed multimedia requires a profile');
  const submitted = await call('jobs', 'POST', inputTwo());
  assert.equal(submitted.status, 202);
  const job = JSON.parse(submitted.body);
  assert.equal(job.accountId, undefined); assert.equal(job.appId, undefined);
  await waitFor(f, job.id);
  const read = await call('jobs/' + job.id + '/image');
  assert.equal(read.status, 200); assert.ok(read.body.equals(f.png));
  assert.equal((await call('jobs/' + job.id + '/image', 'GET', undefined, 'other-account')).status, 404);
  assert.equal((await call('jobs/' + job.id + '/cancel')).status, 405);
  await install(f.deps.chatStatePath, '0.2.0', '^1.7.0');
  version = '0.2.0';
  const refused = await call('capabilities');
  assert.equal(refused.status, 403);
  assert.equal(JSON.parse(refused.body).error.code, 'app_media_sdk_required');
  assert.equal(f.submissions(), 1);
});


test('deleting work while its missing original is recollected cannot recreate or return the deleted image', async (t) => {
  const f = await setup(t);
  const job = await f.service.submit(f.scope, input()); await waitFor(f, job.id);
  const filename = path.join(resolveCatsAppStoragePathsFromChatState(f.deps.chatStatePath).dataDir, 'cats.studio', 'images',
    createHash('sha256').update('user-one').digest('hex'), job.id + '.jpg');
  await rm(filename);
  let entered, release;
  const began = new Promise((resolve) => { entered = resolve; });
  const held = new Promise((resolve) => { release = resolve; });
  f.client.getImageBytes = async () => { entered(); await held; return f.image; };
  const reading = f.service.image(f.scope, job.id);
  const rejected = assert.rejects(reading, /image_not_found/);
  await began;
  await f.service.remove(f.scope, job.id);
  release(); await rejected;
  await assert.rejects(readFile(filename), /ENOENT/);
  assert.equal(f.submissions(), 1);
});
