import assert from 'node:assert/strict';
import test from 'node:test';

import { McpSessionGrantStore } from '../src/platform/mcp/sessionGrants.ts';
import type {
  RuntimeClient,
  RuntimeMessageResult,
  RuntimeSendMessageInput,
  RuntimeSessionCreateInput,
  RuntimeSessionInfo,
  RuntimeSessionResumeInput,
} from '../src/platform/runtime/client.ts';
import { MemoryCoreStore } from '../src/core/store.ts';
import { readHostToolsInvocationMarker, type HostToolGrantBinding } from '../src/platform/mcp/hostTools.ts';
import { createHostToolsInvocationEnricher } from '../src/platform/mcp/hostToolsEnricher.ts';
import { CODE_AGENT_PREVIEW_POLICY } from '../src/products/code/agentTools/policy.ts';
import { createCodeAgentToolsService } from '../src/products/code/agentTools/service.ts';
import { createHostToolsClientWrapper } from '../src/platform/mcp/hostToolsClientWrapper.ts';
import type { RuntimeSessionMcpDeliveryReport } from '../src/runtime/sessionMcpServers.ts';

const ENDPOINT = 'http://127.0.0.1:8181/api/code/agent-tools/mcp';
const MARKER_CONTEXT = { metadata: { hostTools: { channelId: 'channel-1', workspacePath: '/workspace', level: 'code' } } };
const DELIVERED: RuntimeSessionMcpDeliveryReport = { status: 'delivered', servers: [{ name: 'cats', connection: 'unknown' }] };

function fakeClient(options: { createReport?: RuntimeSessionMcpDeliveryReport; sendReports?: RuntimeSessionMcpDeliveryReport[]; failCreate?: boolean; createCwd?: string } = {}) {
  const calls = {
    create: [] as RuntimeSessionCreateInput[],
    send: [] as Array<RuntimeSendMessageInput | undefined>,
    resume: [] as Array<RuntimeSessionResumeInput | undefined>,
    closed: [] as string[],
  };
  const sendReports = [...(options.sendReports ?? [])];
  const client = {
    async createSession(input: RuntimeSessionCreateInput): Promise<RuntimeSessionInfo> {
      calls.create.push(input);
      if (options.failCreate) throw new Error('runtime unavailable');
      return { id: 'rt-1', provider: 'claude', model: null, status: 'ready', cwd: options.createCwd ?? null, ...(options.createReport ? { mcpServers: options.createReport } : {}) };
    },
    async sendMessage(_sessionId: string, _content: string, input?: RuntimeSendMessageInput): Promise<RuntimeMessageResult> {
      calls.send.push(input);
      const report = sendReports.shift();
      return { segments: [], inputTokens: 0, outputTokens: 0, tokensUsed: 0, ...(report ? { mcpServers: report } : {}) };
    },
    async resumeSession(sessionId: string, input?: RuntimeSessionResumeInput): Promise<RuntimeSessionInfo> {
      calls.resume.push(input);
      return { id: sessionId, provider: 'claude', model: null, status: 'initializing', cwd: null, mcpServers: DELIVERED };
    },
    async closeSession(sessionId: string) { calls.closed.push(sessionId); },
    async deleteSession(sessionId: string) { calls.closed.push(sessionId); return { status: 'deleted' }; },
  } as unknown as RuntimeClient;
  return { client, calls };
}

function setup(endpoint: string | null = ENDPOINT) {
  const grants = new McpSessionGrantStore<HostToolGrantBinding>();
  // The host server with Code's tools, as the app registers them.
  const server = createCodeAgentToolsService({ grants, coreStore: new MemoryCoreStore() });
  const wrapper = createHostToolsClientWrapper({ grants, server, endpoint: () => endpoint });
  return { grants, wrapper, server };
}

