import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash, randomBytes } from 'node:crypto';
import { mkdtemp, mkdir, readFile, writeFile, rename, rm, link } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { MemoryChatStore } from '../build/server/products/chat/state/store.js';
import { admitCollaboration, writeCollaborationIntent } from '../build/server/products/work/state/collaborationRecords.js';
import { upsertCoreArtifact, upsertCoreRun, upsertCoreMission, upsertCoreTask } from '../build/server/core/model/index.js';
import { createCandidateRevisionSet } from '../build/server/platform/development/candidateOwnership.js';
import { prepareWorkCandidate } from '../build/server/products/work/state/candidateEvidence.js';
import { controlWorkCandidate, listWorkCandidates, reconcileWorkCandidates } from '../build/server/products/work/state/candidateLifecycle.js';
import { recoverCollaborations, stopCollaboration } from '../build/server/products/work/state/collaborationExecution.js';
import { routeWorkRunCancellationApi } from '../build/server/products/work/api/runCancellationRoutes.js';
import { buildWorkTaskListProjection } from '../build/server/products/work/api/projection.js';
import { routeWorkCandidateEvidenceApi } from '../build/server/products/work/api/candidateEvidenceRoutes.js';
import { resolveDesktopCandidateProfile } from '../build/desktop/candidateProfile.js';
import { startDesktopCandidateControl } from '../build/desktop/candidateControl.js';

async function fixture(t) {
  const directory = await mkdtemp(path.join(tmpdir(), 'cats-candidate-lifecycle-'));
  const root = path.join(directory, 'candidate'), store = new MemoryChatStore(), members = [];
  let close, extraClose;
  t.after(async () => {
    await close?.(); await extraClose?.();
    const relative = path.relative(tmpdir(), directory);
    assert.ok(relative.startsWith('cats-candidate-lifecycle-') && !path.isAbsolute(relative));
    await rm(directory, { recursive: true, force: true });
  });
  // Synthetic historical Core revisions; lifecycle deliberately needs no source Git reads.
  for (const member of ['platform', 'runtime']) {
    const source = path.join(directory, `cats-${member}`); await mkdir(source);
    await writeFile(path.join(source, 'package.json'), JSON.stringify({ name: `@cats-inc/cats-${member}` }));
    let core = await store.readCore();
    const admitted = admitCollaboration(core, { sourceChannelId: 'source', sourceConversationId: 'conversation-source',
      proposalMessageId: `proposal-${member}`, originalMessageId: `original-${member}`, originalGoalDigest: `goal-${member}`,
      ownerActorId: core.ownerProfile.actorId, confirmationMessageId: `confirm-${member}`, proposalDigest: `digest-${member}`,
      goal: 'Fixture revision', expectedOutput: 'Local revision', conversationIntent: 'create', contextRevision: `context-${member}`,
      workspacePath: source, workers: { implementation: { catId: 'author', actorId: 'author', name: 'Author', target: { provider: 'fixture' } },
        review: { catId: 'reviewer', actorId: 'reviewer', name: 'Reviewer', target: { provider: 'fixture' } } },
      budget: { maxTokens: 100, maxDurationMs: 60000 } });
    core = admitted.core;
    const intent = admitted.intent, stage = intent.stages.implementation, commitId = (member === 'platform' ? 'a' : 'b').repeat(40);
    stage.status = 'result_ready'; stage.sessionId = `session-${member}`; stage.workspacePath = source;
    intent.implementationEvidence = { artifactId: `revision-${member}`, runId: stage.runId, sessionId: stage.sessionId,
      workspacePath: source, baselineCommitId: 'c'.repeat(40), commitId, validation: 'runtime_clean_new_head' };
    core = upsertCoreRun(core, { id: stage.runId, taskId: stage.taskId, title: 'Implementation', status: 'completed',
      metadata: { collaborationId: intent.id, role: 'implementation' } }).core;
    core = upsertCoreArtifact(core, { id: `revision-${member}`, taskId: stage.taskId, runId: stage.runId,
      title: 'Revision', kind: 'report', status: 'ready', metadata: { source: 'work-collaboration', commitId, sessionId: stage.sessionId } }).core;
    await store.writeCore(writeCollaborationIntent(core, intent)); members.push({ intent, stage, source });
  }
  const prepared = await prepareWorkCandidate({ coreStore: store, taskId: members[0].intent.id,
    request: { requestId: 'lifecycle-fixture', root, companionTaskId: members[1].intent.id } });
  await mkdir(root);
  const token = randomBytes(32).toString('hex'), launchId = createHash('sha256').update(token).digest('hex');
  await writeFile(path.join(root, 'launch.json'), JSON.stringify({ schemaVersion: 1, root, launchId, ownership: prepared.ownership }));
  const profile = resolveDesktopCandidateProfile({ env: { CATS_DESKTOP_CANDIDATE_ROOT: root,
    CATS_DESKTOP_APP_HOST: '127.0.0.1', CATS_DESKTOP_RUNTIME_HOST: '127.0.0.1',
    CATS_DESKTOP_APP_PORT: '43121', CATS_DESKTOP_RUNTIME_PORT: '43122' },
    normalCatsHomeDir: path.join(directory, 'normal'), normalElectronDirs: [] });
  let stops = 0, closing;
  const hostInput = { profile, token, status: () => ({ services: [{ ready: false }, { ready: false }] }),
    screenshot: async () => { throw new Error('Not used'); }, input: async () => {}, invalidate() {} };
  const host = await startDesktopCandidateControl({ ...hostInput, stop: () => { stops++; void close(); } });
  close = () => closing ??= host.close(0);
  const control = JSON.parse(await readFile(path.join(root, 'control.json'), 'utf8'));
  const options = { coreStore: store, taskId: members[0].intent.id, artifactId: prepared.artifactId };
  return { directory, root, store, members, control, prepared, options, token, close,
    stops: () => stops, replace: async () => {
      await close();
      const replacement = await startDesktopCandidateControl({ ...hostInput, stop: () => { stops++; } });
      extraClose = () => replacement.close(0);
      return JSON.parse(await readFile(path.join(root, 'control.json'), 'utf8'));
    } };
}

