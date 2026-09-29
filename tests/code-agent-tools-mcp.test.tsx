import assert from 'node:assert/strict';
import { createServer, request as httpRequest, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import test from 'node:test';

import { createDefaultCoreState } from '../src/core/model/index.ts';
import { upsertCoreConversation } from '../src/core/model/structuralRecords.ts';
import { MemoryCoreStore } from '../src/core/store.ts';
import { McpSessionGrantStore } from '../src/platform/mcp/sessionGrants.ts';
import {
  CODE_AGENT_TOOLS_MCP_PATH,
  type CodeAgentToolGrantBinding,
} from '../src/products/code/agentTools/contracts.ts';
import { createCodeAgentToolsService } from '../src/products/code/agentTools/service.ts';
import type { ArtifactCanvasNavigateIntent } from '../src/products/shared/artifactCanvas/contracts.ts';
import { ArtifactCanvasRenderIntentHub } from '../src/products/shared/artifactCanvas/renderIntent.ts';

const BINDING: CodeAgentToolGrantBinding = {
  channelId: 'channel-1',
  conversationId: 'conversation-channel-channel-1',
  workspacePath: '/workspace/calculator',
  actorId: 'cat-1',
};

interface Harness {
  url: string;
  grants: McpSessionGrantStore<CodeAgentToolGrantBinding>;
  store: MemoryCoreStore;
  hub: ArtifactCanvasRenderIntentHub;
  close(): Promise<void>;
}

async function startHarness(): Promise<Harness> {
  const core = upsertCoreConversation(createDefaultCoreState(), {
    id: BINDING.conversationId,
    title: 'Calculator',
    kind: 'code_thread',
    status: 'active',
  }).core;
  const store = new MemoryCoreStore(core);
  const grants = new McpSessionGrantStore<CodeAgentToolGrantBinding>();
  const hub = new ArtifactCanvasRenderIntentHub();
  const service = createCodeAgentToolsService({ coreStore: store, grants, renderIntentHub: hub });
  const server: Server = createServer((request, response) => {
    void service.route(request, response).then((handled) => {
      if (!handled) response.writeHead(404).end();
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}${CODE_AGENT_TOOLS_MCP_PATH}`,
    grants,
    store,
    hub,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

function send(
  url: string,
  options: { method?: string; headers?: Record<string, string>; body?: string },
): Promise<{ status: number; headers: Record<string, unknown>; body: string }> {
  const target = new URL(url);
  return new Promise((resolve, reject) => {
    const req = httpRequest({
      hostname: target.hostname,
      port: target.port,
      path: target.pathname,
      method: options.method ?? 'POST',
      headers: { 'content-type': 'application/json', ...options.headers },
    }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body }));
    });
    req.on('error', reject);
    req.end(options.body);
  });
}

async function rpc(harness: Harness, token: string, method: string, params?: unknown, id: number | null = 1) {
  const response = await send(harness.url, {
    headers: { authorization: `Bearer ${token}` },
    body: JSON.stringify({ jsonrpc: '2.0', ...(id === null ? {} : { id }), method, ...(params ? { params } : {}) }),
  });
  return { status: response.status, json: response.body ? JSON.parse(response.body) : null };
}

test('the endpoint enforces transport guards before any tool runs', async () => {
  const harness = await startHarness();
  try {
    const { token } = harness.grants.issue(BINDING);
    const auth = { authorization: `Bearer ${token}` };
    const initialize = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} });
    assert.equal((await send(harness.url, { method: 'GET', headers: auth })).status, 405);
    assert.equal((await send(harness.url, { headers: { ...auth, origin: 'http://127.0.0.1:47100' }, body: initialize })).status, 403);
    assert.equal((await send(harness.url, { body: initialize })).status, 401);
    assert.equal((await send(harness.url, { headers: { authorization: 'Bearer wrong' }, body: initialize })).status, 401);
    assert.equal((await send(harness.url, { headers: { ...auth, 'mcp-protocol-version': '2099-01-01' }, body: initialize })).status, 400);
    assert.equal((await send(harness.url, { headers: auth, body: 'x'.repeat(1024 * 1024 + 1) })).status, 413);
    const parse = await send(harness.url, { headers: auth, body: '{' });
    assert.equal(JSON.parse(parse.body).error.code, -32700);
  } finally {
    await harness.close();
  }
});

test('initialize, tools/list and protocol methods follow JSON-RPC and MCP', async () => {
  const harness = await startHarness();
  try {
    const { token } = harness.grants.issue(BINDING);
    const init = await rpc(harness, token, 'initialize', { protocolVersion: '2025-03-26' });
    assert.equal(init.json.result.protocolVersion, '2025-03-26');
    assert.equal(init.json.result.serverInfo.name, 'cats');
    const newer = await rpc(harness, token, 'initialize', { protocolVersion: '2099-01-01' });
    assert.equal(newer.json.result.protocolVersion, '2025-06-18');
    assert.equal((await rpc(harness, token, 'notifications/initialized', undefined, null)).status, 202);
    assert.deepEqual((await rpc(harness, token, 'ping')).json.result, {});
    assert.equal((await rpc(harness, token, 'server/discover')).json.error.code, -32601);
    const list = await rpc(harness, token, 'tools/list');
    assert.deepEqual(list.json.result.tools.map((tool: { name: string }) => tool.name), ['declare_artifact', 'clear_canvas']);
    assert.equal((await rpc(harness, token, 'tools/call', { name: 'nope', arguments: {} })).status, 401);
  } finally {
    await harness.close();
  }
});

test('tool calls need a bound grant and act only on its conversation', async () => {
  const harness = await startHarness();
  try {
    const { token } = harness.grants.issue(BINDING);
    const declare = {
      name: 'declare_artifact',
      arguments: {
        declarationId: 'calculator-report',
        label: 'report',
        title: 'Calculator notes',
        location: { kind: 'inline_summary', value: 'Adds, subtracts, multiplies and divides.' },
      },
    };
    assert.equal((await rpc(harness, token, 'tools/call', declare)).status, 401, 'issued grants cannot act yet');

    harness.grants.bind(token, 'runtime-session-1');
    const declared = await rpc(harness, token, 'tools/call', declare);
    assert.equal(declared.json.result.isError, undefined);
    const artifactId = declared.json.result.structuredContent.artifactId as string;
    const artifact = (await harness.store.readCore()).artifacts.find((entry) => entry.id === artifactId);
    assert.equal(artifact?.conversationId, BINDING.conversationId);

    const invalid = await rpc(harness, token, 'tools/call', { name: 'declare_artifact', arguments: { label: 'report' } });
    assert.equal(invalid.json.result.isError, true);
    assert.ok(invalid.json.result.structuredContent.error.code);

    const intents: ArtifactCanvasNavigateIntent[] = [];
    harness.hub.subscribe({
      surface: { kind: 'code_conversation', surfaceId: BINDING.channelId },
      sessionId: 'browser-1',
      send: (intent) => intents.push(intent),
    });
    const cleared = await rpc(harness, token, 'tools/call', { name: 'clear_canvas', arguments: {} });
    assert.deepEqual(cleared.json.result.structuredContent, { cleared: true, canvasPath: '/code/chats/channel-1' });
    assert.equal(intents.length, 1);
    assert.equal(intents[0]?.artifactId, null);
    const activity = (await harness.store.readCore()).activities.find((entry) => entry.kind === 'artifact_canvas_clear_intent');
    assert.equal(activity?.conversationId, BINDING.conversationId);

    harness.grants.revoke(token);
    assert.equal((await rpc(harness, token, 'tools/list')).status, 401);
  } finally {
    await harness.close();
  }
});
