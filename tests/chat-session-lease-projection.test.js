import assert from 'node:assert/strict';
import path from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';

import {
  assignCatToChannel,
  createCat,
  createChannel,
  setChannelCatExecutionTarget,
} from '../build/server/products/chat/state/model/index.js';
import { routeChannelMessage } from '../build/server/products/chat/state/runtimeActions.js';
import { MemoryChatStore } from '../build/server/products/chat/state/store.js';

function createRuntimeStub(outcomes) {
  let nextSession = 1;
  return {
    createdSessions: [],
    async getHealth() {
      return { baseUrl: 'http://127.0.0.1:3110', reachable: true, status: 'ok', service: 'cats-runtime' };
    },
    async getProviderConfig() {
      return {};
    },
    async getProviderModels(provider) {
      return {
        provider, backend: 'cli', instance: 'default', defaultModel: null, source: 'config',
        cache: null, models: [], warnings: [],
      };
    },
    async createSession(input) {
      const id = `session-${nextSession++}`;
      this.createdSessions.push({ id, model: input.model ?? null });
      return {
        id,
        provider: input.provider,
        model: input.model ?? null,
        status: 'ready',
        cwd: path.join(tmpdir(), '.cats', 'runtime', 'sessions', id),
      };
    },
    async sendMessage(sessionId, content, input) {
      const outcome = outcomes.shift();
      if (outcome instanceof Error) throw outcome;
      return {
        segments: [{ kind: 'text', text: outcome, toolName: null, toolId: null }],
        inputTokens: 1,
        outputTokens: 1,
        tokensUsed: 2,
      };
    },
    async closeSession() {},
    async observeSession(sessionId) {
      return {
        session: { id: sessionId, inspection: { state: 'idle' } },
        observePath: `/sessions/${sessionId}/observe`,
        stream: { path: `/sessions/${sessionId}/stream`, available: false },
      };
    },
    async streamSession() {},
  };
}

test('each room session keeps the model and error it ran with after later turns', async () => {
  // Reproduces a room where the first and third turns failed on one model and the second, on
  // another model, succeeded. The participant's lease only describes its latest session, and
  // copying it onto every session showed the second as failed on the first model.
  const now = new Date('2026-09-27T21:51:00.000Z');
  let state = await new MemoryChatStore().read();
  state = createCat(state, { name: 'Agent-1', provider: 'opencode', roles: ['helper'] }, now);
  const catId = state.cats[0].id;
  state = createChannel(state, {
    originSurface: 'chat',
    title: 'Lease projection',
    topic: 'Keep per-session lease history.',
    skipBossCatGreeting: true,
  }, now);
  const channelId = state.selectedChannelId;
  state = assignCatToChannel(state, channelId, { catId, provider: 'opencode', roles: ['helper'] }, now);

  const notFound = new Error('Model not found: example/withdrawn.');
  const runtimeClient = createRuntimeStub([notFound, 'Good morning!', notFound]);
  const store = new MemoryChatStore(state);
  const turns = [
    { model: 'example/withdrawn', at: '2026-09-27T21:51:25.000Z' },
    { model: 'example/working', at: '2026-09-27T21:52:04.000Z' },
    { model: 'example/withdrawn', at: '2026-09-27T21:52:24.000Z' },
  ];
  for (const turn of turns) {
    state = setChannelCatExecutionTarget(state, channelId, catId, { model: turn.model }, new Date(turn.at));
    const dispatched = await routeChannelMessage(
      state,
      channelId,
      { body: '@Agent-1 good morning' },
      runtimeClient,
      new Date(turn.at),
      { chatStore: store },
    );
    state = await store.write(dispatched.state);
  }

  assert.deepEqual(runtimeClient.createdSessions.map(({ model }) => model), turns.map(({ model }) => model));
  const core = await store.readCore();
  const sessions = runtimeClient.createdSessions.map(({ id }) => {
    const record = core.sessions.find((candidate) => candidate.id === id);
    assert.ok(record, `missing core session ${id}`);
    return record;
  });

  assert.deepEqual(sessions.map((session) => session.metadata.leaseModel), turns.map(({ model }) => model));
  assert.deepEqual(sessions.map((session) => session.status), ['failed', 'completed', 'failed']);
  assert.match(sessions[0].metadata.leaseLastError ?? '', /Model not found/);
  assert.equal(sessions[1].metadata.leaseLastError, null);
  assert.match(sessions[2].metadata.leaseLastError ?? '', /Model not found/);
  assert.deepEqual(
    sessions.map((session) => path.basename(session.metadata.leaseCwd ?? '')),
    runtimeClient.createdSessions.map(({ id }) => id),
  );
});
