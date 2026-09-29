import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { encodeAppPackage } from '#cats-app-encode';
import { PLATFORM_VERSION } from '#cats-app-package';
import { AppImageService } from '../build/server/platform/apps/images.js';
import { MemoryCoreStore } from '../build/server/core/store.js';
import { installRendererPackage } from '../build/server/platform/apps/packageInstaller.js';
import { FileCatsAppRegistry } from '../build/server/platform/apps/registry.js';
import { resolveCatsAppStoragePathsFromChatState } from '../build/server/platform/apps/paths.js';
import { routeAppPackageApi } from '../build/server/app/server/appPackageRoutes.js';
import { RuntimeImageError, projectImageJob, readImageResponse } from '../build/server/runtime/images.js';
import { CatsRuntimeClient } from '../build/server/runtime/client.js';

const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
async function setup(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'cats-app-images-'));
  t.after(() => rm(root, { recursive: true, force: true, maxRetries: 5 }));
  const chatStatePath = path.join(root, 'state', 'chat-state.local.json');
  const manifest = { schemaVersion: 1, id: 'cats.studio', displayName: 'Studio', version: '0.1.0',
    category: 'user-app', trustTier: 'local-user', publisher: { name: 'Cats' },
    compatibility: { catsPlatform: PLATFORM_VERSION, appSdk: '^1.3.0' }, entrypoints: { renderer: 'renderer/index.html' },
    permissions: ['ui.route', 'ui.lobby', 'media.images'], contributions: { lobbyApps: [{ id: 'studio', title: 'Studio', routePath: '/apps/cats.studio' }] } };
  const archive = encodeAppPackage({ manifest,
    files: [{ path: 'renderer/index.html', data: Buffer.from('<html><head></head><body>Studio</body></html>') }] });
  await installRendererPackage({ chatStatePath, bytes: archive, pin: { id: manifest.id, version: manifest.version, sha256: digest(archive) }, source: 'local-package', enable: true });
  const image = Buffer.from([255, 216, 255, 217]); // Runtime stub owns decoding; host asserts digest/transfer only.
  const output = { mimeType: 'image/jpeg', bytes: image.length, width: 1024, height: 1024, sha256: digest(image) };
  const records = new Map(); let submissions = 0; let cancellations = 0; let failReads = 0; let running = false;
  let holdSubmit; let releaseSubmit;
  const client = {
    async getImageCapabilities() { return { schemaVersion: 1, operation: 'image.generate', aspectRatio: '1:1', maxPromptLength: 2000, maxImageBytes: 8388608,
      targets: [{ provider: 'grok', instance: 'native', agentModel: 'fixture' }] }; },
    async submitImageJob(input) {
      submissions++; if (holdSubmit) await holdSubmit;
      const now = new Date().toISOString();
      const record = { ...input, schemaVersion: 1, provider: 'grok', agentModel: 'fixture', status: running ? 'running' : 'succeeded',
        createdAt: now, updatedAt: now, output: running ? null : output, error: null };
      records.set(input.id, record); return record;
    },
    async getImageJob(id) { if (failReads-- > 0) throw new Error('Transient connection failure');
      if (!records.has(id)) throw new RuntimeImageError('image_not_found'); return records.get(id); },
    async cancelImageJob(id) { cancellations++; if (!records.has(id)) throw new RuntimeImageError('image_not_found');
      const record = { ...records.get(id), status: 'cancelled', output: null }; records.set(id, record); return record; },
    async getImageBytes() { return image; },
  };
  const coreStore = new MemoryCoreStore();
  const deps = { coreStore, runtimeClient: client, chatStatePath };
  const service = new AppImageService(deps);
  const scope = { appId: 'cats.studio', version: '0.1.0', accountId: 'user-one' };
  const registry = new FileCatsAppRegistry({ registryPath: resolveCatsAppStoragePathsFromChatState(chatStatePath).registryPath });
  return { root, deps, client, service, scope, registry, image, records, output,
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

test('idempotent submit uses existing Core task/run/artifact, retains images across service restart and rejects cross-app/account access', async (t) => {
  const f = await setup(t); const request = input();
  const [a, b] = await Promise.all([f.service.submit(f.scope, request), f.service.submit(f.scope, request)]);
  assert.equal(a.id, b.id); await waitFor(f, a.id); assert.equal(f.submissions(), 1);
  await assert.rejects(f.service.submit(f.scope, { ...request, prompt: 'Different' }), /image_request_conflict/);
  const core = await f.deps.coreStore.readCore();
  assert.equal(core.tasks.length, 1); assert.equal(core.runs.length, 1); assert.equal(core.artifacts.length, 1);
  assert.equal(core.artifacts[0].runId, core.runs[0].id); assert.equal(core.artifacts[0].status, 'ready');
  const restarted = new AppImageService(f.deps);
  assert.ok((await restarted.image(f.scope, a.id)).equals(f.image));
  await assert.rejects(restarted.image({ ...f.scope, accountId: 'user-two' }, a.id), /image_not_found/);
  await assert.rejects(restarted.image({ ...f.scope, appId: 'cats.usage' }, a.id), /app_context_revoked/);
  assert.equal((await restarted.list({ ...f.scope, accountId: 'user-two' })).length, 0);
  await f.registry.updateAppState('cats.studio', { installState: 'disabled' });
  await assert.rejects(restarted.image(f.scope, a.id), /app_context_revoked/);
  assert.equal(f.submissions(), 1);
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
  assert.ok((await f.service.image(f.scope, job.id)).equals(f.image));
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
});

test('Runtime projection rejects unbounded or malformed images and redacts arbitrary errors', async () => {
  await assert.rejects(readImageResponse(new Response('X'.repeat(33000))), /image_output_limit/);
  assert.throws(() => projectImageJob({ schemaVersion: 1, id: randomUUID(), provider: 'grok', status: 'succeeded' }), /invalid_image/);
  await assert.rejects(readImageResponse(new Response(JSON.stringify({ error: 'SECRET /private/path' }), { status: 500 })), /image_service_unavailable/);
});

test('Runtime image client authenticates fixed routes and decodes UTF-8 JSON and binary bytes', async (t) => {
  const f = await setup(t); const request = { id: randomUUID(), instance: 'native', prompt: '一隻貓' };
  const now = new Date().toISOString();
  const job = { ...request, schemaVersion: 1, provider: 'grok', agentModel: 'fixture', status: 'succeeded',
    createdAt: now, updatedAt: now, output: f.output, error: null };
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push(url); assert.equal(options.headers.Authorization, 'Bearer fixture-key'); assert.ok(options.signal);
    if (url.endsWith('/image')) return new Response(f.image, { headers: { 'Content-Type': 'image/jpeg' } });
    if (url.endsWith('/capabilities')) return new Response(JSON.stringify(await f.client.getImageCapabilities()));
    return new Response(JSON.stringify(job));
  });
  const client = new CatsRuntimeClient('http://runtime.test', { apiKey: 'fixture-key' });
  assert.equal((await client.getImageCapabilities()).targets[0].instance, 'native');
  assert.equal((await client.submitImageJob(request)).prompt, '一隻貓');
  assert.equal((await client.getImageJob(request.id)).id, request.id);
  await client.cancelImageJob(request.id);
  assert.deepEqual(Buffer.from(await client.getImageBytes(request.id)), f.image);
  assert.equal(calls.length, 5); assert.ok(calls.every((url) => url.startsWith('http://runtime.test/media/images/')));
});
