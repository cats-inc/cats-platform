import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { FileChatStore } from '../build/server/products/chat/state/store.js';
import { buildCodeTaskDetailProjection, buildCodeArtifactDetailProjection } from '../build/server/products/code/api/projection.js';
import { authorKnowledge, inspectAuthoring, recoverAuthoring } from '../tools/knowledge-practice/managedAuthoring.mjs';
import { stopRun } from '../build/server/platform/supervision/runCancellation.js';
import { upsertCoreTask, upsertCoreRun } from '../build/server/core/model/index.js';
import { digest, writeNew } from '../tools/knowledge-practice/artifacts.mjs';
import { validateAuthoringHost, waitForAuthoringStart } from '../tools/knowledge-practice/authoring-host.mjs';
import { CatsRuntimeClient } from '../build/server/runtime/client.js';
import { validateRuntimeSessionPolicyInput } from '../build/server/shared/runtimeSessionPolicy.js';

const policyFingerprint = digest('cats.skill-content.v1:preview');
async function fixture(t, overrides = {}) {
  const root = await mkdtemp(join(tmpdir(), 'cats-knowledge-author-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const runtimeRoot = join(root, 'runtime-package');
  // Independent fake artifact authority, never a caller-controlled production profile switch.
  await writeNew(join(runtimeRoot, 'build/runtime/core/skills/contentPolicy.js'),
    `export function loadRuntimeSkillContentPolicy() { return ${JSON.stringify({ profile: 'preview', fingerprint: policyFingerprint })}; }`);
  await writeNew(join(runtimeRoot, 'package.json'), { type: 'module' });
  const skill = { id: 'cats-practice-and-distill', status: 'resolved', contentProfile: 'preview',
    version: '1.0.0', fingerprint: digest('fixture-skill'),
    sourcePath: join(runtimeRoot, 'runtime-skills/preview/cats-practice-and-distill'),
    entryFile: join(runtimeRoot, 'runtime-skills/preview/cats-practice-and-distill/SKILL.md') };
  await writeNew(join(runtimeRoot, 'build/runtime/core/skills/catalog.js'),
    `export function listRuntimeSkillCatalog() { return ${JSON.stringify([skill])}; }`);
  const coreStore = new FileChatStore(join(root, 'state/chat-state.json'));
  const runtimeWorkspaceRoot = join(root, 'sessions');
  const cwd = join(runtimeWorkspaceRoot, 'author/workspace'); await mkdir(cwd, { recursive: true });
  const baseline = JSON.parse(await readFile(new URL('../config/catlas-knowledge.json', import.meta.url), 'utf8'));
  const request = { schemaVersion: 1, id: 'code-guidance', title: 'Code guidance candidate',
    target: { provider: 'codex', instance: 'cli/native', model: 'fixture-model' },
    budget: { maxDurationMs: 10_000, maxTokens: 1_000 },
    draft: { schemaVersion: 1, id: 'code-guidance', authorId: 'fixture-author', evidenceRefs: ['test:workspace'],
      counterexamples: ['A selected folder does not prove the resulting session uses it.'],
      knowledge: { revision: 'fixture.1', platformRange: baseline.platformRange,
        requiredCapabilities: baseline.requiredCapabilities,
        entries: baseline.entries.map(({ id, revision, topics, content }) => ({ id, revision, topics, content,
          roles: ['catlas'], kind: 'concept', surfaces: ['code-help'], requiredOperations: [] })) } },
    evidence: [{ id: 'test:workspace', summary: 'The product observes the created session workspace before confirming it.',
      sourceDigest: digest('independent-fixture') }] };
  const session = { id: 'session-author', providerName: 'codex', model: 'fixture-model', status: 'idle', cwd,
    providerBackend: 'cli', providerInstanceId: 'native', permissionMode: 'default', allowedTools: ['read_file', 'list_files'],
    providerTarget: { provider: 'codex', backend: 'cli', instance: 'native', target: 'cli/native', resolved: true },
    workspace: { kind: 'sandbox', access: 'read_only', runtimeCwd: cwd },
    hydration: { metadata: { runtimeSkillContent: { schemaVersion: 1, sessionId: 'session-author', profile: 'preview',
      policyFingerprint, releaseCompatible: false } } },
    skills: { contentPolicy: { profile: 'preview', fingerprint: policyFingerprint, skillsRoot: join(runtimeRoot, 'runtime-skills') }, strict: true,
      requestedSkills: ['cats-practice-and-distill'], appliedSkillIds: ['cats-practice-and-distill'],
      resolvedSkills: [skill], warnings: [],
      delivery: { provider: 'codex', backend: 'cli', mode: 'instructions', status: 'applied', warnings: [] } } };
  const calls = [];
  const runtimeClient = {
    async createSession(input) {
      calls.push(['create', input]);
      const current = await inspectAuthoring(coreStore, request.id);
      assert.equal(current.phase, 'creating-session');
      assert.equal(input.workspaceAccess, 'read_only');
      assert.equal(validateRuntimeSessionPolicyInput(input), null);
      assert.deepEqual(input.skills.requestedSkills, ['cats-practice-and-distill']);
      return session;
    },
    async observeSession(id) { assert.equal(id, session.id); return { session }; },
    async sendMessage(id, prompt) {
      calls.push(['send', id]); assert.ok(prompt.includes('UNVERIFIED'));
      assert.equal((await inspectAuthoring(coreStore, request.id)).sessionId, id);
      return { segments: [{ kind: 'text', text: JSON.stringify(request.draft) }], tokensUsed: 42 };
    },
    async cancelSession(id) { calls.push(['cancel', id]); },
    async closeSession(id) { calls.push(['close', id]); },
    ...overrides,
  };
  return { root, coreStore, runtimeClient, request, runtimeRoot, runtimeWorkspaceRoot,
    runtimeBaseUrl: 'http://127.0.0.1:49172', outputRoot: join(root, 'receipts'), calls, session };
}

test('managed authoring persists one correlated draft through actual Code projections', async t => {
  const f = await fixture(t);
  const result = await authorKnowledge(f);
  assert.equal(result.status, 'completed', result.error);
  assert.equal(result.cleanup, 'requested'); assert.equal(result.candidateState, 'unverified');
  assert.equal(result.usageTokens, 42); assert.equal(result.deliveryBefore.resources, 'not-established');
  const candidate = JSON.parse(await readFile(result.candidatePath, 'utf8'));
  assert.equal(candidate.state, 'unverified'); assert.equal(candidate.digest, result.candidateDigest);
  const core = await f.coreStore.readCore();
  assert.equal(core.tasks.length, 1); assert.equal(core.runs.length, 1); assert.equal(core.artifacts.length, 1);
  const artifact = core.artifacts[0];
  assert.equal(artifact.status, 'draft'); assert.equal(artifact.taskId, result.taskId); assert.equal(artifact.runId, result.runId);
  assert.equal(artifact.metadata.codeArtifactDeclaration.idempotency.producerRuntimeSessionId, f.session.id);
  assert.ok(buildCodeTaskDetailProjection(core, core.tasks[0], []));
  assert.ok(buildCodeArtifactDetailProjection(core, artifact));
  const duplicate = await authorKnowledge(f);
  assert.equal(duplicate.candidateDigest, result.candidateDigest);
  assert.equal(f.calls.filter(([name]) => name === 'send').length, 1);
});

test('concurrent duplicate admission and re-entry cannot repeat a session or inference', async t => {
  const f = await fixture(t);
  await Promise.all([authorKnowledge(f), authorKnowledge(f)]);
  assert.equal(f.calls.filter(([name]) => name === 'create').length, 1);
  assert.equal(f.calls.filter(([name]) => name === 'send').length, 1);
  const changed = structuredClone(f.request); changed.title = 'Changed';
  await assert.rejects(authorKnowledge({ ...f, request: changed }), /changed inputs/u);
});

test('authoring creation passes the real Runtime client policy guard and preserves the read-only wire grant', async t => {
  const f = await fixture(t);
  const client = new CatsRuntimeClient(f.runtimeBaseUrl);
  let requests = 0;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(String(url), `${f.runtimeBaseUrl}/sessions`);
    const input = JSON.parse(options.body);
    assert.equal(input.workspaceAccess, 'read_only'); assert.equal(input.workspaceKind, 'sandbox');
    assert.equal(input.permissionMode, 'default'); assert.equal(input.cwd, undefined);
    assert.deepEqual(input.allowedTools, ['read_file', 'list_files']);
    assert.deepEqual(input.skills, { requestedSkills: ['cats-practice-and-distill'], strict: true });
    requests += 1;
    return Response.json({ ...f.session, provider: 'codex' });
  });
  f.runtimeClient.createSession = client.createSession.bind(client);
  const result = await authorKnowledge(f);
  assert.equal(result.status, 'completed', result.error); assert.equal(requests, 1);
});

