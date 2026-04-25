import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import {
  RUNTIME_MESSAGE_SEND_TOOL,
  RUNTIME_SESSION_CREATE_TOOL,
  RUNTIME_SUPERVISION_BOUNDARY,
  createInMemoryToolEvidenceSink,
  createSupervisedRuntimeSession,
  sendSupervisedRuntimeMessage,
} from '../src/platform/supervision/index.ts';
import type { RuntimeClient } from '../src/platform/runtime/client.ts';

function createRuntimeStub(): RuntimeClient & {
  createdSessions: unknown[];
  sentMessages: unknown[];
} {
  return {
    createdSessions: [],
    sentMessages: [],
    async getHealth() {
      return {
        baseUrl: 'http://127.0.0.1:3110',
        reachable: true,
        status: 'ok',
      };
    },
    async getSetupState() {
      return {
        status: 'ready',
        providers: [],
        availableCount: 0,
        providerCount: 0,
        providersReadyToApply: [],
        providersNeedingAttention: [],
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
        models: [],
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
        models: [],
        presets: [],
        controls: [],
        warnings: [],
      };
    },
    async createSession(input) {
      this.createdSessions.push(input);
      return {
        id: 'runtime-session-1',
        provider: input.provider,
        model: input.model ?? null,
        status: 'ready',
        cwd: input.cwd ?? null,
      };
    },
    async sendMessage(sessionId, content, input) {
      this.sentMessages.push({ sessionId, content, input });
      return {
        segments: [{ kind: 'text', text: 'ok', toolName: null, toolId: null }],
        inputTokens: 1,
        outputTokens: 1,
        tokensUsed: 2,
      };
    },
    async observeSession() {
      return { session: {} };
    },
    async streamSession() {},
    async createWakeup() {
      return {
        request: { id: 'wakeup-1' },
        coalesced: false,
      };
    },
    async callMcp() {
      return null;
    },
    async cancelSession() {},
    async closeSession() {},
    async deleteSession(sessionId) {
      return {
        sessionId,
        status: 'deleted',
      };
    },
  };
}

test('runtime supervision adapter wraps createSession and sendMessage calls', async () => {
  const runtimeClient = createRuntimeStub();
  const evidenceSink = createInMemoryToolEvidenceSink();
  const supervision = {
    product: 'cats-chat',
    surface: 'runtime-dispatch',
    runId: 'channel-1',
    actionId: 'dispatch-1',
    actorRef: 'cat-1',
    reason: 'explicit_mentions',
    evidenceSink,
  };

  await createSupervisedRuntimeSession({
    runtimeClient,
    input: {
      provider: 'claude',
      model: 'sonnet',
      context: {
        source: 'interactive',
        reason: 'chat',
        metadata: {
          existing: 'preserved',
        },
      },
    },
    supervision,
  });
  await sendSupervisedRuntimeMessage({
    runtimeClient,
    sessionId: 'runtime-session-1',
    content: 'hello',
    input: {
      context: {
        source: 'interactive',
        reason: 'chat',
        metadata: {
          sourceMessageId: 'message-1',
        },
      },
    },
    supervision,
  });
  await sendSupervisedRuntimeMessage({
    runtimeClient,
    sessionId: 'runtime-session-1',
    content: 'rewrite without prior input',
    supervision: {
      ...supervision,
      surface: 'orchestrator-rewrite',
      actionId: 'dispatch-1:rewrite',
      reason: 'orchestrator_rewrite',
    },
  });

  const createdSession = runtimeClient.createdSessions[0] as {
    context?: { metadata?: Record<string, unknown> };
  };
  const sentMessage = runtimeClient.sentMessages[0] as {
    input?: { context?: { metadata?: Record<string, unknown> } };
  };
  const sentRewrite = runtimeClient.sentMessages[1] as {
    input?: { context?: { metadata?: Record<string, unknown> } };
  };

  assert.equal(
    createdSession.context?.metadata?.supervisionBoundary,
    RUNTIME_SUPERVISION_BOUNDARY,
  );
  assert.equal(createdSession.context?.metadata?.supervisionToolName, RUNTIME_SESSION_CREATE_TOOL);
  assert.equal(createdSession.context?.metadata?.existing, 'preserved');
  assert.equal(
    sentMessage.input?.context?.metadata?.supervisionBoundary,
    RUNTIME_SUPERVISION_BOUNDARY,
  );
  assert.equal(sentMessage.input?.context?.metadata?.supervisionToolName, RUNTIME_MESSAGE_SEND_TOOL);
  assert.equal(sentMessage.input?.context?.metadata?.sourceMessageId, 'message-1');
  assert.equal(
    sentRewrite.input?.context?.metadata?.supervisionBoundary,
    RUNTIME_SUPERVISION_BOUNDARY,
  );
  assert.equal(sentRewrite.input?.context?.metadata?.supervisionSurface, 'orchestrator-rewrite');
  assert.deepEqual(evidenceSink.read().map((event) => event.toolName), [
    RUNTIME_SESSION_CREATE_TOOL,
    RUNTIME_MESSAGE_SEND_TOOL,
    RUNTIME_MESSAGE_SEND_TOOL,
  ]);
});

test('Chat runtime cutover points do not call runtime directly', () => {
  const files = [
    {
      path: 'src/products/chat/state/runtime-dispatch/execution.ts',
      forbidden: ['runtimeClient.sendMessage('],
      required: ['sendSupervisedRuntimeMessage'],
    },
    {
      path: 'src/products/chat/state/runtime-session/sessionStart.ts',
      forbidden: ['runtimeClient.createSession('],
      required: ['createSupervisedRuntimeSession'],
    },
    {
      path: 'src/products/chat/api/routeSupport.ts',
      forbidden: ['runtimeClient.createSession('],
      required: ['createSupervisedRuntimeSession'],
    },
  ];

  for (const file of files) {
    const source = readFileSync(path.join(process.cwd(), file.path), 'utf8');

    for (const required of file.required) {
      assert.equal(
        source.includes(required),
        true,
        `${file.path} must use ${required}`,
      );
    }
    for (const forbidden of file.forbidden) {
      assert.equal(
        source.includes(forbidden),
        false,
        `${file.path} must not use ${forbidden}`,
      );
    }
  }
});
