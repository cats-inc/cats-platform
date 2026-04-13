import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createServer } from '../build/server/app/server/index.js';
import { UUID_PATTERN } from '../build/server/products/chat/shared/channelPaths.js';
import { createSharedCoreFixtureBundle } from '../build/server/shared/coreFixtures.js';
import { notifyStreamTargetChanged } from '../build/server/products/chat/api/resources/streamTargetSignal.js';
import {
  appendMessage,
  assignCatToChannel,
  createCat,
  createChannel,
  requireChannel,
  setChannelCatLease,
  setChannelOrchestratorLease,
} from '../build/server/products/chat/state/model/index.js';
import { beginChannelMessageDispatch } from '../build/server/products/chat/state/runtimeActions.js';
import {
  createCatsMemoryService,
  MemoryCanonicalMemoryStore,
} from '../build/server/platform/memory/index.js';
import {
  buildOrchestratorDispatchReplayRequest,
  writeOrchestratorDispatchReplayMetadata,
} from '../build/server/platform/orchestration/dispatchReplay.js';
import {
  buildPendingOrchestratorDispatchRequest,
  writePendingOrchestratorDispatchMetadata,
} from '../build/server/platform/orchestration/pendingDispatch.js';
import {
  buildWorkflowContinuationReplayRequest,
  writeWorkflowContinuationReplayMetadata,
} from '../build/server/platform/orchestration/workflowContinuationReplay.js';
import { writeTaskPlanningMetadata } from '../build/server/shared/taskPlanning.js';
import { createChatMemorySurface } from '../build/server/products/chat/state/memoryAdapter.js';
import { MemoryChatStore } from '../build/server/products/chat/state/store.js';
import { waitForCondition } from './testUtils.js';

const baseConfig = {
  host: '127.0.0.1',
  port: 8181,
  runtimeBaseUrl: 'http://127.0.0.1:3110',
  runtimeApiKey: '',
  chatStatePath: 'unused-for-tests',
};

function createRuntimeStub() {
  let nextSession = 1;
  let nextWakeup = 1;
  return {
    createdSessions: [],
    sentMessages: [],
    closedSessions: [],
    wakeups: [],
    streamedSessions: [],
    observedSessionPayloads: new Map(),
    setObservedSession(sessionId, payload) {
      this.observedSessionPayloads.set(sessionId, payload);
    },
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
    async getProviderDiagnostics() {
      return {
        probe: 'light',
        providers: [],
      };
    },
    async getProviderModels(provider) {
      return {
        provider,
        backend: 'cli',
        instance: 'default',
        defaultModel: `${provider}-default`,
        source: 'config',
        cache: null,
        models: [
          { id: `${provider}-default`, label: `${provider} default`, default: true },
        ],
        warnings: [],
      };
    },
    async getAdvancedProviderModels(provider) {
      return {
        provider,
        backend: 'cli',
        instance: 'default',
        defaultModel: `${provider}-default`,
        source: 'config',
        cache: null,
        entries: [
          { id: `${provider}-default`, label: `${provider} default`, default: true },
        ],
        presets: [
          {
            id: 'balanced',
            label: 'Balanced',
            availability: 'supported',
            applicableEntryIds: [`${provider}-default`],
            preferredEntryId: `${provider}-default`,
            controlDefaults: {
              'openai.reasoning_effort': 'medium',
            },
          },
        ],
        controls: [
          {
            key: 'openai.reasoning_effort',
            label: 'Reasoning effort',
            kind: 'enum',
            scope: 'session_default',
            values: [
              { value: 'low', label: 'low' },
              { value: 'medium', label: 'medium' },
              { value: 'high', label: 'high' },
            ],
          },
        ],
        defaultSelection: {
          entryMode: 'auto',
          entryId: `${provider}-default`,
          presetId: 'balanced',
          controls: {
            'openai.reasoning_effort': 'medium',
          },
        },
        support: {
          tier: 'entry_only',
        },
        warnings: [],
      };
    },
    async createSession(input) {
      const sessionId = `session-${nextSession++}`;
      const session = {
        id: sessionId,
        provider: input.provider,
        model: input.model ?? null,
        status: 'ready',
        cwd: input.cwd ?? path.join(os.tmpdir(), '.cats', 'runtime', 'sessions', sessionId),
      };
      this.createdSessions.push({ ...input, id: session.id });
      return session;
    },
    async sendMessage(sessionId, content) {
      this.sentMessages.push({ sessionId, content });
      const text = content.includes('Agent-1')
        ? 'Agent-1 handled the routed turn.'
        : 'Orchestrator acknowledged the chat request.';
      return {
        segments: [{ kind: 'text', text, toolName: null, toolId: null }],
        inputTokens: 11,
        outputTokens: 7,
        tokensUsed: 18,
      };
    },
    async closeSession(sessionId) {
      this.closedSessions.push(sessionId);
    },
    async deleteSession(sessionId) {
      this.deletedSessions = this.deletedSessions || [];
      this.deletedSessions.push(sessionId);
      return { action: 'delete', sessionId, status: 'deleted' };
    },
    async createWakeup(input) {
      const request = {
        id: `wakeup-${nextWakeup++}`,
        scheduleAt: input.scheduleAt ?? null,
        target: input.target,
        metadata: input.metadata ?? {},
      };
      this.wakeups.push({
        ...input,
        request,
      });
      return {
        request,
        coalesced: false,
      };
    },
    async observeSession(sessionId) {
      return this.observedSessionPayloads.get(sessionId) ?? {
        session: {
          id: sessionId,
          inspection: {
            state: 'idle',
          },
        },
        observePath: `/sessions/${sessionId}/observe`,
        stream: {
          path: `/sessions/${sessionId}/stream`,
          available: false,
        },
      };
    },
    async streamSession(sessionId, onEvent) {
      this.streamedSessions.push(sessionId);
      const payload = this.observedSessionPayloads.get(sessionId);
      const events = Array.isArray(payload?.stream?.events) ? payload.stream.events : [];
      for (const event of events) {
        await onEvent(event);
      }
    },
  };
}

async function withServer(
  runtimeClient,
  callback,
  chatStore = new MemoryChatStore(),
  overrides = {},
) {
  const tempStateDir = await mkdtemp(path.join(os.tmpdir(), 'cats-server-state-'));
  const runtimeDataDir = path.join(tempStateDir, 'runtime-data');
  const {
    startup,
    coreStore,
    resumePendingOrchestratorDispatch,
    work,
    code,
    ...chatOverrides
  } = overrides;
  const server = createServer({
    shared: {
      config: {
        ...baseConfig,
        chatStatePath: path.join(tempStateDir, 'platform', 'state', 'chat-state.local.json'),
        runtimeDataDir,
      },
      runtimeClient,
      now: () => new Date('2026-03-11T00:00:00.000Z'),
      startup,
      coreStore,
      resumePendingOrchestratorDispatch,
    },
    chat: {
      chatStore,
      ...chatOverrides,
    },
    work,
    code,
  });

  server.listen(0, '127.0.0.1');
  await once(server, 'listening');

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Failed to resolve test server address');
  }

  try {
    await callback(`http://127.0.0.1:${address.port}`, { tempStateDir, runtimeDataDir });
  } finally {
    server.close();
    await once(server, 'close');
    await rm(tempStateDir, { recursive: true, force: true });
  }
}

function createSseCapture(response) {
  assert.ok(response.body, 'Expected an SSE response body');
  return {
    reader: response.body.getReader(),
    decoder: new TextDecoder(),
    text: '',
  };
}

async function readSseUntil(stream, predicate, timeoutMs = 1_000) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const remainingMs = Math.max(1, deadline - Date.now());
    let timeoutId;
    const result = await Promise.race([
      stream.reader.read(),
      new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error('Timed out while waiting for an SSE frame.'));
        }, remainingMs);
      }),
    ]).finally(() => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    });

    if (result.done) {
      break;
    }

    stream.text += stream.decoder.decode(result.value, { stream: true });
    if (predicate(stream.text)) {
      return stream.text;
    }
  }

  throw new Error(`Timed out waiting for the expected SSE frame.\n${stream.text}`);
}

test('GET /api/channels/:id/stream relays runtime session events through the runtime client', async () => {
  const chatStore = new MemoryChatStore();
  const runtime = createRuntimeStub();
  const seededAt = new Date('2026-03-11T00:00:00.000Z');

  let state = await chatStore.read();
  state = createCat(
    state,
    {
      name: 'Companion Cat',
      provider: 'claude',
      roles: ['companion'],
    },
    seededAt,
  );
  const catId = state.cats[0].id;
  state = createChannel(
    state,
    {
      title: 'Live lane',
      topic: 'Validate runtime streaming.',
    },
    seededAt,
  );
  const channelId = state.channels[0].id;
  state = assignCatToChannel(state, channelId, { catId }, seededAt);
  state = setChannelCatLease(
    state,
    channelId,
    catId,
    {
      sessionId: 'session-live-1',
      status: 'ready',
      cwd: 'C:/repo/cats-platform',
      lastError: null,
      provider: 'claude',
      model: 'claude-sonnet-4',
      startedAt: seededAt.toISOString(),
      lastUsedAt: seededAt.toISOString(),
    },
    seededAt,
  );
  await chatStore.write(state);

  runtime.setObservedSession('session-live-1', {
    session: {
      id: 'session-live-1',
    },
    observePath: '/sessions/session-live-1/observe',
    stream: {
      path: '/sessions/session-live-1/stream',
      available: true,
      events: [
        {
          event: 'progress',
          data: {
            type: 'progress',
            text: 'Planning the next step',
            metadata: {
              kind: 'planning',
            },
          },
        },
        {
          event: 'result',
          data: {
            type: 'result',
          },
        },
      ],
    },
  });

  await withServer(runtime, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/channels/${channelId}/stream`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'text/event-stream');

    const body = await response.text();
    assert.match(body, /event: progress/u);
    assert.match(body, /"text":"Planning the next step"/u);
    assert.match(body, /"kind":"planning"/u);
    assert.match(body, /event: result/u);
    assert.deepEqual(runtime.streamedSessions, ['session-live-1']);
  }, chatStore);
});

test('GET /api/channels/:id/stream waits for a pending session lease before closing the stream', async () => {
  const chatStore = new MemoryChatStore();
  const runtime = createRuntimeStub();
  const seededAt = new Date('2026-03-11T00:00:00.000Z');

  let state = await chatStore.read();
  state = createCat(
    state,
    {
      name: 'Companion Cat',
      provider: 'claude',
      roles: ['companion'],
    },
    seededAt,
  );
  const catId = state.cats[0].id;
  state = createChannel(
    state,
    {
      title: 'Cold start lane',
      topic: 'Wait for the runtime session lease.',
    },
    seededAt,
  );
  const channelId = state.channels[0].id;
  state = assignCatToChannel(state, channelId, { catId }, seededAt);
  await chatStore.write(state);

  runtime.setObservedSession('session-live-2', {
    session: {
      id: 'session-live-2',
    },
    observePath: '/sessions/session-live-2/observe',
    stream: {
      path: '/sessions/session-live-2/stream',
      available: true,
      events: [
        {
          event: 'progress',
          data: {
            type: 'progress',
            text: 'Session became ready',
          },
        },
      ],
    },
  });

  await withServer(runtime, async (baseUrl) => {
    const responsePromise = fetch(`${baseUrl}/api/channels/${channelId}/stream`);

    await new Promise((resolve) => setTimeout(resolve, 100));

    let nextState = await chatStore.read();
    nextState = setChannelCatLease(
      nextState,
      channelId,
      catId,
      {
        sessionId: 'session-live-2',
        status: 'ready',
        cwd: 'C:/repo/cats-platform',
        lastError: null,
        provider: 'claude',
        model: 'claude-sonnet-4',
        startedAt: seededAt.toISOString(),
        lastUsedAt: seededAt.toISOString(),
      },
      seededAt,
    );
    await chatStore.write(nextState);
    notifyStreamTargetChanged(channelId);

    const response = await responsePromise;
    assert.equal(response.status, 200);

    const body = await response.text();
    assert.match(body, /event: progress/u);
    assert.match(body, /"text":"Session became ready"/u);
    assert.doesNotMatch(body, /event: session_closed/u);
    assert.ok(runtime.streamedSessions.includes('session-live-2'));
  }, chatStore);
});

test('GET /api/channels/:id/stream wakes immediately when POST /api/channels/:id/activations creates the session', async () => {
  const chatStore = new MemoryChatStore();
  const runtime = createRuntimeStub();
  const seededAt = new Date('2026-03-11T00:00:00.000Z');

  let state = await chatStore.read();
  state = createCat(
    state,
    {
      name: 'Companion Cat',
      provider: 'claude',
      roles: ['companion'],
    },
    seededAt,
  );
  const catId = state.cats[0].id;
  state = createChannel(
    state,
    {
      title: 'Activation wake lane',
      topic: 'Wake the stream waiter from the activation route.',
      roomMode: 'direct_cat_chat',
      skipBossCatGreeting: true,
      defaultRecipientId: catId,
    },
    seededAt,
  );
  const channelId = state.channels[0].id;
  state = assignCatToChannel(state, channelId, { catId }, seededAt);
  await chatStore.write(state);

  runtime.setObservedSession('session-1', {
    session: {
      id: 'session-1',
    },
    observePath: '/sessions/session-1/observe',
    stream: {
      path: '/sessions/session-1/stream',
      available: true,
      events: [
        {
          event: 'progress',
          data: {
            type: 'progress',
            text: 'Activated session became ready',
          },
        },
      ],
    },
  });

  await withServer(runtime, async (baseUrl) => {
    const responsePromise = fetch(`${baseUrl}/api/channels/${channelId}/stream`);

    await new Promise((resolve) => setTimeout(resolve, 100));

    const activateResponse = await fetch(`${baseUrl}/api/channels/${channelId}/activations`, {
      method: 'POST',
    });
    assert.equal(activateResponse.status, 200);

    const response = await responsePromise;
    assert.equal(response.status, 200);
    const body = await response.text();
    assert.match(body, /event: progress/u);
    assert.match(body, /"text":"Activated session became ready"/u);
    assert.ok(runtime.streamedSessions.includes('session-1'));
  }, chatStore);
});

test('GET /api/channels/:id/stream publishes room updates once a pending session is attached', async () => {
  const chatStore = new MemoryChatStore();
  const runtime = createRuntimeStub();
  const seededAt = new Date('2026-03-11T00:00:00.000Z');

  let state = await chatStore.read();
  state = createCat(
    state,
    {
      name: 'Companion Cat',
      provider: 'claude',
      roles: ['companion'],
    },
    seededAt,
  );
  const catId = state.cats[0].id;
  state = createChannel(
    state,
    {
      title: 'Cold start lane',
      topic: 'Refresh the transcript once runtime session startup is persisted.',
    },
    seededAt,
  );
  const channelId = state.channels[0].id;
  state = assignCatToChannel(state, channelId, { catId }, seededAt);
  const participantId = requireChannel(state, channelId).catAssignments[0].participantId;
  await chatStore.write(state);

  runtime.setObservedSession('session-live-3', {
    session: {
      id: 'session-live-3',
    },
    observePath: '/sessions/session-live-3/observe',
    stream: {
      path: '/sessions/session-live-3/stream',
      available: true,
      events: [
        {
          event: 'progress',
          data: {
            type: 'progress',
            text: 'Session became ready',
            metadata: {
              kind: 'session',
            },
          },
        },
      ],
    },
  });

  await withServer(runtime, async (baseUrl) => {
    const chatEventsResponse = await fetch(`${baseUrl}/api/events/chat`);
    assert.equal(chatEventsResponse.status, 200);
    assert.equal(chatEventsResponse.headers.get('content-type'), 'text/event-stream');

    const chatEvents = createSseCapture(chatEventsResponse);
    await readSseUntil(chatEvents, (text) => /event: connected/u.test(text));

    try {
      const streamResponsePromise = fetch(`${baseUrl}/api/channels/${channelId}/stream`);

      await new Promise((resolve) => setTimeout(resolve, 100));

      let nextState = await chatStore.read();
      nextState = setChannelCatLease(
        nextState,
        channelId,
        catId,
        {
          sessionId: 'session-live-3',
          status: 'ready',
          cwd: 'C:/repo/cats-platform',
          lastError: null,
          provider: 'claude',
          model: 'claude-sonnet-4',
          startedAt: seededAt.toISOString(),
          lastUsedAt: seededAt.toISOString(),
        },
        seededAt,
      );
      nextState = appendMessage(
        nextState,
        channelId,
        {
          senderKind: 'system',
          senderName: 'Runtime',
          body: 'Companion Cat connected to cats-runtime session session-live-3.\n(cwd: C:/repo/cats-platform)',
        },
        new Date('2026-03-11T00:00:02.000Z'),
        {
          metadata: {
            event: 'session_started',
            targetKind: 'cat',
            targetId: participantId,
            sessionId: 'session-live-3',
            verbosity: 'verbose',
          },
          incrementUnread: false,
        },
      ).state;
      await chatStore.write(nextState);
      notifyStreamTargetChanged(channelId);

      const chatEventsBody = await readSseUntil(
        chatEvents,
        (text) =>
          /event: room_updated/u.test(text)
          && new RegExp(`"channelId":"${channelId}"`, 'u').test(text)
          && /"mutation":"updated"/u.test(text),
      );
      assert.match(chatEventsBody, /event: room_updated/u);
      assert.match(chatEventsBody, /"mutation":"updated"/u);

      const streamResponse = await streamResponsePromise;
      assert.equal(streamResponse.status, 200);
      const streamBody = await streamResponse.text();
      assert.match(streamBody, /event: progress/u);
      assert.match(streamBody, /"kind":"session"/u);
      assert.match(streamBody, /"sessionStartedAt":"2026-03-11T00:00:00.000Z"/u);
      assert.match(streamBody, /"requiresSessionStartConfirmation":false/u);
      assert.ok(runtime.streamedSessions.includes('session-live-3'));
    } finally {
      await chatEvents.reader.cancel();
    }
  }, chatStore);
});

test('GET /api/channels/:id/stream publishes another room update when a streamed session finishes', async () => {
  const chatStore = new MemoryChatStore();
  const runtime = createRuntimeStub();
  const seededAt = new Date('2026-03-11T00:00:00.000Z');

  let state = await chatStore.read();
  state = createCat(
    state,
    {
      name: 'Verifier Cat',
      provider: 'codex',
      roles: ['reviewer'],
    },
    seededAt,
  );
  const catId = state.cats[0].id;
  state = createChannel(
    state,
    {
      title: 'Sequential handoff lane',
      topic: 'Refresh persisted replies between sequential speakers.',
    },
    seededAt,
  );
  const channelId = state.channels[0].id;
  state = assignCatToChannel(state, channelId, { catId }, seededAt);
  const participantId = requireChannel(state, channelId).catAssignments[0].participantId;
  state = setChannelCatLease(
    state,
    channelId,
    catId,
    {
      sessionId: 'session-live-finish',
      status: 'ready',
      cwd: 'C:/repo/cats-platform',
      lastError: null,
      provider: 'codex',
      model: 'gpt-5.4',
      startedAt: seededAt.toISOString(),
      lastUsedAt: seededAt.toISOString(),
    },
    seededAt,
  );
  await chatStore.write(state);

  runtime.setObservedSession('session-live-finish', {
    session: {
      id: 'session-live-finish',
    },
    observePath: '/sessions/session-live-finish/observe',
    stream: {
      path: '/sessions/session-live-finish/stream',
      available: true,
      events: [
        {
          event: 'progress',
          data: {
            type: 'progress',
            text: 'Reviewing response',
          },
        },
      ],
    },
  });
  let releaseStreamCompletion;
  const streamCompletionGate = new Promise((resolve) => {
    releaseStreamCompletion = resolve;
  });
  const originalStreamSession = runtime.streamSession.bind(runtime);
  runtime.streamSession = async (sessionId, onEvent) => {
    await originalStreamSession(sessionId, onEvent);
    await streamCompletionGate;
  };

  await withServer(runtime, async (baseUrl) => {
    const chatEventsResponse = await fetch(`${baseUrl}/api/events/chat`);
    assert.equal(chatEventsResponse.status, 200);
    const chatEvents = createSseCapture(chatEventsResponse);
    await readSseUntil(chatEvents, (text) => /event: connected/u.test(text));

    try {
      const streamResponsePromise = fetch(`${baseUrl}/api/channels/${channelId}/stream`);

      await readSseUntil(
        chatEvents,
        (text) =>
          (text.match(/event: room_updated/gu) ?? []).length >= 1
          && new RegExp(`"channelId":"${channelId}"`, 'u').test(text),
      );

      let nextState = await chatStore.read();
      nextState = appendMessage(
        nextState,
        channelId,
        {
          senderKind: 'agent',
          senderName: 'Verifier Cat',
          body: 'Second speaker reply is now persisted.',
        },
        new Date('2026-03-11T00:00:02.000Z'),
        {
          metadata: {
            event: 'assistant_turn_segment',
            assistantTurnId: 'assistant-turn-live-finish',
            terminal: true,
            targetKind: 'cat',
            targetId: participantId,
            sessionId: 'session-live-finish',
          },
          incrementUnread: false,
        },
      ).state;
      await chatStore.write(nextState);
      notifyStreamTargetChanged(channelId);
      releaseStreamCompletion();

      const streamResponse = await streamResponsePromise;
      assert.equal(streamResponse.status, 200);
      await streamResponse.text();

      const completionEventsBody = await readSseUntil(
        chatEvents,
        (text) =>
          (text.match(/event: room_updated/gu) ?? []).length >= 2
          && new RegExp(`"channelId":"${channelId}"`, 'u').test(text),
      );
      assert.match(completionEventsBody, /event: room_updated/u);
      assert.ok(runtime.streamedSessions.includes('session-live-finish'));
    } finally {
      await chatEvents.reader.cancel();
    }
  }, chatStore);
});

test('POST /api/channels/:id/messages publishes room updates while background sequential dispatch persists intermediate speakers', async () => {
  const runtime = createRuntimeStub();

  await withServer(runtime, async (baseUrl) => {
    const createChannelResponse = await fetch(`${baseUrl}/api/channels`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: 'Sequential background refresh',
        topic: 'Broadcast intermediate sequential dispatch persistence.',
        entryKind: 'group',
        skipBossCatGreeting: true,
        temporaryParticipants: [
          {
            participantId: 'participant-claude',
            name: 'Claude-CLI',
            provider: 'claude',
            instance: 'native',
            model: 'claude-opus-4-6',
            roleHint: 'Lead',
          },
          {
            participantId: 'participant-codex',
            name: 'Codex-CLI',
            provider: 'codex',
            instance: 'native',
            model: 'gpt-5.4',
            roleHint: 'Reviewer',
          },
        ],
      }),
    });
    assert.equal(createChannelResponse.status, 201);
    const createChannelPayload = await createChannelResponse.json();
    const channelId = createChannelPayload.channel.id;

    const chatEventsResponse = await fetch(`${baseUrl}/api/events/chat`);
    assert.equal(chatEventsResponse.status, 200);
    const chatEvents = createSseCapture(chatEventsResponse);
    await readSseUntil(chatEvents, (text) => /event: connected/u.test(text));

    try {
      const sendResponse = await fetch(`${baseUrl}/api/channels/${channelId}/messages`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          body: 'Please answer in order with one short greeting each.',
          messageMetadata: {
            recipientParticipantIds: ['participant-claude', 'participant-codex'],
            workflowShape: 'sequential',
          },
        }),
      });
      assert.equal(sendResponse.status, 200);

      const roomUpdateEvents = await readSseUntil(
        chatEvents,
        (text) =>
          (text.match(/event: room_updated/gu) ?? []).length >= 2
          && new RegExp(`"channelId":"${channelId}"`, 'u').test(text),
        2_000,
      );
      assert.match(roomUpdateEvents, /event: room_updated/u);

      const messagesResponse = await fetch(`${baseUrl}/api/channels/${channelId}/messages`);
      assert.equal(messagesResponse.status, 200);
      const messagesPayload = await messagesResponse.json();
      const sessionStartedCount = messagesPayload.messages.filter((message) =>
        message.metadata?.event === 'session_started').length;
      assert.ok(
        sessionStartedCount >= 1,
        'expected intermediate runtime session metadata to persist before the turn fully settles',
      );
    } finally {
      await chatEvents.reader.cancel();
    }
  });
});

test('GET /api/channels/:id/stream hands off to the next sequential speaker after a result event even when the prior session stream stays open', async () => {
  const chatStore = new MemoryChatStore();
  const runtime = createRuntimeStub();
  const seededAt = new Date('2026-03-11T00:00:00.000Z');
  const firstReplyAt = new Date('2026-03-11T00:00:02.000Z');
  const secondStartAt = new Date('2026-03-11T00:00:03.000Z');
  const secondReplyAt = new Date('2026-03-11T00:00:04.000Z');

  let state = await chatStore.read();
  state = createCat(
    state,
    {
      name: 'First Cat',
      provider: 'claude',
      roles: ['researcher'],
    },
    seededAt,
  );
  const firstCatId = state.cats[0].id;
  state = createCat(
    state,
    {
      name: 'Second Cat',
      provider: 'codex',
      roles: ['reviewer'],
    },
    seededAt,
  );
  const secondCatId = state.cats[0].id;
  state = createChannel(
    state,
    {
      title: 'Sequential live handoff',
      topic: 'Move the live stream to the next room speaker.',
      skipBossCatGreeting: true,
    },
    seededAt,
  );
  const channelId = state.channels[0].id;
  state = assignCatToChannel(state, channelId, { catId: firstCatId }, seededAt);
  state = assignCatToChannel(state, channelId, { catId: secondCatId }, seededAt);
  const seededChannel = requireChannel(state, channelId);
  const firstParticipantId = seededChannel.catAssignments.find((assignment) => assignment.catId === firstCatId)?.participantId;
  const secondParticipantId = seededChannel.catAssignments.find((assignment) => assignment.catId === secondCatId)?.participantId;
  assert.ok(firstParticipantId);
  assert.ok(secondParticipantId);
  state = setChannelCatLease(
    state,
    channelId,
    firstCatId,
    {
      sessionId: 'session-live-sequential-1',
      status: 'ready',
      cwd: 'C:/repo/cats-platform',
      lastError: null,
      provider: 'claude',
      model: 'claude-sonnet-4',
      startedAt: seededAt.toISOString(),
      lastUsedAt: seededAt.toISOString(),
    },
    seededAt,
  );
  state = setChannelCatLease(
    state,
    channelId,
    secondCatId,
    {
      sessionId: 'session-live-sequential-2',
      status: 'ready',
      cwd: 'C:/repo/cats-platform',
      lastError: null,
      provider: 'codex',
      model: 'gpt-5.4',
      startedAt: secondStartAt.toISOString(),
      lastUsedAt: secondStartAt.toISOString(),
    },
    secondStartAt,
  );
  await chatStore.write(state);
  let releaseFirstResultSeen;
  const firstResultSeen = new Promise((resolve) => {
    releaseFirstResultSeen = resolve;
  });
  let releaseSecondResultSeen;
  const secondResultSeen = new Promise((resolve) => {
    releaseSecondResultSeen = resolve;
  });
  runtime.streamSession = async (sessionId, onEvent, options) => {
    runtime.streamedSessions.push(sessionId);
    if (sessionId === 'session-live-sequential-1') {
      await onEvent({
        event: 'progress',
        data: {
          type: 'progress',
          text: 'First speaker is thinking',
        },
      });
      await onEvent({
        event: 'result',
        data: {
          type: 'result',
        },
      });
      releaseFirstResultSeen();
      await new Promise((resolve) => {
        if (options?.signal?.aborted) {
          resolve();
          return;
        }
        options?.signal?.addEventListener('abort', resolve, { once: true });
      });
      return;
    }

    if (sessionId === 'session-live-sequential-2') {
      await onEvent({
        event: 'progress',
        data: {
          type: 'progress',
          text: 'Second speaker picked up the room',
        },
      });
      await onEvent({
        event: 'result',
        data: {
          type: 'result',
        },
      });
      releaseSecondResultSeen();
      return;
    }

    throw new Error(`Unexpected streamed session ${sessionId}`);
  };

  await withServer(runtime, async (baseUrl) => {
    const begun = await beginChannelMessageDispatch(
      await chatStore.read(),
      channelId,
      {
        body: 'Handle this in order.',
        messageMetadata: {
          recipientParticipantIds: [firstParticipantId, secondParticipantId],
          workflowShape: 'sequential',
        },
      },
      runtime,
      seededAt,
    );
    await chatStore.write(begun.state);

    const streamResponsePromise = fetch(`${baseUrl}/api/channels/${channelId}/stream`);

    await new Promise((resolve) => setTimeout(resolve, 100));

    let nextState = await chatStore.read();
    let nextChannel = requireChannel(nextState, channelId);
    let nextTurn = nextChannel.roomRouting.workflow.activeTurn;
    assert.ok(nextTurn);
    nextTurn.targetStatuses = [
      {
        id: 'target-state-sequential-1',
        dispatchId: 'dispatch-sequential-1',
        participant: {
          participantKind: 'cat',
          participantId: firstParticipantId,
          participantName: 'First Cat',
        },
        source: null,
        sourceMessageId: nextTurn.sourceMessageId,
        trigger: 'room_default',
        mentionNames: [],
        depth: 0,
        parentCheckpointId: nextTurn.lastCheckpointId,
        branchStrategy: 'fresh_no_parent',
        handoffReason: 'room_default',
        wakeRequestId: null,
        status: 'running',
        queuedAt: seededAt.toISOString(),
        startedAt: seededAt.toISOString(),
        completedAt: null,
        response: null,
        error: null,
      },
    ];
    nextTurn.updatedAt = seededAt.toISOString();
    await chatStore.write(nextState);
    notifyStreamTargetChanged(channelId);

    const streamResponse = await streamResponsePromise;
    assert.equal(streamResponse.status, 200);
    const streamBodyPromise = streamResponse.text();

    await firstResultSeen;

    nextState = await chatStore.read();
    nextChannel = requireChannel(nextState, channelId);
    nextTurn = nextChannel.roomRouting.workflow.activeTurn;
    assert.ok(nextTurn);
    nextTurn.targetStatuses = [
      {
        ...nextTurn.targetStatuses[0],
        status: 'completed',
        completedAt: firstReplyAt.toISOString(),
      },
      {
        id: 'target-state-sequential-2',
        dispatchId: 'dispatch-sequential-2',
        participant: {
          participantKind: 'cat',
          participantId: secondParticipantId,
          participantName: 'Second Cat',
        },
        source: null,
        sourceMessageId: nextTurn.sourceMessageId,
        trigger: 'room_default',
        mentionNames: [],
        depth: 0,
        parentCheckpointId: nextTurn.lastCheckpointId,
        branchStrategy: 'fresh_no_parent',
        handoffReason: 'room_default',
        wakeRequestId: null,
        status: 'running',
        queuedAt: secondStartAt.toISOString(),
        startedAt: secondStartAt.toISOString(),
        completedAt: null,
        response: null,
        error: null,
      },
    ];
    nextTurn.updatedAt = secondStartAt.toISOString();
    nextState = appendMessage(
      nextState,
      channelId,
      {
        senderKind: 'agent',
        senderName: 'First Cat',
        body: 'First speaker reply.',
      },
      firstReplyAt,
      {
        metadata: {
          event: 'assistant_turn_segment',
          assistantTurnId: 'assistant-turn-sequential-1',
          terminal: true,
          targetKind: 'cat',
          targetId: firstParticipantId,
          sessionId: 'session-live-sequential-1',
        },
        incrementUnread: false,
      },
    ).state;
    nextState = appendMessage(
      nextState,
      channelId,
      {
        senderKind: 'system',
        senderName: 'Runtime',
        body: 'Second Cat connected to cats-runtime session session-live-sequential-2.\n(cwd: C:/repo/cats-platform)',
      },
      secondStartAt,
      {
        metadata: {
          event: 'session_started',
          targetKind: 'cat',
          targetId: secondParticipantId,
          sessionId: 'session-live-sequential-2',
          verbosity: 'verbose',
        },
        incrementUnread: false,
      },
    ).state;
    await chatStore.write(nextState);
    notifyStreamTargetChanged(channelId);

    await secondResultSeen;

    let finalState = await chatStore.read();
    finalState = appendMessage(
      finalState,
      channelId,
      {
        senderKind: 'agent',
        senderName: 'Second Cat',
        body: 'Second speaker reply.',
      },
      secondReplyAt,
      {
        metadata: {
          event: 'assistant_turn_segment',
          assistantTurnId: 'assistant-turn-sequential-2',
          terminal: true,
          targetKind: 'cat',
          targetId: secondParticipantId,
          sessionId: 'session-live-sequential-2',
        },
        incrementUnread: false,
      },
    ).state;
    const finalChannel = requireChannel(finalState, channelId);
    finalChannel.roomRouting.workflow.activeTurn = null;
    await chatStore.write(finalState);
    notifyStreamTargetChanged(channelId);

    const streamBody = await streamBodyPromise;
    assert.match(streamBody, /"speakerLabel":"First Cat"/u);
    assert.match(streamBody, /"targetStateId":"target-state-sequential-1"/u);
    assert.match(streamBody, /"text":"First speaker is thinking"/u);
    assert.match(streamBody, /"speakerLabel":"Second Cat"/u);
    assert.match(streamBody, /"targetStateId":"target-state-sequential-2"/u);
    assert.match(streamBody, /"text":"Second speaker picked up the room"/u);
    assert.deepEqual(runtime.streamedSessions, [
      'session-live-sequential-1',
      'session-live-sequential-2',
    ]);
  }, chatStore);
});

test('GET /api/channels/:id/stream keeps direct lanes pinned to the lead cat session', async () => {
  const chatStore = new MemoryChatStore();
  const runtime = createRuntimeStub();
  const seededAt = new Date('2026-03-11T00:00:00.000Z');

  let state = await chatStore.read();
  state = createCat(
    state,
    {
      name: 'Lead Cat',
      provider: 'claude',
      roles: ['companion'],
    },
    seededAt,
  );
  const catId = state.cats[0].id;
  state = createChannel(
    state,
    {
      title: 'Strict direct lane',
      topic: 'Do not stream from Boss Cat fallbacks.',
      roomMode: 'direct_cat_chat',
      participantCatIds: [catId],
      defaultRecipientId: catId,
      skipBossCatGreeting: true,
    },
    seededAt,
  );
  const channelId = state.channels[0].id;
  state.channels[0].channelKind = 'direct_lane';
  state.channels[0].roomRouting.mode = 'boss_chat';
  state = setChannelOrchestratorLease(
    state,
    channelId,
    {
      sessionId: 'session-orchestrator-fallback',
      status: 'ready',
      startedAt: seededAt.toISOString(),
      lastUsedAt: seededAt.toISOString(),
    },
    seededAt,
  );
  await chatStore.write(state);

  runtime.setObservedSession('session-orchestrator-fallback', {
    session: {
      id: 'session-orchestrator-fallback',
    },
    observePath: '/sessions/session-orchestrator-fallback/observe',
    stream: {
      path: '/sessions/session-orchestrator-fallback/stream',
      available: true,
      events: [
        {
          event: 'progress',
          data: {
            type: 'progress',
            text: 'This should never be streamed for a direct lane.',
          },
        },
      ],
    },
  });

  await withServer(runtime, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/channels/${channelId}/stream`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'text/event-stream');

    const body = await response.text();
    assert.match(body, /event: session_closed/u);
    assert.deepEqual(runtime.streamedSessions, []);
  }, chatStore);
});

