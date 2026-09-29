import assert from 'node:assert/strict';
import test from 'node:test';

import type {
  RuntimeClient,
  RuntimeSessionCreateInput,
  RuntimeSessionInfo,
  RuntimeSendMessageInput,
  RuntimeSessionResumeInput,
} from '../src/platform/runtime/client.ts';
import { McpSessionGrantStore } from '../src/platform/mcp/sessionGrants.ts';
import {
  SessionMcpServerCompositionError,
  composeSessionMcpServers,
  sessionMcpServerName,
  type SessionMcpServerContext,
  type SessionMcpServerContributor,
} from '../src/platform/mcp/sessionMcpServerContributions.ts';
import type { CodeAgentToolGrantBinding } from '../src/products/code/agentTools/contracts.ts';
import { createCodeAgentToolsClientWrapper } from '../src/products/code/agentTools/runtimeClientWrapper.ts';

const APP_SERVER = {
  name: 'app-cats-ask',
  transport: 'http' as const,
  url: 'http://127.0.0.1:8080/apps/cats.ask/mcp',
  auth: { kind: 'bearer_env' as const, token: 'app-token' },
};

test('server names are namespaced by origin and fit Runtime limits', () => {
  assert.equal(sessionMcpServerName({ kind: 'host' }), 'cats');
  assert.equal(sessionMcpServerName({ kind: 'app', appId: 'cats.ask' }), 'app-cats-ask');
  assert.equal(sessionMcpServerName({ kind: 'plugin', pluginId: 'cats-inc/agency-agents' }), 'plugin-cats-inc-agency-agents');
  const long = sessionMcpServerName({ kind: 'plugin', pluginId: 'some-very-long-publisher/with-a-long-plugin-name' });
  const other = sessionMcpServerName({ kind: 'plugin', pluginId: 'some-very-long-publisher/with-a-long-plugin-name-2' });
  for (const name of [long, other]) assert.match(name, /^[a-z][a-z0-9-]{0,31}$/u);
  assert.notEqual(long, other, 'long IDs keep distinct names');
});

test('composition keeps each origin in its own name', () => {
  const cats = { name: 'cats', transport: 'http' as const, url: 'http://127.0.0.1:1/mcp', auth: { kind: 'none' as const } };
  assert.deepEqual(
    composeSessionMcpServers([
      { origin: { kind: 'host' }, server: cats },
      { origin: { kind: 'app', appId: 'cats.ask' }, server: APP_SERVER },
    ]).map((server) => server.name),
    ['cats', 'app-cats-ask'],
  );
  const code = (fn: () => unknown) => {
    try { fn(); } catch (error) { return error instanceof SessionMcpServerCompositionError ? error.code : String(error); }
    return 'ok';
  };
  assert.equal(code(() => composeSessionMcpServers([{ origin: { kind: 'app', appId: 'evil' }, server: { ...APP_SERVER, name: 'cats' } }])),
    'name_mismatch', 'an App cannot claim the host name');
  assert.equal(code(() => composeSessionMcpServers([
    { origin: { kind: 'app', appId: 'cats.ask' }, server: APP_SERVER },
    { origin: { kind: 'app', appId: 'cats.ask' }, server: APP_SERVER },
  ])), 'name_duplicate');
  assert.equal(code(() => composeSessionMcpServers([{ origin: { kind: 'host' }, server: { ...cats, name: 'Cats!' } }])), 'name_invalid');
});

test('the Code wrapper delivers contributed servers through the same descriptor (PLAN-116 F5)', async () => {
  const calls = { create: [] as RuntimeSessionCreateInput[], send: [] as (RuntimeSendMessageInput | undefined)[], resume: [] as (RuntimeSessionResumeInput | undefined)[] };
  const client = {
    async createSession(input: RuntimeSessionCreateInput): Promise<RuntimeSessionInfo> {
      calls.create.push(input);
      return { id: 'rt-1', provider: 'claude', model: null, status: 'ready', cwd: '/workspace' };
    },
    async sendMessage(_id: string, _content: string, input?: RuntimeSendMessageInput) {
      calls.send.push(input);
      return { segments: [], inputTokens: 0, outputTokens: 0, tokensUsed: 0 };
    },
    async resumeSession(id: string, input?: RuntimeSessionResumeInput): Promise<RuntimeSessionInfo> {
      calls.resume.push(input);
      return { id, provider: 'claude', model: null, status: 'ready', cwd: null };
    },
  } as unknown as RuntimeClient;
  const seen: SessionMcpServerContext[] = [];
  const failures: string[] = [];
  const contributors: SessionMcpServerContributor[] = [
    {
      id: 'granted-apps',
      contribute(context) {
        seen.push(context);
        return [{ origin: { kind: 'app', appId: 'cats.ask' }, server: APP_SERVER }];
      },
    },
    {
      id: 'broken-plugin',
      contribute: () => [{ origin: { kind: 'plugin', pluginId: 'x/y' }, server: { ...APP_SERVER, name: 'cats' } }],
    },
    { id: 'throwing', contribute: () => { throw new Error('boom'); } },
  ];
  const wrapper = createCodeAgentToolsClientWrapper({
    grants: new McpSessionGrantStore<CodeAgentToolGrantBinding>(),
    endpoint: () => 'http://127.0.0.1:9/api/code/agent-tools/mcp',
    contributors,
    onContributionError: (id) => failures.push(id),
  });
  const wrapped = wrapper.wrapClient(client);
  const context = { metadata: { codeAgentTools: { channelId: 'channel-1', workspacePath: '/workspace', shellExecution: true } } };
  await wrapped.createSession({ provider: 'claude', context } as RuntimeSessionCreateInput);
  await wrapped.sendMessage('rt-1', 'hi', { context });
  await wrapped.resumeSession!('rt-1');

  for (const servers of [calls.create[0]?.mcpServers, calls.send[0]?.mcpServers, calls.resume[0]?.mcpServers]) {
    assert.deepEqual(servers?.map((server) => server.name), ['cats', 'app-cats-ask']);
  }
  assert.deepEqual(seen[0], { channelId: 'channel-1', conversationId: 'conversation-channel-channel-1', workspacePath: '/workspace' });
  assert.deepEqual([...new Set(failures)], ['broken-plugin', 'throwing'], 'bad contributors are left out, cats still arrives');
});
