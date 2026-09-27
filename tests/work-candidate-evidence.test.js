import assert from 'node:assert/strict';
import test from 'node:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash, randomBytes } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm, cp, rename, symlink } from 'node:fs/promises';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { snapshotCandidateSource, readCandidateOwnershipFile, verifyCandidateOwnershipSources } from '../scripts/desktop-candidate.mjs';
import { inspectCandidateBuild } from '../build/server/platform/development/candidateEvidence.js';
import { attachWorkCandidateEvidence, prepareWorkCandidate } from '../build/server/products/work/state/candidateEvidence.js';
import { MemoryChatStore } from '../build/server/products/chat/state/store.js';
import { admitCollaboration, writeCollaborationIntent } from '../build/server/products/work/state/collaborationRecords.js';
import { upsertCoreArtifact, upsertCoreRun } from '../build/server/core/model/index.js';
import { buildCodeArtifactDetailProjection, buildCodeArtifactListProjection } from '../build/server/products/code/api/projection.js';
import { buildWorkTaskListProjection } from '../build/server/products/work/api/projection.js';
import { routeWorkCandidateEvidenceApi } from '../build/server/products/work/api/candidateEvidenceRoutes.js';
import { readCandidateOwnership, createCandidateRevisionSet } from '../build/server/platform/development/candidateOwnership.js';

