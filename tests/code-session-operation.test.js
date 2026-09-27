import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, mkdir, symlink, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MemoryChatStore } from '../build/server/products/chat/state/store.js';
import { createConversationSessionDelegate } from '../build/server/products/chat/state/conversationSessionDelegate.js';
import { createCodeSessionOperationService } from '../build/server/products/code/state/codeSessionOperation.js';

async function fixture(t, overrides = {}) {
  const root = await mkdtemp(join(tmpdir(), 'cats-code-open-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const store = new MemoryChatStore();
  const calls = { create: [], close: [] };
  let session;
  const runtime = {
    getHealth: async () => ({ reachable: true, baseUrl: 'http://127.0.0.1:43210' }),
    getProviderConfig: async () => ({ codex: { defaultInstance: 'local', defaultBackend: 'cli',
      instances: [{ id: 'local', backend: 'cli', model: 'model' }] } }),
    getProviderDiagnostics: async query => {
      assert.equal(query.instance, 'local'); assert.equal(query.backend, 'cli'); assert.equal(query.probe, 'live');
      return { providers: [{ provider: 'codex', instance: 'local', backend: 'cli',
        defaultTarget: true, availability: { status: 'ok' } }] };
    },
    createSession: async input => {
      calls.create.push(input);
      session = { id: randomUUID(), providerName: input.provider, model: input.model, status: 'ready',
        providerTarget: { target: input.instance, resolved: true }, permissionMode: input.permissionMode,
        workspace: { kind: input.workspaceKind, access: input.workspaceAccess, runtimeCwd: input.cwd, sourceCwd: input.cwd } };
      return { id: session.id, provider: input.provider, model: input.model, status: 'ready', cwd: input.cwd };
    },
    observeSession: async () => ({ session }),
    closeSession: async id => { calls.close.push(id); },
    ...overrides,
  };
  const options = { coreStore: store, runtimeClient: runtime,
    conversations: createConversationSessionDelegate(store, join(root, 'runtime')),
    runMutation: async (_id, action) => action() };
  const service = createCodeSessionOperationService(options);
  const draft = { cwd: root, target: { provider: 'codex', instance: 'cli/local', model: 'model' },
    policy: { workspaceKind: 'source', workspaceAccess: 'read_only', permissionMode: 'default' } };
  const request = async () => ({ requestId: randomUUID(), revision: (await service.inspect(draft)).revision });
  const signal = new AbortController().signal;
  return { root, store, calls, runtime, service, draft, request, signal, options,
    changeSession: mutate => { mutate(session); } };
}

test('owner opens one real Code conversation through activation and verifies Runtime access', async t => {
  const f = await fixture(t);
  const inspection = await f.service.inspect(f.draft);
  assert.equal(inspection.ready, true);
  assert.equal(f.calls.create.length, 0, 'inspection is read-only');
  const request = await f.request();
  const result = await f.service.open(f.draft, request, f.signal);
  assert.equal(result.status, 'verified', JSON.stringify(result));
  assert.deepEqual(result.workspace, { kind: 'source', access: 'read_only', cwd: f.root });
  assert.equal(f.calls.create.length, 1);
  assert.equal(f.calls.create[0].workspaceAccess, 'read_only');
  const state = await f.store.read();
  assert.equal(state.channels.filter(row => row.id === result.channelId && row.originSurface === 'code').length, 1);
  assert.equal((await f.store.readCore()).tasks.find(row => row.id === `task-channel-${result.channelId}`)
    .metadata.codeSessionOpen.sessionId, result.sessionId);
  const resumed = createCodeSessionOperationService(f.options);
  assert.deepEqual(await resumed.open(f.draft, request, f.signal), result);
  assert.equal(f.calls.create.length, 1, 'restart/retry inspects rather than repeating creation');
  f.changeSession(session => { session.workspace.access = 'read_write'; });
  assert.equal((await resumed.open(f.draft, request, f.signal)).status, 'unconfirmed');
});

test('unavailable, stale, invalid and non-Git worktree requests cannot mutate state', async t => {
  const f = await fixture(t), original = await f.store.read();
  const request = await f.request();
  assert.equal((await f.service.open({ ...f.draft, policy: { ...f.draft.policy, workspaceAccess: 'read_write', permissionMode: 'whitelist' } },
    request, f.signal)).reason, 'stale_context');
  assert.equal((await f.service.inspect({ ...f.draft, policy: { ...f.draft.policy, workspaceKind: 'worktree' } })).reason, 'git_member_required');
  f.runtime.getProviderDiagnostics = async () => ({ providers: [] });
  assert.equal((await f.service.open(f.draft, request, f.signal)).reason, 'target_unavailable');
  assert.equal((await f.service.open(f.draft, { ...request, requestId: 'bad' }, f.signal)).reason, 'invalid_request');
  assert.deepEqual(await f.store.read(), original);
  assert.equal(f.calls.create.length, 0);
});

test('default provider identity is frozen and rechecked before admission', async t => {
  const f = await fixture(t);
  const draft = { ...f.draft, target: { ...f.draft.target, instance: null } };
  const inspected = await f.service.inspect(draft);
  assert.equal(inspected.resolvedTarget.instance, 'cli/local');
  f.runtime.getProviderConfig = async () => ({ codex: { defaultInstance: 'other', defaultBackend: 'cli',
    instances: [{ id: 'other', backend: 'cli', model: 'model' }] } });
  f.runtime.getProviderDiagnostics = async () => ({ providers: [{ provider: 'codex', instance: 'other', backend: 'cli', availability: { status: 'ok' } }] });
  const result = await f.service.open(draft, { requestId: randomUUID(), revision: inspected.revision }, f.signal);
  assert.equal(result.reason, 'stale_context');
  assert.equal(f.calls.create.length, 0);
});

test('inspection of an unadmitted attempt never creates a session', async t => {
  const f = await fixture(t);
  const result = await f.service.inspectAttempt(f.draft, await f.request(), f.signal);
  assert.equal(result.reason, 'attempt_not_admitted');
  assert.equal(f.calls.create.length, 0);
  assert.equal((await f.store.readCore()).tasks.length, 0);
});

test('a folder alias changing after inspection never changes the admitted physical workspace', async t => {
  const f = await fixture(t), first = join(f.root, 'first'), second = join(f.root, 'second'), alias = join(f.root, 'alias');
  await mkdir(first); await mkdir(second);
  await symlink(first, alias, process.platform === 'win32' ? 'junction' : 'dir');
  const draft = { ...f.draft, cwd: alias };
  const service = createCodeSessionOperationService({ ...f.options, runMutation: async (_id, action) => {
    await rm(alias); await symlink(second, alias, process.platform === 'win32' ? 'junction' : 'dir');
    return action();
  } });
  const request = { requestId: randomUUID(), revision: (await service.inspect(draft)).revision };
  const result = await service.open(draft, request, f.signal);
  assert.equal(result.status, 'verified');
  assert.equal(f.calls.create[0].cwd, await realpath(first));
  assert.equal(await realpath(alias), await realpath(second));
});

test('channel changes during observation prevent a verified result', async t => {
  const f = await fixture(t), observe = f.runtime.observeSession;
  f.runtime.observeSession = async () => {
    const response = await observe();
    await f.store.updateSnapshot(({ chat, core }) => ({ core, chat: { ...chat,
      channels: chat.channels.map(channel => ({ ...channel, status: 'archived' })) } }));
    return response;
  };
  assert.equal((await f.service.open(f.draft, await f.request(), f.signal)).status, 'unconfirmed');
});

test('revoked guide authority while waiting for the channel lock prevents provider creation', async t => {
  const f = await fixture(t);
  const service = createCodeSessionOperationService({ ...f.options, runMutation: async (_id, action) => {
    await f.store.updateCore(core => ({ ...core, ownerProfile: { ...core.ownerProfile, actorId: 'changed-owner' } }));
    return action();
  } });
  const request = { requestId: randomUUID(), revision: (await service.inspect(f.draft)).revision };
  assert.equal((await service.open(f.draft, request, f.signal)).status, 'unconfirmed');
  assert.equal(f.calls.create.length, 0);
});

test('duplicate concurrent requests create once; reusing an id for different input is rejected', async t => {
  const f = await fixture(t), request = await f.request();
  const results = await Promise.all([f.service.open(f.draft, request, f.signal), f.service.open(f.draft, request, f.signal)]);
  assert.equal(results[0].status, 'verified');
  assert.deepEqual(results[0], results[1]);
  assert.equal(f.calls.create.length, 1);
  const changed = { ...f.draft, target: { ...f.draft.target, model: 'different' } };
  assert.equal((await f.service.open(changed, request, f.signal)).reason, 'request_conflict');
});

test('interrupted admission is retained across service restart without a provider retry', async t => {
  const f = await fixture(t), request = await f.request();
  const first = await f.service.open(f.draft, request, f.signal);
  await f.store.updateCore(core => ({ ...core, tasks: core.tasks.map(task => task.id === `task-channel-${first.channelId}`
    ? { ...task, metadata: { ...task.metadata, codeSessionOpen: { ...task.metadata.codeSessionOpen, status: 'starting', sessionId: null } } }
    : task) }));
  const restored = createCodeSessionOperationService(f.options);
  const result = await restored.open(f.draft, request, f.signal);
  assert.equal(result.status, 'unconfirmed');
  assert.equal(result.channelId, first.channelId);
  assert.equal(f.calls.create.length, 1);
});

test('cancel before admission changes nothing; late-created session is closed and never replayed', async t => {
  const f = await fixture(t), request = await f.request(), controller = new AbortController();
  controller.abort();
  assert.equal((await f.service.open(f.draft, request, controller.signal)).reason, 'cancelled');
  assert.equal(f.calls.create.length, 0);
  const late = new AbortController(), create = f.runtime.createSession;
  f.runtime.createSession = async input => { const result = await create(input); late.abort(); return result; };
  const result = await f.service.open(f.draft, request, late.signal);
  assert.equal(result.status, 'unconfirmed');
  assert.deepEqual(f.calls.close, [result.sessionId]);
  await createCodeSessionOperationService(f.options).open(f.draft, request, f.signal);
  assert.equal(f.calls.create.length, 1);
});
