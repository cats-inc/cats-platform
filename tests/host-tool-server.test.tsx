import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import test from 'node:test';

import { MemoryCoreStore } from '../src/core/store.ts';
import { mcpTextResult } from '../src/platform/mcp/jsonRpcServer.ts';
import {
  createHostToolServer,
  HOST_TOOLS_MCP_PATH,
  HostToolRegistrationError,
  type HostToolGrantBinding,
  type HostToolProvider,
} from '../src/platform/mcp/hostTools.ts';
import { createHostToolsClientWrapper } from '../src/platform/mcp/hostToolsClientWrapper.ts';
import { McpSessionGrantStore } from '../src/platform/mcp/sessionGrants.ts';
import { createCatImageTools, CAT_IMAGE_TOOLS_SERVER_NAME } from '../src/platform/multimedia/catImageTools.ts';
import type {
  RuntimeClient,
  RuntimeMessageResult,
  RuntimeSendMessageInput,
  RuntimeSessionCreateInput,
  RuntimeSessionInfo,
} from '../src/platform/runtime/client.ts';
import type { RuntimeSessionMcpDeliveryReport, RuntimeSessionMcpServer } from '../src/runtime/sessionMcpServers.ts';
import { CODE_AGENT_PREVIEW_POLICY } from '../src/products/code/agentTools/policy.ts';
import { createCodeAgentToolsProvider } from '../src/products/code/agentTools/service.ts';
import { readHostToolsInvocationMarker } from '../src/platform/mcp/hostTools.ts';
import { createHostToolsInvocationEnricher } from '../src/platform/mcp/hostToolsEnricher.ts';
import {
  clearRuntimeInvocationEnrichers,
  enrichRuntimeInvocation,
  registerRuntimeInvocationEnricher,
} from '../src/platform/runtime/invocationEnrichment.ts';

/** A provider at `chat`, standing in for the base tools PLAN-135 Phase 2 adds. */
const BASE: HostToolProvider = {
  id: 'test.base',
  level: 'chat',
  instructions: 'Base policy: get_tasks reads this conversation\'s Tasks.',
  tools: [{ name: 'get_tasks', description: 'Read Tasks.', inputSchema: { type: 'object' } }],
  async callTool(_name, _args, grant) { return mcpTextResult({ level: grant.binding.level }); },
};

function binding(level: HostToolGrantBinding['level']): HostToolGrantBinding {
  return { channelId: 'channel-1', conversationId: 'conversation-channel-channel-1', workspacePath: '/w',
    actorId: null, shellExecution: false, level, participantId: 'participant-1' };
}