test('Work observes and drains its historical candidate without source or healthy services; restart does not replay stop', async t => {
  const f = await fixture(t);
  assert.equal((await listWorkCandidates(f.store, f.options.taskId)).candidates.length, 1);
  const observed = await controlWorkCandidate({ ...f.options, action: 'status' });
  assert.equal(observed.observation.state, 'running'); assert.equal(observed.observation.instanceBoundStop, true);
  f.members[0].intent.status = 'cancelled'; delete f.members[0].intent.implementationEvidence;
  await f.store.updateCore(core => writeCollaborationIntent(core, f.members[0].intent));
  await rename(f.members[0].source, path.join(f.directory, 'retained-source'));
  const projection = buildWorkTaskListProjection(await f.store.readCore()).tasks.find(row => row.id === f.options.taskId);
  assert.equal(projection.candidateEvidenceAvailable, undefined); assert.equal(projection.candidateControlAvailable, true);
  const before = await f.store.readCore();
  await controlWorkCandidate({ ...f.options, action: 'stop' }); await f.close();
  assert.equal(f.stops(), 1);
  const restored = new MemoryChatStore(); await restored.writeCore(await f.store.readCore());
  assert.ok((await listWorkCandidates(restored, f.options.taskId)).candidates[0].observation.stopRequestedAt);
  const ended = await controlWorkCandidate({ ...f.options, coreStore: restored, action: 'status' });
  assert.equal(ended.observation.state, 'drained'); assert.equal(f.stops(), 1);
  assert.deepEqual((await restored.readCore()).tasks, before.tasks); assert.deepEqual((await restored.readCore()).runs, before.runs);
  assert.equal(JSON.stringify(await restored.readCore()).includes(f.token), false);
  assert.equal(await readFile(path.join(f.directory, 'retained-source/package.json'), 'utf8'), '{"name":"@cats-inc/cats-platform"}');
});