const exec = promisify(execFile);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
async function fixture(t) {
  const directory = await mkdtemp(path.join(tmpdir(), 'cats-work-candidate-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const root = path.join(directory, 'candidate'); await mkdir(root);
  const token = randomBytes(32).toString('hex');
  const request = { root, launchId: hash(token), instanceId: randomBytes(16).toString('hex') };
  const sources = {};
  for (const member of ['platform', 'runtime']) {
    const source = path.join(directory, `cats-${member}`);
    await mkdir(path.join(source, 'src'), { recursive: true }); await mkdir(path.join(source, 'node_modules'));
    await writeFile(path.join(source, '.gitignore'), 'node_modules\n');
    await writeFile(path.join(source, 'package.json'), JSON.stringify({ name: `@cats-inc/cats-${member}` }));
    await writeFile(path.join(source, 'package-lock.json'), '{}');
    await writeFile(path.join(source, 'src', 'feature.ts'), 'export const value = 1;\n');
    const git = async (...args) => (await exec('git', args, { cwd: source, windowsHide: true })).stdout.trim();
    await git('init', '--quiet'); await git('add', '.');
    await git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.test', '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'fixture');
    sources[member] = await snapshotCandidateSource(source, path.join(root, 'source', `cats-${member}`));
  }
  const control = { ...request, token, pid: 1234, url: 'http://127.0.0.1:54321' };
  const launch = { schemaVersion: 1, root, launchId: request.launchId, stage: 'running', builtAt: new Date().toISOString(), sources };
  const save = async () => { await writeFile(path.join(root, 'launch.json'), JSON.stringify(launch)); };
  await save(); await writeFile(path.join(root, 'control.json'), JSON.stringify(control));
  await writeFile(path.join(root, `exit-${request.instanceId}.json`), JSON.stringify({ ...request, pid: 1234, exitCode: 0 }));
  return { root, directory, sources, request, launch, save, token };
}

async function coreFixture(f, member = 'platform', store = new MemoryChatStore()) {
  let core = await store.readCore();
  const suffix = member === 'platform' ? '' : `-${member}`;
  const revisionId = `revision-artifact${suffix}`, sessionId = `session${suffix}`;
  const admitted = admitCollaboration(core, { sourceChannelId: 'source', sourceConversationId: 'conversation-source',
    proposalMessageId: `proposal${suffix}`, originalMessageId: `original${suffix}`, originalGoalDigest: `goal${suffix}`, ownerActorId: core.ownerProfile.actorId,
    confirmationMessageId: `confirm${suffix}`, proposalDigest: `proposal-digest${suffix}`, goal: 'Fixture change', expectedOutput: 'Local revision',
    conversationIntent: 'create', contextRevision: `context${suffix}`, workspacePath: f.sources[member].checkout,
    workers: { implementation: { catId: 'author', actorId: 'author', name: 'Author', target: { provider: 'fixture' } },
      review: { catId: 'reviewer', actorId: 'reviewer', name: 'Reviewer', target: { provider: 'fixture' } } },
    budget: { maxTokens: 100, maxDurationMs: 60000 } });
  core = admitted.core; const intent = admitted.intent, stage = intent.stages.implementation;
  stage.status = 'result_ready'; stage.sessionId = sessionId; stage.workspacePath = f.sources[member].checkout;
  intent.implementationEvidence = { artifactId: revisionId, runId: stage.runId, sessionId,
    workspacePath: stage.workspacePath, baselineCommitId: 'a'.repeat(40), commitId: f.sources[member].head, validation: 'runtime_clean_new_head' };
  core = upsertCoreRun(core, { id: stage.runId, taskId: stage.taskId, title: 'Implementation', status: 'completed',
    metadata: { collaborationId: intent.id, role: 'implementation' } }).core;
  core = upsertCoreArtifact(core, { id: revisionId, taskId: stage.taskId, runId: stage.runId, title: 'Revision', kind: 'report', status: 'ready',
    metadata: { source: 'work-collaboration', commitId: f.sources[member].head, sessionId } }).core;
  await store.writeCore(writeCollaborationIntent(core, intent));
  return { store, intent, stage };
}

test('two managed member revisions share a fixed digest through preparation, CLI and attachment', async t => {
  const f = await fixture(t), primary = await coreFixture(f);
  const companion = await coreFixture(f, 'runtime', primary.store);
  const root = path.join(f.directory, 'paired-candidate');
  const request = { requestId: 'paired-candidate-record', root, companionTaskId: companion.intent.id };
  const prepared = await prepareWorkCandidate({ coreStore: primary.store, taskId: primary.intent.id, request });
  const ownership = prepared.ownership;
  const assertRetryOwnerFence = async () => {
    const original = await primary.store.readCore();
    let reads = 0;
    try {
      await assert.rejects(prepareWorkCandidate({ taskId: primary.intent.id, request,
        coreStore: { readCore: async () => {
          if (++reads === 2) await primary.store.updateCore(core => ({ ...core,
            tasks: core.tasks.map(row => row.id === companion.stage.taskId
              ? { ...row, ownerActorId: 'changed-after-first-read' } : row) }));
          return primary.store.readCore();
        }, updateCore: () => assert.fail('An existing record must not be rewritten') },
      }), /verified_revision_required|owner_revision_changed/u);
      assert.equal(reads, 2);
      assert.deepEqual((await primary.store.readCore()).artifacts, original.artifacts);
    } finally { await primary.store.writeCore(original); }
  };
  await assertRetryOwnerFence();
  assert.deepEqual(ownership.revisionSet.members.map(row => row.member), ['platform', 'runtime']);
  assert.deepEqual(readCandidateOwnership(ownership), ownership);
  const reverse = await prepareWorkCandidate({ coreStore: primary.store, taskId: companion.intent.id,
    request: { requestId: 'reverse-candidate-record', root: path.join(f.directory, 'reverse'), companionTaskId: primary.intent.id } });
  assert.equal(reverse.ownership.revisionSet.sha256, ownership.revisionSet.sha256);
  const file = path.join(f.directory, 'paired.json'); await writeFile(file, JSON.stringify(ownership));
  const workspace = { platformRoot: f.sources.platform.checkout, runtimeRoot: f.sources.runtime.checkout };
  assert.deepEqual(await readCandidateOwnershipFile(file, root, workspace), ownership);
  verifyCandidateOwnershipSources(ownership, f.sources);
  assert.equal((await prepareWorkCandidate({ coreStore: primary.store, taskId: primary.intent.id, request })).created, false);
  await assert.rejects(prepareWorkCandidate({ coreStore: primary.store, taskId: primary.intent.id,
    request: { requestId: request.requestId, root } }), /preparation_conflict/u);
  await rename(f.root, root);
  const control = JSON.parse(await readFile(path.join(root, 'control.json'), 'utf8'));
  await writeFile(path.join(root, 'control.json'), JSON.stringify({ ...control, root }));
  await writeFile(path.join(root, `exit-${f.request.instanceId}.json`), JSON.stringify({ ...f.request, root, pid: 1234, exitCode: 0 }));
  await writeFile(path.join(root, 'launch.json'), JSON.stringify({ ...f.launch, root, ownership }));
  const lifecycle = { launchId: f.request.launchId, instanceId: f.request.instanceId, hostPid: 1234,
    state: 'drained', observedAt: new Date().toISOString(), instanceBoundStop: true };
  await primary.store.updateCore(core => ({ ...core, artifacts: core.artifacts.map(row => row.id === prepared.artifactId
    ? { ...row, metadata: { ...row.metadata, candidateLifecycle: lifecycle } } : row) }));
  const attached = await attachWorkCandidateEvidence({ coreStore: primary.store, taskId: primary.intent.id, request: { ...f.request, root } });
  const record = (await primary.store.readCore()).artifacts.find(row => row.id === attached.artifactId);
  assert.equal(record.status, 'ready'); assert.deepEqual(record.metadata.revisionSet, ownership.revisionSet);
  assert.deepEqual(record.metadata.candidateLifecycle, lifecycle);
  await assertRetryOwnerFence();
  assert.equal(record.metadata.dependencyMember, undefined); assert.equal(record.metadata.integrationValidation, 'not_observed');
  assert.equal((await attachWorkCandidateEvidence({ coreStore: primary.store, taskId: primary.intent.id, request: { ...f.request, root } })).created, false);
  assert.equal((await prepareWorkCandidate({ coreStore: primary.store, taskId: primary.intent.id, request })).created, false);
});

test('both validators reject changed hashes, mixed revisions and a stale second checkout', async t => {
  const f = await fixture(t), primary = await coreFixture(f), companion = await coreFixture(f, 'runtime', primary.store);
  const root = path.join(f.directory, 'paired-candidate');
  const { ownership } = await prepareWorkCandidate({ coreStore: primary.store, taskId: primary.intent.id,
    request: { requestId: 'validate-paired-record', root, companionTaskId: companion.intent.id } });
  const file = path.join(f.directory, 'paired.json');
  const workspace = { platformRoot: f.sources.platform.checkout, runtimeRoot: f.sources.runtime.checkout };
  const members = ownership.revisionSet.members;
  const badSets = [null, { ...ownership.revisionSet, sha256: '0'.repeat(64) },
    { ...ownership.revisionSet, members: [...members].reverse() },
    createCandidateRevisionSet([{ ...members[0], taskId: members[1].taskId }, members[1]]),
    createCandidateRevisionSet([{ ...members[0], commitId: 'a'.repeat(40) }, members[1]]),
    { ...ownership.revisionSet, extra: 'ignored-authority' }];
  for (const revisionSet of badSets) {
    const invalid = { ...ownership, revisionSet };
    assert.throws(() => readCandidateOwnership(invalid), /invalid_candidate_revision_set/u);
    await writeFile(file, JSON.stringify(invalid));
    await assert.rejects(readCandidateOwnershipFile(file, root, workspace), /Invalid candidate revision set/u);
  }
  await writeFile(file, JSON.stringify(ownership));
  assert.throws(() => verifyCandidateOwnershipSources(ownership, { ...f.sources,
    runtime: { ...f.sources.runtime, head: 'a'.repeat(40) } }), /clean revision/u);
  await writeFile(path.join(workspace.runtimeRoot, 'src/feature.ts'), 'changed-runtime');
  await assert.rejects(readCandidateOwnershipFile(file, root, workspace), /clean revision/u);
});

test('second task changes cannot pass preparation or attachment and leave the saved draft intact', async t => {
  const f = await fixture(t), primary = await coreFixture(f), companion = await coreFixture(f, 'runtime', primary.store);
  const root = path.join(f.directory, 'paired-candidate');
  const request = { requestId: 'paired-owner-race', root, companionTaskId: companion.intent.id };
  const original = await primary.store.readCore();
  const changeOwner = core => ({ ...core, tasks: core.tasks.map(row => row.id === companion.stage.taskId
    ? { ...row, ownerActorId: 'foreign-owner' } : row) });
  await assert.rejects(prepareWorkCandidate({ taskId: primary.intent.id, request,
    coreStore: { readCore: () => primary.store.readCore(), updateCore: async mutator => {
      await primary.store.updateCore(changeOwner); return primary.store.updateCore(mutator);
    } } }), /verified_revision_required|owner_revision_changed/u);
  assert.deepEqual((await primary.store.readCore()).artifacts, original.artifacts);
  await primary.store.writeCore(original);
  const prepared = await prepareWorkCandidate({ coreStore: primary.store, taskId: primary.intent.id, request });
  const observed = { ...await inspectCandidateBuild(f.request), root, ownership: prepared.ownership };
  await assert.rejects(attachWorkCandidateEvidence({ coreStore: primary.store, taskId: primary.intent.id,
    request: f.request, inspect: async () => ({ ...observed, members: { ...observed.members,
      runtime: { ...observed.members.runtime, head: 'a'.repeat(40) } } }) }), /revision_mismatch/u);
  await assert.rejects(attachWorkCandidateEvidence({ coreStore: primary.store, taskId: primary.intent.id,
    request: f.request, inspect: async () => {
      await primary.store.updateCore(changeOwner); return observed;
    } }), /verified_revision_required|owner_revision_changed/u);
  assert.equal((await primary.store.readCore()).artifacts.find(row => row.id === prepared.artifactId).status, 'draft');
});

test('prepared candidate retains one artifact across CLI validation and verified attachment', async t => {
  const f = await fixture(t), c = await coreFixture(f), root = path.join(f.directory, 'prepared-candidate');
  const request = { requestId: 'candidate-request-one', root };
  const prepared = await prepareWorkCandidate({ coreStore: c.store, taskId: c.intent.id, request });
  assert.equal(prepared.created, true);
  assert.equal((await c.store.readCore()).artifacts.find(row => row.id === prepared.artifactId).status, 'draft');
  const descriptor = path.join(f.directory, 'ownership.json'); await writeFile(descriptor, JSON.stringify(prepared.ownership));
  const workspace = { platformRoot: f.sources.platform.checkout, runtimeRoot: f.sources.runtime.checkout };
  assert.deepEqual(await readCandidateOwnershipFile(descriptor, root, workspace), prepared.ownership);
  verifyCandidateOwnershipSources(prepared.ownership, f.sources);
  await assert.rejects(readCandidateOwnershipFile(descriptor, f.root, workspace), /does not match/u);
  assert.throws(() => verifyCandidateOwnershipSources(prepared.ownership, { ...f.sources,
    runtime: { ...f.sources.runtime, dirty: true } }), /clean revision/u);
  await writeFile(path.join(f.sources.platform.checkout, 'src', 'feature.ts'), 'changed');
  await assert.rejects(readCandidateOwnershipFile(descriptor, root, workspace), /clean revision/u);
  await writeFile(path.join(f.sources.platform.checkout, 'src', 'feature.ts'), 'export const value = 1;\n');
  await assert.rejects(prepareWorkCandidate({ coreStore: c.store, taskId: c.intent.id,
    request: { ...request, root: path.join(f.directory, 'other') } }), /preparation_conflict/u);
  await rename(f.root, root);
  const control = JSON.parse(await readFile(path.join(root, 'control.json'), 'utf8'));
  await writeFile(path.join(root, 'control.json'), JSON.stringify({ ...control, root }));
  await writeFile(path.join(root, `exit-${f.request.instanceId}.json`), JSON.stringify({ ...f.request, root, pid: 1234, exitCode: 0 }));
  await writeFile(path.join(root, 'launch.json'), JSON.stringify({ ...f.launch, root, ownership: prepared.ownership }));
  const attached = await attachWorkCandidateEvidence({ coreStore: c.store, taskId: c.intent.id, request: { ...f.request, root } });
  assert.equal(attached.artifactId, prepared.artifactId);
  const after = (await c.store.readCore()).artifacts.find(row => row.id === prepared.artifactId);
  assert.equal(after.status, 'ready'); assert.deepEqual(after.metadata.ownership, prepared.ownership);
  assert.equal((await attachWorkCandidateEvidence({ coreStore: c.store, taskId: c.intent.id, request: { ...f.request, root } })).created, false);
  assert.equal((await prepareWorkCandidate({ coreStore: c.store, taskId: c.intent.id, request })).created, false);
  assert.equal((await c.store.readCore()).artifacts.find(row => row.id === prepared.artifactId).status, 'ready');
  await assert.rejects(attachWorkCandidateEvidence({ coreStore: c.store, taskId: c.intent.id, request: { ...f.request, root },
    inspect: async () => ({ ...after.metadata.candidate, launchId: 'c'.repeat(64) }) }), /artifact_conflict/u);
});

test('prepared ownership cannot impersonate another record or survive an owner change during inspection', async t => {
  const f = await fixture(t), c = await coreFixture(f), root = path.join(f.directory, 'prepared-candidate');
  const prepared = await prepareWorkCandidate({ coreStore: c.store, taskId: c.intent.id, request: { requestId: 'candidate-request-two', root } });
  const observed = await inspectCandidateBuild(f.request);
  await assert.rejects(attachWorkCandidateEvidence({ coreStore: c.store, taskId: c.intent.id, request: f.request,
    inspect: async () => ({ ...observed, ownership: { ...prepared.ownership, commitId: 'a'.repeat(40) } }) }), /preparation_conflict/u);
  const original = await c.store.readCore();
  for (const changed of ['profile', c.intent.id, c.stage.taskId]) {
    await c.store.writeCore(original);
    await assert.rejects(attachWorkCandidateEvidence({ coreStore: c.store, taskId: c.intent.id, request: f.request,
      inspect: async () => {
        await c.store.updateCore(core => changed === 'profile'
          ? { ...core, ownerProfile: { ...core.ownerProfile, actorId: 'changed-owner' } }
          : { ...core, tasks: core.tasks.map(row => row.id === changed ? { ...row, ownerActorId: 'changed-owner' } : row) });
        return { ...observed, root, ownership: prepared.ownership };
      } }), /verified_revision_required|owner_revision_changed/u);
  }
  assert.equal((await c.store.readCore()).artifacts.find(row => row.id === prepared.artifactId).status, 'draft');
});

test('preparation rechecks actual Task ownership in its final atomic writer', async t => {
  const f = await fixture(t), c = await coreFixture(f);
  const before = await c.store.readCore();
  await assert.rejects(prepareWorkCandidate({ taskId: c.intent.id,
    request: { requestId: 'task-owner-race', root: path.join(f.directory, 'raced-candidate') },
    coreStore: { readCore: () => c.store.readCore(), updateCore: async mutator => {
      await c.store.updateCore(core => ({ ...core, tasks: core.tasks.map(row => row.id === c.stage.taskId
        ? { ...row, ownerActorId: 'changed-owner' } : row) }));
      return c.store.updateCore(mutator);
    } },
  }), /verified_revision_required|owner_revision_changed/u);
  assert.deepEqual((await c.store.readCore()).artifacts, before.artifacts);
});

test('candidate inspection binds both commit input sets and excludes control credentials', async t => {
  const f = await fixture(t), observed = await inspectCandidateBuild(f.request);
  assert.equal(observed.state, 'drained'); assert.equal(observed.members.platform.head, f.sources.platform.head);
  assert.equal(observed.members.runtime.head, f.sources.runtime.head); assert.equal(JSON.stringify(observed).includes(f.token), false);
  const index = path.join(f.sources.platform.gitCommonDirectory, 'index');
  const before = await readFile(index); await inspectCandidateBuild(f.request); assert.deepEqual(await readFile(index), before);
  await assert.rejects(inspectCandidateBuild({ ...f.request, instanceId: 'a'.repeat(32) }), /identity_mismatch/u);
  await writeFile(path.join(f.root, 'source', 'cats-platform', 'src', 'extra.ts'), 'unrecorded');
  await assert.rejects(inspectCandidateBuild(f.request), /extra_inputs/u);
  await rm(path.join(f.root, 'source', 'cats-platform', 'src', 'extra.ts'));
  await writeFile(path.join(f.root, 'source', 'cats-platform', 'tsconfig.extra.json'), '{}');
  await assert.rejects(inspectCandidateBuild(f.request), /extra_inputs/u);
  await rm(path.join(f.root, 'source', 'cats-platform', 'tsconfig.extra.json'));
  await writeFile(path.join(f.root, 'source', 'cats-platform', 'src', 'feature.ts'), 'tampered');
  await assert.rejects(inspectCandidateBuild(f.request), /input_changed/u);
});

test('self-consistent changed source digest cannot impersonate the committed revision', async t => {
  const f = await fixture(t);
  await writeFile(path.join(f.sources.platform.checkout, 'src', 'feature.ts'), 'changed');
  const replacement = path.join(f.directory, 'changed-snapshot');
  const altered = await snapshotCandidateSource(f.sources.platform.checkout, replacement);
  await writeFile(path.join(f.root, 'source', 'cats-platform', 'src', 'feature.ts'), 'changed');
  f.launch.sources.platform.sourceDigest = altered.sourceDigest; await f.save();
  await assert.rejects(inspectCandidateBuild(f.request), /commit_inputs_mismatch/u);
});

test('Git inspection ignores inherited routing and cannot create shared indexes in the owning repo', async t => {
  const f = await fixture(t);
  const source = f.sources.platform.checkout, common = f.sources.platform.gitCommonDirectory;
  await exec('git', ['config', 'core.splitIndex', 'true'], { cwd: source, windowsHide: true });
  const before = (await readdir(common)).sort(), index = await readFile(path.join(common, 'index'));
  const old = process.env.GIT_DIR;
  process.env.GIT_DIR = path.join(f.directory, 'wrong-git-directory');
  try { await inspectCandidateBuild(f.request); }
  finally { if (old === undefined) delete process.env.GIT_DIR; else process.env.GIT_DIR = old; }
  assert.deepEqual((await readdir(common)).sort(), before);
  assert.deepEqual(await readFile(path.join(common, 'index')), index);
});

test('source mutation during the final host observation cannot retain a verified digest', async t => {
  const f = await fixture(t);
  await rm(path.join(f.root, `exit-${f.request.instanceId}.json`));
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    if (++calls === 2) await writeFile(path.join(f.root, 'source', 'cats-platform', 'src', 'feature.ts'), 'changed during status');
    return Response.json({ ...f.request, pid: 1234, services: [{ ready: true }, { ready: true }] });
  });
  await assert.rejects(inspectCandidateBuild(f.request), /input_changed/u);
  assert.equal(calls, 2);
});