test('GET /health reports runtime reachability', async () => {
  await withServer(createRuntimeStub(), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/health`);
    assert.equal(response.status, 200);

    const payload = await response.json();
    assert.equal(payload.service, 'cats-platform');
    assert.equal(payload.status, 'ok');
    assert.equal(payload.readiness.ready, true);
    assert.equal(payload.readiness.endpoint, '/health');
    assert.equal(payload.contract.startup, 1);
    assert.ok(Array.isArray(payload.contract.supportedModes));
    assert.equal(payload.startup.mode, 'standalone');
    assert.equal(payload.startup.phase, 'ready');
    assert.equal(payload.shutdown.stdinCloseEnabled, false);
    assert.equal(payload.runtime.service, 'cats-runtime');
  });
});

test('GET /api/providers/:provider/models/advanced returns the runtime advanced catalog additively', async () => {
  const runtime = createRuntimeStub();
  runtime.getProviderConfig = async () => ({
    codex: {
      defaultInstance: 'default',
      defaultBackend: 'cli',
      instances: [
        {
          id: 'default',
          target: 'cli/default',
          backend: 'cli',
          command: 'codex',
          runner: null,
          runtime: null,
          transport: null,
          model: 'codex-default',
        },
      ],
    },
  });
  runtime.getProviderDiagnostics = async () => ({
    probe: 'light',
    providers: [
      {
        provider: 'codex',
        backend: 'cli',
        instance: 'default',
        availability: {
          status: 'ok',
          summary: 'CLI ready',
          attentionCodes: [],
        },
      },
    ],
  });

  await withServer(runtime, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/providers/codex/models/advanced`);
    assert.equal(response.status, 200);

    const payload = await response.json();
    assert.equal(payload.catalog.provider, 'codex');
    assert.equal(payload.catalog.defaultSelection.entryMode, 'auto');
    assert.equal(payload.catalog.defaultSelection.presetId, 'balanced');
    assert.equal(payload.catalog.presets[0].availability, 'supported');
    assert.deepEqual(payload.catalog.controls[0].values, [
      { value: 'low', label: 'low' },
      { value: 'medium', label: 'medium' },
      { value: 'high', label: 'high' },
    ]);
  });
});

test('cat durable-memory writes stay successful when canonical sync fails', async () => {
  const chatStore = new MemoryChatStore();
  const baseMemoryService = createCatsMemoryService(
    createChatMemorySurface(chatStore),
    new MemoryCanonicalMemoryStore(),
  );
  const failingMemoryService = {
    async listCanonicalRecords(filter) {
      return baseMemoryService.listCanonicalRecords(filter);
    },
    async flushCompanionBox() {
      throw new Error('canonical cat sync failed');
    },
    async flushChannel(input) {
      return baseMemoryService.flushChannel(input);
    },
    async flushOwnerProfile(input) {
      return baseMemoryService.flushOwnerProfile(input);
    },
    async buildCompanionRetrievalContext(input) {
      return baseMemoryService.buildCompanionRetrievalContext(input);
    },
    async buildChannelRetrievalContext(input) {
      return baseMemoryService.buildChannelRetrievalContext(input);
    },
  };

  await withServer(createRuntimeStub(), async (baseUrl) => {
    const createCatResponse = await fetch(`${baseUrl}/api/cats`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Memory Cat',
        provider: 'claude',
      }),
    });
    assert.equal(createCatResponse.status, 201);
    const { cat } = await createCatResponse.json();

    const createMemoryResponse = await fetch(`${baseUrl}/api/cats/${cat.id}/memory`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        category: 'fact',
        content: 'Memory Cat likes rooftop naps.',
      }),
    });
    assert.equal(createMemoryResponse.status, 201);

    const listMemoryResponse = await fetch(`${baseUrl}/api/cats/${cat.id}/memory`);
    assert.equal(listMemoryResponse.status, 200);
    const listMemoryPayload = await listMemoryResponse.json();
    assert.equal(listMemoryPayload.records.length, 1);
    assert.equal(listMemoryPayload.records[0].content, 'Memory Cat likes rooftop naps.');

    const coreState = await chatStore.readCore();
    assert.ok(
      coreState.activities.some((activity) =>
        activity.metadata?.category === 'memory_maintenance'
        && activity.metadata?.trigger === 'companion_sync'
        && activity.metadata?.status === 'deferred'
        && activity.metadata?.catId === cat.id),
    );
  }, chatStore, { memoryService: failingMemoryService });
});

test('owner-profile writes stay successful when canonical sync fails', async () => {
  const chatStore = new MemoryChatStore();
  const baseMemoryService = createCatsMemoryService(
    createChatMemorySurface(chatStore),
    new MemoryCanonicalMemoryStore(),
  );
  const failingMemoryService = {
    async listCanonicalRecords(filter) {
      return baseMemoryService.listCanonicalRecords(filter);
    },
    async flushCompanionBox(input) {
      return baseMemoryService.flushCompanionBox(input);
    },
    async flushChannel(input) {
      return baseMemoryService.flushChannel(input);
    },
    async flushOwnerProfile() {
      throw new Error('canonical owner sync failed');
    },
    async buildCompanionRetrievalContext(input) {
      return baseMemoryService.buildCompanionRetrievalContext(input);
    },
    async buildChannelRetrievalContext(input) {
      return baseMemoryService.buildChannelRetrievalContext(input);
    },
  };

  await withServer(createRuntimeStub(), async (baseUrl) => {
    const ownerProfileResponse = await fetch(`${baseUrl}/api/core/owner-profile`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        displayName: 'Resilient Owner',
      }),
    });
    assert.equal(ownerProfileResponse.status, 200);
    const ownerProfilePayload = await ownerProfileResponse.json();
    assert.equal(ownerProfilePayload.ownerProfile.displayName, 'Resilient Owner');

    const coreState = await chatStore.readCore();
    assert.equal(coreState.ownerProfile.displayName, 'Resilient Owner');
    assert.ok(
      coreState.activities.some((activity) =>
        activity.metadata?.category === 'memory_maintenance'
        && activity.metadata?.trigger === 'owner_sync'
        && activity.metadata?.status === 'deferred'),
    );
  }, chatStore, { memoryService: failingMemoryService });
});

test('PATCH /api/core/owner-profile clears the owner avatar when avatarUrl is null', async () => {
  await withServer(createRuntimeStub(), async (baseUrl) => {
    const saveResponse = await fetch(`${baseUrl}/api/core/owner-profile`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        avatarUrl: 'data:image/png;base64,owner-avatar',
      }),
    });
    assert.equal(saveResponse.status, 200);

    const clearResponse = await fetch(`${baseUrl}/api/core/owner-profile`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        avatarUrl: null,
      }),
    });
    assert.equal(clearResponse.status, 200);
    const clearPayload = await clearResponse.json();
    assert.equal(clearPayload.ownerProfile.avatarUrl, null);

    const readResponse = await fetch(`${baseUrl}/api/core/owner-profile`);
    assert.equal(readResponse.status, 200);
    const readPayload = await readResponse.json();
    assert.equal(readPayload.ownerProfile.avatarUrl, null);
  });
});

test('owner durable-memory writes stay successful when canonical sync fails', async () => {
  const chatStore = new MemoryChatStore();
  const baseMemoryService = createCatsMemoryService(
    createChatMemorySurface(chatStore),
    new MemoryCanonicalMemoryStore(),
  );
  const failingMemoryService = {
    async listCanonicalRecords(filter) {
      return baseMemoryService.listCanonicalRecords(filter);
    },
    async flushCompanionBox(input) {
      return baseMemoryService.flushCompanionBox(input);
    },
    async flushChannel(input) {
      return baseMemoryService.flushChannel(input);
    },
    async flushOwnerProfile() {
      throw new Error('canonical owner sync failed');
    },
    async buildCompanionRetrievalContext(input) {
      return baseMemoryService.buildCompanionRetrievalContext(input);
    },
    async buildChannelRetrievalContext(input) {
      return baseMemoryService.buildChannelRetrievalContext(input);
    },
  };

  await withServer(createRuntimeStub(), async (baseUrl) => {
    const createMemoryResponse = await fetch(`${baseUrl}/api/owner/memory`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        category: 'style',
        content: 'Owner prefers concise updates.',
      }),
    });
    assert.equal(createMemoryResponse.status, 201);
    const { memory } = await createMemoryResponse.json();

    const updateMemoryResponse = await fetch(`${baseUrl}/api/owner/memory/${memory.id}`, {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        content: 'Owner prefers bullet summaries.',
      }),
    });
    assert.equal(updateMemoryResponse.status, 200);

    const deleteMemoryResponse = await fetch(`${baseUrl}/api/owner/memory/${memory.id}`, {
      method: 'DELETE',
    });
    assert.equal(deleteMemoryResponse.status, 200);

    const listMemoryResponse = await fetch(`${baseUrl}/api/owner/memory`);
    assert.equal(listMemoryResponse.status, 200);
    const listMemoryPayload = await listMemoryResponse.json();
    assert.equal(listMemoryPayload.records.length, 0);

    const coreState = await chatStore.readCore();
    assert.ok(
      coreState.activities.some((activity) =>
        activity.metadata?.category === 'memory_maintenance'
        && activity.metadata?.trigger === 'owner_sync'
        && activity.metadata?.status === 'deferred'),
    );
  }, chatStore, { memoryService: failingMemoryService });
});