test('the marker enricher tags every conversation with its level and participant', () => {
  const enricher = createHostToolsInvocationEnricher();
  const phase = { phase: 'session_create' as const };
  const code = enricher.enrich({ originSurface: 'code', id: 'channel-1', chatCwd: '/workspace' },
    { context: { metadata: { targetParticipantId: 'participant-7' } } }, phase);
  assert.deepEqual(readHostToolsInvocationMarker(code?.context), {
    channelId: 'channel-1',
    workspacePath: '/workspace',
    shellExecution: true,
    level: 'code',
    participantId: 'participant-7',
    // SPEC-142 Phase 3: closed unless the turn carries the owner's stamp.
    proposalsAllowed: false,
  });
  assert.deepEqual(code?.context?.labels, ['product:code']);
  const chat = enricher.enrich({ originSurface: 'chat', id: 'channel-2' }, {}, phase);
  assert.equal(readHostToolsInvocationMarker(chat?.context)?.level, 'chat');
  assert.equal(readHostToolsInvocationMarker(chat?.context)?.participantId, null);
  assert.deepEqual(chat?.context?.labels, [], "Code's label follows Code's tools");
  // SPEC-142 A3: a direct lane is marked too, at `chat` whatever it stores.
  const lane = enricher.enrich({ originSurface: 'code', productScope: 'work', channelKind: 'direct_message', id: 'lane-1' }, {}, phase);
  assert.equal(readHostToolsInvocationMarker(lane?.context)?.level, 'chat');
  assert.equal(enricher.enrich({ originSurface: 'chat', id: '' }, {}, phase), null);
  const readOnly = enricher.enrich({
    originSurface: 'code', id: 'channel-3', runtimeWorkspaceAccess: 'read_only', runtimePermissionMode: 'default',
  }, {}, phase);
  assert.equal(readHostToolsInvocationMarker(readOnly?.context)?.shellExecution, false);
  const whitelist = enricher.enrich({
    originSurface: 'code', id: 'channel-4', runtimeWorkspaceAccess: 'read_write', runtimePermissionMode: 'whitelist',
  }, {}, phase);
  assert.equal(readHostToolsInvocationMarker(whitelist?.context)?.shellExecution, false,
    'a channel whitelist without its tools counts as no shell');
});

test('the grant records whether the session may run shell commands (SPEC-123 CAP-08)', async () => {
  const { grants, wrapper } = setup();
  async function postureFor(input: Partial<RuntimeSessionCreateInput>): Promise<boolean | undefined> {
    const { client, calls } = fakeClient();
    await wrapper.wrapClient(client).createSession({ provider: 'claude', context: MARKER_CONTEXT, ...input } as RuntimeSessionCreateInput);
    const server = calls.create[0]!.mcpServers![0]!;
    return grants.resolve(server.auth.kind === 'bearer_env' ? server.auth.token : '')?.binding.shellExecution;
  }
  assert.equal(await postureFor({}), true, 'unset means the client default, skip');
  assert.equal(await postureFor({ workspaceAccess: 'read_write', permissionMode: 'skip' }), true);
  assert.equal(await postureFor({ workspaceAccess: 'read_only', permissionMode: 'default' }), false);
  assert.equal(await postureFor({ workspaceAccess: 'read_write', permissionMode: 'whitelist', allowedTools: ['Read', 'Edit'] }), false);
  assert.equal(await postureFor({ workspaceAccess: 'read_write', permissionMode: 'whitelist', allowedTools: ['Read', 'Bash(npm run *)'] }), true);
  assert.equal(await postureFor({ workspaceAccess: 'read_write', permissionMode: 'whitelist', allowedTools: ['shell'] }), true);

  // After a Platform restart the turn's marker supplies the channel posture.
  const { client, calls } = fakeClient();
  const context = { metadata: { hostTools: { level: 'code', channelId: 'channel-1', workspacePath: '/workspace', shellExecution: false } } };
  await wrapper.wrapClient(client).sendMessage('rt-restarted', 'hi', { context });
  const server = calls.send[0]!.mcpServers![0]!;
  assert.equal(grants.resolve(server.auth.kind === 'bearer_env' ? server.auth.token : '')?.binding.shellExecution, false);
});