test('owner changes during live observation and failed atomic intent persistence prevent the stop POST', async t => {
  const f = await fixture(t), original = await f.store.readCore(), fetch = globalThis.fetch;
  let posts = 0;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    if (options?.method === 'POST') posts++;
    const response = await fetch(url, options);
    if (String(url).endsWith('/status')) await f.store.updateCore(core => ({ ...core,
      tasks: core.tasks.map(task => task.id === f.members[1].stage.taskId ? { ...task, ownerActorId: 'foreign-owner' } : task) }));
    return response;
  });
  await assert.rejects(controlWorkCandidate({ ...f.options, action: 'stop' }), /candidate_owner_changed/u);
  assert.equal(posts, 0); assert.equal(f.stops(), 0);
  t.mock.restoreAll(); await f.store.writeCore(original);
  await assert.rejects(controlWorkCandidate({ ...f.options, action: 'stop', coreStore: {
    readCore: () => f.store.readCore(), updateCore: async () => { throw new Error('disk unavailable'); },
  } }), /disk unavailable/u);
  assert.equal(f.stops(), 0); assert.deepEqual((await f.store.readCore()).artifacts, original.artifacts);
});

test('fixed Core and attached identities reject replacement hosts and host rejects an old stop nonce', async t => {
  const f = await fixture(t);
  await controlWorkCandidate({ ...f.options, action: 'status' });
  const replacement = await f.replace();
  await assert.rejects(controlWorkCandidate({ ...f.options, action: 'stop' }), /candidate_identity_mismatch/u);
  const response = await fetch(`${replacement.url}/stop-instance`, { method: 'POST',
    headers: { Authorization: `Bearer ${f.token}`, 'X-Cats-Instance-Id': f.control.instanceId } });
  assert.equal(response.status, 409); assert.equal(f.stops(), 0);
  await f.store.updateCore(core => ({ ...core, artifacts: core.artifacts.map(row => row.id === f.prepared.artifactId ? {
    ...row, status: 'ready', metadata: { ...row.metadata, candidateLifecycle: undefined,
      candidate: { root: f.root, launchId: f.control.launchId, instanceId: f.control.instanceId, hostPid: f.control.pid } },
  } : row) }));
  await assert.rejects(controlWorkCandidate({ ...f.options, action: 'stop' }), /candidate_identity_mismatch/u);
  assert.equal(f.stops(), 0);
});

test('old hosts, changed control files, linked files and incomplete exit receipts cannot authorize or report a successful stop', async t => {
  const f = await fixture(t), fetch = globalThis.fetch;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    const response = await fetch(url, options), value = await response.json();
    delete value.instanceBoundStop; return Response.json(value);
  });
  await assert.rejects(controlWorkCandidate({ ...f.options, action: 'stop' }), /candidate_control_upgrade_required/u);
  t.mock.restoreAll();
  const controlFile = path.join(f.root, 'control.json');
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    const response = await fetch(url, options);
    await writeFile(controlFile, JSON.stringify({ ...f.control, url: 'http://127.0.0.1:1' })); return response;
  });
  await assert.rejects(controlWorkCandidate({ ...f.options, action: 'stop' }), /candidate_changed/u);
  t.mock.restoreAll(); await writeFile(controlFile, JSON.stringify(f.control));
  const held = path.join(f.root, 'held-control.json'); await rename(controlFile, held);
  await link(held, controlFile);
  await assert.rejects(controlWorkCandidate({ ...f.options, action: 'stop' }), /candidate_invalid_control/u);
  await rm(controlFile); await rename(held, controlFile);
  await writeFile(path.join(f.root, `exit-${f.control.instanceId}.json`), JSON.stringify({ schemaVersion: 1, root: f.root,
    launchId: f.control.launchId, instanceId: f.control.instanceId, pid: f.control.pid, exitCode: 0 }));
  await assert.rejects(controlWorkCandidate({ ...f.options, action: 'status' }), /candidate_invalid_control/u);
  assert.equal(f.stops(), 0);
});

test('late running observations cannot revive drained state or downgrade a concurrently attached artifact', async t => {
  const f = await fixture(t), running = (await controlWorkCandidate({ ...f.options, action: 'status' })).observation;
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const late = controlWorkCandidate({ ...f.options, action: 'status', operate: async () => { await gate; return running; } });
  await controlWorkCandidate({ ...f.options, action: 'stop' }); await f.close();
  await controlWorkCandidate({ ...f.options, action: 'status' });
  await f.store.updateCore(core => ({ ...core, artifacts: core.artifacts.map(row => row.id === f.prepared.artifactId
    ? { ...row, status: 'ready' } : row) }));
  release(); assert.equal((await late).observation.state, 'drained');
  assert.equal((await f.store.readCore()).artifacts.find(row => row.id === f.prepared.artifactId).status, 'ready');
});