test('GET /api/app-shell exposes detailed chat state with global cats', async () => {
  await withServer(createRuntimeStub(), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/app-shell`);
    assert.equal(response.status, 200);

    const payload = await response.json();
    assert.equal(payload.app.name, 'cats-platform');
    assert.equal(payload.chat.name, 'Chat');
    assert.equal(payload.chat.selectedChannelId, '');
    assert.equal(payload.chat.channels.length, 0);
    assert.equal(payload.chat.cats.length, 0);
    assert.equal(payload.chat.selectedChannel, null);
    assert.equal(payload.chat.capabilities.mentions, 'basic');
    assert.equal(payload.chat.capabilities.transcriptExport, true);
  });
});

test('GET /api/app-shell repairs an orphaned completed room turn before rendering the selected channel', async () => {
  const runtime = createRuntimeStub();
  const chatStore = new MemoryChatStore();
  const seededAt = new Date('2026-03-11T00:00:00.000Z');
  const responseAt = new Date('2026-03-11T00:00:06.000Z');
  let state = await chatStore.read();
  state = createChannel(
    state,
    {
      title: 'Corrupted room route',
      topic: 'Repair orphaned active turn',
      skipBossCatGreeting: true,
    },
    seededAt,
  );
  const channelId = state.selectedChannelId;
  const begun = await beginChannelMessageDispatch(
    state,
    channelId,
    { body: 'Please repair me' },
    runtime,
    seededAt,
  );
  const activeTurnId = begun.state.channels.find((channel) => channel.id === channelId)
    ?.roomRouting.workflow.activeTurn?.id;
  assert.ok(activeTurnId);
  state = appendMessage(
    begun.state,
    channelId,
    {
      senderKind: 'orchestrator',
      senderName: 'Chat',
      body: 'Recovered response body',
    },
    responseAt,
    {
      metadata: {
        event: 'assistant_turn_segment',
        assistantTurnId: 'assistant-turn-startup-repaired',
        targetStateId: 'target-state-startup-repaired',
        terminal: true,
        turnId: activeTurnId,
        targetKind: 'orchestrator',
        targetId: 'orchestrator',
        routingTrigger: 'room_default',
        dispatchDepth: 0,
      },
    },
  ).state;
  const corruptedChannel = state.channels.find((channel) => channel.id === channelId);
  assert.ok(corruptedChannel?.roomRouting.workflow.activeTurn);
  corruptedChannel.roomRouting.workflow.activeTurn.targetStatuses = [];
  corruptedChannel.roomRouting.workflow.activeTurn.events =
    corruptedChannel.roomRouting.workflow.activeTurn.events.filter((event) =>
      event.kind === 'turn_started' || event.kind === 'checkpoint');
  corruptedChannel.orchestratorLease = {
    sessionId: null,
    status: 'not_started',
    cwd: null,
    lastError: null,
    provider: 'claude',
    model: null,
    startedAt: null,
    lastUsedAt: null,
  };
  await withServer(runtime, async (baseUrl) => {
    await chatStore.write(state);
    const response = await fetch(`${baseUrl}/api/app-shell`);
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.chat.selectedChannel.id, channelId);
    assert.equal(payload.chat.selectedChannel.roomRouting.workflow.activeTurn, null);
    assert.equal(payload.chat.selectedChannel.roomRouting.lastOutcome?.status, 'completed');
  }, chatStore);

  const repairedState = await chatStore.read();
  const repairedChannel = repairedState.channels.find((channel) => channel.id === channelId);
  assert.equal(repairedChannel?.roomRouting.workflow.activeTurn, null);
  assert.equal(repairedChannel?.roomRouting.lastOutcome?.status, 'completed');
});

test('GET /api/app-shell does not finalize an active sequential room turn while follow-up speakers remain in flight', async () => {
  const runtime = createRuntimeStub();
  const chatStore = new MemoryChatStore();
  const seededAt = new Date('2026-03-11T00:00:00.000Z');
  const responseAt = new Date('2026-03-11T00:00:06.000Z');
  let state = await chatStore.read();
  state = createChannel(
    state,
    {
      title: 'Sequential turn still active',
      topic: 'Do not clear the active turn before later speakers run.',
      skipBossCatGreeting: true,
    },
    seededAt,
  );
  const channelId = state.selectedChannelId;
  const begun = await beginChannelMessageDispatch(
    state,
    channelId,
    { body: 'Please hand this off in order.' },
    runtime,
    seededAt,
  );
  const inFlightState = structuredClone(begun.state);
  const inFlightChannel = requireChannel(inFlightState, channelId);
  const activeTurn = inFlightChannel.roomRouting.workflow.activeTurn;
  assert.ok(activeTurn);

  activeTurn.workflowShape = 'sequential';
  activeTurn.targetStatuses = [
    {
      id: 'target-claude',
      dispatchId: 'dispatch-claude',
      participant: {
        participantKind: 'cat',
        participantId: 'participant-claude',
        participantName: 'Claude-CLI',
      },
      source: null,
      sourceMessageId: activeTurn.sourceMessageId,
      trigger: 'explicit_mention',
      mentionNames: ['Claude-CLI', 'Codex-CLI'],
      depth: 0,
      parentCheckpointId: activeTurn.lastCheckpointId,
      branchStrategy: 'transplant_context',
      handoffReason: 'explicit_mention',
      wakeRequestId: null,
      status: 'completed',
      queuedAt: seededAt.toISOString(),
      startedAt: seededAt.toISOString(),
      completedAt: responseAt.toISOString(),
      response: {
        assistantTurnId: 'assistant-turn-claude',
        messageIds: ['message-claude'],
        fullText: 'Hello from Claude-CLI.',
        segmentCount: 1,
      },
      error: null,
    },
    {
      id: 'target-codex',
      dispatchId: 'dispatch-codex',
      participant: {
        participantKind: 'cat',
        participantId: 'participant-codex',
        participantName: 'Codex-CLI',
      },
      source: null,
      sourceMessageId: activeTurn.sourceMessageId,
      trigger: 'continuation_mention',
      mentionNames: ['Codex-CLI'],
      depth: 0,
      parentCheckpointId: activeTurn.lastCheckpointId,
      branchStrategy: 'transplant_context',
      handoffReason: 'workflow_continuation',
      wakeRequestId: null,
      status: 'running',
      queuedAt: responseAt.toISOString(),
      startedAt: responseAt.toISOString(),
      completedAt: null,
      response: null,
      error: null,
    },
  ];
  inFlightChannel.roomRouting.lastOutcome.dispatches = [
    {
      id: 'dispatch-claude',
      sourceMessageId: activeTurn.sourceMessageId,
      source: null,
      target: {
        participantKind: 'cat',
        participantId: 'participant-claude',
        participantName: 'Claude-CLI',
      },
      trigger: 'explicit_mention',
      status: 'completed',
      mentionNames: ['Claude-CLI', 'Codex-CLI'],
      response: {
        assistantTurnId: 'assistant-turn-claude',
        messageIds: ['message-claude'],
        fullText: 'Hello from Claude-CLI.',
        segmentCount: 1,
      },
      startedAt: seededAt.toISOString(),
      completedAt: responseAt.toISOString(),
      error: null,
    },
    {
      id: 'dispatch-codex',
      sourceMessageId: activeTurn.sourceMessageId,
      source: null,
      target: {
        participantKind: 'cat',
        participantId: 'participant-codex',
        participantName: 'Codex-CLI',
      },
      trigger: 'continuation_mention',
      status: 'running',
      mentionNames: ['Codex-CLI'],
      response: null,
      startedAt: responseAt.toISOString(),
      completedAt: null,
      error: null,
    },
  ];
  inFlightChannel.roomRouting.lastOutcome.status = 'running';
  inFlightChannel.roomRouting.lastOutcome.completedAt = null;
  state = appendMessage(
    inFlightState,
    channelId,
    {
      senderKind: 'agent',
      senderName: 'Claude-CLI',
      body: 'Hello from Claude-CLI.',
    },
    responseAt,
    {
      metadata: {
        event: 'assistant_turn_segment',
        assistantTurnId: 'assistant-turn-claude',
        targetStateId: 'target-claude',
        terminal: true,
        turnId: activeTurn.id,
        targetKind: 'cat',
        targetId: 'participant-claude',
        routingTrigger: 'explicit_mention',
        dispatchDepth: 0,
      },
      incrementUnread: false,
    },
  ).state;

  await withServer(runtime, async (baseUrl) => {
    await chatStore.write(state);
    const response = await fetch(`${baseUrl}/api/app-shell`);
    assert.equal(response.status, 200);
    const payload = await response.json();
    const repairedChannel = payload.chat.selectedChannel;
    assert.equal(repairedChannel.id, channelId);
    assert.ok(repairedChannel.roomRouting.workflow.activeTurn);
    assert.equal(
      repairedChannel.roomRouting.workflow.activeTurn.targetStatuses.some((target) =>
        target.participant.participantId === 'participant-codex' && target.status === 'running'),
      true,
    );
    assert.equal(repairedChannel.roomRouting.lastOutcome?.status, 'running');
  }, chatStore);

  const persistedState = await chatStore.read();
  const persistedChannel = persistedState.channels.find((channel) => channel.id === channelId);
  assert.ok(persistedChannel?.roomRouting.workflow.activeTurn);
  assert.equal(persistedChannel?.roomRouting.lastOutcome?.status, 'running');
});

test('GET /api/core endpoints expose the shared Cats Core contract', async () => {
  await withServer(createRuntimeStub(), async (baseUrl) => {
    const stateResponse = await fetch(`${baseUrl}/api/core`);
    assert.equal(stateResponse.status, 200);
    const statePayload = await stateResponse.json();
    assert.equal(statePayload.version, 5);
    assert.equal(statePayload.ownerProfile.actorId, 'actor-owner');
    assert.ok(Array.isArray(statePayload.actors));
    assert.ok(Array.isArray(statePayload.conversations));
    assert.ok(Array.isArray(statePayload.projects));
    assert.ok(Array.isArray(statePayload.workItems));
    assert.ok(Array.isArray(statePayload.tasks));
    assert.ok(Array.isArray(statePayload.runs));
    assert.ok(Array.isArray(statePayload.traces));
    assert.ok(Array.isArray(statePayload.checkpoints));
    assert.ok(Array.isArray(statePayload.outcomes));
    assert.ok(Array.isArray(statePayload.artifacts));
    assert.ok(Array.isArray(statePayload.activities));
    assert.ok(Array.isArray(statePayload.approvalBindings));

    const actorsResponse = await fetch(`${baseUrl}/api/core/actors`);
    assert.equal(actorsResponse.status, 200);
    const actorsPayload = await actorsResponse.json();
    assert.ok(actorsPayload.actors.some((actor) => actor.kind === 'owner'));
    assert.ok(actorsPayload.actors.some((actor) => actor.kind === 'orchestrator'));

    const approvalsResponse = await fetch(`${baseUrl}/api/core/approvals`);
    assert.equal(approvalsResponse.status, 200);
    const approvalsPayload = await approvalsResponse.json();
    assert.ok(Array.isArray(approvalsPayload.approvals));
    assert.equal(approvalsPayload.approvals.length, 0);

    const ownerProfileResponse = await fetch(`${baseUrl}/api/core/owner-profile`);
    assert.equal(ownerProfileResponse.status, 200);
    const ownerProfilePayload = await ownerProfileResponse.json();
    assert.equal(ownerProfilePayload.ownerProfile.displayName, 'Owner');
  });
});

test('GET /api/core/memory-maintenance returns normalized maintenance activity history', async () => {
  await withServer(createRuntimeStub(), async (baseUrl) => {
    const runtimeHookResponse = await fetch(`${baseUrl}/api/core/activities`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        activity: {
          id: 'activity-memory-route-runtime',
          kind: 'note',
          message: 'Runtime memory flush completed.',
          createdAt: '2026-03-26T16:59:00.000Z',
          metadata: {
            category: 'memory_maintenance',
            trigger: 'runtime_hook',
            status: 'executed',
            phase: 'pre_reset',
            sessionId: 'session-memory-route',
            channelId: 'channel-memory-route',
            reason: 'runtime_hook',
            summary: {
              subjects: [
                {
                  kind: 'channel',
                  id: 'channel-memory-route',
                },
              ],
              flushCount: 1,
              persistedCount: 2,
              removedCount: 1,
              removedRecordIds: ['cats-memory-old-1'],
              sourceScopeKeys: ['channel:channel-memory-route'],
              replacementGroups: ['channel:channel-memory-route:summary'],
            },
          },
        },
      }),
    });
    assert.equal(runtimeHookResponse.status, 201);

    const deferredResponse = await fetch(`${baseUrl}/api/core/activities`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        activity: {
          id: 'activity-memory-route-companion',
          kind: 'note',
          message: 'Companion sync deferred.',
          createdAt: '2026-03-26T16:58:00.000Z',
          metadata: {
            category: 'memory_maintenance',
            trigger: 'companion_sync',
            status: 'deferred',
            catId: 'cat-memory-route',
            reason: 'manual',
            error: 'rate limited',
          },
        },
      }),
    });
    assert.equal(deferredResponse.status, 201);

    const listResponse = await fetch(`${baseUrl}/api/core/memory-maintenance`);
    assert.equal(listResponse.status, 200);
    const listPayload = await listResponse.json();

    assert.deepEqual(listPayload.summary, {
      totalAvailable: 2,
      matching: 2,
      returned: 2,
    });
    assert.deepEqual(listPayload.maintenance.totals, {
      recentCount: 2,
      executed: 1,
      deferred: 1,
      missingContext: 0,
      error: 0,
    });
    assert.equal(
      listPayload.maintenance.latestByTrigger.runtimeHook.id,
      'activity-memory-route-runtime',
    );
    assert.equal(
      listPayload.maintenance.latestByTrigger.companionSync.id,
      'activity-memory-route-companion',
    );
    assert.equal(listPayload.maintenance.latestByTrigger.ownerSync, null);
    assert.deepEqual(listPayload.maintenance.recent[0].subjectKeys, [
      'channel:channel-memory-route',
    ]);
    assert.deepEqual(
      listPayload.maintenance.recent[0].summary.removedRecordIds,
      ['cats-memory-old-1'],
    );
    assert.deepEqual(listPayload.maintenance.recent[0].impact, {
      subjects: [
        {
          kind: 'channel',
          id: 'channel-memory-route',
        },
      ],
      sourceScopeKeys: ['channel:channel-memory-route'],
      replacementGroups: ['channel:channel-memory-route:summary'],
      removedRecordIds: ['cats-memory-old-1'],
      persistedRecords: [],
    });
    assert.deepEqual(listPayload.maintenance.recent[1].subjectKeys, [
      'cat:cat-memory-route',
    ]);
    assert.deepEqual(
      listPayload.maintenance.latestByTrigger.runtimeHook.subjectKeys,
      ['channel:channel-memory-route'],
    );
    assert.deepEqual(
      listPayload.maintenance.latestByTrigger.companionSync.subjectKeys,
      ['cat:cat-memory-route'],
    );
    assert.deepEqual(listPayload.maintenance.facets, {
      sourceScopeKeyCounts: {
        'channel:channel-memory-route': 1,
      },
      replacementGroupCounts: {
        'channel:channel-memory-route:summary': 1,
      },
      removedRecordIdCounts: {
        'cats-memory-old-1': 1,
      },
      withRemovedRecordsCount: 1,
    });

    const filteredResponse = await fetch(
      `${baseUrl}/api/core/memory-maintenance`
      + '?trigger=runtime_hook&status=executed&phase=pre_reset'
      + '&subjectKey=channel:channel-memory-route'
      + '&sourceScopeKey=channel:channel-memory-route'
      + '&replacementGroup=channel:channel-memory-route:summary'
      + '&removedRecordId=cats-memory-old-1&limit=1',
    );
    assert.equal(filteredResponse.status, 200);
    const filteredPayload = await filteredResponse.json();

    assert.deepEqual(filteredPayload.summary, {
      totalAvailable: 2,
      matching: 1,
      returned: 1,
    });
    assert.deepEqual(
      filteredPayload.maintenance.recent.map((activity) => activity.id),
      ['activity-memory-route-runtime'],
    );
    assert.deepEqual(filteredPayload.maintenance.facets, {
      sourceScopeKeyCounts: {
        'channel:channel-memory-route': 1,
      },
      replacementGroupCounts: {
        'channel:channel-memory-route:summary': 1,
      },
      removedRecordIdCounts: {
        'cats-memory-old-1': 1,
      },
      withRemovedRecordsCount: 1,
    });
    assert.equal(
      filteredPayload.maintenance.latestByTrigger.runtimeHook?.id,
      'activity-memory-route-runtime',
    );
    assert.equal(filteredPayload.maintenance.latestByTrigger.companionSync, null);
  });
});

test('POST /api/core/memory-maintenance runs companion canonical sync through the core route', async () => {
  await withServer(createRuntimeStub(), async (baseUrl) => {
    const createCatResponse = await fetch(`${baseUrl}/api/cats`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Maintenance Cat',
        provider: 'claude',
      }),
    });
    assert.equal(createCatResponse.status, 201);
    const { cat } = await createCatResponse.json();

    const createMemoryResponse = await fetch(`${baseUrl}/api/cats/${cat.id}/memory`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        category: 'fact',
        content: 'Maintenance Cat likes deterministic sync checks.',
      }),
    });
    assert.equal(createMemoryResponse.status, 201);

    const actionResponse = await fetch(`${baseUrl}/api/core/memory-maintenance`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        action: 'sync_companion',
        catId: cat.id,
        reason: 'manual',
      }),
    });
    assert.equal(actionResponse.status, 200);
    const actionPayload = await actionResponse.json();

    assert.equal(actionPayload.maintenanceAction.action, 'sync_companion');
    assert.equal(actionPayload.maintenanceAction.trigger, 'companion_sync');
    assert.equal(actionPayload.maintenanceAction.status, 'executed');
    assert.equal(actionPayload.maintenanceAction.subject.kind, 'cat');
    assert.equal(actionPayload.maintenanceAction.subject.id, cat.id);
    assert.equal(actionPayload.maintenanceAction.reason, 'manual');
    assert.ok(actionPayload.maintenanceAction.summary.persistedCount >= 1);

    const listResponse = await fetch(`${baseUrl}/api/core/memory-maintenance`);
    assert.equal(listResponse.status, 200);
    const listPayload = await listResponse.json();

    assert.equal(listPayload.maintenance.latestByTrigger.companionSync?.status, 'executed');
    assert.equal(listPayload.maintenance.latestByTrigger.companionSync?.catId, cat.id);
      assert.deepEqual(
        listPayload.maintenance.latestByTrigger.companionSync?.subjectKeys,
        [`cat:${cat.id}`],
      );
      assert.ok(
        (listPayload.maintenance.latestByTrigger.companionSync?.impact?.persistedRecords.length ?? 0) >= 1,
      );
      assert.equal(
        listPayload.maintenance.latestByTrigger.companionSync?.impact?.persistedRecords[0]?.subjectKey,
        `cat:${cat.id}`,
      );
    });
  });

test('POST /api/core/memory-maintenance reports deferred owner sync when canonical flush fails', async () => {
  const chatStore = new MemoryChatStore();
  const baseMemoryService = createCatsMemoryService(
    createChatMemorySurface(chatStore),
    new MemoryCanonicalMemoryStore(),
  );
  const failingMemoryService = {
    async listCanonicalRecords(filter) {
      return baseMemoryService.listCanonicalRecords(filter);
    },
    async flushCompanionBox(input) {
      return baseMemoryService.flushCompanionBox(input);
    },
    async flushChannel(input) {
      return baseMemoryService.flushChannel(input);
    },
    async flushOwnerProfile() {
      throw new Error('canonical owner sync failed');
    },
    async buildCompanionRetrievalContext(input) {
      return baseMemoryService.buildCompanionRetrievalContext(input);
    },
    async buildChannelRetrievalContext(input) {
      return baseMemoryService.buildChannelRetrievalContext(input);
    },
  };

  await withServer(createRuntimeStub(), async (baseUrl) => {
    const actionResponse = await fetch(`${baseUrl}/api/core/memory-maintenance`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        action: 'sync_owner',
        reason: 'owner_profile_sync',
      }),
    });
    assert.equal(actionResponse.status, 200);
    const actionPayload = await actionResponse.json();

    assert.equal(actionPayload.maintenanceAction.action, 'sync_owner');
    assert.equal(actionPayload.maintenanceAction.trigger, 'owner_sync');
    assert.equal(actionPayload.maintenanceAction.status, 'deferred');
    assert.equal(actionPayload.maintenanceAction.subject.kind, 'owner');
    assert.equal(actionPayload.maintenanceAction.subject.id, 'actor-owner');
    assert.equal(actionPayload.maintenanceAction.reason, 'owner_profile_sync');
    assert.match(actionPayload.maintenanceAction.error ?? '', /canonical owner sync failed/i);

    const listResponse = await fetch(`${baseUrl}/api/core/memory-maintenance`);
    assert.equal(listResponse.status, 200);
    const listPayload = await listResponse.json();

    assert.equal(listPayload.maintenance.latestByTrigger.ownerSync?.status, 'deferred');
    assert.equal(
      listPayload.maintenance.latestByTrigger.ownerSync?.reason,
      'owner_profile_sync',
    );
    assert.deepEqual(
      listPayload.maintenance.latestByTrigger.ownerSync?.subjectKeys,
      ['owner:actor-owner'],
    );
  }, chatStore, { memoryService: failingMemoryService });
});

test('POST /api/core/memory-maintenance runs project and relationship canonical sync through the core route', async () => {
  const fixtures = createSharedCoreFixtureBundle();
  const relationshipId = 'relationship-owner-maintenance-agent';

  await withServer(createRuntimeStub(), async (baseUrl) => {
    const projectResponse = await fetch(`${baseUrl}/api/core/projects`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ project: fixtures.project }),
    });
    assert.equal(projectResponse.status, 201);

    const createProjectMemoryResponse = await fetch(
      `${baseUrl}/api/core/projects/${fixtures.project.id}/memory`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          category: 'policy',
          content: 'Project sync should remain product-owned and additive.',
        }),
      },
    );
    assert.equal(createProjectMemoryResponse.status, 201);

    const createRelationshipMemoryResponse = await fetch(
      `${baseUrl}/api/core/relationships/${relationshipId}/memory`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          category: 'relationship',
          content: 'Relationship sync should preserve trusted collaborator context.',
        }),
      },
    );
    assert.equal(createRelationshipMemoryResponse.status, 201);

    const projectActionResponse = await fetch(`${baseUrl}/api/core/memory-maintenance`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        action: 'sync_project',
        projectId: fixtures.project.id,
        reason: 'manual',
      }),
    });
    assert.equal(projectActionResponse.status, 200);
    const projectActionPayload = await projectActionResponse.json();

    assert.equal(projectActionPayload.maintenanceAction.action, 'sync_project');
    assert.equal(projectActionPayload.maintenanceAction.trigger, 'project_sync');
    assert.equal(projectActionPayload.maintenanceAction.status, 'executed');
    assert.equal(projectActionPayload.maintenanceAction.subject.kind, 'project');
    assert.equal(projectActionPayload.maintenanceAction.subject.id, fixtures.project.id);

    const relationshipActionResponse = await fetch(`${baseUrl}/api/core/memory-maintenance`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        action: 'sync_relationship',
        relationshipId,
        reason: 'manual',
      }),
    });
    assert.equal(relationshipActionResponse.status, 200);
    const relationshipActionPayload = await relationshipActionResponse.json();

    assert.equal(relationshipActionPayload.maintenanceAction.action, 'sync_relationship');
    assert.equal(relationshipActionPayload.maintenanceAction.trigger, 'relationship_sync');
    assert.equal(relationshipActionPayload.maintenanceAction.status, 'executed');
    assert.equal(relationshipActionPayload.maintenanceAction.subject.kind, 'relationship');
    assert.equal(relationshipActionPayload.maintenanceAction.subject.id, relationshipId);

    const listResponse = await fetch(`${baseUrl}/api/core/memory-maintenance`);
    assert.equal(listResponse.status, 200);
    const listPayload = await listResponse.json();

    assert.equal(listPayload.maintenance.latestByTrigger.projectSync?.status, 'executed');
    assert.equal(
      listPayload.maintenance.latestByTrigger.relationshipSync?.status,
      'executed',
    );
    assert.deepEqual(
      listPayload.maintenance.latestByTrigger.projectSync?.subjectKeys,
      [`project:${fixtures.project.id}`],
    );
    assert.deepEqual(
      listPayload.maintenance.latestByTrigger.relationshipSync?.subjectKeys,
      [`relationship:${relationshipId}`],
    );
  });
});

test('core write APIs persist shared project, work, approval, trace, artifact, and owner records', async () => {
  const chatStore = new MemoryChatStore();
  const fixtures = createSharedCoreFixtureBundle();

  await withServer(createRuntimeStub(), async (baseUrl) => {
    const ownerProfileResponse = await fetch(`${baseUrl}/api/core/owner-profile`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        displayName: 'Boss Owner',
        decisionPreferences: ['show options first'],
      }),
    });
    assert.equal(ownerProfileResponse.status, 200);
    const ownerProfilePayload = await ownerProfileResponse.json();
    assert.equal(ownerProfilePayload.ownerProfile.displayName, 'Boss Owner');

    const ownerCanonicalResponse = await fetch(`${baseUrl}/api/owner/memory/canonical`);
    assert.equal(ownerCanonicalResponse.status, 200);
    const ownerCanonicalPayload = await ownerCanonicalResponse.json();
    assert.ok(
      ownerCanonicalPayload.records.some((record) =>
        record.origin.kind === 'owner_profile'
        && record.content === 'show options first',
      ),
    );

    const taskResponse = await fetch(`${baseUrl}/api/core/tasks`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        task: {
          ...fixtures.task,
          parentTaskId: 'task-parent-platform',
        },
      }),
    });
    assert.equal(taskResponse.status, 201);
    const taskPayload = await taskResponse.json();
    assert.equal(taskPayload.task.id, fixtures.task.id);
    assert.equal(taskPayload.task.parentTaskId, 'task-parent-platform');

    const projectResponse = await fetch(`${baseUrl}/api/core/projects`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ project: fixtures.project }),
    });
    assert.equal(projectResponse.status, 201);

    const workItemResponse = await fetch(`${baseUrl}/api/core/work-items`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ workItem: fixtures.workItem }),
    });
    assert.equal(workItemResponse.status, 201);

    const approvalResponse = await fetch(`${baseUrl}/api/core/approvals`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(fixtures.approvalDecision),
    });
    assert.equal(approvalResponse.status, 200);
    const approvalPayload = await approvalResponse.json();
    assert.equal(approvalPayload.task.approval.status, 'pending');
    assert.equal(approvalPayload.queueItem.taskId, fixtures.task.id);

    const traceResponse = await fetch(`${baseUrl}/api/core/traces`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ trace: fixtures.trace }),
    });
    assert.equal(traceResponse.status, 201);
    const tracePayload = await traceResponse.json();
    assert.equal(tracePayload.trace.id, fixtures.trace.id);

    const checkpointResponse = await fetch(`${baseUrl}/api/core/checkpoints`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ checkpoint: fixtures.checkpoint }),
    });
    assert.equal(checkpointResponse.status, 201);
    const checkpointPayload = await checkpointResponse.json();
    assert.equal(checkpointPayload.checkpoint.id, fixtures.checkpoint.id);
    assert.equal(checkpointPayload.checkpoint.updatedAt, fixtures.checkpoint.createdAt);

    const runResponse = await fetch(`${baseUrl}/api/core/runs`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ run: fixtures.run }),
    });
    assert.equal(runResponse.status, 201);
    const runPayload = await runResponse.json();
    assert.equal(runPayload.run.id, fixtures.run.id);
    assert.equal(runPayload.run.updatedAt, fixtures.run.createdAt);

    const outcomeResponse = await fetch(`${baseUrl}/api/core/outcomes`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ outcome: fixtures.outcome }),
    });
    assert.equal(outcomeResponse.status, 201);
    const outcomePayload = await outcomeResponse.json();
    assert.equal(outcomePayload.outcome.id, fixtures.outcome.id);
    assert.equal(outcomePayload.outcome.updatedAt, fixtures.outcome.recordedAt);

    const artifactResponse = await fetch(`${baseUrl}/api/core/artifacts`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ artifact: fixtures.artifact }),
    });
    assert.equal(artifactResponse.status, 201);

    const activityResponse = await fetch(`${baseUrl}/api/core/activities`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ activity: fixtures.activity }),
    });
    assert.equal(activityResponse.status, 201);

    const approvalBindingResponse = await fetch(`${baseUrl}/api/core/approval-bindings`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ approvalBinding: fixtures.approvalBinding }),
    });
    assert.equal(approvalBindingResponse.status, 201);

    const approvalsListResponse = await fetch(`${baseUrl}/api/core/approvals`);
    assert.equal(approvalsListResponse.status, 200);
    const approvalsListPayload = await approvalsListResponse.json();
    assert.equal(approvalsListPayload.approvals.length, 1);

    const stateResponse = await fetch(`${baseUrl}/api/core`);
    assert.equal(stateResponse.status, 200);
    const statePayload = await stateResponse.json();
    assert.equal(statePayload.ownerProfile.displayName, 'Boss Owner');
    assert.ok(statePayload.projects.some((project) => project.id === fixtures.project.id));
    assert.ok(statePayload.workItems.some((workItem) => workItem.id === fixtures.workItem.id));
    assert.ok(statePayload.tasks.some((task) => task.id === fixtures.task.id));
    assert.equal(
      statePayload.tasks.find((task) => task.id === fixtures.task.id)?.parentTaskId,
      'task-parent-platform',
    );
    assert.ok(statePayload.runs.some((run) => run.id === fixtures.run.id));
    assert.ok(statePayload.traces.some((trace) => trace.id === fixtures.trace.id));
    assert.ok(
      statePayload.checkpoints.some((checkpoint) => checkpoint.id === fixtures.checkpoint.id),
    );
    assert.ok(statePayload.outcomes.some((outcome) => outcome.id === fixtures.outcome.id));
    assert.ok(statePayload.artifacts.some((artifact) => artifact.id === fixtures.artifact.id));
    assert.ok(statePayload.activities.some((activity) => activity.id === fixtures.activity.id));
    assert.ok(
      statePayload.approvalBindings.some(
        (approvalBinding) => approvalBinding.id === fixtures.approvalBinding.id,
      ),
    );
  }, chatStore);
});

test('core recovery routes expose normalized orchestrator replay state without leaking raw task metadata', async () => {
  await withServer(createRuntimeStub(), async (baseUrl) => {
    const metadata = writeWorkflowContinuationReplayMetadata(
      writeOrchestratorDispatchReplayMetadata(
        writePendingOrchestratorDispatchMetadata(
          {
            effectiveDeliveryPolicy: {
              mode: 'commit_only',
              gates: ['owner_approval_required'],
              source: 'task_override',
              rationale: 'Safer retry rollout.',
            },
            roomRoutingMode: 'boss_chat',
          },
          buildPendingOrchestratorDispatchRequest({
            channelId: 'channel-recovery-routes',
            body: 'Please resume the blocked rollout with a safer follow-up plan.',
            senderName: 'Owner',
            blockedAt: '2026-03-26T13:00:00.000Z',
          }),
          {
            replayState: 'failed',
            replayTrigger: 'approve',
            replayAttemptAt: '2026-03-26T13:01:00.000Z',
            replayError: 'owner unavailable',
          },
        ),
        buildOrchestratorDispatchReplayRequest({
          channelId: 'channel-recovery-routes',
          body: 'Please resume the blocked rollout with a safer follow-up plan.',
          senderName: 'Owner',
          recordedAt: '2026-03-26T13:00:00.000Z',
        }),
        {
          replayState: 'ready',
          replayTrigger: 'retry',
          replayAttemptAt: '2026-03-26T13:02:00.000Z',
          sourceMessageId: 'message-recovery-routes',
        },
      ),
      buildWorkflowContinuationReplayRequest({
        channelId: 'channel-recovery-routes',
        checkpointId: 'checkpoint-recovery-routes',
        sourceMessageId: 'message-recovery-routes',
        sourceParticipant: {
          participantKind: 'cat',
          participantId: 'cat-inline',
          participantName: 'Inline-Agent',
        },
        targets: [
          {
            participantKind: 'cat',
            participantId: 'cat-followup',
            participantName: 'Followup-Agent',
          },
        ],
        branchStrategy: 'transplant_context',
        workflowStageId: 'continuation_handoff',
        workflowShape: 'converge',
        reviewRequired: true,
        continuationSource: 'workflow_recommendation',
        unresolvedTargets: ['Ghost Cat'],
        blockedReason: 'max_dispatches',
        recordedAt: '2026-03-26T13:03:00.000Z',
      }),
      {
        replayState: 'failed',
        replayTrigger: 'retry',
        replayAttemptAt: '2026-03-26T13:03:30.000Z',
        replayError: 'guard tripped',
      },
    );

    const rootTaskResponse = await fetch(`${baseUrl}/api/core/tasks`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        task: {
          id: 'task-recovery-routes-root',
          title: 'Inspect recovery routes root',
          status: 'in_progress',
          conversationId: 'conversation-channel-recovery-routes',
        },
      }),
    });
    assert.equal(rootTaskResponse.status, 201);

    const taskResponse = await fetch(`${baseUrl}/api/core/tasks`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        task: {
          id: 'task-recovery-routes',
          title: 'Inspect recovery routes',
          status: 'blocked',
          parentTaskId: 'task-recovery-routes-root',
          conversationId: 'conversation-channel-recovery-routes',
          approval: {
            status: 'pending',
            requestedAt: '2026-03-26T12:59:00.000Z',
          },
          metadata,
        },
      }),
    });
    assert.equal(taskResponse.status, 201);

    const activityResponse = await fetch(`${baseUrl}/api/core/activities`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        activity: {
          id: 'activity-recovery-routes',
          kind: 'note',
          taskId: 'task-recovery-routes',
          conversationId: 'conversation-channel-recovery-routes',
          message: 'Workflow continuation replay failed after retry.',
          createdAt: '2026-03-26T13:04:00.000Z',
          metadata: {
            source: 'workflow-continuation-replay',
            replayPhase: 'replay_failed',
            replayTrigger: 'retry',
            resumeReason: 'target_recovered',
            error: 'guard tripped',
            resultCount: 0,
          },
        },
      }),
    });
    assert.equal(activityResponse.status, 201);

    const listResponse = await fetch(`${baseUrl}/api/core/recovery/tasks`);
    assert.equal(listResponse.status, 200);
    const listPayload = await listResponse.json();
    assert.equal(listPayload.recoveries.length, 1);
    assert.equal(listPayload.recoveries[0].taskId, 'task-recovery-routes');
    assert.equal(listPayload.recoveries[0].canResumeViaApproval, true);
    assert.equal(listPayload.recoveries[0].canRetry, true);
    assert.deepEqual(
      listPayload.recoveries[0].approvalActions.map((action) => action.kind),
      ['approve', 'reroute', 'reject'],
    );
    assert.deepEqual(
      listPayload.recoveries[0].incidentActions.map((action) => action.kind),
      ['retry'],
    );
    assert.ok(listPayload.recoveries[0].pendingDispatch.bodyLength > 40);
    assert.match(listPayload.recoveries[0].pendingDispatch.bodyPreview, /blocked rollout/i);
    assert.equal(listPayload.recoveries[0].latestActivity.phase, 'replay_failed');
    assert.equal(listPayload.recoveries[0].latestActivity.resumeReason, 'target_recovered');
    assert.equal(listPayload.recoveries[0].family.rootTaskId, 'task-recovery-routes-root');
    assert.equal(listPayload.recoveries[0].family.parent.taskId, 'task-recovery-routes-root');
    assert.equal(listPayload.recoveries[0].context.deliveryMode, 'commit_only');
    assert.deepEqual(listPayload.recoveries[0].context.deliveryActions, ['create_commit']);
    assert.equal(listPayload.recoveries[0].context.workflowStageId, 'continuation_handoff');
    assert.equal(listPayload.summary.actionKindCounts.approve, 1);
    assert.equal(listPayload.summary.actionKindCounts.retry, 1);
    assert.equal(listPayload.summary.pendingDispatchReplayStateCounts.failed, 1);
    assert.equal(listPayload.summary.dispatchReplayStateCounts.ready, 1);
    assert.equal(listPayload.summary.workflowContinuationReplayStateCounts.failed, 1);
    assert.equal(listPayload.summary.workflowContinuationBlockedReasonCounts.max_dispatches, 1);
    assert.equal(listPayload.summary.deliveryModeCounts.commit_only, 1);
    assert.equal(listPayload.summary.deliveryActionCounts.create_commit, 1);
    assert.equal(listPayload.summary.workflowStageCounts.continuation_handoff, 1);
    assert.equal(listPayload.summary.workflowShapeCounts.converge, 1);
    assert.equal(listPayload.summary.latestReplaySourceCounts['workflow-continuation-replay'], 1);
    assert.equal(listPayload.summary.latestReplayTriggerCounts.retry, 1);
    assert.equal(listPayload.summary.latestReplayPhaseCounts.replay_failed, 1);
    assert.equal(listPayload.summary.latestReplayResumeReasonCounts.target_recovered, 1);
    assert.equal(listPayload.summary.withChildrenCount, 0);
    assert.equal(listPayload.summary.withActiveChildrenCount, 0);

    const filteredListResponse = await fetch(
      `${baseUrl}/api/core/recovery/tasks?actionKind=approve&pendingDispatchReplayState=failed&dispatchReplayState=ready&workflowContinuationReplayState=failed&workflowContinuationBlockedReason=max_dispatches&deliveryMode=commit_only&deliveryAction=create_commit&workflowStageId=continuation_handoff&workflowShape=converge&workflowReviewRequired=true&workflowConvergeTargetId=cat-followup&latestReplaySource=workflow-continuation-replay&latestReplayTrigger=retry&latestReplayPhase=replay_failed&latestReplayResumeReason=target_recovered&rootTaskId=task-recovery-routes-root&parentTaskId=task-recovery-routes-root&hasChildren=false&hasActiveChildren=false`,
    );
    assert.equal(filteredListResponse.status, 200);
    const filteredListPayload = await filteredListResponse.json();
    assert.deepEqual(
      filteredListPayload.recoveries.map((recovery) => recovery.taskId),
      ['task-recovery-routes'],
    );
    assert.equal(filteredListPayload.summary.actionKindCounts.approve, 1);
    assert.equal(filteredListPayload.summary.actionKindCounts.retry, 1);
    assert.equal(filteredListPayload.summary.pendingDispatchReplayStateCounts.failed, 1);
    assert.equal(filteredListPayload.summary.dispatchReplayStateCounts.ready, 1);
    assert.equal(filteredListPayload.summary.workflowContinuationReplayStateCounts.failed, 1);
    assert.equal(filteredListPayload.summary.workflowContinuationBlockedReasonCounts.max_dispatches, 1);
    assert.equal(filteredListPayload.summary.workflowShapeCounts.converge, 1);
    assert.equal(
      filteredListPayload.summary.latestReplaySourceCounts['workflow-continuation-replay'],
      1,
    );
    assert.equal(filteredListPayload.summary.latestReplayTriggerCounts.retry, 1);
    assert.equal(filteredListPayload.summary.latestReplayPhaseCounts.replay_failed, 1);
    assert.equal(filteredListPayload.summary.latestReplayResumeReasonCounts.target_recovered, 1);

    const detailResponse = await fetch(
      `${baseUrl}/api/core/tasks/task-recovery-routes/recovery`,
    );
    assert.equal(detailResponse.status, 200);
    const detailPayload = await detailResponse.json();
    assert.equal(detailPayload.recovery.dispatchReplay.sourceMessageId, 'message-recovery-routes');
    assert.equal(detailPayload.recovery.dispatchReplay.replayState, 'ready');
    assert.equal(detailPayload.recovery.workflowContinuationReplay.checkpointId, 'checkpoint-recovery-routes');
    assert.deepEqual(
      detailPayload.recovery.workflowContinuationReplay.targets.map((target) => target.participantName),
      ['Followup-Agent'],
    );
    assert.equal(detailPayload.recovery.workflowContinuationReplay.reviewRequired, true);
    assert.equal(
      detailPayload.recovery.workflowContinuationReplay.blockedReason,
      'max_dispatches',
    );
    assert.equal(detailPayload.recovery.context.deliveryMode, 'commit_only');
    assert.equal(detailPayload.recovery.context.deliverySource, 'task_override');
    assert.deepEqual(detailPayload.recovery.context.deliveryGates, ['owner_approval_required']);
    assert.deepEqual(detailPayload.recovery.context.deliveryActions, ['create_commit']);
    assert.equal(detailPayload.recovery.context.workflowStageId, 'continuation_handoff');
    assert.equal(detailPayload.recovery.context.workflowShape, 'converge');
    assert.equal(detailPayload.recovery.context.workflowReviewRequired, true);
    assert.equal(detailPayload.recovery.context.workflowConvergeTargetId, 'cat-followup');
    assert.equal(detailPayload.recovery.context.channelId, 'channel-recovery-routes');
    assert.equal(detailPayload.recovery.context.transport, 'web');
    assert.equal(detailPayload.recovery.context.roomMode, 'boss_chat');
    assert.equal(detailPayload.recovery.latestActivity.resumeReason, 'target_recovered');
    assert.equal(detailPayload.recovery.family.rootTaskId, 'task-recovery-routes-root');
    assert.equal(detailPayload.recovery.family.parent.taskId, 'task-recovery-routes-root');
    assert.equal(detailPayload.recovery.approval.status, 'pending');
    assert.equal(detailPayload.recovery.approvalActions[0].action.path, '/api/core/approvals');
    assert.equal(detailPayload.recovery.incidentActions[0].action.path, '/api/core/operator-actions');

    const missingResponse = await fetch(`${baseUrl}/api/core/tasks/task-missing/recovery`);
    assert.equal(missingResponse.status, 404);
    const missingPayload = await missingResponse.json();
    assert.equal(missingPayload.error.code, 'task_not_found');
  });
});

test('GET /api/core/tasks/:taskId returns derived inspection detail alongside the raw task', async () => {
  await withServer(createRuntimeStub(), async (baseUrl) => {
    const parentTaskResponse = await fetch(`${baseUrl}/api/core/tasks`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        task: {
          id: 'task-inspection-route-parent',
          title: 'Inspect task route parent',
          status: 'in_progress',
          conversationId: 'conversation-channel-inspection-route',
          createdAt: '2026-03-26T14:00:00.000Z',
        },
      }),
    });
    assert.equal(parentTaskResponse.status, 201);

    const taskResponse = await fetch(`${baseUrl}/api/core/tasks`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        task: {
          id: 'task-inspection-route',
          title: 'Inspect task route',
          status: 'pending_approval',
          parentTaskId: 'task-inspection-route-parent',
          conversationId: 'conversation-channel-inspection-route',
          createdAt: '2026-03-26T14:05:00.000Z',
          metadata: writeOrchestratorDispatchReplayMetadata(
            writeTaskPlanningMetadata(
              {
                effectiveDeliveryMode: 'commit_only',
                effectiveDeliveryGates: ['owner_approval_required'],
              },
              {
                strategyHint: 'tree_of_thoughts',
                acceptanceCriteria: 'Summarize the blocked rollout before retrying.',
                strategyContext: {
                  phase: 'review',
                  strict: true,
                },
                dependsOnTaskIds: ['task-inspection-route-parent'],
                productHint: 'code',
                transfer: {
                  suggestedProduct: 'code',
                  rationale: 'Implementation should continue in Cats Code.',
                },
              },
            ),
            buildOrchestratorDispatchReplayRequest({
              channelId: 'channel-inspection-route',
              body: 'Retry the blocked rollout after approval.',
              recordedAt: '2026-03-26T14:10:00.000Z',
            }),
            {
              replayState: 'failed',
              replayTrigger: 'retry',
              replayAttemptAt: '2026-03-26T14:11:00.000Z',
              replayError: 'rate limited',
              sourceMessageId: 'message-inspection-route',
            },
          ),
        },
      }),
    });
    assert.equal(taskResponse.status, 201);

    const siblingTaskResponse = await fetch(`${baseUrl}/api/core/tasks`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        task: {
          id: 'task-inspection-route-sibling',
          title: 'Inspect task route sibling',
          status: 'approved',
          parentTaskId: 'task-inspection-route-parent',
          conversationId: 'conversation-channel-inspection-route',
          createdAt: '2026-03-26T14:05:30.000Z',
        },
      }),
    });
    assert.equal(siblingTaskResponse.status, 201);

    const childCompleteResponse = await fetch(`${baseUrl}/api/core/tasks`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        task: {
          id: 'task-inspection-route-child-complete',
          title: 'Inspect task route child complete',
          status: 'completed',
          parentTaskId: 'task-inspection-route',
          conversationId: 'conversation-channel-inspection-route',
          createdAt: '2026-03-26T14:06:00.000Z',
        },
      }),
    });
    assert.equal(childCompleteResponse.status, 201);

    const childBlockedResponse = await fetch(`${baseUrl}/api/core/tasks`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        task: {
          id: 'task-inspection-route-child-blocked',
          title: 'Inspect task route child blocked',
          status: 'blocked',
          parentTaskId: 'task-inspection-route',
          conversationId: 'conversation-channel-inspection-route',
          createdAt: '2026-03-26T14:06:30.000Z',
        },
      }),
    });
    assert.equal(childBlockedResponse.status, 201);

    const approvalResponse = await fetch(`${baseUrl}/api/core/approvals`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        taskId: 'task-inspection-route',
        status: 'pending',
        requestedByActorId: 'actor-orchestrator-global',
        notes: 'Need approval before retry.',
      }),
    });
    assert.equal(approvalResponse.status, 200);

    const runResponse = await fetch(`${baseUrl}/api/core/runs`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        run: {
          id: 'run-inspection-route',
          title: 'Inspection run',
          status: 'blocked',
          conversationId: 'conversation-channel-inspection-route',
          taskId: 'task-inspection-route',
          summary: 'Blocked while waiting for approval.',
          metadata: {
            workflowStageId: 'continuation_handoff',
            workflowShape: 'sequential',
            dispatchCount: 1,
            continuationCount: 1,
            targetCount: 1,
          },
        },
      }),
    });
    assert.equal(runResponse.status, 201);

    const checkpointResponse = await fetch(`${baseUrl}/api/core/checkpoints`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        checkpoint: {
          id: 'checkpoint-inspection-route',
          label: 'owner-gate',
          status: 'open',
          conversationId: 'conversation-channel-inspection-route',
          taskId: 'task-inspection-route',
          runId: 'run-inspection-route',
          summary: 'Awaiting approval.',
        },
      }),
    });
    assert.equal(checkpointResponse.status, 201);

    const outcomeResponse = await fetch(`${baseUrl}/api/core/outcomes`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        outcome: {
          id: 'outcome-inspection-route',
          title: 'Blocked',
          status: 'blocked',
          conversationId: 'conversation-channel-inspection-route',
          taskId: 'task-inspection-route',
          runId: 'run-inspection-route',
          summary: 'Blocked before retry.',
          createdAt: '2026-03-26T14:11:00.000Z',
          updatedAt: '2026-03-26T14:11:00.000Z',
        },
      }),
    });
    assert.equal(outcomeResponse.status, 201);

    const activityResponse = await fetch(`${baseUrl}/api/core/activities`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        activity: {
          id: 'activity-inspection-route',
          kind: 'note',
          taskId: 'task-inspection-route',
          runId: 'run-inspection-route',
          conversationId: 'conversation-channel-inspection-route',
          message: 'Replay failed after retry.',
          createdAt: '2026-03-26T14:12:00.000Z',
          metadata: {
            source: 'orchestrator-replay',
            replayPhase: 'replay_failed',
          },
        },
      }),
    });
    assert.equal(activityResponse.status, 201);

    const detailResponse = await fetch(`${baseUrl}/api/core/tasks/task-inspection-route`);
    assert.equal(detailResponse.status, 200);
    const detailPayload = await detailResponse.json();
    assert.equal(detailPayload.task.id, 'task-inspection-route');
    assert.equal(detailPayload.inspection.approvalQueueItem.taskId, 'task-inspection-route');
    assert.equal(detailPayload.inspection.latestRun.id, 'run-inspection-route');
    assert.equal(detailPayload.inspection.latestCheckpoint.id, 'checkpoint-inspection-route');
    assert.equal(detailPayload.inspection.latestOutcome.id, 'outcome-inspection-route');
    assert.ok(detailPayload.inspection.latestTimelineItem);
    assert.ok(
      ['activity-inspection-route', 'outcome-inspection-route'].includes(
        detailPayload.inspection.latestTimelineItem.recordId,
      ),
    );
    assert.equal(detailPayload.inspection.governanceSummary.approval.pending, true);
    assert.equal(detailPayload.inspection.workflowSummary.dispatchCount, 1);
    assert.equal(detailPayload.inspection.planning.strategyHint, 'tree_of_thoughts');
    assert.equal(
      detailPayload.inspection.planning.acceptanceCriteria,
      'Summarize the blocked rollout before retrying.',
    );
    assert.deepEqual(detailPayload.inspection.planning.strategyContext, {
      phase: 'review',
      strict: true,
    });
    assert.deepEqual(detailPayload.inspection.planning.dependsOnTaskIds, ['task-inspection-route-parent']);
    assert.equal(detailPayload.inspection.planning.productHint, 'code');
    assert.equal(detailPayload.inspection.planning.transfer.suggestedProduct, 'code');
    assert.equal(detailPayload.inspection.planning.effectiveProduct, 'code');
    assert.equal(detailPayload.inspection.planning.effectiveStrategy, 'tree_of_thoughts');
    assert.equal(detailPayload.inspection.runtimeBridge.product, 'code');
    assert.equal(detailPayload.inspection.runtimeBridge.request.requestedStrategy, 'tree_of_thoughts');
    assert.equal(
      detailPayload.inspection.runtimeBridge.request.acceptanceCriteria,
      'Summarize the blocked rollout before retrying.',
    );
    assert.deepEqual(detailPayload.inspection.runtimeBridge.request.strategyContext, {
      phase: 'review',
      strict: true,
    });
    assert.deepEqual(detailPayload.inspection.runtimeBridge.request.correlation, {
      taskId: 'task-inspection-route',
      conversationId: 'conversation-channel-inspection-route',
      product: 'code',
    });
    assert.equal(detailPayload.inspection.recovery.dispatchReplay.sourceMessageId, 'message-inspection-route');
    assert.equal(detailPayload.inspection.recovery.latestActivity.phase, 'replay_failed');
    assert.equal(detailPayload.inspection.family.rootTaskId, 'task-inspection-route-parent');
    assert.equal(detailPayload.inspection.family.depth, 1);
    assert.equal(detailPayload.inspection.family.parent.taskId, 'task-inspection-route-parent');
    assert.equal(detailPayload.inspection.family.siblingCount, 1);
    assert.equal(detailPayload.inspection.family.childCount, 2);
    assert.equal(detailPayload.inspection.family.terminalChildCount, 2);
    assert.equal(detailPayload.inspection.family.allChildrenTerminal, true);
    assert.equal(detailPayload.inspection.family.childStatusCounts.completed, 1);
    assert.equal(detailPayload.inspection.family.childStatusCounts.blocked, 1);
    assert.deepEqual(
      detailPayload.inspection.family.children.map((child) => child.taskId),
      ['task-inspection-route-child-blocked', 'task-inspection-route-child-complete'],
    );
    assert.deepEqual(detailPayload.inspection.counts, {
      runs: 1,
      outcomes: 1,
      checkpoints: 1,
      traces: 0,
      activities: 2,
    });

    const missingResponse = await fetch(`${baseUrl}/api/core/tasks/task-missing-inspection`);
    assert.equal(missingResponse.status, 404);
  });
});

test('GET /api/core/tasks/:taskId/records returns grouped task-scoped records without the full core snapshot', async () => {
  await withServer(createRuntimeStub(), async (baseUrl) => {
    const taskResponse = await fetch(`${baseUrl}/api/core/tasks`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        task: {
          id: 'task-record-route',
          title: 'Inspect grouped task records',
          status: 'blocked',
          conversationId: 'conversation-channel-record-route',
        },
      }),
    });
    assert.equal(taskResponse.status, 201);

    const otherTaskResponse = await fetch(`${baseUrl}/api/core/tasks`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        task: {
          id: 'task-record-route-other',
          title: 'Other task',
          status: 'draft',
        },
      }),
    });
    assert.equal(otherTaskResponse.status, 201);

    const approvalBindingResponse = await fetch(`${baseUrl}/api/core/approval-bindings`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        approvalBinding: {
          id: 'binding-record-route',
          kind: 'owner_decision',
          approvalTaskId: 'task-record-route',
          subjectKind: 'task',
          subjectId: 'task-record-route',
          requestedForActorId: 'actor-owner',
          conversationId: 'conversation-channel-record-route',
          createdAt: '2026-03-26T14:01:00.000Z',
        },
      }),
    });
    assert.equal(approvalBindingResponse.status, 201);

    const runResponse = await fetch(`${baseUrl}/api/core/runs`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        run: {
          id: 'run-record-route',
          title: 'Grouped run',
          status: 'blocked',
          conversationId: 'conversation-channel-record-route',
          taskId: 'task-record-route',
          createdAt: '2026-03-26T14:02:00.000Z',
        },
      }),
    });
    assert.equal(runResponse.status, 201);

    const runOtherResponse = await fetch(`${baseUrl}/api/core/runs`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        run: {
          id: 'run-record-route-other',
          title: 'Other run',
          status: 'completed',
          taskId: 'task-record-route-other',
          createdAt: '2026-03-26T14:02:30.000Z',
        },
      }),
    });
    assert.equal(runOtherResponse.status, 201);

    const traceResponse = await fetch(`${baseUrl}/api/core/traces`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        trace: {
          id: 'trace-record-route',
          traceId: 'trace-record-route',
          kind: 'status',
          conversationId: 'conversation-channel-record-route',
          taskId: 'task-record-route',
          runId: 'run-record-route',
          message: 'Primary grouped trace',
          createdAt: '2026-03-26T14:03:00.000Z',
        },
      }),
    });
    assert.equal(traceResponse.status, 201);

    const traceOtherResponse = await fetch(`${baseUrl}/api/core/traces`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        trace: {
          id: 'trace-record-route-other',
          traceId: 'trace-record-route-other',
          kind: 'status',
          taskId: 'task-record-route-other',
          message: 'Other grouped trace',
          createdAt: '2026-03-26T14:03:30.000Z',
        },
      }),
    });
    assert.equal(traceOtherResponse.status, 201);

    const checkpointResponse = await fetch(`${baseUrl}/api/core/checkpoints`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        checkpoint: {
          id: 'checkpoint-record-route',
          label: 'review',
          status: 'open',
          conversationId: 'conversation-channel-record-route',
          taskId: 'task-record-route',
          runId: 'run-record-route',
          summary: 'Waiting for review.',
          createdAt: '2026-03-26T14:04:00.000Z',
        },
      }),
    });
    assert.equal(checkpointResponse.status, 201);

    const outcomeResponse = await fetch(`${baseUrl}/api/core/outcomes`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        outcome: {
          id: 'outcome-record-route',
          title: 'Blocked',
          status: 'blocked',
          conversationId: 'conversation-channel-record-route',
          taskId: 'task-record-route',
          runId: 'run-record-route',
          summary: 'Still blocked.',
          recordedAt: '2026-03-26T14:05:00.000Z',
        },
      }),
    });
    assert.equal(outcomeResponse.status, 201);

    const activityResponse = await fetch(`${baseUrl}/api/core/activities`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        activity: {
          id: 'activity-record-route',
          kind: 'note',
          conversationId: 'conversation-channel-record-route',
          taskId: 'task-record-route',
          runId: 'run-record-route',
          message: 'Grouped task activity.',
          createdAt: '2026-03-26T14:06:00.000Z',
        },
      }),
    });
    assert.equal(activityResponse.status, 201);

    const recordsResponse = await fetch(`${baseUrl}/api/core/tasks/task-record-route/records`);
    assert.equal(recordsResponse.status, 200);
    const recordsPayload = await recordsResponse.json();

    assert.equal(recordsPayload.taskId, 'task-record-route');
    assert.equal(recordsPayload.records.taskId, 'task-record-route');
    assert.equal(
      recordsPayload.records.conversationId,
      'conversation-channel-record-route',
    );
    assert.deepEqual(
      recordsPayload.records.approvalBindings.map((record) => record.id),
      ['binding-record-route'],
    );
    assert.deepEqual(recordsPayload.records.runs.map((record) => record.id), [
      'run-record-route',
    ]);
    assert.deepEqual(recordsPayload.records.traces.map((record) => record.id), [
      'trace-record-route',
    ]);
    assert.deepEqual(recordsPayload.records.checkpoints.map((record) => record.id), [
      'checkpoint-record-route',
    ]);
    assert.deepEqual(recordsPayload.records.outcomes.map((record) => record.id), [
      'outcome-record-route',
    ]);
    assert.deepEqual(recordsPayload.records.activities.map((record) => record.id), [
      'activity-record-route',
    ]);
    assert.equal(
      recordsPayload.records.runs.some((record) => record.id === 'run-record-route-other'),
      false,
    );
    assert.equal(
      recordsPayload.records.traces.some((record) => record.id === 'trace-record-route-other'),
      false,
    );

    const missingResponse = await fetch(`${baseUrl}/api/core/tasks/task-missing/records`);
    assert.equal(missingResponse.status, 404);
    const missingPayload = await missingResponse.json();
    assert.equal(missingPayload.error.code, 'task_not_found');
  });
});

test('GET /api/core/tasks/:taskId/timeline returns a normalized task execution narrative', async () => {
  const fixtures = createSharedCoreFixtureBundle();

  await withServer(createRuntimeStub(), async (baseUrl) => {
    const taskResponse = await fetch(`${baseUrl}/api/core/tasks`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        task: {
          ...fixtures.task,
          status: 'blocked',
        },
      }),
    });
    assert.equal(taskResponse.status, 201);

    const approvalResponse = await fetch(`${baseUrl}/api/core/approvals`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(fixtures.approvalDecision),
    });
    assert.equal(approvalResponse.status, 200);

    const approvalBindingResponse = await fetch(`${baseUrl}/api/core/approval-bindings`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        approvalBinding: {
          ...fixtures.approvalBinding,
          subjectKind: 'task',
          subjectId: fixtures.task.id,
        },
      }),
    });
    assert.equal(approvalBindingResponse.status, 201);

    const runResponse = await fetch(`${baseUrl}/api/core/runs`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        run: {
          ...fixtures.run,
          status: 'blocked',
          summary: 'Blocked while waiting for retry.',
        },
      }),
    });
    assert.equal(runResponse.status, 201);

    const traceResponse = await fetch(`${baseUrl}/api/core/traces`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ trace: fixtures.trace }),
    });
    assert.equal(traceResponse.status, 201);

    const checkpointResponse = await fetch(`${baseUrl}/api/core/checkpoints`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        checkpoint: {
          ...fixtures.checkpoint,
          summary: 'Review the recovery step.',
        },
      }),
    });
    assert.equal(checkpointResponse.status, 201);

    const outcomeResponse = await fetch(`${baseUrl}/api/core/outcomes`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        outcome: {
          ...fixtures.outcome,
          status: 'blocked',
          summary: 'Outcome stayed blocked pending operator retry.',
        },
      }),
    });
    assert.equal(outcomeResponse.status, 201);

    const operatorActivityResponse = await fetch(`${baseUrl}/api/core/activities`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        activity: {
          id: 'activity-system-operator',
          kind: 'operator_action',
          actorId: 'actor-owner',
          conversationId: fixtures.task.conversationId,
          taskId: fixtures.task.id,
          runId: fixtures.run.id,
          message: 'Operator requested a retry.',
          createdAt: '2026-03-21T01:01:00.000Z',
          metadata: {
            source: 'core-operator-actions',
          },
        },
      }),
    });
    assert.equal(operatorActivityResponse.status, 201);

    const recoveryActivityResponse = await fetch(`${baseUrl}/api/core/activities`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        activity: {
          id: 'activity-system-recovery',
          kind: 'note',
          conversationId: fixtures.task.conversationId,
          taskId: fixtures.task.id,
          message: 'Dispatch replay failed during startup recovery.',
          createdAt: '2026-03-21T01:02:00.000Z',
          metadata: {
            source: 'orchestrator-startup-recovery',
            replayPhase: 'replay_failed',
            replayTrigger: 'startup_recovery',
          },
        },
      }),
    });
    assert.equal(recoveryActivityResponse.status, 201);

    const timelineResponse = await fetch(`${baseUrl}/api/core/tasks/${fixtures.task.id}/timeline`);
    assert.equal(timelineResponse.status, 200);
    const timelinePayload = await timelineResponse.json();

    assert.equal(timelinePayload.taskId, fixtures.task.id);
    assert.equal(timelinePayload.summary.totalAvailable, 9);
    assert.equal(timelinePayload.summary.matching, 9);
    assert.equal(timelinePayload.summary.returned, 9);
    assert.equal(
      timelinePayload.timeline.latestTimestamp,
      timelinePayload.timeline.items[0]?.timestamp ?? null,
    );
    assert.deepEqual(timelinePayload.timeline.counts, {
      total: 9,
      taskLifecycle: 1,
      governance: 2,
      execution: 2,
      workflow: 2,
      recovery: 1,
      operator: 1,
    });
    assert.deepEqual(
      timelinePayload.timeline.items.find((item) => item.recordId === 'activity-system-recovery'),
      {
        timelineId: 'activity:activity-system-recovery',
        kind: 'activity',
        recordId: 'activity-system-recovery',
        category: 'recovery',
        timestamp: '2026-03-21T01:02:00.000Z',
        status: 'note',
        title: 'Note',
        summary: 'Dispatch replay failed during startup recovery.',
        taskId: fixtures.task.id,
        conversationId: fixtures.task.conversationId,
        runId: null,
        traceId: null,
        actorId: null,
      },
    );
    assert.deepEqual(
      timelinePayload.timeline.items.find((item) => item.recordId === 'activity-system-operator'),
      {
        timelineId: 'activity:activity-system-operator',
        kind: 'activity',
        recordId: 'activity-system-operator',
        category: 'operator',
        timestamp: '2026-03-21T01:01:00.000Z',
        status: 'operator_action',
        title: 'Operator action',
        summary: 'Operator requested a retry.',
        taskId: fixtures.task.id,
        conversationId: fixtures.task.conversationId,
        runId: fixtures.run.id,
        traceId: null,
        actorId: 'actor-owner',
      },
    );
    assert.equal(
      timelinePayload.timeline.items.find((item) => item.kind === 'task')?.recordId,
      fixtures.task.id,
    );
    assert.equal(
      timelinePayload.timeline.items.find((item) => item.kind === 'run')?.traceId,
      fixtures.run.traceId,
    );

    const filteredTimelineResponse = await fetch(
      `${baseUrl}/api/core/tasks/${fixtures.task.id}/timeline?category=recovery&kind=activity&limit=1`,
    );
    assert.equal(filteredTimelineResponse.status, 200);
    const filteredTimelinePayload = await filteredTimelineResponse.json();
    assert.equal(filteredTimelinePayload.summary.totalAvailable, 9);
    assert.equal(filteredTimelinePayload.summary.matching, 1);
    assert.equal(filteredTimelinePayload.summary.returned, 1);
    assert.deepEqual(
      filteredTimelinePayload.timeline.items.map((item) => item.recordId),
      ['activity-system-recovery'],
    );
    assert.equal(filteredTimelinePayload.timeline.counts.recovery, 1);
    assert.equal(filteredTimelinePayload.timeline.counts.total, 1);
  });
});

test('core control-plane routes expose grouped operator actions and workflow attention signals', async () => {
  await withServer(createRuntimeStub(), async (baseUrl) => {
    const taskResponse = await fetch(`${baseUrl}/api/core/tasks`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        task: {
          id: 'task-control-plane-route',
          title: 'Inspect control-plane route',
          status: 'pending_approval',
          conversationId: 'conversation-channel-control-plane-route',
          metadata: writeTaskPlanningMetadata(
            writeWorkflowContinuationReplayMetadata(
              writeOrchestratorDispatchReplayMetadata(
                {
                  effectiveDeliveryPolicy: {
                    mode: 'commit_only',
                    gates: ['owner_approval_required'],
                    source: 'task_override',
                    rationale: 'Owner-gated retry.',
                  },
                  channelId: 'channel-control-plane-route',
                  transport: 'web',
                  roomRoutingMode: 'boss_chat',
                },
                buildOrchestratorDispatchReplayRequest({
                  channelId: 'channel-control-plane-route',
                  body: 'Retry the blocked rollout after approval.',
                  recordedAt: '2026-03-26T14:20:00.000Z',
                }),
                {
                  replayState: 'failed',
                  replayTrigger: 'retry',
                  replayAttemptAt: '2026-03-26T14:21:00.000Z',
                  replayError: 'rate limited',
                  sourceMessageId: 'message-control-plane-route',
                },
              ),
              buildWorkflowContinuationReplayRequest({
                channelId: 'channel-control-plane-route',
                checkpointId: 'checkpoint-control-plane-route',
                sourceMessageId: 'message-control-plane-route',
                sourceParticipant: {
                  participantKind: 'orchestrator',
                  participantId: 'actor-orchestrator-global',
                  participantName: 'Orchestrator',
                },
                targets: [
                  {
                    participantKind: 'cat',
                    participantId: 'cat-reviewer',
                    participantName: 'Reviewer',
                  },
                ],
                trigger: 'continuation_mention',
                branchStrategy: 'transplant_context',
                workflowStageId: 'continuation_handoff',
                workflowShape: 'converge',
                reviewRequired: true,
                continuationSource: 'workflow_recommendation',
                unresolvedTargets: ['Reviewer'],
                blockedReason: 'anti_ping_pong',
                recordedAt: '2026-03-26T14:22:00.000Z',
              }),
              {
                replayState: 'failed',
                replayTrigger: 'retry',
                replayAttemptAt: '2026-03-26T14:23:00.000Z',
                replayError: 'reviewer offline',
              },
            ),
            {
              productHint: 'code',
              strategyHint: 'reflexion',
            },
          ),
        },
      }),
    });
    assert.equal(taskResponse.status, 201);

    const otherTaskResponse = await fetch(`${baseUrl}/api/core/tasks`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        task: {
          id: 'task-control-plane-other',
          title: 'Other task',
          status: 'draft',
        },
      }),
    });
    assert.equal(otherTaskResponse.status, 201);

    const approvalResponse = await fetch(`${baseUrl}/api/core/approvals`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        taskId: 'task-control-plane-route',
        status: 'pending',
        requestedByActorId: 'actor-orchestrator-global',
        notes: 'Need approval before retry.',
      }),
    });
    assert.equal(approvalResponse.status, 200);

    const runResponse = await fetch(`${baseUrl}/api/core/runs`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        run: {
          id: 'run-control-plane-route',
          title: 'Blocked run',
          status: 'blocked',
          conversationId: 'conversation-channel-control-plane-route',
          taskId: 'task-control-plane-route',
          metadata: {
            workflowStageId: 'continuation_handoff',
            workflowShape: 'sequential',
            dispatchCount: 1,
            continuationCount: 1,
            targetCount: 1,
          },
        },
      }),
    });
    assert.equal(runResponse.status, 201);

    const checkpointResponse = await fetch(`${baseUrl}/api/core/checkpoints`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        checkpoint: {
          id: 'checkpoint-control-plane-route',
          label: 'review',
          status: 'open',
          conversationId: 'conversation-channel-control-plane-route',
          taskId: 'task-control-plane-route',
          runId: 'run-control-plane-route',
          summary: 'Review the reroute recommendation.',
          metadata: {
            continuationSource: 'workflow_recommendation',
            unresolvedTargets: ['Reviewer'],
            workflowRecommendation: {
              source: 'checkpoint',
              workflowShape: 'converge',
              branchStrategy: 'single_target_review',
              rationale: 'Need reviewer signoff before continuing.',
              reviewRequired: true,
              candidateTargets: [
                {
                  participantKind: 'cat',
                  participantId: 'cat-reviewer',
                  participantName: 'Reviewer',
                },
              ],
            },
          },
        },
      }),
    });
    assert.equal(checkpointResponse.status, 201);

    const listResponse = await fetch(`${baseUrl}/api/core/control-plane/tasks`);
    assert.equal(listResponse.status, 200);
    const listPayload = await listResponse.json();
    assert.deepEqual(listPayload.tasks.map((task) => task.taskId), [
      'task-control-plane-route',
    ]);
    assert.equal(listPayload.tasks[0].latestTimelineItem.recordId, 'checkpoint-control-plane-route');
    assert.equal(listPayload.tasks[0].latestTimelineItem.category, 'workflow');
    assert.deepEqual(listPayload.tasks[0].attention.reasons, [
      'approval_pending',
      'run_blocked',
      'retry_available',
      'workflow_review_required',
    ]);
    assert.deepEqual(listPayload.tasks[0].nextActions.map((action) => action.kind), [
      'approve',
      'reroute',
      'reject',
      'retry',
      'acknowledge',
    ]);
    assert.equal(listPayload.tasks[0].planning.effectiveProduct, 'code');
    assert.equal(listPayload.tasks[0].runtimeBridge.request.requestedStrategy, 'reflexion');

    const detailResponse = await fetch(
      `${baseUrl}/api/core/tasks/task-control-plane-route/control-plane`,
    );
    assert.equal(detailResponse.status, 200);
    const detailPayload = await detailResponse.json();
    assert.equal(detailPayload.controlPlane.taskId, 'task-control-plane-route');
    assert.equal(detailPayload.controlPlane.planning.effectiveProduct, 'code');
    assert.equal(detailPayload.controlPlane.runtimeBridge.product, 'code');
    assert.equal(detailPayload.controlPlane.runtimeBridge.request.requestedStrategy, 'reflexion');
    assert.equal(detailPayload.controlPlane.latestTimelineItem.recordId, 'checkpoint-control-plane-route');
    assert.equal(detailPayload.controlPlane.latestTimelineItem.category, 'workflow');
    assert.equal(
      detailPayload.controlPlane.latestTimelineItem.summary,
      'Review the reroute recommendation.',
    );
    assert.equal(
      detailPayload.controlPlane.latestWorkflowRecommendation.reviewRequired,
      true,
    );
    assert.equal(
      detailPayload.controlPlane.latestWorkflowRecommendation.candidateTargets[0].participantName,
      'Reviewer',
    );
    assert.deepEqual(
      detailPayload.controlPlane.governanceSummary.runtimeDeliveryManifest.requestedActions,
      ['create_commit'],
    );
    assert.equal(detailPayload.controlPlane.recovery.dispatchReplay.replayState, 'failed');
    assert.equal(detailPayload.controlPlane.workflowContinuation.checkpointId, 'checkpoint-control-plane-route');
    assert.equal(detailPayload.controlPlane.workflowContinuation.stageId, 'continuation_handoff');
    assert.equal(detailPayload.controlPlane.workflowContinuation.workflowShape, 'converge');
    assert.equal(
      detailPayload.controlPlane.workflowContinuation.continuationSource,
      'workflow_recommendation',
    );
    assert.equal(
      detailPayload.controlPlane.workflowContinuation.blockedReason,
      'anti_ping_pong',
    );
    assert.deepEqual(detailPayload.controlPlane.workflowContinuation.targetNames, ['Reviewer']);
    assert.deepEqual(
      detailPayload.controlPlane.workflowContinuation.unresolvedTargets,
      ['Reviewer'],
    );
    assert.equal(detailPayload.controlPlane.workflowContinuation.replayState, 'failed');
    assert.equal(detailPayload.controlPlane.workflowContinuation.replayError, 'reviewer offline');
    assert.equal(detailPayload.controlPlane.workflowContinuation.retryAvailable, true);
    assert.equal(detailPayload.controlPlane.runtimeDeliveryIntent.mode, 'commit_only');
    assert.equal(detailPayload.controlPlane.runtimeDeliveryIntent.source, 'task_override');
    assert.deepEqual(detailPayload.controlPlane.runtimeDeliveryIntent.gates, [
      'owner_approval_required',
    ]);
    assert.deepEqual(detailPayload.controlPlane.runtimeDeliveryIntent.requestedActions, [
      'create_commit',
    ]);
    assert.equal(detailPayload.controlPlane.runtimeDeliveryIntent.strict, true);
    assert.equal(detailPayload.controlPlane.runtimeDeliveryIntent.requiresOwnerDecision, true);
    assert.equal(detailPayload.controlPlane.runtimeDeliveryIntent.approvalPending, true);
    assert.equal(detailPayload.controlPlane.runtimeDeliveryIntent.channelId, 'channel-control-plane-route');
    assert.equal(
      detailPayload.controlPlane.runtimeDeliveryIntent.conversationId,
      'conversation-channel-control-plane-route',
    );
    assert.equal(detailPayload.controlPlane.runtimeDeliveryIntent.taskId, 'task-control-plane-route');
    assert.equal(detailPayload.controlPlane.runtimeDeliveryIntent.roomMode, 'boss_chat');
    assert.equal(detailPayload.controlPlane.runtimeDeliveryIntent.transport, 'web');
    assert.equal(
      detailPayload.controlPlane.runtimeDeliveryIntent.workflowStageId,
      'continuation_handoff',
    );
    assert.equal(detailPayload.controlPlane.runtimeDeliveryIntent.workflowShape, 'converge');

    const missingResponse = await fetch(
      `${baseUrl}/api/core/tasks/task-missing/control-plane`,
    );
    assert.equal(missingResponse.status, 404);
    const missingPayload = await missingResponse.json();
    assert.equal(missingPayload.error.code, 'task_not_found');
  });
});

test('core control-plane routes expose family-aware wait state for parent tasks with active children', async () => {
  await withServer(createRuntimeStub(), async (baseUrl) => {
    const parentResponse = await fetch(`${baseUrl}/api/core/tasks`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        task: {
          id: 'task-control-plane-family-parent',
          title: 'Family parent task',
          status: 'in_progress',
          conversationId: 'conversation-channel-control-plane-family',
          createdAt: '2026-03-26T14:30:00.000Z',
        },
      }),
    });
    assert.equal(parentResponse.status, 201);

    const childActiveResponse = await fetch(`${baseUrl}/api/core/tasks`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        task: {
          id: 'task-control-plane-family-child-active',
          title: 'Family active child',
          status: 'in_progress',
          parentTaskId: 'task-control-plane-family-parent',
          conversationId: 'conversation-channel-control-plane-family',
          createdAt: '2026-03-26T14:31:00.000Z',
        },
      }),
    });
    assert.equal(childActiveResponse.status, 201);

    const childDoneResponse = await fetch(`${baseUrl}/api/core/tasks`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        task: {
          id: 'task-control-plane-family-child-done',
          title: 'Family completed child',
          status: 'completed',
          parentTaskId: 'task-control-plane-family-parent',
          conversationId: 'conversation-channel-control-plane-family',
          createdAt: '2026-03-26T14:32:00.000Z',
        },
      }),
    });
    assert.equal(childDoneResponse.status, 201);

    const listResponse = await fetch(
      `${baseUrl}/api/core/control-plane/tasks?reason=child_tasks_in_progress&nextAction=wait`,
    );
    assert.equal(listResponse.status, 200);
    const listPayload = await listResponse.json();
    assert.deepEqual(listPayload.tasks.map((task) => task.taskId), [
      'task-control-plane-family-parent',
    ]);
    assert.deepEqual(listPayload.tasks[0].attention.reasons, [
      'child_tasks_in_progress',
    ]);
    assert.equal(listPayload.tasks[0].attention.severity, 'progress');
    assert.deepEqual(listPayload.tasks[0].nextActions.map((action) => action.kind), ['wait']);
    assert.equal(listPayload.tasks[0].nextActions[0].label, 'Wait for child tasks');
    assert.equal(listPayload.tasks[0].family.childCount, 2);
    assert.equal(listPayload.tasks[0].family.terminalChildCount, 1);
    assert.equal(listPayload.tasks[0].family.allChildrenTerminal, false);
    assert.equal(listPayload.summary.withChildrenCount, 1);
    assert.equal(listPayload.summary.withActiveChildrenCount, 1);

    const detailResponse = await fetch(
      `${baseUrl}/api/core/tasks/task-control-plane-family-parent/control-plane`,
    );
    assert.equal(detailResponse.status, 200);
    const detailPayload = await detailResponse.json();
    assert.equal(detailPayload.controlPlane.family.childCount, 2);
    assert.equal(detailPayload.controlPlane.family.terminalChildCount, 1);
    assert.equal(detailPayload.controlPlane.family.allChildrenTerminal, false);
    assert.deepEqual(detailPayload.controlPlane.attention.reasons, [
      'child_tasks_in_progress',
    ]);
    assert.deepEqual(
      detailPayload.controlPlane.nextActions.map((action) => action.kind),
      ['wait'],
    );
  });
});

test('GET /api/core/operator-inbox returns actionable task summaries with latest timeline context', async () => {
  const metadata = writeOrchestratorDispatchReplayMetadata(
    {},
    buildOrchestratorDispatchReplayRequest({
      channelId: 'channel-operator-inbox',
      body: 'Retry the blocked rollout.',
      recordedAt: '2026-03-26T17:50:00.000Z',
    }),
    {
      replayState: 'failed',
      replayTrigger: 'retry',
      replayAttemptAt: '2026-03-26T17:55:00.000Z',
      replayError: 'rate limited',
    },
  );

  await withServer(createRuntimeStub(), async (baseUrl) => {
    const taskResponse = await fetch(`${baseUrl}/api/core/tasks`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        task: {
          id: 'task-operator-inbox',
          title: 'Operator inbox task',
          status: 'pending_approval',
          conversationId: 'conversation-channel-operator-inbox',
          summary: 'Needs operator attention.',
          metadata,
          createdAt: '2026-03-26T17:40:00.000Z',
        },
      }),
    });
    assert.equal(taskResponse.status, 201);

    const approvalResponse = await fetch(`${baseUrl}/api/core/approvals`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        taskId: 'task-operator-inbox',
        status: 'pending',
        requestedByActorId: 'actor-orchestrator-global',
        notes: 'Need owner approval.',
      }),
    });
    assert.equal(approvalResponse.status, 200);

    const runResponse = await fetch(`${baseUrl}/api/core/runs`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        run: {
          id: 'run-operator-inbox',
          title: 'Blocked run',
          status: 'blocked',
          taskId: 'task-operator-inbox',
          conversationId: 'conversation-channel-operator-inbox',
          summary: 'Run blocked pending retry.',
          createdAt: '2026-03-26T17:45:00.000Z',
          metadata: {
            workflowStageId: 'continuation_handoff',
            workflowShape: 'sequential',
          },
        },
      }),
    });
    assert.equal(runResponse.status, 201);

    const checkpointResponse = await fetch(`${baseUrl}/api/core/checkpoints`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        checkpoint: {
          id: 'checkpoint-operator-inbox',
          label: 'review',
          status: 'open',
          taskId: 'task-operator-inbox',
          runId: 'run-operator-inbox',
          summary: 'Review before continuing.',
          createdAt: '2026-03-26T17:46:00.000Z',
          metadata: {
            continuationSource: 'workflow_recommendation',
            workflowRecommendation: {
              source: 'checkpoint',
              workflowShape: 'converge',
              reviewRequired: true,
              candidateTargets: [
                {
                  participantKind: 'cat',
                  participantId: 'cat-reviewer',
                  participantName: 'Reviewer',
                },
              ],
            },
          },
        },
      }),
    });
    assert.equal(checkpointResponse.status, 201);

    const recoveryActivityResponse = await fetch(`${baseUrl}/api/core/activities`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        activity: {
          id: 'activity-operator-inbox-recovery',
          kind: 'note',
          taskId: 'task-operator-inbox',
          conversationId: 'conversation-channel-operator-inbox',
          message: 'Dispatch replay failed during startup recovery.',
          createdAt: '2026-03-26T17:59:00.000Z',
          metadata: {
            source: 'orchestrator-startup-recovery',
            replayTrigger: 'retry',
            replayPhase: 'replay_failed',
          },
        },
      }),
    });
    assert.equal(recoveryActivityResponse.status, 201);

    const inboxResponse = await fetch(`${baseUrl}/api/core/operator-inbox`);
    assert.equal(inboxResponse.status, 200);
    const inboxPayload = await inboxResponse.json();

    assert.equal(inboxPayload.tasks.length, 1);
    assert.equal(inboxPayload.tasks[0].taskId, 'task-operator-inbox');
    assert.equal(inboxPayload.tasks[0].taskTitle, 'Operator inbox task');
    assert.equal(inboxPayload.tasks[0].attention.severity, 'attention');
    assert.deepEqual(inboxPayload.tasks[0].attention.reasons, [
      'approval_pending',
      'run_blocked',
      'retry_available',
      'workflow_review_required',
    ]);
    assert.equal(inboxPayload.tasks[0].family.rootTaskId, 'task-operator-inbox');
    assert.equal(inboxPayload.tasks[0].family.childCount, 0);
    assert.equal(inboxPayload.tasks[0].latestTimelineItem.category, 'recovery');
    assert.equal(
      inboxPayload.tasks[0].latestTimelineItem.summary,
      'Dispatch replay failed during startup recovery.',
    );
    assert.deepEqual(
      inboxPayload.tasks[0].nextActions.map((action) => action.kind),
      ['approve', 'reroute', 'reject', 'retry', 'acknowledge'],
    );
  });
});

test('core operator inspection routes support additive filters and summaries', async () => {
  await withServer(createRuntimeStub(), async (baseUrl) => {
    const rootTaskResponse = await fetch(`${baseUrl}/api/core/tasks`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        task: {
          id: 'task-ops-root',
          title: 'Ops root task',
          status: 'in_progress',
          conversationId: 'conversation-channel-ops',
        },
      }),
    });
    assert.equal(rootTaskResponse.status, 201);

    const attentionTaskResponse = await fetch(`${baseUrl}/api/core/tasks`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        task: {
          id: 'task-ops-attention',
          title: 'Attention task',
          status: 'pending_approval',
          parentTaskId: 'task-ops-root',
          conversationId: 'conversation-channel-ops',
          metadata: writeOrchestratorDispatchReplayMetadata(
            {
              effectiveDeliveryPolicy: {
                mode: 'commit_only',
                gates: ['owner_approval_required'],
                source: 'task_override',
                rationale: 'Owner-approved retry.',
              },
              channelId: 'channel-ops',
              transport: 'web',
              roomRoutingMode: 'boss_chat',
            },
            buildOrchestratorDispatchReplayRequest({
              channelId: 'channel-ops',
              body: 'Retry the blocked rollout.',
              recordedAt: '2026-03-26T18:10:00.000Z',
            }),
            {
              replayState: 'failed',
              replayTrigger: 'retry',
              replayAttemptAt: '2026-03-26T18:11:00.000Z',
              replayError: 'rate limited',
            },
          ),
        },
      }),
    });
    assert.equal(attentionTaskResponse.status, 201);

    const approvalResponse = await fetch(`${baseUrl}/api/core/approvals`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        taskId: 'task-ops-attention',
        status: 'pending',
        requestedByActorId: 'actor-orchestrator-global',
        notes: 'Need approval before retry.',
      }),
    });
    assert.equal(approvalResponse.status, 200);

    const attentionRunResponse = await fetch(`${baseUrl}/api/core/runs`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        run: {
          id: 'run-ops-attention',
          title: 'Blocked run',
          status: 'blocked',
          taskId: 'task-ops-attention',
          conversationId: 'conversation-channel-ops',
          summary: 'Blocked pending operator review.',
          metadata: {
            workflowStageId: 'continuation_handoff',
            workflowShape: 'sequential',
          },
        },
      }),
    });
    assert.equal(attentionRunResponse.status, 201);

    const workflowTaskResponse = await fetch(`${baseUrl}/api/core/tasks`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        task: {
          id: 'task-ops-workflow',
          title: 'Workflow task',
          status: 'blocked',
          parentTaskId: 'task-ops-root',
          conversationId: 'conversation-channel-ops',
          metadata: writeTaskPlanningMetadata(
            writeWorkflowContinuationReplayMetadata(
              {
                effectiveDeliveryPolicy: {
                  mode: 'commit_only',
                  gates: ['owner_approval_required'],
                  source: 'task_override',
                  rationale: 'Workflow retry with owner gate.',
                },
                roomRoutingMode: 'boss_chat',
              },
              buildWorkflowContinuationReplayRequest({
                channelId: 'channel-ops',
                checkpointId: 'checkpoint-ops',
                sourceMessageId: 'message-ops',
                continuationSource: 'workflow_recommendation',
                sourceParticipant: {
                  participantKind: 'cat',
                  participantId: 'cat-inline',
                  participantName: 'Inline-Agent',
                },
                targets: [
                  {
                    participantKind: 'cat',
                    participantId: 'cat-reviewer',
                    participantName: 'Reviewer',
                  },
                ],
                workflowStageId: 'continuation_handoff',
                workflowShape: 'converge',
                reviewRequired: true,
                blockedReason: 'max_dispatches',
                unresolvedTargets: ['Reviewer'],
                recordedAt: '2026-03-26T18:12:00.000Z',
              }),
              {
                replayState: 'failed',
                replayTrigger: 'retry',
                replayAttemptAt: '2026-03-26T18:13:00.000Z',
                replayError: 'checkpoint guard',
              },
            ),
            {
              productHint: 'code',
              strategyHint: 'reflexion',
            },
          ),
        },
      }),
    });
    assert.equal(workflowTaskResponse.status, 201);

    const workflowRunResponse = await fetch(`${baseUrl}/api/core/runs`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        run: {
          id: 'run-ops-workflow',
          title: 'Blocked workflow run',
          status: 'blocked',
          taskId: 'task-ops-workflow',
          conversationId: 'conversation-channel-ops',
          summary: 'Blocked while waiting for workflow continuation retry.',
        },
      }),
    });
    assert.equal(workflowRunResponse.status, 201);

    const replayActivityResponse = await fetch(`${baseUrl}/api/core/activities`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        activity: {
          id: 'activity-ops-workflow-replay',
          kind: 'note',
          taskId: 'task-ops-workflow',
          conversationId: 'conversation-channel-ops',
          message: 'Workflow continuation replay failed after target recovery.',
          createdAt: '2026-03-01T00:00:00.000Z',
          metadata: {
            source: 'workflow-continuation-replay',
            replayTrigger: 'retry',
            replayPhase: 'replay_failed',
            resumeReason: 'target_recovered',
          },
        },
      }),
    });
    assert.equal(replayActivityResponse.status, 201);

    const inboxResponse = await fetch(
      `${baseUrl}/api/core/operator-inbox?conversationId=conversation-channel-ops&executionProduct=code&requestedStrategy=reflexion&nextAction=retry&needsOperatorAttention=true&deliveryMode=commit_only&deliveryAction=create_commit&workflowStageId=continuation_handoff&workflowShape=converge&workflowReviewRequired=true&workflowConvergeTargetId=cat-reviewer&workflowContinuationSource=workflow_recommendation&workflowUnresolvedTarget=Reviewer&hasUnresolvedWorkflowTargets=true&workflowContinuationBlockedReason=max_dispatches&latestReplaySource=workflow-continuation-replay&latestReplayTrigger=retry&latestReplayPhase=replay_failed&latestReplayResumeReason=target_recovered&latestTimelineCategory=execution&latestTimelineKind=run&rootTaskId=task-ops-root&parentTaskId=task-ops-root&hasChildren=false&hasActiveChildren=false&limit=1`,
    );
    assert.equal(inboxResponse.status, 200);
    const inboxPayload = await inboxResponse.json();
    assert.equal(inboxPayload.summary.totalAvailable, 2);
    assert.equal(inboxPayload.summary.matching, 1);
    assert.equal(inboxPayload.summary.returned, 1);
    assert.equal(inboxPayload.summary.executionProductCounts.code, 1);
    assert.equal(inboxPayload.summary.requestedStrategyCounts.reflexion, 1);
    assert.equal(inboxPayload.summary.nextActionCounts.retry, 1);
    assert.equal(inboxPayload.summary.attentionSeverityCounts.attention, 1);
    assert.equal(inboxPayload.summary.deliveryModeCounts.commit_only, 1);
    assert.equal(inboxPayload.summary.deliveryActionCounts.create_commit, 1);
    assert.equal(inboxPayload.summary.workflowStageCounts.continuation_handoff, 1);
    assert.equal(inboxPayload.summary.workflowShapeCounts.converge, 1);
    assert.equal(inboxPayload.summary.workflowReviewRequiredCount, 1);
    assert.equal(inboxPayload.summary.workflowConvergeTargetCount, 1);
    assert.equal(inboxPayload.summary.workflowContinuationSourceCounts.workflow_recommendation, 1);
    assert.equal(inboxPayload.summary.withUnresolvedWorkflowTargetsCount, 1);
    assert.equal(inboxPayload.summary.workflowContinuationBlockedReasonCounts.max_dispatches, 1);
    assert.equal(inboxPayload.summary.latestReplaySourceCounts['workflow-continuation-replay'], 1);
    assert.equal(inboxPayload.summary.latestReplayTriggerCounts.retry, 1);
    assert.equal(inboxPayload.summary.latestReplayPhaseCounts.replay_failed, 1);
    assert.equal(inboxPayload.summary.latestReplayResumeReasonCounts.target_recovered, 1);
    assert.equal(inboxPayload.summary.latestTimelineCategoryCounts.execution, 1);
    assert.equal(inboxPayload.summary.latestTimelineKindCounts.run, 1);
    assert.equal(inboxPayload.summary.withChildrenCount, 0);
    assert.equal(inboxPayload.summary.withActiveChildrenCount, 0);
    assert.equal(inboxPayload.tasks.length, 1);
    assert.equal(inboxPayload.tasks[0].family.rootTaskId, 'task-ops-root');
    assert.equal(inboxPayload.tasks[0].family.parent.taskId, 'task-ops-root');
    assert.equal(inboxPayload.tasks[0].planning.effectiveProduct, 'code');
    assert.equal(inboxPayload.tasks[0].runtimeBridge.request.requestedStrategy, 'reflexion');
    assert.equal(inboxPayload.tasks[0].workflowContinuation.convergeTargetId, 'cat-reviewer');

    const controlPlaneResponse = await fetch(
      `${baseUrl}/api/core/control-plane/tasks?conversationId=conversation-channel-ops&executionProduct=code&requestedStrategy=reflexion&reason=retry_available&nextAction=retry&deliveryMode=commit_only&deliveryAction=create_commit&workflowStageId=continuation_handoff&workflowShape=converge&workflowReviewRequired=true&workflowConvergeTargetId=cat-reviewer&workflowContinuationSource=workflow_recommendation&workflowUnresolvedTarget=Reviewer&hasUnresolvedWorkflowTargets=true&workflowContinuationBlockedReason=max_dispatches&latestReplaySource=workflow-continuation-replay&latestReplayTrigger=retry&latestReplayPhase=replay_failed&latestReplayResumeReason=target_recovered&latestTimelineCategory=execution&latestTimelineKind=run&rootTaskId=task-ops-root&parentTaskId=task-ops-root&hasChildren=false&hasActiveChildren=false&limit=1`,
    );
    assert.equal(controlPlaneResponse.status, 200);
    const controlPlanePayload = await controlPlaneResponse.json();
    assert.equal(controlPlanePayload.summary.totalAvailable, 3);
    assert.equal(controlPlanePayload.summary.matching, 1);
    assert.equal(controlPlanePayload.summary.returned, 1);
    assert.equal(controlPlanePayload.summary.executionProductCounts.code, 1);
    assert.equal(controlPlanePayload.summary.requestedStrategyCounts.reflexion, 1);
    assert.equal(controlPlanePayload.summary.reasonCounts.retry_available, 1);
    assert.equal(controlPlanePayload.summary.taskStatusCounts.blocked, 1);
    assert.equal(controlPlanePayload.summary.deliveryModeCounts.commit_only, 1);
    assert.equal(controlPlanePayload.summary.deliveryActionCounts.create_commit, 1);
    assert.equal(controlPlanePayload.summary.workflowStageCounts.continuation_handoff, 1);
    assert.equal(controlPlanePayload.summary.workflowShapeCounts.converge, 1);
    assert.equal(controlPlanePayload.summary.workflowReviewRequiredCount, 1);
    assert.equal(controlPlanePayload.summary.workflowConvergeTargetCount, 1);
    assert.equal(
      controlPlanePayload.summary.workflowContinuationSourceCounts.workflow_recommendation,
      1,
    );
    assert.equal(controlPlanePayload.summary.withUnresolvedWorkflowTargetsCount, 1);
    assert.equal(
      controlPlanePayload.summary.workflowContinuationBlockedReasonCounts.max_dispatches,
      1,
    );
    assert.equal(
      controlPlanePayload.summary.latestReplaySourceCounts['workflow-continuation-replay'],
      1,
    );
    assert.equal(controlPlanePayload.summary.latestReplayTriggerCounts.retry, 1);
    assert.equal(controlPlanePayload.summary.latestReplayPhaseCounts.replay_failed, 1);
    assert.equal(
      controlPlanePayload.summary.latestReplayResumeReasonCounts.target_recovered,
      1,
    );
    assert.equal(controlPlanePayload.summary.latestTimelineCategoryCounts.execution, 1);
    assert.equal(controlPlanePayload.summary.latestTimelineKindCounts.run, 1);
    assert.equal(controlPlanePayload.summary.withChildrenCount, 0);
    assert.equal(controlPlanePayload.summary.withActiveChildrenCount, 0);
    assert.equal(controlPlanePayload.tasks.length, 1);
    assert.equal(controlPlanePayload.tasks[0].planning.effectiveProduct, 'code');
    assert.equal(controlPlanePayload.tasks[0].runtimeBridge.request.requestedStrategy, 'reflexion');
    assert.equal(controlPlanePayload.tasks[0].workflowContinuation.convergeTargetId, 'cat-reviewer');

    const recoveryResponse = await fetch(
      `${baseUrl}/api/core/recovery/tasks?conversationId=conversation-channel-ops&hasWorkflowContinuationReplay=true&workflowContinuationReplayState=failed&workflowContinuationSource=workflow_recommendation&workflowContinuationBlockedReason=max_dispatches&workflowUnresolvedTarget=Reviewer&hasUnresolvedWorkflowTargets=true&canRetry=true&deliveryMode=commit_only&deliveryAction=create_commit&workflowStageId=continuation_handoff&workflowShape=converge&rootTaskId=task-ops-root&parentTaskId=task-ops-root&hasChildren=false&hasActiveChildren=false`,
    );
    assert.equal(recoveryResponse.status, 200);
    const recoveryPayload = await recoveryResponse.json();
    assert.equal(recoveryPayload.summary.totalAvailable, 2);
    assert.equal(recoveryPayload.summary.matching, 1);
    assert.equal(recoveryPayload.summary.returned, 1);
    assert.equal(recoveryPayload.summary.withWorkflowContinuationReplayCount, 1);
    assert.equal(recoveryPayload.summary.withDispatchReplayCount, 0);
    assert.equal(recoveryPayload.summary.pendingDispatchReplayStateCounts.pending, 0);
    assert.equal(recoveryPayload.summary.dispatchReplayStateCounts.ready, 0);
    assert.equal(recoveryPayload.summary.workflowContinuationReplayStateCounts.failed, 1);
    assert.equal(recoveryPayload.summary.workflowContinuationBlockedReasonCounts.max_dispatches, 1);
    assert.equal(recoveryPayload.summary.deliveryModeCounts.commit_only, 1);
    assert.equal(recoveryPayload.summary.deliveryActionCounts.create_commit, 1);
    assert.equal(recoveryPayload.summary.workflowStageCounts.continuation_handoff, 1);
    assert.equal(recoveryPayload.summary.workflowShapeCounts.converge, 1);
    assert.equal(recoveryPayload.summary.workflowReviewRequiredCount, 1);
    assert.equal(recoveryPayload.summary.workflowConvergeTargetCount, 1);
    assert.equal(
      recoveryPayload.summary.workflowContinuationSourceCounts.workflow_recommendation,
      1,
    );
    assert.equal(recoveryPayload.summary.withUnresolvedWorkflowTargetsCount, 1);
    assert.equal(recoveryPayload.summary.withChildrenCount, 0);
    assert.equal(recoveryPayload.summary.withActiveChildrenCount, 0);
    assert.deepEqual(
      recoveryPayload.recoveries.map((recovery) => recovery.taskId),
      ['task-ops-workflow'],
    );
    assert.equal(recoveryPayload.recoveries[0].family.rootTaskId, 'task-ops-root');
    assert.equal(recoveryPayload.recoveries[0].family.parent.taskId, 'task-ops-root');
  });
});

test('core project memory routes persist durable memory, sync canonical records, and expose retrieval context', async () => {
  const chatStore = new MemoryChatStore();
  const fixtures = createSharedCoreFixtureBundle();

  await withServer(createRuntimeStub(), async (baseUrl) => {
    const projectResponse = await fetch(`${baseUrl}/api/core/projects`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ project: fixtures.project }),
    });
    assert.equal(projectResponse.status, 201);

    const createMemoryResponse = await fetch(
      `${baseUrl}/api/core/projects/${fixtures.project.id}/memory`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          category: 'policy',
          content: 'Keep launch migrations additive and compatibility-safe.',
        }),
      },
    );
    assert.equal(createMemoryResponse.status, 201);
    const createMemoryPayload = await createMemoryResponse.json();
    assert.equal(createMemoryPayload.memory.subjectType, 'project');
    assert.equal(createMemoryPayload.canonicalSync.status, 'synced');

    const memoryId = createMemoryPayload.memory.id;
    assert.ok(memoryId);

    const listResponse = await fetch(`${baseUrl}/api/core/projects/${fixtures.project.id}/memory`);
    assert.equal(listResponse.status, 200);
    const listPayload = await listResponse.json();
    assert.equal(listPayload.records.length, 1);

    const canonicalResponse = await fetch(
      `${baseUrl}/api/core/projects/${fixtures.project.id}/memory/canonical`,
    );
    assert.equal(canonicalResponse.status, 200);
    const canonicalPayload = await canonicalResponse.json();
    assert.ok(
      canonicalPayload.records.some((record) =>
        record.content.includes('compatibility-safe'),
      ),
    );

    const retrievalResponse = await fetch(
      `${baseUrl}/api/core/projects/${fixtures.project.id}/memory/retrieval-context`,
    );
    assert.equal(retrievalResponse.status, 200);
    const retrievalPayload = await retrievalResponse.json();
    assert.deepEqual(retrievalPayload.retrieval.scope.projectIds, [fixtures.project.id]);
    assert.ok(
      retrievalPayload.retrieval.selectedMemories.some((hit) =>
        hit.subjectKind === 'project'
        && hit.selectionReasons.includes('project_scope_match'),
      ),
    );

    const updateMemoryResponse = await fetch(
      `${baseUrl}/api/core/projects/${fixtures.project.id}/memory/${memoryId}`,
      {
        method: 'PUT',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          content: 'Keep launch migrations additive, compatibility-safe, and staged.',
        }),
      },
    );
    assert.equal(updateMemoryResponse.status, 200);
    const updateMemoryPayload = await updateMemoryResponse.json();
    assert.equal(updateMemoryPayload.canonicalSync.status, 'synced');

    const flushResponse = await fetch(
      `${baseUrl}/api/core/projects/${fixtures.project.id}/memory/flush`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({ reason: 'manual' }),
      },
    );
    assert.equal(flushResponse.status, 200);
    const flushPayload = await flushResponse.json();
    assert.equal(flushPayload.canonicalSync.status, 'synced');

    const deleteMemoryResponse = await fetch(
      `${baseUrl}/api/core/projects/${fixtures.project.id}/memory/${memoryId}`,
      {
        method: 'DELETE',
      },
    );
    assert.equal(deleteMemoryResponse.status, 200);
    const deleteMemoryPayload = await deleteMemoryResponse.json();
    assert.equal(deleteMemoryPayload.canonicalSync.status, 'synced');

    const finalCanonicalResponse = await fetch(
      `${baseUrl}/api/core/projects/${fixtures.project.id}/memory/canonical`,
    );
    assert.equal(finalCanonicalResponse.status, 200);
    const finalCanonicalPayload = await finalCanonicalResponse.json();
    assert.equal(finalCanonicalPayload.records.length, 0);
  }, chatStore);
});

test('core relationship memory routes expose scoped retrieval without requiring a chat product route', async () => {
  const relationshipId = 'relationship-owner-inline-agent';

  await withServer(createRuntimeStub(), async (baseUrl) => {
    const createMemoryResponse = await fetch(
      `${baseUrl}/api/core/relationships/${relationshipId}/memory`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          category: 'relationship',
          content: 'Owner trusts Inline-Agent for the first draft but expects a final summary.',
        }),
      },
    );
    assert.equal(createMemoryResponse.status, 201);
    const createMemoryPayload = await createMemoryResponse.json();
    assert.equal(createMemoryPayload.memory.subjectType, 'relationship');
    assert.equal(createMemoryPayload.canonicalSync.status, 'synced');

    const retrievalResponse = await fetch(
      `${baseUrl}/api/core/relationships/${relationshipId}/memory/retrieval-context`,
    );
    assert.equal(retrievalResponse.status, 200);
    const retrievalPayload = await retrievalResponse.json();
    assert.deepEqual(retrievalPayload.retrieval.scope.relationshipIds, [relationshipId]);
    assert.ok(
      retrievalPayload.retrieval.selectedMemories.some((hit) =>
        hit.subjectKind === 'relationship'
        && hit.selectionReasons.includes('relationship_scope_match'),
      ),
    );
  });
});

test('approved task assignment queues runtime wakeups for active assigned cat sessions', async () => {
  const chatStore = new MemoryChatStore();
  const runtime = createRuntimeStub();
  const seededAt = new Date('2026-03-24T01:00:00.000Z');

  let state = await chatStore.read();
  state = createCat(
    state,
    {
      name: 'Coder Cat',
      provider: 'claude',
      roles: ['coder'],
    },
    seededAt,
  );
  const catId = state.cats[0].id;
  state = createChannel(
    state,
    {
      title: 'Spec 032 Task Flow',
      topic: 'Wire approved task assignment into runtime wakeups.',
    },
    seededAt,
  );
  const channelId = state.channels[0].id;
  state = assignCatToChannel(state, channelId, { catId }, seededAt);
  state = setChannelCatLease(
    state,
    channelId,
    catId,
    {
      sessionId: 'session-coder',
      status: 'ready',
      cwd: 'C:/repo/cats-platform',
      lastError: null,
      provider: 'claude',
      model: 'claude-sonnet-4',
      startedAt: seededAt.toISOString(),
      lastUsedAt: seededAt.toISOString(),
    },
    seededAt,
  );
  await chatStore.write(state);
  const core = await chatStore.readCore();
  const conversationId = core.conversations.find((candidate) => candidate.sourceChannelId === channelId)?.id;
  assert.ok(conversationId);

  await withServer(runtime, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/core/tasks`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        task: {
          id: 'task-runtime-wakeup',
          title: 'Implement the task lifecycle hook',
          status: 'approved',
          conversationId,
          assignedActorIds: [`actor-cat-${catId}`],
        },
      }),
    });
    assert.equal(response.status, 201);
    const payload = await response.json();
    assert.equal(payload.task.id, 'task-runtime-wakeup');
    assert.equal(payload.wakeups.length, 1);
    assert.equal(payload.wakeups[0].request.target.sessionId, 'session-coder');
    assert.equal(runtime.wakeups.length, 1);
    assert.equal(runtime.wakeups[0].metadata.taskId, 'task-runtime-wakeup');
    assert.equal(payload.activities.length, 1);
    assert.match(payload.activities[0].message, /queued runtime wakeup/i);

    const stateResponse = await fetch(`${baseUrl}/api/core`);
    assert.equal(stateResponse.status, 200);
    const statePayload = await stateResponse.json();
    const task = statePayload.tasks.find((candidate) => candidate.id === 'task-runtime-wakeup');
    assert.ok(task);
    assert.equal(task.metadata.taskLifecycle.wakeups.length, 1);
    assert.equal(task.metadata.taskLifecycle.wakeups[0].sessionId, 'session-coder');
  }, chatStore);
});