for (const when of ['initial', 'final status']) test(`candidate rejects a source-parent alias at ${when}`, async t => {
  const f = await fixture(t);
  const source = path.join(f.root, 'source'), outside = path.join(f.directory, 'outside-copy'), held = path.join(f.root, 'held-source');
  await cp(source, outside, { recursive: true, filter: entry => path.basename(entry) !== 'node_modules' });
  const replace = async () => { await rename(source, held); await symlink(outside, source, process.platform === 'win32' ? 'junction' : 'dir'); };
  if (when === 'initial') await replace();
  else {
    await rm(path.join(f.root, `exit-${f.request.instanceId}.json`));
    let calls = 0;
    t.mock.method(globalThis, 'fetch', async () => {
      if (++calls === 2) await replace();
      return Response.json({ ...f.request, pid: 1234, services: [{ ready: true }, { ready: true }] });
    });
  }
  await assert.rejects(inspectCandidateBuild(f.request), /source_boundary/u);
});

test('association is atomic/idempotent and exposes a Code artifact while preserving cancellation history', async t => {
  const f = await fixture(t), h = await coreFixture(f);
  const before = await h.store.readCore();
  const options = { coreStore: h.store, taskId: h.intent.id, request: f.request };
  const result = await attachWorkCandidateEvidence(options);
  assert.equal(result.created, true); assert.equal((await attachWorkCandidateEvidence(options)).created, false);
  let core = await h.store.readCore(); const artifact = core.artifacts.find(row => row.id === result.artifactId);
  assert.equal(artifact.metadata.implementationMember, 'platform'); assert.equal(artifact.metadata.dependencyMember, 'runtime');
  assert.deepEqual(core.runs, before.runs); assert.deepEqual(core.tasks, before.tasks);
  assert.ok(buildCodeArtifactListProjection(core).artifacts.some(row => row.id === artifact.id));
  assert.ok(buildCodeArtifactDetailProjection(core, artifact));
  assert.equal(buildWorkTaskListProjection(core).tasks.find(row => row.id === h.intent.id).candidateEvidenceAvailable, true);
  h.intent.status = 'cancelled'; await h.store.writeCore(writeCollaborationIntent(core, h.intent));
  assert.equal((await attachWorkCandidateEvidence(options)).created, false);
  assert.equal((await h.store.readCore()).tasks.find(row => row.id === h.intent.id).status, 'cancelled');
  await assert.rejects(attachWorkCandidateEvidence({ ...options, inspect: async request => {
    const observed = await inspectCandidateBuild(request);
    await h.store.updateCore(state => ({ ...state, ownerProfile: { ...state.ownerProfile, actorId: 'changed-owner' } }));
    return observed;
  } }), /verified_revision_required|owner_revision_changed/u);
  assert.equal((await h.store.readCore()).artifacts.filter(row => row.metadata.source === 'work-candidate').length, 1);
});