test('control HTTP entry only accepts owner/admin and bounded artifact actions, with no path or endpoint override', async t => {
  const f = await fixture(t);
  const server = createServer((request, response) => {
    void routeWorkCandidateEvidenceApi({ request, response, method: request.method,
      url: new URL(request.url, 'http://localhost'), auth: { principal: { membership: { roles: [request.headers['x-test-role'] ?? 'member'] } } },
      dependencies: { coreStore: f.store } }).then(handled => { if (!handled) response.writeHead(404).end(); });
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { const closed = once(server, 'close'); server.close(); server.closeAllConnections(); await closed; });
  const url = `http://127.0.0.1:${server.address().port}/api/work/tasks/${f.options.taskId}/candidate-control`;
  assert.equal((await fetch(url)).status, 403);
  const headers = { 'x-test-role': 'owner', 'content-type': 'application/json' };
  assert.equal((await (await fetch(url, { headers })).json()).candidates.length, 1);
  const post = body => fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
  for (const body of [{ artifactId: f.prepared.artifactId, action: 'build' },
    { artifactId: f.prepared.artifactId, action: 'stop', root: f.root }, { artifactId: 'foreign', action: 'stop' }]) {
    assert.equal((await post(body)).status, 409);
  }
  const response = await post({ artifactId: f.prepared.artifactId, action: 'status' });
  assert.equal(response.status, 200); assert.equal((await response.json()).observation.state, 'running');
  assert.equal(f.stops(), 0);
});

test('primary and companion cancellation race sends only one stop, and duplicates only observe', async t => {
  const f = await fixture(t);
  await controlWorkCandidate({ ...f.options, action: 'status' });
  const fetch = globalThis.fetch; let posts = 0;
  t.mock.method(globalThis, 'fetch', (url, options) => { if (options?.method === 'POST') posts++; return fetch(url, options); });
  await Promise.all(f.members.map(member => reconcileWorkCandidates({ coreStore: f.store, mode: 'cancel', taskIds: [member.intent.id] })));
  await f.close(); assert.equal(posts, 1); assert.equal(f.stops(), 1);
  const again = await reconcileWorkCandidates({ coreStore: f.store, mode: 'cancel', taskIds: [f.members[1].intent.id] });
  assert.equal(again.drained, 1); assert.equal(posts, 1);
});

test('cancellation and recovery never claim an unbound generation or contact its endpoint', async t => {
  const f = await fixture(t);
  t.mock.method(globalThis, 'fetch', () => assert.fail('Unbound candidates must not be contacted'));
  for (const mode of ['cancel', 'observe']) assert.deepEqual(await reconcileWorkCandidates({ coreStore: f.store,
    mode, taskIds: [f.options.taskId] }), { drained: 0, failed: 0, pending: 0, unbound: 1 });
  assert.equal(f.stops(), 0);
  assert.equal((await f.store.readCore()).artifacts.find(row => row.id === f.prepared.artifactId).metadata.candidateLifecycle, undefined);
});

test('clearing the binding while status is pending prevents stop and never recreates the binding', async t => {
  const f = await fixture(t);
  await controlWorkCandidate({ ...f.options, action: 'status' });
  const fetch = globalThis.fetch; let posts = 0;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    if (options.method === 'POST') posts++;
    const response = await fetch(url, options);
    await f.store.updateCore(core => ({ ...core, artifacts: core.artifacts.map(row => row.id === f.prepared.artifactId
      ? { ...row, metadata: { ...row.metadata, candidateLifecycle: undefined } } : row) }));
    return response;
  });
  assert.deepEqual(await reconcileWorkCandidates({ coreStore: f.store, mode: 'cancel', taskIds: [f.options.taskId] }),
    { drained: 0, failed: 0, pending: 1, unbound: 0 });
  assert.equal(posts, 0); assert.equal(f.stops(), 0);
  assert.equal((await f.store.readCore()).artifacts.find(row => row.id === f.prepared.artifactId).metadata.candidateLifecycle, undefined);
});