test('create attaches the cats server with a grant bound to the new session', async () => {
  const { grants, wrapper } = setup();
  const { client, calls } = fakeClient({ createReport: DELIVERED, sendReports: [{ status: 'unsupported', servers: [] }] });
  const wrapped = wrapper.wrapClient(client);
  await wrapped.createSession({ provider: 'claude', context: MARKER_CONTEXT } as RuntimeSessionCreateInput);

  const [server] = calls.create[0]!.mcpServers!;
  assert.equal(server?.name, 'cats');
  assert.equal(server?.url, ENDPOINT);
  assert.equal(server?.auth.kind, 'bearer_env');
  const token = server?.auth.kind === 'bearer_env' ? server.auth.token : '';
  assert.ok(token.length > 20);
  assert.doesNotMatch(JSON.stringify(calls.create[0]!.context), new RegExp(token));
  const grant = grants.resolve(token);
  assert.equal(grant?.state, 'bound');
  assert.equal(grant?.runtimeSessionId, 'rt-1');
  assert.equal(grant?.binding.conversationId, 'conversation-channel-channel-1');

  // Delivered at create: the next turn carries the policy and the descriptor.
  await wrapped.sendMessage('rt-1', 'build a calculator', { instructions: 'Be brief.', context: MARKER_CONTEXT });
  assert.match(calls.send[0]!.instructions ?? '', /Be brief\./u);
  assert.ok(calls.send[0]!.instructions?.includes(CODE_AGENT_PREVIEW_POLICY));
  assert.equal(calls.send[0]!.mcpServers?.[0]?.name, 'cats');
  // That turn reported unsupported, so the following one omits the policy.
  await wrapped.sendMessage('rt-1', 'again', { context: MARKER_CONTEXT });
  assert.equal(calls.send[1]!.instructions, undefined);

  await wrapped.resumeSession!('rt-1');
  assert.equal(calls.resume[0]?.mcpServers?.[0]?.name, 'cats');

  await wrapped.closeSession('rt-1');
  assert.equal(grants.resolve(token), null);
});

test('the grant uses the workspace Runtime resolved for the session', async () => {
  const { grants, wrapper } = setup();
  const withCwd = fakeClient({ createCwd: '/runtime/worktrees/rt-1' });
  await wrapper.wrapClient(withCwd.client).createSession({ provider: 'claude', cwd: '/repo', context: MARKER_CONTEXT } as RuntimeSessionCreateInput);
  const server = withCwd.calls.create[0]!.mcpServers![0]!;
  const token = server.auth.kind === 'bearer_env' ? server.auth.token : '';
  assert.equal(grants.resolve(token)?.binding.workspacePath, '/runtime/worktrees/rt-1');

  const noCwd = fakeClient();
  await wrapper.wrapClient(noCwd.client).createSession({ provider: 'claude', cwd: '/repo', context: MARKER_CONTEXT } as RuntimeSessionCreateInput);
  const second = noCwd.calls.create[0]!.mcpServers![0]!;
  const secondToken = second.auth.kind === 'bearer_env' ? second.auth.token : '';
  assert.equal(grants.resolve(secondToken)?.binding.workspacePath, '/repo');

  const enricher = createHostToolsInvocationEnricher();
  const repoOnly = enricher.enrich({ originSurface: 'code', id: 'channel-9', repoPath: '/repo' }, {}, { phase: 'session_create' });
  assert.equal(readHostToolsInvocationMarker(repoOnly?.context)?.workspacePath, '/repo');
});