test('task checkout short-circuits terminal observe payloads and reconciles completion back into core state', async () => {
  const chatStore = new MemoryChatStore();
  const runtime = createRuntimeStub();
  runtime.setObservedSession('session-task-1', {
    session: {
      id: 'session-task-1',
      inspection: {
        state: 'idle',
        lastRun: {
          id: 'runtime-run-1',
          status: 'succeeded',
          startedAt: '2026-03-24T02:00:00.000Z',
          endedAt: '2026-03-24T02:01:00.000Z',
          resultSummary: 'Implemented the requested task.',
          usage: {
            inputTokens: 11,
            outputTokens: 7,
          },
        },
      },
    },
    observePath: '/sessions/session-task-1/observe',
    stream: {
      path: '/sessions/session-task-1/stream',
      available: true,
      events: [
        {
          event: 'result',
          data: {
            type: 'result',
          },
        },
        {
          event: 'session_closed',
          data: {
            type: 'session_closed',
          },
        },
      ],
    },
  });

  await withServer(runtime, async (baseUrl) => {
    const taskResponse = await fetch(`${baseUrl}/api/core/tasks`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        task: {
          id: 'task-checkout-runtime',
          title: 'Run task checkout',
          status: 'approved',
          assignedActorIds: ['actor-cat-runtime'],
        },
      }),
    });
    assert.equal(taskResponse.status, 201);

    const checkoutResponse = await fetch(`${baseUrl}/api/core/tasks/task-checkout-runtime/checkout`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        actorId: 'actor-cat-runtime',
        sessionId: 'session-task-1',
      }),
    });
    assert.equal(checkoutResponse.status, 200);
    const checkoutPayload = await checkoutResponse.json();
    assert.equal(checkoutPayload.task.status, 'in_progress');
    assert.equal(checkoutPayload.run.status, 'running');
    assert.equal(checkoutPayload.watcherStarted, true);

    await new Promise((resolve) => setTimeout(resolve, 10));

    const stateResponse = await fetch(`${baseUrl}/api/core`);
    assert.equal(stateResponse.status, 200);
    const statePayload = await stateResponse.json();
    const task = statePayload.tasks.find((candidate) => candidate.id === 'task-checkout-runtime');
    const run = statePayload.runs.find((candidate) => candidate.id === checkoutPayload.run.id);
    const completionActivity = statePayload.activities.find((candidate) =>
      candidate.taskId === 'task-checkout-runtime'
      && /completed/i.test(candidate.message));

    assert.ok(task);
    assert.equal(task.status, 'completed');
    assert.ok(run);
    assert.equal(run.status, 'completed');
    assert.equal(run.metadata.runtimeRunStatus, 'succeeded');
    assert.ok(completionActivity);
    assert.ok(!runtime.streamedSessions.includes('session-task-1'));
  }, chatStore);
});