test('completed historical collaboration recovery only observes despite a retained cancelled reason', async t => {
  const f = await fixture(t);
  await controlWorkCandidate({ ...f.options, action: 'status' });
  for (const member of f.members) {
    member.intent.status = 'cancelled'; member.intent.reason = 'cancelled'; member.intent.coordinatorClosed = true;
    for (const stage of Object.values(member.intent.stages)) { stage.status = 'reviewed'; stage.sessionClosed = true; }
    await f.store.updateCore(core => writeCollaborationIntent(core, member.intent));
  }
  const restored = new MemoryChatStore(); await restored.writeCore(await f.store.readCore());
  const fetch = globalThis.fetch; const methods = [];
  t.mock.method(globalThis, 'fetch', (url, options) => { methods.push(options.method); return fetch(url, options); });
  await recoverCollaborations(restored, { cancelSession: async () => assert.fail('No unfinished Runtime'), closeSession: async () => assert.fail('No unfinished Runtime') });
  assert.deepEqual(methods, ['GET']); assert.equal(f.stops(), 0);
  assert.equal((await listWorkCandidates(restored, f.options.taskId)).candidates[0].observation.state, 'running');
});

test('revoked ownership during automatic cancellation prevents POST and leaves the foreign artifact intact', async t => {
  const f = await fixture(t);
  await controlWorkCandidate({ ...f.options, action: 'status' });
  const before = (await f.store.readCore()).artifacts, fetch = globalThis.fetch; let posts = 0;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    if (options.method === 'POST') posts++;
    const response = await fetch(url, options);
    await f.store.updateCore(core => ({ ...core, tasks: core.tasks.map(task => task.id === f.members[1].stage.taskId
      ? { ...task, ownerActorId: 'foreign-owner' } : task) })); return response;
  });
  const result = await reconcileWorkCandidates({ coreStore: f.store, mode: 'cancel', taskIds: [f.options.taskId] });
  assert.equal(result.pending, 1); assert.equal(posts, 0); assert.equal(f.stops(), 0);
  assert.deepEqual((await f.store.readCore()).artifacts, before);
});

test('explicit collaboration cancel reports its candidate outcome and retains the prepared source evidence', async t => {
  const f = await fixture(t);
  await controlWorkCandidate({ ...f.options, action: 'status' });
  const runtime = { cancelSession: async () => {}, closeSession: async () => {} };
  const result = await stopCollaboration(f.store, runtime, f.members[1].intent.id, 'cancelled', false, 'cancel');
  await f.close(); assert.equal(f.stops(), 1); assert.equal(result.status, 'cancelled');
  assert.equal(result.candidateCancellation.drained + result.candidateCancellation.pending, 1);
  assert.ok((await f.store.readCore()).artifacts.some(row => row.id === f.prepared.artifactId));
});

