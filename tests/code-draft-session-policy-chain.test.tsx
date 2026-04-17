import assert from 'node:assert/strict';
import { once } from 'node:events';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createServer } from '../src/app/server/index.ts';
import { MemoryChatStore } from '../src/products/chat/state/store.ts';
import { buildNewChatChannelInput } from '../src/products/shared/renderer/workspaceChatUtils.tsx';

const baseConfig = {
  host: '127.0.0.1',
  port: 0,
  runtimeBaseUrl: 'http://127.0.0.1:3110',
  runtimeApiKey: '',
  chatStatePath: 'unused-for-tests',
};

interface RecordedSession {
  provider: string;
  cwd?: string | null;
  workspaceKind?: string | null;
  workspaceAccess?: string | null;
  permissionMode?: string | null;
  id: string;
}

function createRuntimeStub() {
  const createdSessions: RecordedSession[] = [];
  let nextSession = 1;
  return {
    createdSessions,
    async getHealth() {
      return {
        baseUrl: baseConfig.runtimeBaseUrl,
        reachable: true,
        status: 'ok',
        service: 'cats-runtime',
      };
    },
    async getProviderConfig() {
      return {};
    },
    async getProviderModels(provider: string) {
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
    async getAdvancedProviderModels(provider: string) {
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
        presets: [],
        controls: [],
        defaultSelection: null,
        support: { tier: 'entry_only' },
        warnings: [],
      };
    },
    async createSession(input: Record<string, unknown>) {
      const sessionId = `session-${nextSession++}`;
      createdSessions.push({ ...(input as RecordedSession), id: sessionId });
      return {
        id: sessionId,
        provider: String(input.provider),
        model: (input.model as string | null | undefined) ?? null,
        status: 'ready',
        cwd:
          (input.cwd as string | null | undefined)
          ?? path.join(os.tmpdir(), '.cats', 'runtime', 'sessions', sessionId),
      };
    },
    async sendMessage() {
      return {
        segments: [],
        inputTokens: 0,
        outputTokens: 0,
        tokensUsed: 0,
      };
    },
    async closeSession() {},
  };
}

async function withServer(
  runtimeClient: ReturnType<typeof createRuntimeStub>,
  callback: (baseUrl: string) => Promise<void>,
): Promise<void> {
  const chatStore = new MemoryChatStore();
  const server = createServer({
    shared: {
      config: baseConfig,
      runtimeClient: runtimeClient as unknown as Parameters<typeof createServer>[0]['shared']['runtimeClient'],
      now: () => new Date('2026-04-18T00:00:00.000Z'),
    },
    chat: { chatStore },
  });

  server.listen(0, '127.0.0.1');
  await once(server, 'listening');

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Failed to resolve test server address');
  }

  try {
    await callback(`http://127.0.0.1:${address.port}`);
  } finally {
    server.close();
    await once(server, 'close');
  }
}

test('code-draft session policy flows end-to-end from chip input to runtime session creation', async () => {
  const runtimeClient = createRuntimeStub();

  // 1. Chip state → CreateChatChannelInput via the renderer helper.
  const createInput = buildNewChatChannelInput({
    body: 'Ship a small feature on an isolated worktree',
    existingCount: 0,
    originSurface: 'code',
    entryKind: 'solo',
    repoPath: 'C:/repo/cats-platform',
    draftSessionPolicy: {
      workspaceKind: 'worktree',
      workspaceAccess: 'read_only',
      permissionMode: 'default',
    },
  });
  assert.equal(createInput.runtimeWorkspaceKind, 'worktree');
  assert.equal(createInput.runtimeWorkspaceAccess, 'read_only');
  assert.equal(createInput.runtimePermissionMode, 'default');

  await withServer(runtimeClient, async (baseUrl) => {
    // 2. POST that input to the server; assert the stored channel honours it.
    const createChannelResponse = await fetch(`${baseUrl}/api/channels`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...createInput, skipBossCatGreeting: true }),
    });
    assert.equal(createChannelResponse.status, 201);
    const createChannelPayload = await createChannelResponse.json();
    const channelId = createChannelPayload.channel.id;
    assert.equal(createChannelPayload.channel.runtimeWorkspaceKind, 'worktree');
    assert.equal(createChannelPayload.channel.runtimeWorkspaceAccess, 'read_only');
    assert.equal(createChannelPayload.channel.runtimePermissionMode, 'default');

    // 3. Create a cat and assign it — this triggers a runtime session start that
    //    should reuse the channel's persisted runtime policy.
    const createCatResponse = await fetch(`${baseUrl}/api/cats`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Chain Cat',
        provider: 'claude',
        model: 'claude-opus-4-6',
      }),
    });
    assert.equal(createCatResponse.status, 201);
    const createCatPayload = await createCatResponse.json();
    const catId = createCatPayload.cat.id;

    const assignResponse = await fetch(
      `${baseUrl}/api/channels/${channelId}/cats/${catId}`,
      {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          provider: 'claude',
          model: 'claude-opus-4-6',
        }),
      },
    );
    assert.equal(assignResponse.status, 201);

    // 4. Runtime client should receive the same policy the chip set.
    assert.equal(runtimeClient.createdSessions.length, 1);
    assert.equal(runtimeClient.createdSessions[0]?.workspaceKind, 'worktree');
    assert.equal(runtimeClient.createdSessions[0]?.workspaceAccess, 'read_only');
    assert.equal(runtimeClient.createdSessions[0]?.permissionMode, 'default');
  });
});
