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
import type { CodeAgentToolGrantBinding } from '../src/products/code/agentTools/contracts.ts';
import {
  createCodeAgentToolsInvocationEnricher,
  readCodeAgentToolsInvocationMarker,
} from '../src/products/code/agentTools/enricher.ts';
import { CODE_AGENT_PREVIEW_POLICY } from '../src/products/code/agentTools/policy.ts';
import { createCodeAgentToolsClientWrapper } from '../src/products/code/agentTools/runtimeClientWrapper.ts';
import type { RuntimeSessionMcpDeliveryReport } from '../src/runtime/sessionMcpServers.ts';

const ENDPOINT = 'http://127.0.0.1:8181/api/code/agent-tools/mcp';
const MARKER_CONTEXT = { metadata: { codeAgentTools: { channelId: 'channel-1', workspacePath: '/workspace' } } };
const DELIVERED: RuntimeSessionMcpDeliveryReport = { status: 'delivered', servers: [{ name: 'cats', connection: 'unknown' }] };

function fakeClient(options: { createReport?: RuntimeSessionMcpDeliveryReport; sendReports?: RuntimeSessionMcpDeliveryReport[]; failCreate?: boolean } = {}) {
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
      return { id: 'rt-1', provider: 'claude', model: null, status: 'ready', cwd: null, ...(options.createReport ? { mcpServers: options.createReport } : {}) };
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
  const grants = new McpSessionGrantStore<CodeAgentToolGrantBinding>();
  const wrapper = createCodeAgentToolsClientWrapper({ grants, endpoint: () => endpoint });
  return { grants, wrapper };
}

test('the marker enricher tags Code conversations only', () => {
  const enricher = createCodeAgentToolsInvocationEnricher();
  const phase = { phase: 'session_create' as const };
  const code = enricher.enrich({ originSurface: 'code', id: 'channel-1', chatCwd: '/workspace' }, {}, phase);
  assert.deepEqual(readCodeAgentToolsInvocationMarker(code?.context), { channelId: 'channel-1', workspacePath: '/workspace' });
  assert.equal(enricher.enrich({ originSurface: 'chat', id: 'channel-2' }, {}, phase), null);
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