test('candidate evidence HTTP entry requires owner/admin and checks the actual selected revision', async t => {
  const f = await fixture(t), h = await coreFixture(f);
  const server = createServer((request, response) => { void routeWorkCandidateEvidenceApi({ request, response,
    url: new URL(request.url, 'http://localhost'), method: request.method,
    auth: { principal: { membership: { roles: [String(request.headers['x-fixture-role'] ?? 'member')] } } },
    dependencies: { coreStore: h.store } }); });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}/api/work/tasks/${h.intent.id}/candidate-evidence`;
  const send = (role, body, endpoint = url) => fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json', 'x-fixture-role': role }, body: JSON.stringify(body) });
  assert.equal((await send('member', f.request)).status, 403);
  assert.equal((await send('owner', { ...f.request, extra: 'not admitted' })).status, 409);
  assert.equal((await send('owner', { ...f.request, launchId: 'a'.repeat(64) })).status, 409);
  const first = await send('owner', f.request); assert.equal(first.status, 201, await first.clone().text());
  assert.equal((await send('admin', f.request)).status, 200);
  const prepareUrl = url.replace('candidate-evidence', 'candidate-preparation');
  const prepareBody = { requestId: 'http-owned-candidate', root: path.join(f.directory, 'http-candidate') };
  assert.equal((await send('member', prepareBody, prepareUrl)).status, 403);
  assert.equal((await send('owner', { ...prepareBody, grant: 'execute' }, prepareUrl)).status, 409);
  const prepared = await send('owner', prepareBody, prepareUrl);
  assert.equal(prepared.status, 201, await prepared.clone().text());
  assert.equal((await prepared.json()).ownership.kind, 'cats-desktop-candidate');
  assert.equal((await send('admin', prepareBody, prepareUrl)).status, 200);
});