test('non-Code sessions, a missing endpoint and failed creates stay untouched', async () => {
  const { grants, wrapper } = setup();
  const { client, calls } = fakeClient();
  await wrapper.wrapClient(client).createSession({ provider: 'claude' } as RuntimeSessionCreateInput);
  assert.equal(calls.create[0]!.mcpServers, undefined);

  const noEndpoint = setup(null);
  const second = fakeClient();
  await noEndpoint.wrapper.wrapClient(second.client).createSession({ provider: 'claude', context: MARKER_CONTEXT } as RuntimeSessionCreateInput);
  assert.equal(second.calls.create[0]!.mcpServers, undefined);

  const failing = fakeClient({ failCreate: true });
  await assert.rejects(wrapper.wrapClient(failing.client).createSession({ provider: 'claude', context: MARKER_CONTEXT } as RuntimeSessionCreateInput));
  assert.equal(grants.revokeWhere(() => true), 0, 'a failed create leaves no grant');
});

test('after a Platform restart a Code send issues a fresh grant without the policy', async () => {
  const { grants, wrapper } = setup();
  const { client, calls } = fakeClient({ sendReports: [DELIVERED] });
  const wrapped = wrapper.wrapClient(client);
  await wrapped.sendMessage('rt-restarted', 'hello', { context: MARKER_CONTEXT });
  const server = calls.send[0]!.mcpServers?.[0];
  assert.equal(server?.name, 'cats');
  assert.equal(calls.send[0]!.instructions, undefined);
  const token = server?.auth.kind === 'bearer_env' ? server.auth.token : '';
  assert.equal(grants.resolve(token)?.runtimeSessionId, 'rt-restarted');
  await wrapped.sendMessage('rt-restarted', 'next', { context: MARKER_CONTEXT });
  assert.ok(calls.send[1]!.instructions?.includes(CODE_AGENT_PREVIEW_POLICY));
});

test("SPEC-141 FR-8: Work conversations list Code's tools too, and a direct lane lists them never", () => {
  const enricher = createHostToolsInvocationEnricher();
  const phase = { phase: 'session_create' as const };
  // Work includes Code (ADR-149 D5): by the stored scope, or by the origin when none is stored.
  for (const channel of [
    { originSurface: 'work', id: 'work-origin', chatCwd: '/workspace' },
    { originSurface: 'chat', productScope: 'work', id: 'raised-to-work', chatCwd: '/workspace' },
    { originSurface: 'chat', productScope: 'code', id: 'raised-to-code', chatCwd: '/workspace' },
  ]) {
    const enriched = enricher.enrich(channel, {}, phase);
    const marker = readHostToolsInvocationMarker(enriched?.context);
    assert.equal(marker?.channelId, channel.id, channel.id);
    assert.ok(marker && ['code', 'work'].includes(marker.level), channel.id);
    assert.ok(enriched?.context?.labels?.includes('product:code'), channel.id);
  }
  // A direct lane reads as chat whatever it stores (SPEC-142 A3), so its grant never lists
  // Code's tools.
  for (const lane of [
    { originSurface: 'work', channelKind: 'direct_message', id: 'lane-1' },
    { originSurface: 'code', productScope: 'work', roomRouting: { mode: 'direct_message' }, id: 'lane-2' },
    { originSurface: 'work', productScope: 'chat', id: 'kept-at-chat' },
  ]) {
    const enriched = enricher.enrich(lane, {}, phase);
    assert.equal(readHostToolsInvocationMarker(enriched?.context)?.level, 'chat', lane.id);
    assert.ok(!enriched?.context?.labels?.includes('product:code'), lane.id);
  }
});