for (const failure of ['malformed', 'unknown-usage', 'over-budget', 'invented-evidence', 'private-content']) {
  test(`${failure} retains failure and usage without materializing a candidate`, async t => {
    const f = await fixture(t);
    f.runtimeClient.sendMessage = async () => {
      const draft = structuredClone(f.request.draft);
      if (failure === 'invented-evidence') draft.evidenceRefs = ['invented:claim'];
      if (failure === 'private-content') draft.knowledge.entries[0].content.en = 'Read C:/Users/private/token';
      return { segments: [{ kind: 'text', text: failure === 'malformed' ? 'not JSON' : JSON.stringify(draft) }],
        tokensUsed: failure === 'unknown-usage' ? undefined : failure === 'over-budget' ? 1001 : 42 };
    };
    const result = await authorKnowledge(f);
    assert.equal(result.status, 'failed'); assert.equal(result.cleanup, 'requested');
    assert.equal(result.usageTokens, failure === 'unknown-usage' ? null : failure === 'over-budget' ? 1001 : 42);
    assert.equal((await f.coreStore.readCore()).artifacts.length, 0);
    await authorKnowledge(f);
    assert.equal(f.calls.filter(([name]) => name === 'create').length, 1);
  });
}

test('cancelled inference keeps measured usage and fences a late valid response', { timeout: 15_000 }, async t => {
  const f = await fixture(t); const controller = new AbortController();
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  let started;
  const sent = new Promise(resolve => { started = resolve; });
  f.runtimeClient.sendMessage = async () => { started(); return pending; };
  const running = authorKnowledge({ ...f, signal: controller.signal });
  await sent; controller.abort();
  const result = await running;
  assert.equal(result.status, 'cancelled');
  release({ segments: [{ kind: 'text', text: JSON.stringify(f.request.draft) }], tokensUsed: 17 });
  for (let count = 0; count < 30 && (await inspectAuthoring(f.coreStore, f.request.id)).usageTokens === null; count++) {
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.equal((await inspectAuthoring(f.coreStore, f.request.id)).usageTokens, 17);
  assert.equal((await f.coreStore.readCore()).artifacts.length, 0);
});

test('late session creation is recorded and cleaned up without dispatch', { timeout: 15_000 }, async t => {
  const f = await fixture(t); const controller = new AbortController();
  let release, started;
  const pending = new Promise(resolve => { release = resolve; });
  const creating = new Promise(resolve => { started = resolve; });
  f.runtimeClient.createSession = async () => { started(); return pending; };
  const running = authorKnowledge({ ...f, signal: controller.signal });
  await creating; controller.abort(); await running;
  release(f.session);
  for (let count = 0; count < 40 && (await inspectAuthoring(f.coreStore, f.request.id)).cleanup !== 'requested'; count++) {
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  const result = await inspectAuthoring(f.coreStore, f.request.id);
  assert.equal(result.sessionId, f.session.id); assert.equal(result.cleanup, 'requested');
  assert.equal(result.status, 'cancelled'); assert.equal(f.calls.filter(([name]) => name === 'send').length, 0);
});

test('actual target, artifact, grant and provenance mismatches reject before inference', async t => {
  for (const fault of ['delivery', 'release', 'workspace', 'target', 'model', 'package', 'provenance', 'tools']) {
    const f = await fixture(t);
    if (fault === 'delivery') f.session.skills.delivery.status = 'failed';
    if (fault === 'release') f.session.skills.contentPolicy.profile = 'release';
    if (fault === 'workspace') f.session.cwd = f.root;
    if (fault === 'target') f.session.providerTarget.target = 'cli/foreign';
    if (fault === 'model') f.session.model = 'foreign-model';
    if (fault === 'package') f.session.skills.resolvedSkills[0].fingerprint = digest('foreign-package');
    if (fault === 'provenance') f.session.hydration.metadata.runtimeSkillContent.sessionId = 'foreign-session';
    if (fault === 'tools') f.session.allowedTools.push('write_file');
    const result = await authorKnowledge(f);
    assert.equal(result.status, 'failed'); assert.equal(f.calls.filter(([name]) => name === 'send').length, 0);
  }
});

for (const stop of ['run', 'task']) {
  test(`canonical ${stop} cancellation fences a late candidate`, { timeout: 15_000 }, async t => {
    const f = await fixture(t); let release, started;
    const pending = new Promise(resolve => { release = resolve; });
    const sent = new Promise(resolve => { started = resolve; });
    f.runtimeClient.sendMessage = async () => { started(); return pending; };
    const running = authorKnowledge(f); await sent;
    if (stop === 'run') {
      const result = await stopRun({ coreStore: f.coreStore, runtimeClient: f.runtimeClient }, `run-knowledge-${f.request.id}`);
      assert.equal(result.run.status, 'cancelled'); assert.equal(result.runtimeAbort.attempted, true);
    } else {
      await f.coreStore.updateCore(core => upsertCoreTask(core, { ...core.tasks[0], status: 'cancelled' }).core);
    }
    release({ segments: [{ kind: 'text', text: JSON.stringify(f.request.draft) }], tokensUsed: 42 });
    const result = await running;
    assert.notEqual(result.status, 'completed'); assert.equal(result.usageTokens, 42);
    const core = await f.coreStore.readCore(); assert.equal(core.artifacts.length, 0);
    if (stop === 'task') assert.equal(core.tasks[0].status, 'cancelled');
  });
}

test('unexpected tool activity is retained and rejects a valid draft', async t => {
  const f = await fixture(t); const send = f.runtimeClient.sendMessage;
  f.runtimeClient.sendMessage = async (...args) => {
    const result = await send(...args);
    result.segments.unshift({ kind: 'tool_use', toolName: 'write_file', text: 'opaque' }); return result;
  };
  const result = await authorKnowledge(f);
  assert.equal(result.status, 'failed'); assert.equal(result.toolActivity[0].toolName, 'write_file');
  assert.equal((await f.coreStore.readCore()).artifacts.length, 0);
});

test('restart fences persisted active work, retries owned cleanup and never replays inference', async t => {
  const f = await fixture(t); await authorKnowledge(f);
  await f.coreStore.updateCore(core => {
    core = upsertCoreTask(core, { ...core.tasks[0], status: 'in_progress' }).core;
    const run = core.runs[0]; return upsertCoreRun(core, { ...run, status: 'running', metadata: { ...run.metadata,
      knowledgeAuthoring: { ...run.metadata.knowledgeAuthoring, phase: 'authoring', cleanup: 'pending' } } }).core;
  });
  const sends = f.calls.filter(([name]) => name === 'send').length;
  await assert.rejects(recoverAuthoring({ ...f, runtimeBaseUrl: 'http://127.0.0.1:49173' }), /binding changed/u);
  const restored = await recoverAuthoring(f);
  assert.equal(restored.status, 'cancelled'); assert.equal(restored.recovery, 'startup-fenced');
  assert.equal(restored.cleanup, 'requested'); assert.equal((await f.coreStore.readCore()).tasks[0].status, 'blocked');
  await authorKnowledge(f); assert.equal(f.calls.filter(([name]) => name === 'send').length, sends);
  await f.coreStore.updateCore(core => { const run = core.runs[0]; return upsertCoreRun(core,
    { ...run, status: 'queued', metadata: { ...run.metadata, knowledgeAuthoring: {
      ...run.metadata.knowledgeAuthoring, phase: 'creating-session', sessionId: null } } }).core; });
  const unknown = await recoverAuthoring(f);
  assert.equal(unknown.status, 'cancelled'); assert.equal(unknown.cleanup, 'unknown-session');
});

test('changed skill fingerprint and failed cleanup remain explicit', async t => {
  const f = await fixture(t);
  const send = f.runtimeClient.sendMessage;
  f.runtimeClient.sendMessage = async (...args) => { const result = await send(...args);
    f.session.skills.resolvedSkills[0].fingerprint = digest('changed'); return result; };
  f.runtimeClient.closeSession = async () => { throw new Error('offline'); };
  const result = await authorKnowledge(f);
  assert.equal(result.status, 'failed'); assert.equal(result.cleanup, 'pending'); assert.equal(result.usageTokens, 42);
  assert.equal((await f.coreStore.readCore()).artifacts.length, 0);
});

test('host rejects missing candidate identity and state/endpoint aliases before writes', async t => {
  await assert.rejects(validateAuthoringHost({}, []), /candidate/u);
  const f = await fixture(t);
  const env = { CATS_DESKTOP_CANDIDATE_ROOT: f.root, CATS_PLATFORM_DIR: join(f.root, 'cats/platform'),
    CATS_RUNTIME_DIR: join(f.root, 'cats/runtime'), CATS_DESKTOP_DIR: join(f.root, 'cats/desktop'),
    CATS_HOST: '127.0.0.1', CATS_PORT: '49171', CATS_DESKTOP_APP_PORT: '49171',
    CATS_DESKTOP_RUNTIME_PORT: '49172', CATS_RUNTIME_BASE_URL: 'http://127.0.0.1:49172',
    CATS_DESKTOP_RUNTIME_ROOT: f.runtimeRoot, CATS_KNOWLEDGE_AUTHORING_REQUEST: join(f.root, 'request.json') };
  await writeNew(env.CATS_KNOWLEDGE_AUTHORING_REQUEST, f.request);
  const argv = ['--startup-mode=app-managed', '--managed-by=cats-electron'];
  await validateAuthoringHost(env, argv);
  await assert.rejects(validateAuthoringHost({ ...env, CATS_RUNTIME_BASE_URL: 'http://127.0.0.1:3110' }, argv));
  await assert.rejects(validateAuthoringHost({ ...env, CATS_PLATFORM_DIR: join(f.root, 'elsewhere') }, argv));
  await mkdir(join(f.root, 'elsewhere'), { recursive: true });
  await symlink(join(f.root, 'elsewhere'), join(f.root, 'knowledge-authoring'), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(validateAuthoringHost(env, argv), /link/u);
});

test('native start receipt is bound to this process and request; absence is abortable', async t => {
  const f = await fixture(t); const startFile = join(f.root, 'authoring-start.json');
  const admission = { ...f, startFile }; const controller = new AbortController();
  const waiting = waitForAuthoringStart(admission, controller.signal);
  controller.abort(); await assert.rejects(waiting);
  await writeNew(startFile, { requestDigest: digest(f.request), desktopPid: process.ppid,
    appPid: process.pid, runtimePid: 12345 });
  assert.equal((await waitForAuthoringStart(admission, new AbortController().signal)).appPid, process.pid);
  await assert.rejects(waitForAuthoringStart({ ...admission, request: { ...f.request, title: 'Changed' } },
    new AbortController().signal));
});