test('core approval write returns 409 for invalid terminal-to-pending transition', async () => {
  const chatStore = new MemoryChatStore();

  await withServer(createRuntimeStub(), async (baseUrl) => {
    const taskResponse = await fetch(`${baseUrl}/api/core/tasks`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        task: {
          id: 'task-system-invalid-transition',
          title: 'Invalid transition guard',
          status: 'pending_approval',
        },
      }),
    });
    assert.equal(taskResponse.status, 201);

    const pendingResponse = await fetch(`${baseUrl}/api/core/approvals`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        taskId: 'task-system-invalid-transition',
        status: 'pending',
      }),
    });
    assert.equal(pendingResponse.status, 200);

    const approvedResponse = await fetch(`${baseUrl}/api/core/approvals`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        taskId: 'task-system-invalid-transition',
        status: 'approved',
        decidedByActorId: 'actor-owner',
      }),
    });
    assert.equal(approvedResponse.status, 200);

    const invalidResponse = await fetch(`${baseUrl}/api/core/approvals`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        taskId: 'task-system-invalid-transition',
        status: 'pending',
      }),
    });
    assert.equal(invalidResponse.status, 409);
    const invalidPayload = await invalidResponse.json();
    assert.equal(invalidPayload.error.code, 'approval_transition_invalid');
  }, chatStore);
});

test('core approval write supports reroute actions and records the decision activity', async () => {
  const chatStore = new MemoryChatStore();

  await withServer(createRuntimeStub(), async (baseUrl) => {
    const taskResponse = await fetch(`${baseUrl}/api/core/tasks`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        task: {
          id: 'task-system-reroute',
          title: 'Reroute approval contract',
          status: 'pending_approval',
        },
      }),
    });
    assert.equal(taskResponse.status, 201);

    const pendingResponse = await fetch(`${baseUrl}/api/core/approvals`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        taskId: 'task-system-reroute',
        status: 'pending',
      }),
    });
    assert.equal(pendingResponse.status, 200);

    const rerouteResponse = await fetch(`${baseUrl}/api/core/approvals`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        taskId: 'task-system-reroute',
        status: 'rejected',
        action: 'reroute',
        decidedByActorId: 'actor-owner',
      }),
    });
    assert.equal(rerouteResponse.status, 200);
    const reroutePayload = await rerouteResponse.json();
    assert.equal(reroutePayload.task.status, 'draft');
    assert.equal(reroutePayload.approval.status, 'rejected');
    assert.equal(reroutePayload.approval.decisionAction, 'reroute');
    assert.equal(reroutePayload.activity.kind, 'approval_decided');
    assert.match(reroutePayload.activity.message, /requested a reroute/i);
    assert.equal(reroutePayload.governanceSummary.approval.pending, false);
    assert.equal(reroutePayload.governanceSummary.approval.latestDecisionAction, 'reroute');
  }, chatStore);
});

test('core operator actions annotate blocked runs and append operator activity records', async () => {
  const chatStore = new MemoryChatStore();
  const fixtures = createSharedCoreFixtureBundle();

  await withServer(createRuntimeStub(), async (baseUrl) => {
    await fetch(`${baseUrl}/api/core/tasks`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ task: fixtures.task }),
    });
    await fetch(`${baseUrl}/api/core/runs`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        run: {
          ...fixtures.run,
          status: 'blocked',
        },
      }),
    });
    await fetch(`${baseUrl}/api/core/checkpoints`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ checkpoint: fixtures.checkpoint }),
    });
    await fetch(`${baseUrl}/api/core/outcomes`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ outcome: fixtures.outcome }),
    });

    const operatorActionResponse = await fetch(`${baseUrl}/api/core/operator-actions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        action: 'retry',
        actorId: 'actor-owner',
        taskId: fixtures.task.id,
        runId: fixtures.run.id,
        checkpointId: fixtures.checkpoint.id,
        outcomeId: fixtures.outcome.id,
      }),
    });
    assert.equal(operatorActionResponse.status, 200);
    const operatorActionPayload = await operatorActionResponse.json();
    assert.equal(operatorActionPayload.action, 'retry');
    assert.equal(operatorActionPayload.run.id, fixtures.run.id);
    assert.equal(operatorActionPayload.task.id, fixtures.task.id);
    assert.equal(operatorActionPayload.governanceSummary.latestOperatorAction.kind, 'retry');

    const stateResponse = await fetch(`${baseUrl}/api/core`);
    const statePayload = await stateResponse.json();
    const run = statePayload.runs.find((candidate) => candidate.id === fixtures.run.id);
    const activity = statePayload.activities.find(
      (candidate) =>
        candidate.kind === 'operator_action'
        && candidate.runId === fixtures.run.id,
    );

    assert.equal(run.metadata.operatorRetryRequestedBy, 'actor-owner');
    assert.ok(typeof run.metadata.operatorRetryRequestedAt === 'string');
    assert.ok(activity);
    assert.equal(activity.metadata.action, 'retry');
  }, chatStore);
});

test('core acknowledge actions use acknowledged metadata keys and append operator activity records', async () => {
  const chatStore = new MemoryChatStore();
  const fixtures = createSharedCoreFixtureBundle();

  await withServer(createRuntimeStub(), async (baseUrl) => {
    await fetch(`${baseUrl}/api/core/tasks`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ task: fixtures.task }),
    });
    await fetch(`${baseUrl}/api/core/runs`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        run: {
          ...fixtures.run,
          status: 'blocked',
        },
      }),
    });

    const operatorActionResponse = await fetch(`${baseUrl}/api/core/operator-actions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        action: 'acknowledge',
        actorId: 'actor-owner',
        taskId: fixtures.task.id,
        runId: fixtures.run.id,
        notes: 'Owner has seen the guardrail.',
      }),
    });
    assert.equal(operatorActionResponse.status, 200);
    const operatorActionPayload = await operatorActionResponse.json();
    assert.equal(operatorActionPayload.action, 'acknowledge');
    assert.equal(operatorActionPayload.run.id, fixtures.run.id);
    assert.equal(
      operatorActionPayload.governanceSummary.latestOperatorAction.kind,
      'acknowledge',
    );

    const stateResponse = await fetch(`${baseUrl}/api/core`);
    const statePayload = await stateResponse.json();
    const run = statePayload.runs.find((candidate) => candidate.id === fixtures.run.id);
    const activity = statePayload.activities.find(
      (candidate) =>
        candidate.kind === 'operator_action'
        && candidate.runId === fixtures.run.id
        && candidate.metadata.action === 'acknowledge',
    );

    assert.equal(run.metadata.operatorAcknowledgedBy, 'actor-owner');
    assert.ok(typeof run.metadata.operatorAcknowledgedAt === 'string');
    assert.equal(
      run.metadata.operatorAcknowledgedNotes,
      'Owner has seen the guardrail.',
    );
    assert.equal('operatorAcknowledgeNotes' in run.metadata, false);
    assert.ok(activity);
    assert.equal(activity.metadata.action, 'acknowledge');
  }, chatStore);
});

