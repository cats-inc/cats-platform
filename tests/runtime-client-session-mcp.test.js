import assert from 'node:assert/strict';
import test from 'node:test';

import { CatsRuntimeClient } from '../build/server/runtime/client.js';

const token = 'synthetic-session-mcp-secret';
const mcpServers = [{
  name: 'cats',
  transport: 'http',
  url: 'http://127.0.0.1:8181/api/code/agent-tools/mcp',
  auth: { kind: 'bearer_env', token },
}];
const report = { status: 'delivered', servers: [{ name: 'cats', connection: 'unknown' }] };

async function withFetch(handler, run) {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (input, init = {}) => {
    calls.push({ url: String(input), init });
    return handler(String(input), init);
  };
  try {
    await run(calls);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

function json(body) {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
}

function ndjson(events) {
  return new Response(events.map((event) => JSON.stringify(event)).join('\n'), {
    status: 200,
    headers: { 'content-type': 'application/x-ndjson' },
  });
}

test('createSession sends session MCP servers and keeps the delivery report', async () => {
  await withFetch(() => json({ id: 'session-1', providerName: 'claude', status: 'ready', mcpServers: report }), async (calls) => {
    const client = new CatsRuntimeClient('http://runtime.test');
    const session = await client.createSession({ provider: 'claude', mcpServers });
    assert.deepEqual(JSON.parse(calls[0].init.body).mcpServers, mcpServers);
    assert.deepEqual(session.mcpServers, report);
  });
});

test('createSession omits the report when Runtime returns none or an invalid one', async () => {
  for (const body of [{ id: 's' }, { id: 's', mcpServers: { status: 'weird', servers: [] } }]) {
    await withFetch(() => json(body), async (calls) => {
      const client = new CatsRuntimeClient('http://runtime.test');
      const session = await client.createSession({ provider: 'claude' });
      assert.equal('mcpServers' in JSON.parse(calls[0].init.body), false);
      assert.equal(session.mcpServers, undefined);
    });
  }
});

test('sendMessage sends servers and reads only the Runtime-sourced delivery event', async () => {
  await withFetch(() => ndjson([
    { type: 'progress', text: 'Session MCP servers: delivered', metadata: { kind: 'mcp_servers', source: 'runtime', mcpServers: report } },
    { type: 'progress', text: 'MCP server cats: ready', mcpServers: [{ name: 'cats', status: 'ready' }], metadata: { kind: 'mcp_servers', source: 'provider' } },
    { type: 'text', text: 'Done.' },
    { type: 'result' },
  ]), async (calls) => {
    const client = new CatsRuntimeClient('http://runtime.test');
    const result = await client.sendMessage('session-1', 'hello', { mcpServers: [] });
    assert.deepEqual(JSON.parse(calls[0].init.body).mcpServers, []);
    assert.deepEqual(result.mcpServers, report);
    assert.deepEqual(result.segments, [{ kind: 'text', text: 'Done.', toolName: null, toolId: null }]);
  });
});

test('sendMessage leaves the report absent when the stream has none', async () => {
  await withFetch(() => ndjson([{ type: 'text', text: 'Hi.' }, { type: 'result' }]), async () => {
    const client = new CatsRuntimeClient('http://runtime.test');
    const result = await client.sendMessage('session-1', 'hello');
    assert.equal(result.mcpServers, undefined);
  });
});

test('resumeSession sends a JSON body only when servers are supplied', async () => {
  await withFetch(() => json({ id: 'session-1', status: 'initializing', mcpServers: report }), async (calls) => {
    const client = new CatsRuntimeClient('http://runtime.test');
    const resumed = await client.resumeSession('session-1', { mcpServers });
    assert.equal(calls[0].url, 'http://runtime.test/sessions/session-1/resume');
    assert.equal(calls[0].init.headers['content-type'], 'application/json');
    assert.deepEqual(JSON.parse(calls[0].init.body), { mcpServers });
    assert.deepEqual(resumed.mcpServers, report);

    await client.resumeSession('session-1');
    assert.equal(calls[1].init.body, undefined);
    assert.equal(calls[1].init.headers['content-type'], undefined);
  });
});