async function listen(handler: (request: import('node:http').IncomingMessage, response: import('node:http').ServerResponse) => Promise<boolean>) {
  const server: Server = createServer((request, response) => {
    void handler(request, response).then((handled) => { if (!handled) response.writeHead(404).end(); });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  return { url: `http://127.0.0.1:${address.port}`, close: () => new Promise<void>((resolve) => server.close(() => resolve())) };
}

async function rpc(url: string, token: string, method: string, params?: unknown) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  return { status: response.status, json: response.status === 200 ? await response.json() as Record<string, any> : null };
}

test('FR-1, FR-2, FR-5: a grant lists the tools and instructions of its level, and nothing wider', async (t) => {
  const host = createHostToolServer();
  host.register(BASE);
  host.register(createCodeAgentToolsProvider({ coreStore: new MemoryCoreStore() }));
  const served = await listen((request, response) => host.route(request, response));
  t.after(served.close);
  const url = `${served.url}${HOST_TOOLS_MCP_PATH}`;
  const tokens = Object.fromEntries((['chat', 'code', 'work'] as const).map((level) => {
    const { token } = host.grants.issue(binding(level));
    host.grants.bind(token, `rt-${level}`);
    return [level, token];
  })) as Record<'chat' | 'code' | 'work', string>;

  const names = async (level: 'chat' | 'code' | 'work') =>
    (await rpc(url, tokens[level], 'tools/list')).json!.result.tools.map((tool: { name: string }) => tool.name);
  assert.deepEqual(await names('chat'), ['get_tasks']);
  assert.ok((await names('code')).includes('show_in_canvas'));
  assert.ok((await names('code')).includes('get_tasks'), 'every level lists the base tools');
  assert.deepEqual(await names('work'), await names('code'), 'Work includes Code');

  const instructions = async (level: 'chat' | 'code' | 'work') =>
    (await rpc(url, tokens[level], 'initialize', { protocolVersion: '2025-06-18' })).json!.result.instructions as string;
  assert.equal(await instructions('chat'), BASE.instructions, "chat's instructions name only its own tools");
  assert.ok((await instructions('code')).includes(CODE_AGENT_PREVIEW_POLICY));
  assert.ok((await instructions('code')).includes(BASE.instructions!));

  const refused = await rpc(url, tokens.chat, 'tools/call', { name: 'show_in_canvas', arguments: { path: 'x' } });
  assert.equal(refused.json?.error?.code, -32602, 'a call outside the level is refused');
  const allowed = await rpc(url, tokens.chat, 'tools/call', { name: 'get_tasks', arguments: {} });
  assert.deepEqual(allowed.json?.result.structuredContent, { level: 'chat' });
});

test('providers cannot reuse an id or a tool name, and a level without tools reports none', () => {
  const host = createHostToolServer();
  assert.equal(host.hasTools('chat'), false);
  assert.equal(host.instructions('work'), undefined);
  host.register(createCodeAgentToolsProvider({ coreStore: new MemoryCoreStore() }));
  assert.equal(host.hasTools('chat'), false, "Code's tools start at code");
  assert.equal(host.hasTools('code'), true);
  assert.throws(() => host.register({ ...BASE, id: 'cats-code.agent-tools' }), HostToolRegistrationError);
  assert.throws(() => host.register({ ...BASE, id: 'other', tools: [{ name: 'show_in_canvas', description: '', inputSchema: {} }] }),
    HostToolRegistrationError);
});

const DELIVERED: RuntimeSessionMcpDeliveryReport = { status: 'delivered', servers: [{ name: 'cats', connection: 'unknown' }] };

function fakeRuntime(options: { sendReports?: Array<RuntimeSessionMcpDeliveryReport | undefined> } = {}) {
  const calls = { create: [] as RuntimeSessionCreateInput[], send: [] as Array<RuntimeSendMessageInput | undefined> };
  const reports = [...(options.sendReports ?? [])];
  const client = {
    async createSession(input: RuntimeSessionCreateInput): Promise<RuntimeSessionInfo> {
      calls.create.push(input);
      return { id: 'rt-1', provider: 'claude', model: null, status: 'ready', cwd: '/w', mcpServers: DELIVERED };
    },
    async sendMessage(_id: string, _content: string, input?: RuntimeSendMessageInput): Promise<RuntimeMessageResult> {
      calls.send.push(input);
      const report = reports.shift();
      return { segments: [], inputTokens: 0, outputTokens: 0, tokensUsed: 0, ...(report ? { mcpServers: report } : {}) };
    },
    async observeSession(id: string) { return { session: { id, cwd: '/w' } }; },
    async closeSession() {},
    async deleteSession() { return { status: 'deleted' }; },
  } as unknown as RuntimeClient;
  return { client, calls };
}

const marker = (level: 'chat' | 'code' | 'work', participantId = 'participant-1') =>
  ({ metadata: { hostTools: { channelId: 'channel-1', workspacePath: '/w', shellExecution: true, level, participantId } } });
const tokenOf = (servers: readonly RuntimeSessionMcpServer[] | undefined) => {
  const server = servers?.find((entry) => entry.name === 'cats');
  return server?.auth.kind === 'bearer_env' ? server.auth.token : null;
};

test('a level with no tool gets no server, so nothing changes for it until it has one', async () => {
  const host = createHostToolServer();
  host.register(createCodeAgentToolsProvider({ coreStore: new MemoryCoreStore() }));
  const wrapper = createHostToolsClientWrapper({ grants: host.grants, server: host, endpoint: () => 'http://127.0.0.1:1/mcp' });
  const { client, calls } = fakeRuntime();
  const wrapped = wrapper.wrapClient(client);
  await wrapped.createSession({ provider: 'claude', context: marker('chat') } as RuntimeSessionCreateInput);
  await wrapped.sendMessage('rt-1', 'hi', { context: marker('chat') });
  assert.equal(calls.create[0]!.mcpServers, undefined);
  assert.equal(calls.send[0]!.mcpServers, undefined);
  assert.equal(calls.send[0]!.instructions, undefined, 'and no policy');
});

test('FR-3: a raise brings a new grant on the next send; the old one lasts until the new set is delivered', async () => {
  const host = createHostToolServer();
  host.register(BASE);
  host.register(createCodeAgentToolsProvider({ coreStore: new MemoryCoreStore() }));
  const wrapper = createHostToolsClientWrapper({ grants: host.grants, server: host, endpoint: () => 'http://127.0.0.1:1/mcp' });
  // The first send after the raise reports the worker still on the old set; the next reports it delivered.
  const { client, calls } = fakeRuntime({ sendReports: [DELIVERED, { ...DELIVERED, status: 'failed' }, DELIVERED] });
  const wrapped = wrapper.wrapClient(client);
  await wrapped.createSession({ provider: 'claude', context: marker('chat') } as RuntimeSessionCreateInput);
  const chatToken = tokenOf(calls.create[0]!.mcpServers)!;
  assert.equal(host.grants.resolve(chatToken)?.binding.level, 'chat');
  assert.equal(host.grants.resolve(chatToken)?.binding.participantId, 'participant-1', 'the grant names the participant');

  await wrapped.sendMessage('rt-1', 'before', { context: marker('chat') });
  assert.equal(tokenOf(calls.send[0]!.mcpServers), chatToken, 'same level, same grant');
  assert.equal(calls.send[0]!.instructions, BASE.instructions, "the turn policy names only chat's tools");

  await wrapped.sendMessage('rt-1', 'after the raise', { context: marker('code') });
  const codeToken = tokenOf(calls.send[1]!.mcpServers)!;
  assert.notEqual(codeToken, chatToken, 'the changed token makes Runtime recycle the worker');
  assert.equal(host.grants.resolve(codeToken)?.binding.level, 'code');
  assert.equal(host.grants.resolve(codeToken)?.state, 'bound');
  assert.equal(host.grants.resolve(codeToken)?.binding.workspacePath, '/w', "the session's folder carries over");
  assert.equal(calls.send[1]!.instructions, undefined, 'no policy until Runtime reports the new set delivered');
  assert.ok(host.grants.resolve(chatToken), 'a worker still on the old set keeps its tools');

  await wrapped.sendMessage('rt-1', 'next', { context: marker('code') });
  assert.equal(tokenOf(calls.send[2]!.mcpServers), codeToken);
  assert.equal(host.grants.resolve(chatToken), null, 'revoked once the new set is delivered');
  await wrapped.sendMessage('rt-1', 'policy', { context: marker('code') });
  assert.ok(calls.send[3]!.instructions?.includes(CODE_AGENT_PREVIEW_POLICY));

  await wrapped.closeSession('rt-1');
  assert.equal(host.grants.resolve(codeToken), null);
});

test('a raise to a level with the same tools keeps the grant, and a lower level is ignored', async () => {
  const host = createHostToolServer();
  host.register(BASE);
  host.register(createCodeAgentToolsProvider({ coreStore: new MemoryCoreStore() }));
  const wrapper = createHostToolsClientWrapper({ grants: host.grants, server: host, endpoint: () => 'http://127.0.0.1:1/mcp' });
  const { client, calls } = fakeRuntime({ sendReports: [DELIVERED, DELIVERED, DELIVERED] });
  const wrapped = wrapper.wrapClient(client);
  await wrapped.createSession({ provider: 'claude', context: marker('code') } as RuntimeSessionCreateInput);
  const codeToken = tokenOf(calls.create[0]!.mcpServers)!;
  // Work lists the same tools as Code until Work has tools of its own.
  await wrapped.sendMessage('rt-1', 'after a raise to work', { context: marker('work') });
  assert.equal(tokenOf(calls.send[0]!.mcpServers), codeToken, 'no new grant, so no recycle');
  assert.equal(host.grants.resolve(codeToken)?.binding.level, 'work', 'the grant takes the new level');
  // A marker below the grant's level is never acted on: levels only rise.
  await wrapped.sendMessage('rt-1', 'a stale marker', { context: marker('chat') });
  assert.equal(tokenOf(calls.send[1]!.mcpServers), codeToken);
  assert.equal(host.grants.resolve(codeToken)?.binding.level, 'work');
});

test('a raise after a data reset fails closed on the shell posture, and keeps the participant', async () => {
  const host = createHostToolServer();
  host.register(BASE);
  host.register(createCodeAgentToolsProvider({ coreStore: new MemoryCoreStore() }));
  const wrapper = createHostToolsClientWrapper({ grants: host.grants, server: host, endpoint: () => 'http://127.0.0.1:1/mcp' });
  const { client, calls } = fakeRuntime({ sendReports: [DELIVERED] });
  const wrapped = wrapper.wrapClient(client);
  await wrapped.createSession({ provider: 'claude', context: marker('chat') } as RuntimeSessionCreateInput);
  host.clearForReset();
  const withoutParticipant = { metadata: { hostTools: { ...marker('code').metadata.hostTools, participantId: null } } };
  await wrapped.sendMessage('rt-1', 'after a reset and a raise', { context: withoutParticipant });
  const token = tokenOf(calls.send[0]!.mcpServers)!;
  assert.equal(host.grants.resolve(token)?.binding.shellExecution, false);
  assert.equal(host.grants.resolve(token)?.binding.participantId, 'participant-1');
});

test("a companion's lane keeps its image tools beside the host server (SPEC-142 A3)", async () => {
  const host = createHostToolServer();
  host.register(BASE);
  const hostTools = createHostToolsClientWrapper({ grants: host.grants, server: host, endpoint: () => 'http://127.0.0.1:1/host' });
  const imageTools = createCatImageTools({
    endpoint: () => 'http://127.0.0.1:1/images',
    service: { submit: async () => { throw new Error('unused'); }, releaseTurn: () => {}, cancelTurn: async () => {},
      status: async () => { throw new Error('unused'); } },
    resolveTurn: async () => ({ caller: { accountId: 'a', ownerActorId: 'o', catId: 'c', conversationId: 'lane',
      runtimeSessionId: 'rt-1', trigger: 'direct' } as never, actionId: 'action-1' }),
  });
  const { client, calls } = fakeRuntime();
  // The app's order: image tools outside the host wrapper (src/app/server/index.ts).
  const wrapped = imageTools.wrapClient(hostTools.wrapClient(client));
  await wrapped.sendMessage('rt-1', 'draw me a cat', { context: marker('chat') });
  const names = (calls.send[0]!.mcpServers ?? []).map((server) => server.name);
  assert.deepEqual(names, ['cats', CAT_IMAGE_TOOLS_SERVER_NAME]);
  assert.equal(CAT_IMAGE_TOOLS_SERVER_NAME, 'cats-images');
  imageTools.close();
});

test('an invocation without a conversation loses a marker an earlier step left', () => {
  clearRuntimeInvocationEnrichers();
  registerRuntimeInvocationEnricher(createHostToolsInvocationEnricher());
  try {
    const enriched = enrichRuntimeInvocation({ id: null }, {
      context: { metadata: { ...marker('work').metadata, other: 1 } },
    }, { phase: 'message_send' });
    assert.equal(readHostToolsInvocationMarker(enriched.context), null, 'through the real pipeline, which never deletes keys');
    assert.equal(enriched.context?.metadata?.other, 1);
  } finally {
    clearRuntimeInvocationEnrichers();
  }
});