test('core artifact and activity writes enforce non-negative sizeBytes and append-only ids', async () => {
  const chatStore = new MemoryChatStore();
  const fixtures = createSharedCoreFixtureBundle();

  await withServer(createRuntimeStub(), async (baseUrl) => {
    const artifactResponse = await fetch(`${baseUrl}/api/core/artifacts`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        artifact: {
          ...fixtures.artifact,
          id: 'artifact-invalid-size',
          sizeBytes: -1,
        },
      }),
    });
    assert.equal(artifactResponse.status, 400);

    const taskResponse = await fetch(`${baseUrl}/api/core/tasks`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ task: fixtures.task }),
    });
    assert.equal(taskResponse.status, 201);

    const firstActivityResponse = await fetch(`${baseUrl}/api/core/activities`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ activity: fixtures.activity }),
    });
    assert.equal(firstActivityResponse.status, 201);

    const duplicateActivityResponse = await fetch(`${baseUrl}/api/core/activities`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ activity: fixtures.activity }),
    });
    assert.equal(duplicateActivityResponse.status, 409);
    const duplicateActivityPayload = await duplicateActivityResponse.json();
    assert.equal(duplicateActivityPayload.error.code, 'activity_already_exists');
  }, chatStore);
});

test('core approval bindings require an existing approval task', async () => {
  const chatStore = new MemoryChatStore();
  const fixtures = createSharedCoreFixtureBundle();

  await withServer(createRuntimeStub(), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/core/approval-bindings`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ approvalBinding: fixtures.approvalBinding }),
    });
    assert.equal(response.status, 404);
    const payload = await response.json();
    assert.equal(payload.error.code, 'task_not_found');
  }, chatStore);
});

test('GET /api/work and /api/code expose shared-core product dashboards without inventing separate schemas', async () => {
  await withServer(createRuntimeStub(), async (baseUrl) => {
    const fixtures = createSharedCoreFixtureBundle();
    const projectResponse = await fetch(`${baseUrl}/api/core/projects`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        project: {
          ...fixtures.project,
          id: 'project-work-dashboard',
          title: 'Work Dashboard Project',
        },
      }),
    });
    assert.equal(projectResponse.status, 201);

    const taskResponse = await fetch(`${baseUrl}/api/core/tasks`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        task: {
          ...fixtures.task,
          id: 'task-work-dashboard',
          title: 'Work dashboard task',
          status: 'in_progress',
          summary: 'Prove Work consumes the shared task substrate.',
        },
      }),
    });
    assert.equal(taskResponse.status, 201);

    const workItemResponse = await fetch(`${baseUrl}/api/core/work-items`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        workItem: {
          ...fixtures.workItem,
          id: 'work-item-work-dashboard',
          title: 'Work Dashboard Item',
          projectId: 'project-work-dashboard',
          taskId: 'task-work-dashboard',
        },
      }),
    });
    assert.equal(workItemResponse.status, 201);

    const codeTaskResponse = await fetch(`${baseUrl}/api/core/tasks`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        task: {
          ...fixtures.task,
          id: 'task-code-dashboard',
          title: 'Code dashboard task',
          conversationId: null,
          status: 'in_progress',
          summary: 'Prove Code consumes code-targeted shared-core records.',
          metadata: {
            planning: {
              productHint: 'code',
            },
            codeWorkspace: {
              workspacePath: 'C:/repo/cats-platform',
              workspaceKind: 'conversation_repo',
              ownershipState: 'conversation_bound',
            },
          },
        },
      }),
    });
    assert.equal(codeTaskResponse.status, 201);

    const codeArtifactResponse = await fetch(`${baseUrl}/api/core/artifacts`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        artifact: {
          ...fixtures.artifact,
          id: 'artifact-code-preview',
          title: 'Code preview artifact',
          conversationId: null,
          kind: 'preview',
          taskId: 'task-code-dashboard',
          workItemId: null,
        },
      }),
    });
    assert.equal(codeArtifactResponse.status, 201);

    const codeBuildArtifactResponse = await fetch(`${baseUrl}/api/core/artifacts`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        artifact: {
          ...fixtures.artifact,
          id: 'artifact-code-build',
          title: 'Code build artifact',
          conversationId: null,
          kind: 'build',
          taskId: 'task-code-dashboard',
          workItemId: null,
          path: 'dist/app',
        },
      }),
    });
    assert.equal(codeBuildArtifactResponse.status, 201);

    const workResponse = await fetch(`${baseUrl}/api/work`);
    assert.equal(workResponse.status, 200);
    const workPayload = await workResponse.json();
    assert.equal(workPayload.product.id, 'work');
    assert.equal(workPayload.product.status, 'active');
    assert.equal(workPayload.product.routeBase, '/work');
    assert.equal(workPayload.summary.ownerActorId, 'actor-owner');
    assert.equal(workPayload.summary.taskCount, 1);
    assert.equal(workPayload.summary.projectCount, 1);
    assert.equal(workPayload.summary.workItemCount, 1);
    assert.equal(workPayload.sections.projects.items[0].id, 'project-work-dashboard');
    assert.equal(workPayload.sections.workItems.items[0].id, 'work-item-work-dashboard');
    assert.ok('operatorInbox' in workPayload.sections);
    assert.ok('controlPlane' in workPayload.sections);
    assert.ok('recovery' in workPayload.sections);
    assert.ok('projects' in workPayload.sections);
    assert.ok('workItems' in workPayload.sections);
    assert.ok(workPayload.extensionPoints.futureRoutes.includes('/api/work/war-room'));

    const workProjectsResponse = await fetch(`${baseUrl}/api/work/projects`);
    assert.equal(workProjectsResponse.status, 200);
    const workProjectsPayload = await workProjectsResponse.json();
    assert.equal(workProjectsPayload.projects.length, 1);
    assert.equal(workProjectsPayload.projects[0].id, 'project-work-dashboard');
    assert.equal(workProjectsPayload.summary.totalAvailable, 1);

    const workProjectDetailResponse = await fetch(
      `${baseUrl}/api/work/projects/project-work-dashboard`,
    );
    assert.equal(workProjectDetailResponse.status, 200);
    const workProjectDetailPayload = await workProjectDetailResponse.json();
    assert.equal(workProjectDetailPayload.project.id, 'project-work-dashboard');
    assert.equal(workProjectDetailPayload.workItems.length, 1);
    assert.equal(workProjectDetailPayload.workItems[0].id, 'work-item-work-dashboard');
    assert.equal(workProjectDetailPayload.linkedTasks.length, 1);
    assert.equal(workProjectDetailPayload.linkedTasks[0].id, 'task-work-dashboard');

    const workItemsResponse = await fetch(`${baseUrl}/api/work/work-items`);
    assert.equal(workItemsResponse.status, 200);
    const workItemsPayload = await workItemsResponse.json();
    assert.equal(workItemsPayload.workItems.length, 1);
    assert.equal(workItemsPayload.workItems[0].id, 'work-item-work-dashboard');
    assert.equal(workItemsPayload.summary.totalAvailable, 1);

    const workItemDetailResponse = await fetch(
      `${baseUrl}/api/work/work-items/work-item-work-dashboard`,
    );
    assert.equal(workItemDetailResponse.status, 200);
    const workItemDetailPayload = await workItemDetailResponse.json();
    assert.equal(workItemDetailPayload.workItem.id, 'work-item-work-dashboard');
    assert.equal(workItemDetailPayload.project?.id, 'project-work-dashboard');
    assert.equal(workItemDetailPayload.linkedTask?.task.id, 'task-work-dashboard');

    const workDetailResponse = await fetch(`${baseUrl}/api/work/tasks/task-work-dashboard`);
    assert.equal(workDetailResponse.status, 200);
    const workDetailPayload = await workDetailResponse.json();
    assert.equal(workDetailPayload.task.id, 'task-work-dashboard');
    assert.equal(workDetailPayload.controlPlane.taskId, 'task-work-dashboard');
    assert.equal(workDetailPayload.timeline.view.taskId, 'task-work-dashboard');

    const codeResponse = await fetch(`${baseUrl}/api/code`);
    assert.equal(codeResponse.status, 200);
    const codePayload = await codeResponse.json();
    assert.equal(codePayload.product.id, 'code');
    assert.equal(codePayload.product.status, 'active');
    assert.equal(codePayload.product.routeBase, '/code');
    assert.equal(codePayload.summary.ownerActorId, 'actor-owner');
    assert.equal(codePayload.summary.taskCount, 1);
    assert.equal(codePayload.summary.artifactCount, 2);
    assert.equal(codePayload.summary.buildCount, 1);
    assert.equal(codePayload.summary.previewCount, 1);
    assert.equal(codePayload.sections.tasks.items[0].id, 'task-code-dashboard');
    assert.equal(codePayload.sections.tasks.items[0].effectiveStrategy, 'reflexion');
    assert.deepEqual(
      codePayload.sections.artifacts.items.map((artifact) => artifact.id),
      ['artifact-code-build', 'artifact-code-preview'],
    );
    assert.ok(codePayload.extensionPoints.futureRoutes.includes('/api/code/tasks/:taskId'));
    assert.ok(codePayload.extensionPoints.futureRoutes.includes('/api/code/artifacts/:artifactId'));

    const codeTasksResponse = await fetch(`${baseUrl}/api/code/tasks`);
    assert.equal(codeTasksResponse.status, 200);
    const codeTasksPayload = await codeTasksResponse.json();
    assert.equal(codeTasksPayload.summary.totalAvailable, 1);
    assert.equal(codeTasksPayload.tasks[0].id, 'task-code-dashboard');

    const codeTaskDetailResponse = await fetch(`${baseUrl}/api/code/tasks/task-code-dashboard`);
    assert.equal(codeTaskDetailResponse.status, 200);
    const codeTaskDetailPayload = await codeTaskDetailResponse.json();
    assert.equal(codeTaskDetailPayload.task.id, 'task-code-dashboard');
    assert.equal(codeTaskDetailPayload.effectiveStrategy, 'reflexion');
    assert.deepEqual(codeTaskDetailPayload.workspace, {
      workspacePath: 'C:/repo/cats-platform',
      workspaceKind: 'conversation_repo',
      ownershipState: 'conversation_bound',
    });
    assert.equal(codeTaskDetailPayload.artifactSummary.totalCount, 2);
    assert.equal(codeTaskDetailPayload.linkedArtifacts.length, 2);
    assert.equal(codeTaskDetailPayload.timeline.view.taskId, 'task-code-dashboard');

    const codeArtifactsResponse = await fetch(`${baseUrl}/api/code/artifacts`);
    assert.equal(codeArtifactsResponse.status, 200);
    const codeArtifactsPayload = await codeArtifactsResponse.json();
    assert.equal(codeArtifactsPayload.summary.totalAvailable, 2);
    assert.equal(codeArtifactsPayload.summary.buildCount, 1);
    assert.equal(codeArtifactsPayload.summary.previewCount, 1);

    const codeBuildsResponse = await fetch(`${baseUrl}/api/code/builds`);
    assert.equal(codeBuildsResponse.status, 200);
    const codeBuildsPayload = await codeBuildsResponse.json();
    assert.equal(codeBuildsPayload.filter, 'build');
    assert.equal(codeBuildsPayload.artifacts.length, 1);
    assert.equal(codeBuildsPayload.artifacts[0].id, 'artifact-code-build');

    const codePreviewsResponse = await fetch(`${baseUrl}/api/code/previews`);
    assert.equal(codePreviewsResponse.status, 200);
    const codePreviewsPayload = await codePreviewsResponse.json();
    assert.equal(codePreviewsPayload.filter, 'preview');
    assert.equal(codePreviewsPayload.artifacts.length, 1);
    assert.equal(codePreviewsPayload.artifacts[0].id, 'artifact-code-preview');

    const codeArtifactDetailResponse = await fetch(
      `${baseUrl}/api/code/artifacts/artifact-code-preview`,
    );
    assert.equal(codeArtifactDetailResponse.status, 200);
    const codeArtifactDetailPayload = await codeArtifactDetailResponse.json();
    assert.equal(codeArtifactDetailPayload.artifact.id, 'artifact-code-preview');
    assert.equal(codeArtifactDetailPayload.task.id, 'task-code-dashboard');
    assert.equal(codeArtifactDetailPayload.relatedArtifacts.length, 1);
    assert.equal(codeArtifactDetailPayload.relatedArtifacts[0].id, 'artifact-code-build');
  });
});

test('GET /api/shell/browse lists subdirectories for the folder browser modal', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'cats-folder-browser-'));
  const alphaDir = path.join(root, 'alpha');
  const betaDir = path.join(root, 'beta');
  const hiddenDir = path.join(root, '.hidden');
  const filePath = path.join(root, 'notes.txt');

  await mkdir(alphaDir);
  await mkdir(betaDir);
  await mkdir(hiddenDir);
  await writeFile(filePath, 'not a directory');

  try {
    await withServer(createRuntimeStub(), async (baseUrl) => {
      const response = await fetch(
        `${baseUrl}/api/shell/browse?path=${encodeURIComponent(root)}`,
      );
      assert.equal(response.status, 200);

      const payload = await response.json();
      assert.equal(payload.current, root);
      assert.equal(payload.parent, path.dirname(root));
      assert.equal(payload.error, undefined);
      assert.deepEqual(
        payload.entries.map((entry) => entry.name),
        ['alpha', 'beta'],
      );
      assert.deepEqual(
        payload.entries.map((entry) => entry.path),
        [alphaDir, betaDir],
      );
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('assigning a cat to a channel immediately creates a runtime session in the channel cwd', async () => {
  const runtimeClient = createRuntimeStub();

  await withServer(runtimeClient, async (baseUrl) => {
    const createChannelResponse = await fetch(`${baseUrl}/api/channels`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        title: 'Session Spawn',
        topic: 'Verify assignment spawns a session.',
        repoPath: 'C:/repo/cats-platform',
        skipBossCatGreeting: true,
      }),
    });
    assert.equal(createChannelResponse.status, 201);
    const createChannelPayload = await createChannelResponse.json();
    const channelId = createChannelPayload.channel.id;

    const createCatResponse = await fetch(`${baseUrl}/api/cats`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Agent-Spawn',
        provider: 'claude',
        model: 'claude-opus-4-6',
      }),
    });
    assert.equal(createCatResponse.status, 201);
    const createCatPayload = await createCatResponse.json();
    const catId = createCatPayload.cat.id;

    const assignResponse = await fetch(`${baseUrl}/api/channels/${channelId}/cats/${catId}`, {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        provider: 'claude',
        model: 'claude-opus-4-6',
      }),
    });
    assert.equal(assignResponse.status, 201);
    const assignPayload = await assignResponse.json();

    assert.equal(runtimeClient.createdSessions.length, 1);
    assert.equal(runtimeClient.createdSessions[0].cwd, 'C:/repo/cats-platform');
    assert.equal(assignPayload.cat.execution.lease.sessionId, 'session-1');
    assert.equal(assignPayload.cat.execution.lease.cwd, 'C:/repo/cats-platform');

    const channelResponse = await fetch(`${baseUrl}/api/channels/${channelId}`);
    assert.equal(channelResponse.status, 200);
    const channelPayload = await channelResponse.json();
    const sessionStartedMessage = channelPayload.channel.messages.find(
      (message) => message.metadata?.event === 'session_started' && message.metadata?.targetId === catId,
    );
    assert.ok(sessionStartedMessage);
    assert.equal(
      sessionStartedMessage.body,
      'Agent-Spawn connected to cats-runtime session session-1.\n(cwd: C:/repo/cats-platform)',
    );
  });
});

test('assigning a cat forwards structured modelSelection to cats-runtime session creation', async () => {
  const runtimeClient = createRuntimeStub();

  await withServer(runtimeClient, async (baseUrl) => {
    const createChannelResponse = await fetch(`${baseUrl}/api/channels`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        title: 'Advanced Session Spawn',
        topic: 'Verify model selection reaches cats-runtime.',
        repoPath: 'C:/repo/cats-platform',
        skipBossCatGreeting: true,
      }),
    });
    assert.equal(createChannelResponse.status, 201);
    const createChannelPayload = await createChannelResponse.json();
    const channelId = createChannelPayload.channel.id;

    const createCatResponse = await fetch(`${baseUrl}/api/cats`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Agent-Advanced',
        provider: 'codex',
        model: 'gpt-5.4',
        modelSelection: {
          entryMode: 'auto',
          presetId: 'balanced',
          controls: {
            'openai.reasoning_effort': 'medium',
          },
        },
      }),
    });
    assert.equal(createCatResponse.status, 201);
    const createCatPayload = await createCatResponse.json();
    const catId = createCatPayload.cat.id;

    const assignResponse = await fetch(`${baseUrl}/api/channels/${channelId}/cats/${catId}`, {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        provider: 'codex',
        model: 'gpt-5.4',
        modelSelection: {
          entryMode: 'auto',
          presetId: 'balanced',
          controls: {
            'openai.reasoning_effort': 'high',
          },
        },
      }),
    });
    assert.equal(assignResponse.status, 201);

    assert.equal(runtimeClient.createdSessions.length, 1);
    assert.deepEqual(runtimeClient.createdSessions[0].modelSelection, {
      entryMode: 'auto',
      presetId: 'balanced',
      controls: {
        'openai.reasoning_effort': 'high',
      },
    });
  });
});

test('assigning a cat without a channel cwd defers session creation until Boss Cat activation establishes one', async () => {
  const runtimeClient = createRuntimeStub();

  await withServer(runtimeClient, async (baseUrl) => {
    const createChannelResponse = await fetch(`${baseUrl}/api/channels`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        title: 'Deferred Session Spawn',
        topic: 'Wait for Boss Cat to anchor the chat first.',
        skipBossCatGreeting: true,
      }),
    });
    assert.equal(createChannelResponse.status, 201);
    const createChannelPayload = await createChannelResponse.json();
    const channelId = createChannelPayload.channel.id;

    const createCatResponse = await fetch(`${baseUrl}/api/cats`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Agent-Deferred',
        provider: 'claude',
        model: 'claude-opus-4-6',
      }),
    });
    assert.equal(createCatResponse.status, 201);
    const createCatPayload = await createCatResponse.json();
    const catId = createCatPayload.cat.id;

    const assignResponse = await fetch(`${baseUrl}/api/channels/${channelId}/cats/${catId}`, {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        provider: 'claude',
        model: 'claude-opus-4-6',
      }),
    });
    assert.equal(assignResponse.status, 201);
    const assignPayload = await assignResponse.json();

    assert.equal(runtimeClient.createdSessions.length, 0);
    assert.equal(assignPayload.cat.execution.lease.sessionId, null);
    assert.equal(assignPayload.cat.execution.lease.cwd, null);

    const activateResponse = await fetch(`${baseUrl}/api/channels/${channelId}/activations`, {
      method: 'POST',
    });
    assert.equal(activateResponse.status, 200);
    const activatePayload = await activateResponse.json();

    assert.equal(runtimeClient.createdSessions.length, 2);
    assert.equal(runtimeClient.createdSessions[0].cwd, null);
    assert.match(
      runtimeClient.createdSessions[1].cwd ?? '',
      /\.cats[\\/]runtime[\\/]sessions[\\/]session-1$/u,
    );
    assert.equal(activatePayload.activation.results[0].targetKind, 'orchestrator');
    assert.equal(activatePayload.activation.results[1].targetKind, 'cat');
  });
});

test('PATCH /api/preferences only selects the requested Boss Chat without waking runtime', async () => {
  const runtimeClient = createRuntimeStub();

  await withServer(runtimeClient, async (baseUrl) => {
    const setupResponse = await fetch(`${baseUrl}/api/setup/complete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ownerDisplayName: 'Kenny',
        bossCatName: 'Smelly',
        bossCatProvider: 'claude',
      }),
    });
    assert.equal(setupResponse.status, 200);

    const createChannelResponse = await fetch(`${baseUrl}/api/channels`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: 'Wake Boss Chat',
        topic: 'Wake the entry participant on room entry.',
        skipBossCatGreeting: true,
      }),
    });
    assert.equal(createChannelResponse.status, 201);
    const createChannelPayload = await createChannelResponse.json();
    const channelId = createChannelPayload.channel.id;

    assert.equal(runtimeClient.createdSessions.length, 0);

    const updatePrefsResponse = await fetch(`${baseUrl}/api/preferences`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ selectedChannelId: channelId }),
    });
    assert.equal(updatePrefsResponse.status, 200);

    const channelResponse = await fetch(`${baseUrl}/api/channels/${channelId}`);
    assert.equal(channelResponse.status, 200);
    const channelPayload = await channelResponse.json();

    assert.equal(runtimeClient.createdSessions.length, 0);
    assert.equal(channelPayload.channel.orchestratorLease.sessionId, null);
    assert.equal(channelPayload.channel.roomRouting.lastWakeRequest, null);
    assert.equal(channelPayload.channel.messages[0]?.metadata?.event, 'room_created');
  });
});

