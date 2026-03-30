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
  const providerConfig = {
    claude: {
      defaultInstance: 'native',
      defaultBackend: 'cli',
      instances: [{ id: 'native', target: 'cli/native', backend: 'cli' }],
    },
    codex: {
      defaultInstance: 'native',
      defaultBackend: 'cli',
      instances: [{ id: 'native', target: 'cli/native', backend: 'cli' }],
    },
    gemini: {
      defaultInstance: 'native',
      defaultBackend: 'cli',
      instances: [{ id: 'native', target: 'cli/native', backend: 'cli' }],
    },
  };

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
      return providerConfig;
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
    async createSession(input) {
      return {
        id: `session-${input.provider}-${input.instance ?? 'default'}`,
        provider: input.provider,
        model: input.model ?? `${input.provider}-default`,
        status: 'ready',
        cwd: input.cwd ?? null,
      };
    },
    async sendMessage(sessionId, prompt) {
      const provider = sessionId.replace(/^session-([^-.]+).*/u, '$1');
      await new Promise((resolve) => setTimeout(resolve, 30));
      return {
        content: `[${provider}] ${prompt}`,
        inputTokens: 1,
        outputTokens: 1,
        tokensUsed: 2,
      };
    },
    async closeSession() {},
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

    const providerPatchResponse = await fetch(
      `${baseUrl}/api/code/relay/threads/${thread.thread.id}/roster/${thread.roster[0].id}`,
      {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          provider: 'cursor',
          instance: 'native',
          model: 'gpt-5.4',
          modelSelection: {
            entryId: 'gpt-5.4',
            entryMode: 'explicit',
          },
        }),
      },
    );
    assert.equal(providerPatchResponse.status, 200);
    const providerPatchPayload = await providerPatchResponse.json();
    assert.equal(providerPatchPayload.threads[0].roster[0].provider, 'cursor');
    assert.equal(providerPatchPayload.threads[0].roster[0].availability, 'unavailable');
    assert.match(
      providerPatchPayload.threads[0].roster[0].availabilitySummary,
      /Runtime does not report/u,
    );

    const fanOutResponse = await fetch(
      `${baseUrl}/api/code/relay/threads/${thread.thread.id}/fan-out`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          mode: 'discover',
          objective: 'Challenge the first implementation direction',
          prompt: 'Which path is lower risk for an MVP?',
          agentIds: providerPatchPayload.threads[0].roster.slice(1, 3).map((entry) => entry.id),
        }),
      },
    );
    assert.equal(fanOutResponse.status, 202);
    const fanOutPayload = await fanOutResponse.json();
    const round = fanOutPayload.threads[0].rounds[0];
    assert.equal(round.objective, 'Challenge the first implementation direction');
    assert.equal(round.dispatches.length, 2);
    assert.equal(round.dispatches[0].status, 'running');
    assert.equal(fanOutPayload.threads[0].thread.status, 'waiting_for_agents');

    let settledPayload = fanOutPayload;
    for (let attempt = 0; attempt < 10; attempt += 1) {
      if (settledPayload.threads[0].thread.status === 'waiting_for_user') {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 40));
      const refreshResponse = await fetch(`${baseUrl}/api/code/relay/threads`);
      assert.equal(refreshResponse.status, 200);
      settledPayload = await refreshResponse.json();
    }

    const settledRound = settledPayload.threads[0].rounds[0];
    assert.equal(settledPayload.threads[0].thread.status, 'waiting_for_user');
    assert.equal(settledRound.dispatches[0].status, 'completed');
    assert.equal(settledRound.messages[0].kind, 'prompt');
    assert.match(settledRound.messages[1].content, /\[(codex|gemini)\]/u);
  });
});