test('public Work run stop also drains its bound candidate and preserves ordinary response fields', async t => {
  const f = await fixture(t);
  await controlWorkCandidate({ ...f.options, action: 'status' });
  const server = createServer((request, response) => {
    void routeWorkRunCancellationApi({ request, response, method: request.method,
      url: new URL(request.url, 'http://localhost'), auth: { principal: { membership: { roles: ['owner'] } } },
      dependencies: { coreStore: f.store, runtimeClient: {} } }).then(handled => { if (!handled) response.writeHead(404).end(); });
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { const closed = once(server, 'close'); server.close(); server.closeAllConnections(); await closed; });
  await f.store.updateCore(core => upsertCoreRun(core, { id: 'another-run-on-same-task', taskId: f.members[1].stage.taskId,
    title: 'Other historical run', status: 'completed' }).core);
  const base = `http://127.0.0.1:${server.address().port}/api/work/runs`;
  const unrelated = await fetch(`${base}/another-run-on-same-task/stop`, { method: 'POST' });
  assert.equal(unrelated.status, 200); assert.equal((await unrelated.json()).candidateCancellation, undefined); assert.equal(f.stops(), 0);
  const response = await fetch(`${base}/${f.members[1].stage.runId}/stop`, { method: 'POST' });
  assert.equal(response.status, 200);
  const result = await response.json(); assert.equal(result.status, 'already_terminal');
  assert.equal(result.run.id, f.members[1].stage.runId); assert.ok(result.candidateCancellation);
  await f.close(); assert.equal(f.stops(), 1);
});

test('a paired artifact reassigned after selector capture cannot be stopped for the former companion', async t => {
  const f = await fixture(t);
  await controlWorkCandidate({ ...f.options, action: 'status' });
  let reads = 0, requests = 0;
  t.mock.method(globalThis, 'fetch', () => { requests++; assert.fail('Changed selection must not contact the host'); });
  const coreStore = { readCore: async () => {
    if (++reads === 2) {
      const ownership = { ...f.prepared.ownership, revisionSet: createCandidateRevisionSet(f.prepared.ownership.revisionSet.members.map(ref =>
        ref.member === 'runtime' ? { ...ref, taskId: 'replacement-companion' } : ref)) };
      await f.store.updateCore(core => {
        const prior = core.tasks.find(row => row.id === f.members[1].intent.id);
        core = upsertCoreTask(core, { ...prior, id: 'replacement-companion' }).core;
        return { ...core,
          tasks: core.tasks.map(row => row.id === f.members[1].stage.taskId ? { ...row, parentTaskId: 'replacement-companion' } : row),
          runs: core.runs.map(row => row.id === f.members[1].stage.runId ? { ...row, metadata: { ...row.metadata, collaborationId: 'replacement-companion' } } : row),
          artifacts: core.artifacts.map(row => row.id === f.prepared.artifactId ? { ...row, metadata: { ...row.metadata, ownership } } : row) };
      });
      const launchFile = path.join(f.root, 'launch.json'), launch = JSON.parse(await readFile(launchFile, 'utf8'));
      await writeFile(launchFile, JSON.stringify({ ...launch, ownership }));
    }
    return f.store.readCore();
  }, updateCore: mutator => f.store.updateCore(mutator) };
  const result = await reconcileWorkCandidates({ coreStore, mode: 'cancel', taskIds: [f.members[1].intent.id] });
  assert.equal(result.pending, 1); assert.equal(requests, 0); assert.equal(f.stops(), 0);
});

test('a blocked Mission leaves its candidate running; an accepted retry uses exact mission Run refs', async t => {
  const f = await fixture(t);
  await controlWorkCandidate({ ...f.options, action: 'status' });
  await f.store.updateCore(core => {
    core = upsertCoreMission(core, { id: 'candidate-mission', title: 'Owned mission', status: 'running' }).core;
    const run = core.runs.find(row => row.id === f.members[1].stage.runId);
    core = upsertCoreRun(core, { ...run, metadata: { ...run.metadata, missionId: 'candidate-mission' } }).core;
    return upsertCoreRun(core, { id: 'unmanaged-running', title: 'Cannot safely stop', status: 'running',
      metadata: { missionId: 'candidate-mission' } }).core;
  });
  const server = createServer((request, response) => {
    void routeWorkRunCancellationApi({ request, response, method: request.method,
      url: new URL(request.url, 'http://localhost'), auth: { principal: { membership: { roles: ['owner'] } } },
      dependencies: { coreStore: f.store, runtimeClient: {} } }).then(handled => { if (!handled) response.writeHead(404).end(); });
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { const closed = once(server, 'close'); server.close(); server.closeAllConnections(); await closed; });
  const url = `http://127.0.0.1:${server.address().port}/api/work/missions/candidate-mission/cancel`;
  const blocked = await fetch(url, { method: 'POST' });
  assert.equal(blocked.status, 409); assert.equal((await blocked.json()).candidateCancellation, undefined); assert.equal(f.stops(), 0);
  await f.store.updateCore(core => ({ ...core, runs: core.runs.map(row => row.id === 'unmanaged-running' ? { ...row, status: 'completed' } : row) }));
  const accepted = await fetch(url, { method: 'POST' });
  assert.equal(accepted.status, 200); assert.ok((await accepted.json()).candidateCancellation);
  await f.close(); assert.equal(f.stops(), 1);
});