test('first send persists a runtime-sanitized solo model selection after dropping a stale preset', async () => {
  const runtimeClient = createRuntimeStub();
  runtimeClient.createSession = async function createSession(input) {
    const sessionId = `session-${this.createdSessions.length + 1}`;
    this.createdSessions.push({ ...input, id: sessionId });
    return {
      id: sessionId,
      provider: input.provider,
      model: 'gpt-5.4',
      modelSelection: {
        entryMode: 'auto',
        entryId: 'gpt-5.4',
        controls: {
          'openai.reasoning_effort': 'high',
        },
      },
      status: 'ready',
      cwd: input.cwd ?? path.join(os.tmpdir(), '.cats', 'runtime', 'sessions', sessionId),
    };
  };

  await withServer(runtimeClient, async (baseUrl) => {
    const createChannelResponse = await fetch(`${baseUrl}/api/channels`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: 'Sanitize Solo Preset',
        topic: 'Wake should clean stale presets from solo chats.',
        composerMode: 'solo',
        pendingProvider: 'codex',
        pendingModel: 'gpt-5.4',
        pendingModelSelection: {
          entryMode: 'auto',
          presetId: 'deep_reasoning',
          controls: {
            'openai.reasoning_effort': 'high',
          },
        },
        skipBossCatGreeting: true,
      }),
    });
    assert.equal(createChannelResponse.status, 201);
    const createChannelPayload = await createChannelResponse.json();
    const channelId = createChannelPayload.channel.id;

    const sendResponse = await fetch(`${baseUrl}/api/channels/${channelId}/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ body: 'Sanitize this preset.' }),
    });
    assert.equal(sendResponse.status, 200);
    const sendPayload = await sendResponse.json();
    assert.equal(sendPayload.phase, 'acknowledged');

    const channelPayload = await waitForCondition(async () => {
      if (runtimeClient.createdSessions.length !== 1) {
        return null;
      }
      const channelResponse = await fetch(`${baseUrl}/api/channels/${channelId}`);
      assert.equal(channelResponse.status, 200);
      const payload = await channelResponse.json();
      return payload.channel.pendingModelSelection?.entryId === 'gpt-5.4'
        ? payload
        : null;
    });

    assert.deepEqual(channelPayload.channel.pendingModelSelection, {
      entryMode: 'auto',
      entryId: 'gpt-5.4',
      controls: {
        'openai.reasoning_effort': 'high',
      },
    });
  });
});

test('first send on a selected solo chat accepts the user turn before starting the orchestrator session', async () => {
  const runtimeClient = createRuntimeStub();
  const originalCreateSession = runtimeClient.createSession.bind(runtimeClient);
  let releaseCreateSession = () => {};
  const createSessionBlocked = new Promise((resolve) => {
    releaseCreateSession = resolve;
  });
  runtimeClient.createSession = async (input) => {
    await createSessionBlocked;
    return originalCreateSession(input);
  };

  await withServer(runtimeClient, async (baseUrl) => {
    const setupResponse = await fetch(`${baseUrl}/api/setup/complete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ownerDisplayName: 'Kenny',
        bossCatName: 'Smelly',
        bossCatProvider: 'claude',
      }),
    });
    assert.equal(setupResponse.status, 200);

    const createChannelResponse = await fetch(`${baseUrl}/api/channels`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: 'Race room',
        topic: 'Do not create two sessions during first send.',
        skipBossCatGreeting: true,
        composerMode: 'solo',
      }),
    });
    assert.equal(createChannelResponse.status, 201);
    const createChannelPayload = await createChannelResponse.json();
    const channelId = createChannelPayload.channel.id;

    const selectResponse = await fetch(`${baseUrl}/api/preferences`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ selectedChannelId: channelId }),
    });
    assert.equal(selectResponse.status, 200);
    assert.equal(runtimeClient.createdSessions.length, 0);

    const sendResponse = await fetch(`${baseUrl}/api/channels/${channelId}/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ body: 'Hi' }),
    });
    assert.equal(sendResponse.status, 200);
    const sendPayload = await sendResponse.json();
    assert.equal(sendPayload.phase, 'acknowledged');
    assert.equal(sendPayload.message.body, 'Hi');
    assert.equal(runtimeClient.createdSessions.length, 0);

    const acknowledgedChannelResponse = await fetch(`${baseUrl}/api/channels/${channelId}`);
    assert.equal(acknowledgedChannelResponse.status, 200);
    const acknowledgedChannelPayload = await acknowledgedChannelResponse.json();
    assert.equal(acknowledgedChannelPayload.channel.messages[0]?.metadata?.event, 'room_created');
    assert.equal(acknowledgedChannelPayload.channel.messages[1]?.senderKind, 'user');
    assert.equal(acknowledgedChannelPayload.channel.orchestratorLease.sessionId, null);

    releaseCreateSession();

    const channelPayload = await waitForCondition(async () => {
      if (runtimeClient.createdSessions.length !== 1 || runtimeClient.sentMessages.length !== 1) {
        return null;
      }
      const channelResponse = await fetch(`${baseUrl}/api/channels/${channelId}`);
      assert.equal(channelResponse.status, 200);
      const payload = await channelResponse.json();
      return payload.channel.orchestratorLease.sessionId === 'session-1'
        ? payload
        : null;
    });

    assert.equal(runtimeClient.sentMessages[0]?.sessionId, 'session-1');
    assert.equal(channelPayload.channel.messages[2]?.metadata?.event, 'session_started');
  });
});

test('parallel chat first send accepts the user turn before starting member sessions', async () => {
  const runtimeClient = createRuntimeStub();
  const originalCreateSession = runtimeClient.createSession.bind(runtimeClient);
  let releaseCreateSession = () => {};
  const createSessionBlocked = new Promise((resolve) => {
    releaseCreateSession = resolve;
  });
  runtimeClient.createSession = async (input) => {
    await createSessionBlocked;
    return originalCreateSession(input);
  };

  await withServer(runtimeClient, async (baseUrl) => {
    const setupResponse = await fetch(`${baseUrl}/api/setup/complete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ownerDisplayName: 'Kenny',
        bossCatName: 'Smelly',
        bossCatProvider: 'claude',
      }),
    });
    assert.equal(setupResponse.status, 200);

    const createGroupResponse = await fetch(`${baseUrl}/api/concurrent-groups`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: 'Parallel Race',
        targets: [
          { provider: 'claude', instance: 'native' },
          { provider: 'codex', instance: 'native' },
        ],
      }),
    });
    assert.equal(createGroupResponse.status, 201);
    const createGroupPayload = await createGroupResponse.json();
    const groupId = createGroupPayload.group.id;
    const memberChannelIds = createGroupPayload.group.memberChannelIds;
    const activeChannelId = createGroupPayload.appShell.chat.selectedChannelId;
    const passiveChannelId = memberChannelIds.find((channelId) => channelId !== activeChannelId);
    assert.ok(activeChannelId);
    assert.ok(passiveChannelId);

    const sendResponse = await fetch(`${baseUrl}/api/concurrent-groups/${groupId}/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        activeChannelId,
        body: 'Hi',
      }),
    });
    assert.equal(sendResponse.status, 200);
    const sendPayload = await sendResponse.json();
    assert.equal(sendPayload.phase, 'acknowledged');
    assert.equal(runtimeClient.createdSessions.length, 0);

    const [activeAcknowledgedResponse, passiveAcknowledgedResponse] = await Promise.all([
      fetch(`${baseUrl}/api/channels/${activeChannelId}`),
      fetch(`${baseUrl}/api/channels/${passiveChannelId}`),
    ]);
    assert.equal(activeAcknowledgedResponse.status, 200);
    assert.equal(passiveAcknowledgedResponse.status, 200);
    const activeAcknowledgedPayload = await activeAcknowledgedResponse.json();
    const passiveAcknowledgedPayload = await passiveAcknowledgedResponse.json();
    assert.deepEqual(
      activeAcknowledgedPayload.channel.messages.slice(0, 2).map((message) => message.senderKind),
      ['system', 'user'],
    );
    assert.deepEqual(
      passiveAcknowledgedPayload.channel.messages.slice(0, 2).map((message) => message.senderKind),
      ['system', 'user'],
    );
    assert.equal(activeAcknowledgedPayload.channel.messages[0]?.metadata?.event, 'room_created');
    assert.equal(passiveAcknowledgedPayload.channel.messages[0]?.metadata?.event, 'room_created');

    releaseCreateSession();

    const [activeChannelPayload, passiveChannelPayload] = await waitForCondition(async () => {
      if (runtimeClient.createdSessions.length !== 2 || runtimeClient.sentMessages.length !== 2) {
        return null;
      }
      const [activeChannelResponse, passiveChannelResponse] = await Promise.all([
        fetch(`${baseUrl}/api/channels/${activeChannelId}`),
        fetch(`${baseUrl}/api/channels/${passiveChannelId}`),
      ]);
      assert.equal(activeChannelResponse.status, 200);
      assert.equal(passiveChannelResponse.status, 200);
      const payloads = await Promise.all([
        activeChannelResponse.json(),
        passiveChannelResponse.json(),
      ]);
      return payloads.every((payload) => Boolean(payload.channel.orchestratorLease.sessionId))
        ? payloads
        : null;
    });

    assert.equal(activeChannelPayload.channel.messages[2]?.metadata?.event, 'session_started');
    assert.equal(passiveChannelPayload.channel.messages[2]?.metadata?.event, 'session_started');

    const selectPassiveResponse = await fetch(`${baseUrl}/api/preferences`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ selectedChannelId: passiveChannelId }),
    });
    assert.equal(selectPassiveResponse.status, 200);
    assert.equal(runtimeClient.createdSessions.length, 2);
  });
});

test('GET /api/app-shell repairs missing session_started metadata from runtime responses', async () => {
  const runtimeClient = createRuntimeStub();
  const chatStore = new MemoryChatStore();

  await withServer(runtimeClient, async (baseUrl, paths) => {
    let state = await chatStore.read();
    state = createChannel(
      state,
      {
        title: 'Repaired session metadata',
        topic: 'Restore missing runtime session metadata in app-shell payloads.',
        skipBossCatGreeting: true,
      },
      new Date('2026-04-09T12:35:29.017Z'),
    );
    const channelId = state.selectedChannelId;
    state = appendMessage(
      state,
      channelId,
      {
        senderKind: 'user',
        senderName: 'User',
        body: '今天AI界有什麼新聞嗎?',
      },
      new Date('2026-04-09T12:35:29.111Z'),
    ).state;
    state = appendMessage(
      state,
      channelId,
      {
        senderKind: 'agent',
        senderName: 'Chat',
        body: '先給你一個整理版回覆。',
      },
      new Date('2026-04-09T12:35:29.111Z'),
      {
        metadata: {
          event: 'assistant_turn_segment',
          assistantTurnId: 'assistant-turn-orphan',
          terminal: true,
          targetKind: 'orchestrator',
          targetId: 'orchestrator',
          sessionId: 'session-orphan',
          turnId: 'turn-orphan',
        },
        incrementUnread: false,
      },
    ).state;
    await mkdir(path.join(paths.runtimeDataDir, 'sessions', 'session-orphan'), { recursive: true });
    await chatStore.write(state);

    const response = await fetch(`${baseUrl}/api/app-shell`);
    assert.equal(response.status, 200);
    const payload = await response.json();
    const selectedChannel = payload.chat.selectedChannel;
    assert.equal(selectedChannel.id, channelId);
    const sessionStartedIndex = selectedChannel.messages.findIndex((message) =>
      message.metadata?.event === 'session_started'
      && message.metadata?.sessionId === 'session-orphan');
    const responseIndex = selectedChannel.messages.findIndex((message) =>
      message.metadata?.event === 'assistant_turn_segment'
      && message.metadata?.terminal === true
      && message.metadata?.sessionId === 'session-orphan');

    assert.equal(sessionStartedIndex >= 0, true);
    assert.equal(responseIndex >= 0, true);
    assert.equal(sessionStartedIndex < responseIndex, true);
    assert.equal(
      selectedChannel.chatCwd,
      path.join(paths.runtimeDataDir, 'sessions', 'session-orphan'),
    );
  }, chatStore);
});

test('GET /api/app-shell inserts a startup recovery interruption note before the next user turn', async () => {
  const runtimeClient = createRuntimeStub();
  const chatStore = new MemoryChatStore();

  await withServer(runtimeClient, async (baseUrl) => {
    let state = await chatStore.read();
    state = createChannel(
      state,
      {
        title: 'Interrupted room workflow',
        topic: 'Show an interruption note for startup recovery turns.',
        skipBossCatGreeting: true,
      },
      new Date('2026-04-09T12:35:29.017Z'),
    );
    const channelId = state.selectedChannelId;
    state = appendMessage(
      state,
      channelId,
      {
        senderKind: 'user',
        senderName: 'User',
        body: '今天AI界有什麼新聞嗎?',
      },
      new Date('2026-04-09T12:35:29.111Z'),
    ).state;
    state = appendMessage(
      state,
      channelId,
      {
        senderKind: 'system',
        senderName: 'Runtime',
        body: 'Chat connected to cats-runtime session session-interrupted.\n(cwd: C:/runtime/session-interrupted)',
      },
      new Date('2026-04-09T12:35:29.111Z'),
      {
        metadata: {
          event: 'session_started',
          targetKind: 'orchestrator',
          sessionId: 'session-interrupted',
        },
        incrementUnread: false,
      },
    ).state;
    state = appendMessage(
      state,
      channelId,
      {
        senderKind: 'user',
        senderName: 'User',
        body: '你的model是什麼?',
      },
      new Date('2026-04-09T14:09:37.663Z'),
    ).state;
    const channel = requireChannel(state, channelId);
    channel.roomRouting.workflow.turnHistory.unshift({
      id: 'turn-startup-recovery',
      status: 'blocked',
      sourceMessageId: channel.messages[1].id,
      sourceSenderKind: 'user',
      sourceSenderName: 'User',
      guard: null,
      stageId: 'startup_recovery',
      workflowShape: 'sequential',
      reviewRequired: false,
      lastCheckpointId: 'checkpoint-startup-recovery',
      convergeTargetId: null,
      continuationCount: 0,
      dispatchCount: 0,
      targetStatuses: [
        {
          id: 'target-startup-recovery',
          dispatchId: 'dispatch-startup-recovery',
          participant: {
            participantKind: 'orchestrator',
            participantId: 'orchestrator',
            participantName: 'Chat',
          },
          source: null,
          sourceMessageId: channel.messages[1].id,
          trigger: 'room_default',
          mentionNames: [],
          depth: 0,
          parentCheckpointId: 'checkpoint-startup-recovery',
          branchStrategy: 'fresh_no_parent',
          handoffReason: 'room_default',
          wakeRequestId: 'wake-startup-recovery',
          status: 'blocked',
          queuedAt: '2026-04-09T12:35:29.111Z',
          startedAt: '2026-04-09T12:35:29.111Z',
          completedAt: '2026-04-09T13:15:24.461Z',
          response: null,
          error: 'Cats server restarted before room workflow cleanup completed.',
        },
      ],
      events: [
        {
          id: 'event-startup-recovery',
          turnId: 'turn-startup-recovery',
          kind: 'outcome',
          status: 'blocked',
          message: 'Room workflow moved to blocked recovery after startup interrupted the active turn.',
          actor: null,
          sourceMessageId: channel.messages[1].id,
          targets: [
            {
              participantKind: 'orchestrator',
              participantId: 'orchestrator',
              participantName: 'Chat',
            },
          ],
          dispatchId: null,
          checkpointId: null,
          outcomeId: null,
          createdAt: '2026-04-09T13:15:24.461Z',
          metadata: {
            recoverySource: 'server_restart',
            interruptedError: 'Cats server restarted before room workflow cleanup completed.',
          },
        },
      ],
      startedAt: '2026-04-09T12:35:29.111Z',
      updatedAt: '2026-04-09T13:15:24.461Z',
      completedAt: '2026-04-09T13:15:24.461Z',
    });
    await chatStore.write(state);

    const response = await fetch(`${baseUrl}/api/app-shell`);
    assert.equal(response.status, 200);
    const payload = await response.json();
    const selectedChannel = payload.chat.selectedChannel;
    const noticeIndex = selectedChannel.messages.findIndex((message) =>
      message.metadata?.event === 'workflow_interrupted'
      && message.metadata?.turnId === 'turn-startup-recovery');
    const nextUserIndex = selectedChannel.messages.findIndex((message) =>
      message.body === '你的model是什麼?');

    assert.ok(noticeIndex >= 0);
    assert.ok(nextUserIndex > noticeIndex);
    assert.match(
      selectedChannel.messages[noticeIndex].body,
      /Cats server restarted before room workflow cleanup completed/i,
    );
  }, chatStore);
});

test('parallel chat first send fans out the selected folder and attachments to every member chat', async () => {
  const runtimeClient = createRuntimeStub();
  const tempWorkingDir = await mkdtemp(path.join(os.tmpdir(), 'cats-parallel-attachments-'));

  try {
    await withServer(runtimeClient, async (baseUrl) => {
      const setupResponse = await fetch(`${baseUrl}/api/setup/complete`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ownerDisplayName: 'Kenny',
          bossCatName: 'Smelly',
          bossCatProvider: 'claude',
        }),
      });
      assert.equal(setupResponse.status, 200);

      const createGroupResponse = await fetch(`${baseUrl}/api/concurrent-groups`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title: 'Parallel Attachments',
          repoPath: tempWorkingDir,
          targets: [
            { provider: 'claude', instance: 'native' },
            { provider: 'codex', instance: 'native' },
          ],
        }),
      });
      assert.equal(createGroupResponse.status, 201);
      const createGroupPayload = await createGroupResponse.json();
      const groupId = createGroupPayload.group.id;
      const memberChannelIds = createGroupPayload.group.memberChannelIds;
      const activeChannelId =
        createGroupPayload.appShell.chat.selectedChannelId
        && memberChannelIds.includes(createGroupPayload.appShell.chat.selectedChannelId)
          ? createGroupPayload.appShell.chat.selectedChannelId
          : createGroupPayload.group.members[0]?.channelId ?? null;
      assert.ok(activeChannelId);
      assert.equal(memberChannelIds.length, 2);

      const sendResponse = await fetch(`${baseUrl}/api/concurrent-groups/${groupId}/messages`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          activeChannelId,
          body: 'Review the attachment.',
          attachments: [
            {
              name: 'notes.txt',
              data: Buffer.from('parallel attachment').toString('base64'),
            },
          ],
        }),
      });
      assert.equal(sendResponse.status, 200);
      const sendPayload = await sendResponse.json();
      assert.equal(sendPayload.phase, 'acknowledged');

      const channelPayloads = await Promise.all(
        memberChannelIds.map(async (channelId) => {
          const response = await fetch(`${baseUrl}/api/channels/${channelId}`);
          assert.equal(response.status, 200);
          return response.json();
        }),
      );

      for (const payload of channelPayloads) {
        assert.equal(payload.channel.repoPath, tempWorkingDir);
        const userMessage = payload.channel.messages.find((message) => message.senderKind === 'user');
        assert.ok(userMessage);
        assert.match(userMessage.body, /^\[Attached files in working directory:\]/);
        assert.match(userMessage.body, /- \.cats-attachments\/notes\.txt/);
      }

      await waitForCondition(() =>
        runtimeClient.createdSessions.length === 2 && runtimeClient.sentMessages.length === 2,
      );
      for (const sent of runtimeClient.sentMessages) {
        assert.match(sent.content, /^\[Attached files in working directory:\]/);
        assert.match(sent.content, /- \.cats-attachments\/notes\.txt/);
      }

      const attachmentContent = await readFile(
        path.join(tempWorkingDir, '.cats-attachments', 'notes.txt'),
        'utf8',
      );
      assert.equal(attachmentContent, 'parallel attachment');

      await Promise.all(
        memberChannelIds.map(async (channelId) => {
          const response = await fetch(`${baseUrl}/api/channels/${channelId}/attachments/notes.txt`);
          assert.equal(response.status, 200);
          assert.equal(await response.text(), 'parallel attachment');
        }),
      );
    });
  } finally {
    await rm(tempWorkingDir, { recursive: true, force: true });
  }
});

test('parallel chat member selection stays responsive while the first send is still dispatching', async () => {
  const runtimeClient = createRuntimeStub();
  const originalSendMessage = runtimeClient.sendMessage.bind(runtimeClient);
  let releaseDispatch = () => {};
  const dispatchBlocked = new Promise((resolve) => {
    releaseDispatch = resolve;
  });
  let markDispatchStarted = () => {};
  const firstDispatchStarted = new Promise((resolve) => {
    markDispatchStarted = resolve;
  });

  runtimeClient.sendMessage = async (sessionId, content) => {
    markDispatchStarted();
    await dispatchBlocked;
    return originalSendMessage(sessionId, content);
  };

  await withServer(runtimeClient, async (baseUrl) => {
    const setupResponse = await fetch(`${baseUrl}/api/setup/complete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ownerDisplayName: 'Kenny',
        bossCatName: 'Smelly',
        bossCatProvider: 'claude',
      }),
    });
    assert.equal(setupResponse.status, 200);

    const createGroupResponse = await fetch(`${baseUrl}/api/concurrent-groups`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: 'Parallel Switching',
        targets: [
          { provider: 'claude', instance: 'native' },
          { provider: 'codex', instance: 'native' },
        ],
      }),
    });
    assert.equal(createGroupResponse.status, 201);
    const createGroupPayload = await createGroupResponse.json();
    const groupId = createGroupPayload.group.id;
    const memberChannelIds = createGroupPayload.group.memberChannelIds;
    const activeChannelId =
      createGroupPayload.appShell.chat.selectedChannelId
      && memberChannelIds.includes(createGroupPayload.appShell.chat.selectedChannelId)
        ? createGroupPayload.appShell.chat.selectedChannelId
        : createGroupPayload.group.members[0]?.channelId ?? null;
    const passiveChannelId = memberChannelIds.find((channelId) => channelId !== activeChannelId) ?? null;
    assert.ok(activeChannelId);
    assert.ok(passiveChannelId);

    const sendResponsePromise = fetch(`${baseUrl}/api/concurrent-groups/${groupId}/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        activeChannelId,
        body: 'Switch while the first reply is still in flight.',
      }),
    });

    await firstDispatchStarted;

    const selectionAbort = new AbortController();
    const selectionTimeout = setTimeout(() => {
      selectionAbort.abort();
    }, 750);

    let selectPassiveResponse;
    try {
      selectPassiveResponse = await fetch(`${baseUrl}/api/preferences`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ selectedChannelId: passiveChannelId }),
        signal: selectionAbort.signal,
      });
    } finally {
      clearTimeout(selectionTimeout);
    }
    assert.equal(selectPassiveResponse.status, 200);

    const appShellResponse = await fetch(`${baseUrl}/api/app-shell`);
    assert.equal(appShellResponse.status, 200);
    const appShellPayload = await appShellResponse.json();
    assert.equal(appShellPayload.chat.selectedChannelId, passiveChannelId);
    assert.equal(appShellPayload.chat.selectedChannel?.id, passiveChannelId);

    releaseDispatch();

    const sendResponse = await sendResponsePromise;
    assert.equal(sendResponse.status, 200);
  });
});

test('single chat background finalize preserves a newer acknowledged user turn', async () => {
  const runtimeClient = createRuntimeStub();
  const originalSendMessage = runtimeClient.sendMessage.bind(runtimeClient);
  let releaseFirstDispatch = () => {};
  const firstDispatchBlocked = new Promise((resolve) => {
    releaseFirstDispatch = resolve;
  });
  let markFirstDispatchStarted = () => {};
  const firstDispatchStarted = new Promise((resolve) => {
    markFirstDispatchStarted = resolve;
  });
  let sendCount = 0;

  runtimeClient.sendMessage = async (sessionId, content) => {
    sendCount += 1;
    if (sendCount === 1) {
      markFirstDispatchStarted();
      await firstDispatchBlocked;
    }
    return originalSendMessage(sessionId, content);
  };

  await withServer(runtimeClient, async (baseUrl) => {
    const setupResponse = await fetch(`${baseUrl}/api/setup/complete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ownerDisplayName: 'Kenny',
        bossCatName: 'Smelly',
        bossCatProvider: 'claude',
      }),
    });
    assert.equal(setupResponse.status, 200);

    const createChannelResponse = await fetch(`${baseUrl}/api/channels`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: 'Stale Merge Guard',
        topic: 'Keep newer user turns while earlier dispatches finish.',
        skipBossCatGreeting: true,
      }),
    });
    assert.equal(createChannelResponse.status, 201);
    const createChannelPayload = await createChannelResponse.json();
    const channelId = createChannelPayload.channel.id;

    const firstSendResponse = await fetch(`${baseUrl}/api/channels/${channelId}/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ body: 'First question' }),
    });
    assert.equal(firstSendResponse.status, 200);
    const firstSendPayload = await firstSendResponse.json();
    assert.equal(firstSendPayload.phase, 'acknowledged');

    await firstDispatchStarted;

    const secondSendResponse = await fetch(`${baseUrl}/api/channels/${channelId}/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ body: 'Second question' }),
    });
    assert.equal(secondSendResponse.status, 200);
    const secondSendPayload = await secondSendResponse.json();
    assert.equal(secondSendPayload.phase, 'acknowledged');

    const acknowledgedChannelResponse = await fetch(`${baseUrl}/api/channels/${channelId}`);
    assert.equal(acknowledgedChannelResponse.status, 200);
    const acknowledgedChannelPayload = await acknowledgedChannelResponse.json();
    assert.deepEqual(
      acknowledgedChannelPayload.channel.messages
        .filter((message) => message.senderKind === 'user')
        .map((message) => message.body),
      ['First question', 'Second question'],
    );

    releaseFirstDispatch();

    const finalChannelPayload = await waitForCondition(async () => {
      const channelResponse = await fetch(`${baseUrl}/api/channels/${channelId}`);
      assert.equal(channelResponse.status, 200);
      const payload = await channelResponse.json();
      const userBodies = payload.channel.messages
        .filter((message) => message.senderKind === 'user')
        .map((message) => message.body);
      const assistantBodies = payload.channel.messages
        .filter((message) =>
          message.metadata?.event === 'assistant_turn_segment'
          && message.metadata?.terminal === true)
        .map((message) => message.body);
      return userBodies.includes('First question')
        && userBodies.includes('Second question')
        && assistantBodies.length >= 2
        ? payload
        : null;
    });

    assert.deepEqual(
      finalChannelPayload.channel.messages
        .filter((message) => message.senderKind === 'user')
        .map((message) => message.body),
      ['First question', 'Second question'],
    );
  });
});

test('single chat failure settlement preserves a newer acknowledged user turn', async () => {
  const runtimeClient = createRuntimeStub();
  const originalSendMessage = runtimeClient.sendMessage.bind(runtimeClient);
  let releaseFirstDispatch = () => {};
  const firstDispatchBlocked = new Promise((resolve) => {
    releaseFirstDispatch = resolve;
  });
  let markFirstDispatchStarted = () => {};
  const firstDispatchStarted = new Promise((resolve) => {
    markFirstDispatchStarted = resolve;
  });
  let sendCount = 0;

  runtimeClient.sendMessage = async (sessionId, content) => {
    sendCount += 1;
    if (sendCount === 1) {
      markFirstDispatchStarted();
      await firstDispatchBlocked;
      throw new Error('Injected runtime failure');
    }
    return originalSendMessage(sessionId, content);
  };

  await withServer(runtimeClient, async (baseUrl) => {
    const setupResponse = await fetch(`${baseUrl}/api/setup/complete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ownerDisplayName: 'Kenny',
        bossCatName: 'Smelly',
        bossCatProvider: 'claude',
      }),
    });
    assert.equal(setupResponse.status, 200);

    const createChannelResponse = await fetch(`${baseUrl}/api/channels`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: 'Failure Merge Guard',
        topic: 'Do not overwrite later ACKed turns on failure.',
        skipBossCatGreeting: true,
      }),
    });
    assert.equal(createChannelResponse.status, 201);
    const createChannelPayload = await createChannelResponse.json();
    const channelId = createChannelPayload.channel.id;

    const firstSendResponse = await fetch(`${baseUrl}/api/channels/${channelId}/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ body: 'First failing question' }),
    });
    assert.equal(firstSendResponse.status, 200);
    const firstSendPayload = await firstSendResponse.json();
    assert.equal(firstSendPayload.phase, 'acknowledged');

    await firstDispatchStarted;

    const secondSendResponse = await fetch(`${baseUrl}/api/channels/${channelId}/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ body: 'Second surviving question' }),
    });
    assert.equal(secondSendResponse.status, 200);
    const secondSendPayload = await secondSendResponse.json();
    assert.equal(secondSendPayload.phase, 'acknowledged');

    releaseFirstDispatch();

    const finalChannelPayload = await waitForCondition(async () => {
      const channelResponse = await fetch(`${baseUrl}/api/channels/${channelId}`);
      assert.equal(channelResponse.status, 200);
      const payload = await channelResponse.json();
      const userBodies = payload.channel.messages
        .filter((message) => message.senderKind === 'user')
        .map((message) => message.body);
      const runtimeError = payload.channel.messages.find((message) =>
        message.metadata?.event === 'runtime_error'
        && /Injected runtime failure/u.test(message.body));
      return userBodies.includes('First failing question')
        && userBodies.includes('Second surviving question')
        && runtimeError
        ? payload
        : null;
    });

    assert.deepEqual(
      finalChannelPayload.channel.messages
        .filter((message) => message.senderKind === 'user')
        .map((message) => message.body),
      ['First failing question', 'Second surviving question'],
    );
  });
});

test('parallel chat finalize preserves member mutations acknowledged after send ack', async () => {
  const runtimeClient = createRuntimeStub();
  const originalSendMessage = runtimeClient.sendMessage.bind(runtimeClient);
  let releaseDispatches = () => {};
  const dispatchBlocked = new Promise((resolve) => {
    releaseDispatches = resolve;
  });
  runtimeClient.sendMessage = async (sessionId, content) => {
    await dispatchBlocked;
    return originalSendMessage(sessionId, content);
  };

  await withServer(runtimeClient, async (baseUrl) => {
    const setupResponse = await fetch(`${baseUrl}/api/setup/complete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ownerDisplayName: 'Kenny',
        bossCatName: 'Smelly',
        bossCatProvider: 'claude',
      }),
    });
    assert.equal(setupResponse.status, 200);

    const createGroupResponse = await fetch(`${baseUrl}/api/concurrent-groups`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: 'Parallel Merge Guard',
        targets: [
          { provider: 'claude', instance: 'native' },
          { provider: 'codex', instance: 'native' },
        ],
      }),
    });
    assert.equal(createGroupResponse.status, 201);
    const createGroupPayload = await createGroupResponse.json();
    const groupId = createGroupPayload.group.id;
    const memberChannelIds = createGroupPayload.group.memberChannelIds;
    const activeChannelId =
      createGroupPayload.appShell.chat.selectedChannelId
      && memberChannelIds.includes(createGroupPayload.appShell.chat.selectedChannelId)
        ? createGroupPayload.appShell.chat.selectedChannelId
        : createGroupPayload.group.members[0]?.channelId ?? null;
    const passiveChannelId = memberChannelIds.find((channelId) => channelId !== activeChannelId) ?? null;
    assert.ok(activeChannelId);
    assert.ok(passiveChannelId);

    const sendResponse = await fetch(`${baseUrl}/api/concurrent-groups/${groupId}/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        activeChannelId,
        body: 'Hold the background finalize while I rename a member.',
      }),
    });
    assert.equal(sendResponse.status, 200);
    const sendPayload = await sendResponse.json();
    assert.equal(sendPayload.phase, 'acknowledged');

    const renameResponse = await fetch(`${baseUrl}/api/channels/${passiveChannelId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Renamed while pending' }),
    });
    assert.equal(renameResponse.status, 200);

    releaseDispatches();

    const passiveChannelPayload = await waitForCondition(async () => {
      const channelResponse = await fetch(`${baseUrl}/api/channels/${passiveChannelId}`);
      assert.equal(channelResponse.status, 200);
      const payload = await channelResponse.json();
      const runtimeReplies = payload.channel.messages.filter((message) =>
        message.metadata?.event === 'assistant_turn_segment'
        && message.metadata?.terminal === true);
      return runtimeReplies.length > 0 ? payload : null;
    });

    assert.equal(passiveChannelPayload.channel.title, 'Renamed while pending');
  });
});

test('parallel chat relay returns a validation error without relying on magic-string control flow', async () => {
  await withServer(createRuntimeStub(), async (baseUrl) => {
    const setupResponse = await fetch(`${baseUrl}/api/setup/complete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ownerDisplayName: 'Kenny',
        bossCatName: 'Smelly',
        bossCatProvider: 'claude',
      }),
    });
    assert.equal(setupResponse.status, 200);

    const createGroupResponse = await fetch(`${baseUrl}/api/concurrent-groups`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: 'Parallel Relay Validation',
        targets: [
          { provider: 'claude', instance: 'native' },
          { provider: 'codex', instance: 'native' },
        ],
      }),
    });
    assert.equal(createGroupResponse.status, 201);
    const createGroupPayload = await createGroupResponse.json();
    const groupId = createGroupPayload.group.id;
    const sourceChannelId = createGroupPayload.group.memberChannelIds[0];

    const relayResponse = await fetch(`${baseUrl}/api/concurrent-groups/${groupId}/relay`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        activeChannelId: '00000000-0000-4000-8000-000000000000',
        sourceChannelId,
        sourceMessageId: 'message-does-not-matter-yet',
        targetPolicy: 'all_others',
        command: 'check_this',
      }),
    });
    assert.equal(relayResponse.status, 400);
    const relayPayload = await relayResponse.json();
    assert.equal(relayPayload.error.code, 'channel_not_in_compare_group');
  });
});

test('ungrouping a parallel chat materializes member chats as standalone recents entries', async () => {
  await withServer(createRuntimeStub(), async (baseUrl) => {
    const setupResponse = await fetch(`${baseUrl}/api/setup/complete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ownerDisplayName: 'Kenny',
        bossCatName: 'Smelly',
        bossCatProvider: 'claude',
      }),
    });
    assert.equal(setupResponse.status, 200);

    const createGroupResponse = await fetch(`${baseUrl}/api/concurrent-groups`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: 'Parallel Race',
        targets: [
          { provider: 'claude', instance: 'native' },
          { provider: 'codex', instance: 'native', model: 'gpt-5.4' },
        ],
      }),
    });
    assert.equal(createGroupResponse.status, 201);
    const createGroupPayload = await createGroupResponse.json();
    const groupId = createGroupPayload.group.id;
    const memberChannelIds = createGroupPayload.group.memberChannelIds;

    const ungroupResponse = await fetch(`${baseUrl}/api/concurrent-groups/${groupId}/ungroup`, {
      method: 'POST',
      headers: { Accept: 'application/json' },
    });
    assert.equal(ungroupResponse.status, 200);

    const appShellResponse = await fetch(`${baseUrl}/api/app-shell`);
    assert.equal(appShellResponse.status, 200);
    const payload = await appShellResponse.json();

    assert.equal(payload.chat.parallelChatGroups.length, 0);
    const memberTitles = payload.chat.channels
      .filter((channel) => memberChannelIds.includes(channel.id))
      .map((channel) => channel.title);
    assert.equal(memberTitles.length, 2);
    assert.deepEqual(memberTitles, ['Parallel Race', 'Parallel Race']);
  });
});

test('solo chats without a cwd create isolated runtime sessions', async () => {
  const runtimeClient = createRuntimeStub();

  await withServer(runtimeClient, async (baseUrl) => {
    const setupResponse = await fetch(`${baseUrl}/api/platform/setup/complete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ownerDisplayName: 'Kenny',
        createBossCat: false,
      }),
    });
    assert.equal(setupResponse.status, 200);

    const createChannelResponse = await fetch(`${baseUrl}/api/channels`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: 'Solo Draft',
        topic: 'Start without a repo path.',
        composerMode: 'solo',
        pendingProvider: 'claude',
        pendingInstance: 'native',
        pendingModel: 'claude-opus-4-6',
        skipBossCatGreeting: true,
      }),
    });
    assert.equal(createChannelResponse.status, 201);
    const { channel } = await createChannelResponse.json();

    const messageResponse = await fetch(`${baseUrl}/api/channels/${channel.id}/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        body: 'Hello from solo mode',
        pendingProvider: 'claude',
        pendingInstance: 'native',
        pendingModel: 'claude-opus-4-6',
      }),
    });
    assert.equal(messageResponse.status, 200);
    const messagePayload = await messageResponse.json();
    assert.equal(messagePayload.phase, 'acknowledged');
    assert.equal(messagePayload.message.body, 'Hello from solo mode');

    await waitForCondition(() => runtimeClient.createdSessions.length === 1);
    assert.equal(runtimeClient.createdSessions[0].workspaceKind, 'sandbox');
    assert.equal(runtimeClient.createdSessions[0].workspaceAccess, 'read_write');
    assert.equal(runtimeClient.createdSessions[0].cwd, null);

    const channelPayload = await waitForCondition(async () => {
      const channelResponse = await fetch(`${baseUrl}/api/channels/${channel.id}`);
      assert.equal(channelResponse.status, 200);
      const payload = await channelResponse.json();
      return payload.channel.orchestratorLease.sessionId === 'session-1'
        ? payload
        : null;
    });

    assert.equal(channelPayload.channel.composerMode, 'solo');
    assert.equal(channelPayload.channel.orchestratorLease.sessionId, 'session-1');
    assert.equal(channelPayload.channel.orchestratorLease.status, 'ready');
    assert.match(
      channelPayload.channel.chatCwd ?? '',
      /\.cats[\\/]runtime[\\/]sessions[\\/]session-1$/u,
    );
    const soloReply = channelPayload.channel.messages.findLast(
      (message) => message.metadata?.targetKind === 'orchestrator',
    );
    assert.equal(soloReply?.senderKind, 'agent');
    assert.equal(soloReply?.senderName, 'Orchestrator');
  });
});

test('POST /api/channels/:channelId/activations recreates closed direct-lane sessions instead of reporting already started', async () => {
  const runtimeClient = createRuntimeStub();
  const chatStore = new MemoryChatStore();
  const now = new Date('2026-03-11T00:00:00.000Z');

  let state = await chatStore.read();
  state = createCat(
    state,
    {
      name: 'Resume-Agent',
      provider: 'claude',
      model: 'claude-opus-4-6',
    },
    now,
  );
  const catId = state.cats[0].id;
  state = createChannel(
    state,
    {
      title: 'Resume lane',
      topic: 'Manual activation should revive closed sessions.',
      roomMode: 'direct_cat_chat',
      defaultRecipientId: catId,
      participantCatIds: [catId],
      skipBossCatGreeting: true,
    },
    now,
  );
  const channelId = state.selectedChannelId;
  state.channels[0].channelKind = 'direct_lane';
  state.channels[0].roomRouting.mode = 'boss_chat';
  state = setChannelCatLease(
    state,
    channelId,
    catId,
    {
      sessionId: 'session-closed',
      status: 'error',
      lastError: 'Session is closed. Resume it first.',
      startedAt: now.toISOString(),
      lastUsedAt: now.toISOString(),
    },
    now,
  );
  await chatStore.write(state);

  runtimeClient.setObservedSession('session-closed', {
    session: {
      id: 'session-closed',
      status: 'closed',
    },
    observePath: '/sessions/session-closed/observe',
    stream: {
      path: '/sessions/session-closed/stream',
      available: false,
    },
  });

  await withServer(runtimeClient, async (baseUrl) => {
    const activateResponse = await fetch(`${baseUrl}/api/channels/${channelId}/activations`, {
      method: 'POST',
    });
    assert.equal(activateResponse.status, 200);
    const activatePayload = await activateResponse.json();

    assert.deepEqual(
      runtimeClient.createdSessions.map((session) => session.id),
      ['session-1'],
    );
    assert.deepEqual(
      activatePayload.activation.results.map((result) => result.targetKind),
      ['cat'],
    );
    const catResult = activatePayload.activation.results.find((result) => result.targetKind === 'cat');
    assert.equal(catResult?.status, 'started');
    assert.equal(catResult?.sessionId, 'session-1');

    const appShellResponse = await fetch(`${baseUrl}/api/app-shell`);
    assert.equal(appShellResponse.status, 200);
    const appShellPayload = await appShellResponse.json();
    assert.equal(
      appShellPayload.chat.selectedChannel.assignedCats[0].execution.lease.sessionId,
      'session-1',
    );
    assert.equal(
      appShellPayload.chat.selectedChannel.assignedCats[0].execution.lease.status,
      'ready',
    );
  }, chatStore);
});

