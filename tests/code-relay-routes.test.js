import assert from 'node:assert/strict';
import { once } from 'node:events';
import test from 'node:test';

import { createServer } from '../dist-server/server.js';
import { MemoryChatStore } from '../dist-server/chat/store.js';

const baseConfig = {
  host: '127.0.0.1',
  port: 8181,
  runtimeBaseUrl: 'http://127.0.0.1:3110',
  runtimeApiKey: '',
  chatStatePath: 'unused-for-tests',
};

function createRuntimeStub() {
  return {
    async getHealth() {
      return {
        baseUrl: 'http://127.0.0.1:3110',
        reachable: true,
        status: 'ok',
        service: 'cats-runtime',
      };
    },
    async getProviderConfig() {
      return {};
    },
    async getProviderModels(provider) {
      return {
        provider,
        backend: 'cli',
        instance: 'native',
        defaultModel: `${provider}-default`,
        source: 'config',
        cache: null,
        models: [{ id: `${provider}-default`, label: `${provider} default`, default: true }],
        warnings: [],
      };
    },
  };
}

function createRelayRuntimeStub() {
  return {
    describeContract() {
      return {
        version: 'phase0-local-cli-v1',
        transport: 'local_cli_subprocess',
        supportedProviders: ['codex', 'claude', 'gemini'],
        notes: ['stubbed for tests'],
      };
    },
    async probeRosterEntries(entries) {
      return entries.map((entry) => ({
        ...entry,
        availability: 'available',
        availabilitySummary: `${entry.label} ready`,
      }));
    },
    async dispatch(request) {
      return {
        entryId: request.entry.id,
        content: `[${request.entry.provider}] ${request.prompt}`,
        stdoutExcerpt: `stdout:${request.entry.provider}`,
        stderrExcerpt: null,
      };
    },
  };
}

async function withServer(callback) {
  const server = createServer({
    shared: {
      config: baseConfig,
      runtimeClient: createRuntimeStub(),
      now: () => new Date('2026-03-30T12:00:00.000Z'),
    },
    chat: {
      chatStore: new MemoryChatStore(),
    },
    code: {
      relayRuntime: createRelayRuntimeStub(),
    },
  });

  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Failed to resolve server address');
  }

  try {
    await callback(`http://127.0.0.1:${address.port}`);
  } finally {
    server.close();
    await once(server, 'close');
  }
}

test('Code relay routes create threads, update roster, and fan out prompts', async () => {
  await withServer(async (baseUrl) => {
    const initialResponse = await fetch(`${baseUrl}/api/code/relay/threads`);
    assert.equal(initialResponse.status, 200);
    const initialPayload = await initialResponse.json();
    assert.equal(initialPayload.defaults.roster.length, 3);
    assert.equal(initialPayload.threads.length, 0);

    const createResponse = await fetch(`${baseUrl}/api/code/relay/threads`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: 'Relay MVP',
        objective: 'Compare implementation arguments',
        repoPath: 'C:/repo/cats-platform',
      }),
    });
    assert.equal(createResponse.status, 201);
    const createPayload = await createResponse.json();
    assert.equal(createPayload.threads.length, 1);
    const thread = createPayload.threads[0];
    assert.equal(thread.thread.title, 'Relay MVP');
    assert.equal(thread.roster[0].availability, 'available');

    const patchResponse = await fetch(
      `${baseUrl}/api/code/relay/threads/${thread.thread.id}/roster/${thread.roster[0].id}`,
      {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          quotaNote: 'Still has room today',
        }),
      },
    );
    assert.equal(patchResponse.status, 200);
    const patchPayload = await patchResponse.json();
    const patchedThread = patchPayload.threads[0];
    assert.equal(patchedThread.roster[0].quotaNote, 'Still has room today');

    const fanOutResponse = await fetch(
      `${baseUrl}/api/code/relay/threads/${thread.thread.id}/fan-out`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          mode: 'discover',
          objective: 'Challenge the first implementation direction',
          prompt: 'Which path is lower risk for an MVP?',
          agentIds: patchedThread.roster.slice(0, 2).map((entry) => entry.id),
        }),
      },
    );
    assert.equal(fanOutResponse.status, 200);
    const fanOutPayload = await fanOutResponse.json();
    const round = fanOutPayload.threads[0].rounds[0];
    assert.equal(round.objective, 'Challenge the first implementation direction');
    assert.equal(round.dispatches.length, 2);
    assert.equal(round.dispatches[0].status, 'completed');
    assert.match(round.messages[0].content, /\[(codex|claude)\]/u);
    assert.equal(fanOutPayload.threads[0].thread.status, 'waiting_for_user');
  });
});