test("Code's servers join the call's other servers on create, send and resume", async () => {
  const { wrapper } = setup();
  const { client, calls } = fakeClient({ createReport: DELIVERED });
  const wrapped = wrapper.wrapClient(client);
  const desktop = { name: 'cats-desktop', transport: 'http' as const, url: 'http://127.0.0.1:1/desktop',
    auth: { kind: 'bearer_env' as const, token: 'desktop-token' } };
  const stale = { name: 'cats', transport: 'http' as const, url: 'http://127.0.0.1:1/stale',
    auth: { kind: 'bearer_env' as const, token: 'stale-token' } };
  const names = (servers?: Array<{ name: string }>) => (servers ?? []).map((server) => server.name);

  await wrapped.createSession({ provider: 'claude', context: MARKER_CONTEXT, mcpServers: [desktop] } as RuntimeSessionCreateInput);
  // In name order on every call: Runtime's fingerprint follows the order (PLAN-135 Phase 1).
  assert.deepEqual(names(calls.create[0]!.mcpServers), ['cats', 'cats-desktop']);
  await wrapped.sendMessage('rt-1', 'hello', { context: MARKER_CONTEXT, mcpServers: [desktop, stale] });
  assert.deepEqual(names(calls.send[0]!.mcpServers), ['cats', 'cats-desktop'], 'its own name replaces a stale entry');
  assert.equal(calls.send[0]!.mcpServers!.find((server) => server.name === 'cats')!.url, ENDPOINT);
  await wrapped.resumeSession!('rt-1', { mcpServers: [desktop] });
  assert.deepEqual(names(calls.resume[0]!.mcpServers), ['cats', 'cats-desktop']);

  // An explicit empty list from an outer wrapper, which drops its own server, leaves only Code's.
  await wrapped.sendMessage('rt-1', 'again', { context: MARKER_CONTEXT, mcpServers: [] });
  assert.deepEqual(names(calls.send[1]!.mcpServers), ['cats']);
  await wrapped.sendMessage('rt-1', 'and again', { context: MARKER_CONTEXT });
  assert.deepEqual(names(calls.send[2]!.mcpServers), ['cats']);
});

test('SPEC-141 FR-25: a session that gains the server is bound to the folder it works in', async () => {
  const observed = (session: Record<string, unknown> | Error) => {
    const { client, calls } = fakeClient();
    (client as unknown as { observeSession: (id: string) => Promise<unknown> }).observeSession = async (id: string) => {
      if (session instanceof Error) throw session;
      return { session: { id, ...session } };
    };
    return { client, calls };
  };
  const tokenOf = (input?: RuntimeSendMessageInput) => {
    const server = input?.mcpServers?.find((entry) => entry.name === 'cats');
    return server?.auth.kind === 'bearer_env' ? server.auth.token : '';
  };
  // A Work conversation's session that started before Work included Code: its first send after
  // the change attaches the server, bound to the session's worktree, not the conversation's folder.
  for (const [session, expected] of [
    [{ cwd: '/repo', workspace: { kind: 'worktree', runtimeCwd: '/runtime/worktrees/rt-old', sourceCwd: '/repo' } }, '/runtime/worktrees/rt-old'],
    [{ cwd: '/runtime/sandbox/rt-old' }, '/runtime/sandbox/rt-old'],
    [{}, null],
    [new Error('runtime unavailable'), null],
  ] as const) {
    const { grants, wrapper } = setup();
    const { client, calls } = observed(session as Record<string, unknown> | Error);
    await wrapper.wrapClient(client).sendMessage('rt-old', 'hello', { context: MARKER_CONTEXT });
    const grant = grants.resolve(tokenOf(calls.send[0]));
    assert.equal(grant?.runtimeSessionId, 'rt-old');
    assert.equal(grant?.binding.workspacePath, expected, JSON.stringify(session instanceof Error ? 'error' : session));
    assert.equal(grant?.binding.channelId, 'channel-1');
  }
});