test('POST /api/channels keeps direct lanes scoped to the lead cat only', async () => {
  const runtimeClient = createRuntimeStub();

  await withServer(runtimeClient, async (baseUrl) => {
    const setupResponse = await fetch(`${baseUrl}/api/setup/complete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ownerDisplayName: 'Kenny',
        bossCatName: 'Smelly',
        bossCatProvider: 'claude',
      }),
    });
    assert.equal(setupResponse.status, 200);

    const firstCatResponse = await fetch(`${baseUrl}/api/cats`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Lead Companion',
        provider: 'claude',
        model: 'claude-opus-4-6',
      }),
    });
    assert.equal(firstCatResponse.status, 201);
    const firstCatPayload = await firstCatResponse.json();
    const defaultRecipientCatId = firstCatPayload.cat.id;

    const secondCatResponse = await fetch(`${baseUrl}/api/cats`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Extra Cat',
        provider: 'gemini',
        model: 'gemini-3-flash',
      }),
    });
    assert.equal(secondCatResponse.status, 201);
    const secondCatPayload = await secondCatResponse.json();
    const extraCatId = secondCatPayload.cat.id;

    const createChannelResponse = await fetch(`${baseUrl}/api/channels`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: 'Scoped direct lane',
        topic: 'A direct lane should only keep its lead cat.',
        roomMode: 'direct_cat_chat',
        defaultRecipientId: defaultRecipientCatId,
        participantCatIds: [defaultRecipientCatId, extraCatId],
        skipBossCatGreeting: true,
      }),
    });
    assert.equal(createChannelResponse.status, 201);
    const createChannelPayload = await createChannelResponse.json();

    assert.equal(createChannelPayload.channel.roomRouting.mode, 'direct_cat_chat');
    assert.equal(createChannelPayload.channel.assignedCats.length, 1);
    assert.equal(createChannelPayload.channel.assignedCats[0].catId, defaultRecipientCatId);
    assert.equal(createChannelPayload.channel.roomRouting.defaultRecipientId, defaultRecipientCatId);
  });
});

test('PUT /api/channels/:channelId/cats/:catId rejects adding a non-lead cat to a direct lane', async () => {
  await withServer(createRuntimeStub(), async (baseUrl) => {
    const setupResponse = await fetch(`${baseUrl}/api/setup/complete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ownerDisplayName: 'Kenny',
        bossCatName: 'Smelly',
        bossCatProvider: 'claude',
      }),
    });
    assert.equal(setupResponse.status, 200);

    const leadCatResponse = await fetch(`${baseUrl}/api/cats`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Lead Companion',
        provider: 'claude',
        model: 'claude-opus-4-6',
      }),
    });
    assert.equal(leadCatResponse.status, 201);
    const leadCatPayload = await leadCatResponse.json();
    const defaultRecipientCatId = leadCatPayload.cat.id;

    const extraCatResponse = await fetch(`${baseUrl}/api/cats`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Extra Companion',
        provider: 'gemini',
        model: 'gemini-3-flash',
      }),
    });
    assert.equal(extraCatResponse.status, 201);
    const extraCatPayload = await extraCatResponse.json();
    const extraCatId = extraCatPayload.cat.id;

    const createChannelResponse = await fetch(`${baseUrl}/api/channels`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: 'Strict direct lane',
        topic: 'Reject adding any non-lead cats.',
        roomMode: 'direct_cat_chat',
        participantCatIds: [defaultRecipientCatId],
        defaultRecipientId: defaultRecipientCatId,
        skipBossCatGreeting: true,
      }),
    });
    assert.equal(createChannelResponse.status, 201);
    const createChannelPayload = await createChannelResponse.json();
    const channelId = createChannelPayload.channel.id;

    const assignResponse = await fetch(`${baseUrl}/api/channels/${channelId}/cats/${extraCatId}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        provider: 'gemini',
        model: 'gemini-3-flash',
      }),
    });
    assert.equal(assignResponse.status, 400);
    const assignPayload = await assignResponse.json();
    assert.equal(assignPayload.error.code, 'bad_request');
    assert.match(assignPayload.error.message, /Direct lanes can only contain their lead cat/u);

    const channelResponse = await fetch(`${baseUrl}/api/channels/${channelId}`);
    assert.equal(channelResponse.status, 200);
    const channelPayload = await channelResponse.json();
    assert.equal(channelPayload.channel.assignedCats.length, 1);
    assert.equal(channelPayload.channel.assignedCats[0].catId, defaultRecipientCatId);
    assert.equal(channelPayload.channel.roomRouting.defaultRecipientId, defaultRecipientCatId);
  });
});

test('PATCH /api/preferences does not overwrite the last wake request because selection no longer wakes rooms', async () => {
  const runtimeClient = createRuntimeStub();

  await withServer(runtimeClient, async (baseUrl) => {
    const setupResponse = await fetch(`${baseUrl}/api/setup/complete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ownerDisplayName: 'Kenny',
        bossCatName: 'Smelly',
        bossCatProvider: 'claude',
      }),
    });
    assert.equal(setupResponse.status, 200);

    const createChannelResponse = await fetch(`${baseUrl}/api/channels`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: 'Wake Boss Chat',
        topic: 'Do not rewrite wake history on re-entry.',
        skipBossCatGreeting: true,
      }),
    });
    assert.equal(createChannelResponse.status, 201);
    const createChannelPayload = await createChannelResponse.json();
    const channelId = createChannelPayload.channel.id;

    const sendResponse = await fetch(`${baseUrl}/api/channels/${channelId}/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ body: 'Start the room.' }),
    });
    assert.equal(sendResponse.status, 200);
    const firstChannelPayload = await waitForCondition(async () => {
      const firstChannelResponse = await fetch(`${baseUrl}/api/channels/${channelId}`);
      assert.equal(firstChannelResponse.status, 200);
      const payload = await firstChannelResponse.json();
      return payload.channel.roomRouting.lastWakeRequest?.completedAt
        ? payload
        : null;
    });
    const firstWakeCompletedAt = firstChannelPayload.channel.roomRouting.lastWakeRequest?.completedAt ?? null;

    const firstPrefsResponse = await fetch(`${baseUrl}/api/preferences`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ selectedChannelId: channelId }),
    });
    assert.equal(firstPrefsResponse.status, 200);

    const secondPrefsResponse = await fetch(`${baseUrl}/api/preferences`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ selectedChannelId: channelId }),
    });
    assert.equal(secondPrefsResponse.status, 200);

    const channelResponse = await fetch(`${baseUrl}/api/channels/${channelId}`);
    assert.equal(channelResponse.status, 200);
    const channelPayload = await channelResponse.json();

    assert.equal(runtimeClient.createdSessions.length, 1);
    assert.equal(channelPayload.channel.roomRouting.wakeHistory.length, 1);
    assert.equal(channelPayload.channel.roomRouting.lastWakeRequest.status, 'completed');
    assert.equal(
      channelPayload.channel.roomRouting.lastWakeRequest.completedAt,
      firstWakeCompletedAt,
    );
  });
});

test('PATCH /api/preferences only selects the requested direct chat lead without waking it', async () => {
  const runtimeClient = createRuntimeStub();

  await withServer(runtimeClient, async (baseUrl) => {
    const setupResponse = await fetch(`${baseUrl}/api/setup/complete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ownerDisplayName: 'Kenny',
        bossCatName: 'Smelly',
        bossCatProvider: 'claude',
      }),
    });
    assert.equal(setupResponse.status, 200);

    const createCatResponse = await fetch(`${baseUrl}/api/cats`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Companion',
        provider: 'claude',
        model: 'claude-opus-4-6',
      }),
    });
    assert.equal(createCatResponse.status, 201);
    const createCatPayload = await createCatResponse.json();
    const catId = createCatPayload.cat.id;

    const createChannelResponse = await fetch(`${baseUrl}/api/channels`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: 'Companion Direct',
        topic: 'Wake the lead cat on persisted room entry.',
        roomMode: 'direct_cat_chat',
        participantCatIds: [catId],
        defaultRecipientId: catId,
        skipBossCatGreeting: true,
      }),
    });
    assert.equal(createChannelResponse.status, 201);
    const createChannelPayload = await createChannelResponse.json();
    const channelId = createChannelPayload.channel.id;

    const updatePrefsResponse = await fetch(`${baseUrl}/api/preferences`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ selectedChannelId: channelId }),
    });
    assert.equal(updatePrefsResponse.status, 200);

    const channelResponse = await fetch(`${baseUrl}/api/channels/${channelId}`);
    assert.equal(channelResponse.status, 200);
    const channelPayload = await channelResponse.json();

    assert.equal(runtimeClient.createdSessions.length, 0);
    assert.equal(channelPayload.channel.roomRouting.mode, 'direct_cat_chat');
    assert.equal(channelPayload.channel.orchestratorLease.sessionId, null);
    assert.equal(
      channelPayload.channel.assignedCats[0].execution.lease.sessionId,
      null,
    );
    assert.equal(channelPayload.channel.roomRouting.lastWakeRequest, null);
  });
});

test('PATCH /api/cats/:id archive closes live direct-lane sessions and converts the room back to a visible chat', async () => {
  const runtimeClient = createRuntimeStub();

  await withServer(runtimeClient, async (baseUrl) => {
    const setupResponse = await fetch(`${baseUrl}/api/platform/setup/complete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ownerDisplayName: 'Kenny',
        createBossCat: false,
      }),
    });
    assert.equal(setupResponse.status, 200);

    const createCatResponse = await fetch(`${baseUrl}/api/cats`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Companion',
        provider: 'claude',
        model: 'claude-opus-4-6',
      }),
    });
    assert.equal(createCatResponse.status, 201);
    const createCatPayload = await createCatResponse.json();
    const catId = createCatPayload.cat.id;

    const bindingResponse = await fetch(`${baseUrl}/api/bot-bindings`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        platform: 'telegram',
        botName: 'companion_bot',
        catId,
        roomMode: 'direct_cat_chat',
        webhookSecret: 'companion-secret',
      }),
    });
    assert.equal(bindingResponse.status, 201);
    const bindingPayload = await bindingResponse.json();
    const bindingId = bindingPayload.botBinding.id;

    const createChannelResponse = await fetch(`${baseUrl}/api/channels`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: 'Companion Direct',
        topic: 'Archive should not leave a hidden zombie lane.',
        roomMode: 'direct_cat_chat',
        participantCatIds: [catId],
        defaultRecipientId: catId,
        skipBossCatGreeting: true,
      }),
    });
    assert.equal(createChannelResponse.status, 201);
    const createChannelPayload = await createChannelResponse.json();
    const channelId = createChannelPayload.channel.id;

    const wakeResponse = await fetch(`${baseUrl}/api/channels/${channelId}/activations`, {
      method: 'POST',
    });
    assert.equal(wakeResponse.status, 200);
    assert.equal(runtimeClient.createdSessions.length, 1);

    const archiveResponse = await fetch(`${baseUrl}/api/cats/${catId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ archive: true }),
    });
    assert.equal(archiveResponse.status, 200);
    const archivePayload = await archiveResponse.json();

    assert.ok(runtimeClient.closedSessions.includes('session-1'));
    assert.equal(archivePayload.chat.selectedChannel.id, channelId);
    assert.equal(archivePayload.chat.selectedChannel.roomRouting.mode, 'boss_chat');
    assert.equal(archivePayload.chat.selectedChannel.roomRouting.defaultRecipientId, null);
    assert.equal(archivePayload.chat.selectedChannel.composerMode, 'solo');
    assert.equal(archivePayload.chat.selectedChannel.assignedCats[0]?.status, 'removed');
    assert.equal(archivePayload.chat.channels[0]?.roomMode, 'boss_chat');
    assert.equal(
      archivePayload.chat.botBindings.find((binding) => binding.id === bindingId),
      undefined,
    );

    const listBindingsResponse = await fetch(`${baseUrl}/api/bot-bindings`);
    assert.equal(listBindingsResponse.status, 200);
    const listBindingsPayload = await listBindingsResponse.json();
    assert.equal(listBindingsPayload.botBindings.length, 0);

    const archivedWebhookResponse = await fetch(
      `${baseUrl}/api/transports/telegram/webhook/${bindingId}`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-telegram-bot-api-secret-token': 'companion-secret',
        },
        body: JSON.stringify({
          update_id: 101,
          message: {
            message_id: 88,
            text: 'hello archived cat',
            chat: { id: 12345, type: 'private' },
          },
        }),
      },
    );
    assert.equal(archivedWebhookResponse.status, 404);
  });
});

test('archived cats cannot receive new Telegram bot bindings', async () => {
  await withServer(createRuntimeStub(), async (baseUrl) => {
    const setupResponse = await fetch(`${baseUrl}/api/platform/setup/complete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ownerDisplayName: 'Kenny',
        createBossCat: false,
      }),
    });
    assert.equal(setupResponse.status, 200);

    const createCatResponse = await fetch(`${baseUrl}/api/cats`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Companion',
        provider: 'claude',
        model: 'claude-opus-4-6',
      }),
    });
    assert.equal(createCatResponse.status, 201);
    const createCatPayload = await createCatResponse.json();
    const catId = createCatPayload.cat.id;

    const archiveResponse = await fetch(`${baseUrl}/api/cats/${catId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ archive: true }),
    });
    assert.equal(archiveResponse.status, 200);

    const bindingResponse = await fetch(`${baseUrl}/api/bot-bindings`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        platform: 'telegram',
        botName: 'archived_companion',
        catId,
        roomMode: 'direct_cat_chat',
      }),
    });
    assert.equal(bindingResponse.status, 400);
    const bindingPayload = await bindingResponse.json();
    assert.match(bindingPayload.error.message, /Cat is not active/u);
  });
});

test('unarchiving a cat restores it without reviving Telegram bindings', async () => {
  await withServer(createRuntimeStub(), async (baseUrl) => {
    const setupResponse = await fetch(`${baseUrl}/api/platform/setup/complete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ownerDisplayName: 'Kenny',
        createBossCat: false,
      }),
    });
    assert.equal(setupResponse.status, 200);

    const createCatResponse = await fetch(`${baseUrl}/api/cats`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Companion',
        provider: 'claude',
        model: 'claude-opus-4-6',
      }),
    });
    assert.equal(createCatResponse.status, 201);
    const createCatPayload = await createCatResponse.json();
    const catId = createCatPayload.cat.id;

    const createChannelResponse = await fetch(`${baseUrl}/api/channels`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: 'Companion Direct',
        topic: 'Recover should rebuild the direct lane without waking it.',
        roomMode: 'direct_cat_chat',
        participantCatIds: [catId],
        defaultRecipientId: catId,
        skipBossCatGreeting: true,
      }),
    });
    assert.equal(createChannelResponse.status, 201);
    const createChannelPayload = await createChannelResponse.json();
    const channelId = createChannelPayload.channel.id;

    const avatarResponse = await fetch(`${baseUrl}/api/cats/${catId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ avatarUrl: 'data:image/png;base64,recoverable-avatar' }),
    });
    assert.equal(avatarResponse.status, 200);

    const bindingResponse = await fetch(`${baseUrl}/api/bot-bindings`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        platform: 'telegram',
        botName: 'companion_bot',
        catId,
        roomMode: 'direct_cat_chat',
      }),
    });
    assert.equal(bindingResponse.status, 201);

    const archiveResponse = await fetch(`${baseUrl}/api/cats/${catId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ archive: true }),
    });
    assert.equal(archiveResponse.status, 200);

    const unarchiveResponse = await fetch(`${baseUrl}/api/cats/${catId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ unarchive: true }),
    });
    assert.equal(unarchiveResponse.status, 200);
    const unarchivePayload = await unarchiveResponse.json();

    const recoveredCat = unarchivePayload.chat.cats.find((cat) => cat.id === catId);
    const recoveredChannel = unarchivePayload.chat.channels.find((channel) => channel.id === channelId);
    assert.equal(recoveredCat?.status, 'active');
    assert.equal(recoveredCat?.archivedAt, null);
    assert.equal(recoveredCat?.avatarUrl, 'data:image/png;base64,recoverable-avatar');
    assert.equal(recoveredChannel?.channelKind, 'direct_lane');
    assert.equal(recoveredChannel?.roomMode, 'direct_cat_chat');
    assert.equal(recoveredChannel?.defaultRecipientCatId, catId);
    assert.equal(recoveredChannel?.defaultRecipientLeaseStatus, 'not_started');
    assert.equal(unarchivePayload.chat.botBindings.length, 0);

    const reboundResponse = await fetch(`${baseUrl}/api/bot-bindings`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        platform: 'telegram',
        botName: 'companion_bot_rebound',
        catId,
        roomMode: 'direct_cat_chat',
      }),
    });
    assert.equal(reboundResponse.status, 201);
  });
});

test('PATCH /api/cats/:id clears the cat avatar when avatarUrl is null', async () => {
  await withServer(createRuntimeStub(), async (baseUrl) => {
    const setupResponse = await fetch(`${baseUrl}/api/platform/setup/complete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ownerDisplayName: 'Kenny',
        createBossCat: false,
      }),
    });
    assert.equal(setupResponse.status, 200);

    const createCatResponse = await fetch(`${baseUrl}/api/cats`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Companion',
        provider: 'claude',
        model: 'claude-opus-4-6',
      }),
    });
    assert.equal(createCatResponse.status, 201);
    const createCatPayload = await createCatResponse.json();
    const catId = createCatPayload.cat.id;

    const saveResponse = await fetch(`${baseUrl}/api/cats/${catId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ avatarUrl: 'data:image/png;base64,cat-avatar' }),
    });
    assert.equal(saveResponse.status, 200);

    const clearResponse = await fetch(`${baseUrl}/api/cats/${catId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ avatarUrl: null }),
    });
    assert.equal(clearResponse.status, 200);
    const clearPayload = await clearResponse.json();
    const clearedCat = clearPayload.chat.cats.find((cat) => cat.id === catId);
    assert.equal(clearedCat?.avatarUrl, null);
  });
});

test('DELETE /api/cats/:id removes Telegram bot bindings for the deleted cat', async () => {
  await withServer(createRuntimeStub(), async (baseUrl) => {
    const setupResponse = await fetch(`${baseUrl}/api/platform/setup/complete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ownerDisplayName: 'Kenny',
        createBossCat: false,
      }),
    });
    assert.equal(setupResponse.status, 200);

    const createCatResponse = await fetch(`${baseUrl}/api/cats`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Companion',
        provider: 'claude',
        model: 'claude-opus-4-6',
      }),
    });
    assert.equal(createCatResponse.status, 201);
    const createCatPayload = await createCatResponse.json();
    const catId = createCatPayload.cat.id;

    const bindingResponse = await fetch(`${baseUrl}/api/bot-bindings`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        platform: 'telegram',
        botName: 'companion_bot',
        catId,
        roomMode: 'direct_cat_chat',
      }),
    });
    assert.equal(bindingResponse.status, 201);

    const deleteResponse = await fetch(`${baseUrl}/api/cats/${catId}`, {
      method: 'DELETE',
    });
    assert.equal(deleteResponse.status, 200);

    const listBindingsResponse = await fetch(`${baseUrl}/api/bot-bindings`);
    assert.equal(listBindingsResponse.status, 200);
    const listBindingsPayload = await listBindingsResponse.json();
    assert.equal(listBindingsPayload.botBindings.length, 0);
  });
});

test('first send does not fall back to Boss Cat when a direct chat lead is missing', async () => {
  const runtimeClient = createRuntimeStub();

  await withServer(runtimeClient, async (baseUrl) => {
    const setupResponse = await fetch(`${baseUrl}/api/setup/complete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ownerDisplayName: 'Kenny',
        bossCatName: 'Smelly',
        bossCatProvider: 'claude',
      }),
    });
    assert.equal(setupResponse.status, 200);

    const createCatResponse = await fetch(`${baseUrl}/api/cats`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Companion',
        provider: 'claude',
        model: 'claude-opus-4-6',
      }),
    });
    assert.equal(createCatResponse.status, 201);
    const createCatPayload = await createCatResponse.json();
    const catId = createCatPayload.cat.id;

    const createChannelResponse = await fetch(`${baseUrl}/api/channels`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: 'Companion Direct',
        topic: 'Do not wake Boss Cat when the direct lead is gone.',
        roomMode: 'direct_cat_chat',
        participantCatIds: [catId],
        defaultRecipientId: catId,
        skipBossCatGreeting: true,
      }),
    });
    assert.equal(createChannelResponse.status, 201);
    const createChannelPayload = await createChannelResponse.json();
    const channelId = createChannelPayload.channel.id;

    const removeResponse = await fetch(`${baseUrl}/api/channels/${channelId}/cats/${catId}`, {
      method: 'DELETE',
    });
    assert.equal(removeResponse.status, 200);

    const sendResponse = await fetch(`${baseUrl}/api/channels/${channelId}/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ body: 'Hello?' }),
    });
    assert.equal(sendResponse.status, 200);

    const channelResponse = await fetch(`${baseUrl}/api/channels/${channelId}`);
    assert.equal(channelResponse.status, 200);
    const channelPayload = await channelResponse.json();

    assert.equal(runtimeClient.createdSessions.length, 0);
    assert.equal(channelPayload.channel.orchestratorLease.sessionId, null);
    assert.equal(channelPayload.channel.roomRouting.mode, 'direct_cat_chat');
    assert.equal(channelPayload.channel.roomRouting.lastWakeRequest, null);
    assert.equal(
      channelPayload.channel.messages.at(-1)?.metadata?.event,
      'routing_skipped',
    );
    assert.match(
      channelPayload.channel.messages.at(-1)?.body ?? '',
      /active lead Cat/i,
    );
  });
});

test('GET /api/app-shell stays read-only when booting a persisted room route', async () => {
  const runtimeClient = createRuntimeStub();

  await withServer(runtimeClient, async (baseUrl) => {
    const setupResponse = await fetch(`${baseUrl}/api/setup/complete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ownerDisplayName: 'Kenny',
        bossCatName: 'Smelly',
        bossCatProvider: 'claude',
      }),
    });
    assert.equal(setupResponse.status, 200);

    const createCatResponse = await fetch(`${baseUrl}/api/cats`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Companion',
        provider: 'claude',
        model: 'claude-opus-4-6',
      }),
    });
    assert.equal(createCatResponse.status, 201);
    const createCatPayload = await createCatResponse.json();
    const catId = createCatPayload.cat.id;

    const createChannelResponse = await fetch(`${baseUrl}/api/channels`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: 'Companion Direct',
        topic: 'App shell reads should not wake runtime sessions.',
        roomMode: 'direct_cat_chat',
        participantCatIds: [catId],
        defaultRecipientId: catId,
        skipBossCatGreeting: true,
      }),
    });
    assert.equal(createChannelResponse.status, 201);
    const createChannelPayload = await createChannelResponse.json();
    const channelId = createChannelPayload.channel.id;

    const appShellResponse = await fetch(`${baseUrl}/api/app-shell`, {
      headers: { 'x-cats-route-path': `/chats/${channelId}` },
    });
    assert.equal(appShellResponse.status, 200);
    const appShellPayload = await appShellResponse.json();

    assert.equal(runtimeClient.createdSessions.length, 0);
    assert.equal(appShellPayload.chat.selectedChannel.roomRouting.mode, 'direct_cat_chat');
    assert.equal(appShellPayload.chat.selectedChannel.orchestratorLease.sessionId, null);
    assert.equal(
      appShellPayload.chat.selectedChannel.assignedCats[0].execution.lease.sessionId,
      null,
    );
    assert.equal(appShellPayload.chat.selectedChannel.status, 'configured');
    assert.equal(appShellPayload.chat.selectedChannel.roomRouting.lastWakeRequest, null);
  });
});

test('re-adding a removed cat to an active chat wakes it again instead of leaving it sleeping', async () => {
  const runtimeClient = createRuntimeStub();

  await withServer(runtimeClient, async (baseUrl) => {
    const createChannelResponse = await fetch(`${baseUrl}/api/channels`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        title: 'Rejoin Wake',
        topic: 'Wake cats when they rejoin a live room.',
        repoPath: 'C:/repo/cats-platform',
        skipBossCatGreeting: true,
      }),
    });
    assert.equal(createChannelResponse.status, 201);
    const createChannelPayload = await createChannelResponse.json();
    const channelId = createChannelPayload.channel.id;

    const createCatResponse = await fetch(`${baseUrl}/api/cats`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Agent-Rejoin',
        provider: 'claude',
        model: 'claude-opus-4-6',
      }),
    });
    assert.equal(createCatResponse.status, 201);
    const createCatPayload = await createCatResponse.json();
    const catId = createCatPayload.cat.id;

    const activateResponse = await fetch(`${baseUrl}/api/channels/${channelId}/activations`, {
      method: 'POST',
    });
    assert.equal(activateResponse.status, 200);
    assert.equal(runtimeClient.createdSessions.length, 1);

    const firstAssignResponse = await fetch(`${baseUrl}/api/channels/${channelId}/cats/${catId}`, {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        provider: 'claude',
        model: 'claude-opus-4-6',
      }),
    });
    assert.equal(firstAssignResponse.status, 201);
    assert.equal(runtimeClient.createdSessions.length, 2);

    const removeResponse = await fetch(`${baseUrl}/api/channels/${channelId}/cats/${catId}`, {
      method: 'DELETE',
    });
    assert.equal(removeResponse.status, 200);

    const reassignResponse = await fetch(`${baseUrl}/api/channels/${channelId}/cats/${catId}`, {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        provider: 'claude',
        model: 'claude-opus-4-6',
      }),
    });
    assert.equal(reassignResponse.status, 200);
    const reassignPayload = await reassignResponse.json();

    assert.equal(runtimeClient.createdSessions.length, 3);
    assert.equal(reassignPayload.cat.execution.lease.sessionId, 'session-3');
    assert.equal(reassignPayload.cat.execution.lease.cwd, 'C:/repo/cats-platform');
    assert.ok(runtimeClient.closedSessions.includes('session-2'));
  });
});

test('attachment uploads sanitize names and avoid overwriting earlier files', async () => {
  const runtimeClient = createRuntimeStub();
  const tempWorkingDir = await mkdtemp(path.join(os.tmpdir(), 'cats-attachments-'));

  try {
    await withServer(runtimeClient, async (baseUrl) => {
      const createChannelResponse = await fetch(`${baseUrl}/api/channels`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          title: 'Attachment Uploads',
          topic: 'Verify unique attachment names.',
          repoPath: tempWorkingDir,
          skipBossCatGreeting: true,
        }),
      });
      assert.equal(createChannelResponse.status, 201);
      const createChannelPayload = await createChannelResponse.json();
      const channelId = createChannelPayload.channel.id;

      const uploadResponse = await fetch(`${baseUrl}/api/channels/${channelId}/attachments`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          files: [
            { name: 'notes.txt', data: Buffer.from('first').toString('base64') },
            { name: '../notes.txt', data: Buffer.from('second').toString('base64') },
            { name: '..', data: Buffer.from('third').toString('base64') },
          ],
        }),
      });
      assert.equal(uploadResponse.status, 200);
      const uploadPayload = await uploadResponse.json();

      assert.deepEqual(
        uploadPayload.attachments.map((attachment) => attachment.relativePath),
        [
          '.cats-attachments/notes.txt',
          '.cats-attachments/notes-2.txt',
          '.cats-attachments/attachment',
        ],
      );

      const firstContent = await readFile(path.join(tempWorkingDir, '.cats-attachments', 'notes.txt'), 'utf8');
      const secondContent = await readFile(path.join(tempWorkingDir, '.cats-attachments', 'notes-2.txt'), 'utf8');
      const thirdContent = await readFile(path.join(tempWorkingDir, '.cats-attachments', 'attachment'), 'utf8');

      assert.equal(firstContent, 'first');
      assert.equal(secondContent, 'second');
      assert.equal(thirdContent, 'third');
    });
  } finally {
    await rm(tempWorkingDir, { recursive: true, force: true });
  }
});

test('attachment serving only inlines raster images and forces download for active formats', async () => {
  const runtimeClient = createRuntimeStub();
  const tempWorkingDir = await mkdtemp(path.join(os.tmpdir(), 'cats-attachment-serve-'));

  try {
    await withServer(runtimeClient, async (baseUrl) => {
      const createChannelResponse = await fetch(`${baseUrl}/api/channels`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          title: 'Attachment Serving',
          topic: 'Verify attachment response headers.',
          repoPath: tempWorkingDir,
          skipBossCatGreeting: true,
        }),
      });
      assert.equal(createChannelResponse.status, 201);
      const createChannelPayload = await createChannelResponse.json();
      const channelId = createChannelPayload.channel.id;

      const uploadResponse = await fetch(`${baseUrl}/api/channels/${channelId}/attachments`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          files: [
            {
              name: 'photo.png',
              data: Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString('base64'),
            },
            {
              name: 'diagram.svg',
              data: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>').toString('base64'),
            },
          ],
        }),
      });
      assert.equal(uploadResponse.status, 200);

      const pngResponse = await fetch(`${baseUrl}/api/channels/${channelId}/attachments/photo.png`);
      assert.equal(pngResponse.status, 200);
      assert.equal(pngResponse.headers.get('content-type'), 'image/png');
      assert.match(
        pngResponse.headers.get('content-disposition') ?? '',
        /^inline;/,
      );
      assert.equal(
        pngResponse.headers.get('x-content-type-options'),
        'nosniff',
      );

      const svgResponse = await fetch(`${baseUrl}/api/channels/${channelId}/attachments/diagram.svg`);
      assert.equal(svgResponse.status, 200);
      assert.equal(svgResponse.headers.get('content-type'), 'image/svg+xml');
      assert.match(
        svgResponse.headers.get('content-disposition') ?? '',
        /^attachment;/,
      );
      assert.equal(
        svgResponse.headers.get('x-content-type-options'),
        'nosniff',
      );
    });
  } finally {
    await rm(tempWorkingDir, { recursive: true, force: true });
  }
});

test('attachment serving keeps no-repo chat files out of the state tree', async () => {
  const runtimeClient = createRuntimeStub();

  await withServer(runtimeClient, async (baseUrl, paths) => {
    const createChannelResponse = await fetch(`${baseUrl}/api/channels`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        title: 'Attachment Persistence',
        topic: 'Keep attachments stable across session restarts.',
        composerMode: 'solo',
        pendingProvider: 'claude',
        pendingInstance: 'native',
        pendingModel: 'claude-opus-4-6',
        skipBossCatGreeting: true,
      }),
    });
    assert.equal(createChannelResponse.status, 201);
    const createChannelPayload = await createChannelResponse.json();
    const channelId = createChannelPayload.channel.id;

    const uploadResponse = await fetch(`${baseUrl}/api/channels/${channelId}/attachments`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        files: [
          {
            name: 'photo.png',
            data: Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString('base64'),
          },
        ],
      }),
    });
    assert.equal(uploadResponse.status, 200);
    assert.equal(runtimeClient.createdSessions.length, 0);

    const firstAttachmentResponse = await fetch(
      `${baseUrl}/api/channels/${channelId}/attachments/photo.png`,
    );
    assert.equal(firstAttachmentResponse.status, 200);

    const messageResponse = await fetch(`${baseUrl}/api/channels/${channelId}/messages`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        body: 'Use the uploaded screenshot',
        pendingProvider: 'claude',
        pendingInstance: 'native',
        pendingModel: 'claude-opus-4-6',
      }),
    });
    assert.equal(messageResponse.status, 200);
    assert.equal(runtimeClient.createdSessions[0].cwd, null);

    const attachmentRoot = path.join(paths.runtimeDataDir, 'channels', channelId, '.cats-attachments');
    const storedAttachment = await readFile(path.join(attachmentRoot, 'photo.png'));
    assert.equal(storedAttachment.byteLength, 4);

    try {
      await access(path.join(paths.tempStateDir, 'channel-workspaces', channelId));
      assert.fail('no-repo chats should not recreate channel-workspaces under the state tree');
    } catch {
      // Expected: the legacy source-tree workspace should stay absent.
    }

    const secondAttachmentResponse = await fetch(
      `${baseUrl}/api/channels/${channelId}/attachments/photo.png`,
    );
    assert.equal(secondAttachmentResponse.status, 200);
    assert.equal(await secondAttachmentResponse.arrayBuffer().then((buffer) => buffer.byteLength), 4);
  });
});