test('two first sends racing on one session issue one grant, and close revokes it', async () => {
  // Found by the Phase 4 review: with the folder read awaited between the lookup and the
  // write, two sends each issued a grant and close revoked only one.
  const { grants, wrapper } = setup();
  const { client, calls } = fakeClient();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  (client as unknown as { observeSession: (id: string) => Promise<unknown> }).observeSession = async (id: string) => {
    await gate;
    return { session: { id, workspace: { runtimeCwd: '/runtime/worktrees/rt-race' } } };
  };
  const wrapped = wrapper.wrapClient(client);
  const first = wrapped.sendMessage('rt-race', 'one', { context: MARKER_CONTEXT });
  const second = wrapped.sendMessage('rt-race', 'two', { context: MARKER_CONTEXT });
  release();
  await Promise.all([first, second]);
  const tokens = calls.send.map((input) => {
    const server = input?.mcpServers?.find((entry) => entry.name === 'cats');
    return server?.auth.kind === 'bearer_env' ? server.auth.token : '';
  });
  assert.equal(new Set(tokens).size, 1, 'both sends carry the same grant');
  assert.equal(grants.some((grant) => grant.runtimeSessionId === 'rt-race'), true);
  await wrapped.closeSession('rt-race');
  assert.equal(grants.some(() => true), false, 'no grant outlives the session');
});

test('a grant issued without a folder gets one when Runtime can later say it', async () => {
  const { grants, wrapper } = setup();
  const { client, calls } = fakeClient();
  let answers = 0;
  (client as unknown as { observeSession: (id: string) => Promise<unknown> }).observeSession = async (id: string) => {
    answers += 1;
    if (answers === 1) throw new Error('runtime busy');
    return { session: { id, workspace: { runtimeCwd: '/runtime/worktrees/rt-late' } } };
  };
  const wrapped = wrapper.wrapClient(client);
  const tokenOf = (index: number) => {
    const server = calls.send[index]?.mcpServers?.find((entry) => entry.name === 'cats');
    return server?.auth.kind === 'bearer_env' ? server.auth.token : '';
  };
  await wrapped.sendMessage('rt-late', 'one', { context: MARKER_CONTEXT });
  assert.equal(grants.resolve(tokenOf(0))?.binding.workspacePath, null, 'unknown at first: no folder');
  await wrapped.sendMessage('rt-late', 'two', { context: MARKER_CONTEXT });
  assert.equal(tokenOf(1), tokenOf(0), 'the same grant');
  assert.equal(grants.resolve(tokenOf(1))?.binding.workspacePath, '/runtime/worktrees/rt-late');
  await wrapped.sendMessage('rt-late', 'three', { context: MARKER_CONTEXT });
  assert.equal(answers, 2, 'once known, the folder is not asked for again');
});

test("a conversation's execution policy reaches the grant's shell posture", async () => {
  // Without a shell the grant cannot start a dev preview (SPEC-123 CAP-08).
  const enricher = createHostToolsInvocationEnricher();
  const phase = { phase: 'message_send' as const };
  const policy = (network: boolean, approval: 'never' | 'on-request') =>
    ({ version: 1 as const, mode: 'explicit' as const, access: 'full-access' as const, network, approval });
  const markerFor = (runtimeExecutionPolicy: ReturnType<typeof policy> | null) => readHostToolsInvocationMarker(
    enricher.enrich({ originSurface: 'work', id: 'channel-p', runtimePermissionMode: 'skip', runtimeExecutionPolicy }, {}, phase)?.context);
  assert.equal(markerFor(null)?.shellExecution, true);
  assert.equal(markerFor(policy(true, 'never'))?.shellExecution, true);
  assert.equal(markerFor(policy(false, 'never'))?.shellExecution, false);
  assert.equal(markerFor(policy(true, 'on-request'))?.shellExecution, false);

  // The create input carries the effective policy too.
  const { grants, wrapper } = setup();
  const { client, calls } = fakeClient();
  await wrapper.wrapClient(client).createSession({ provider: 'codex', context: MARKER_CONTEXT,
    executionPolicy: policy(false, 'never') } as RuntimeSessionCreateInput);
  const server = calls.create[0]!.mcpServers!.find((entry) => entry.name === 'cats')!;
  assert.equal(grants.resolve(server.auth.kind === 'bearer_env' ? server.auth.token : '')?.binding.shellExecution, false);
});
