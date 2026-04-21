import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import {
  createParallelChatGroup,
  sendParallelChatMessage,
} from '../src/products/shared/renderer/api/chat.ts';
import { buildParallelChatDraftCreateInput } from '../src/products/shared/renderer/composerParallelDispatch.ts';

test('parallel chat client uses canonical parallel-chat-groups endpoints', async () => {
  const originalFetch = globalThis.fetch;
  const requests: Array<{ url: string; method: string; body: unknown }> = [];

  globalThis.fetch = async (input, init = {}) => {
    requests.push({
      url: String(input),
      method: init.method ?? 'GET',
      body: typeof init.body === 'string' ? JSON.parse(init.body) : null,
    });

    if (requests.length === 1) {
      return new Response(JSON.stringify({
        appShell: { chat: { selectedChannelId: 'channel-1' } },
        group: {
          id: 'group-1',
          memberChannelIds: ['channel-1', 'channel-2'],
          members: [],
        },
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({
      appShell: { chat: { selectedChannelId: 'channel-1' } },
      groupId: 'group-1',
      phase: 'acknowledged',
      results: [],
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  try {
    await createParallelChatGroup({
      title: 'Peer Code',
      originSurface: 'code',
      targets: [
        { provider: 'claude', instance: null, model: null, modelSelection: null },
        { provider: 'codex', instance: null, model: null, modelSelection: null },
      ],
      participantCatIds: ['cat-reviewer'],
      temporaryParticipants: [
        {
          participantId: 'temp-analyst',
          name: 'Analyst',
          provider: 'gemini',
          instance: 'native',
          model: 'gemini-3.1-pro',
          modelSelection: null,
          roleHint: 'Counterpoint',
        },
      ],
    });
    await sendParallelChatMessage('group-1', {
      activeChannelId: 'channel-1',
      body: 'hi',
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.deepEqual(requests, [
    {
      url: '/api/parallel-chat-groups',
      method: 'POST',
      body: {
        title: 'Peer Code',
        originSurface: 'code',
        targets: [
          { provider: 'claude', instance: null, model: null, modelSelection: null },
          { provider: 'codex', instance: null, model: null, modelSelection: null },
        ],
        participantCatIds: ['cat-reviewer'],
        temporaryParticipants: [
          {
            participantId: 'temp-analyst',
            name: 'Analyst',
            provider: 'gemini',
            instance: 'native',
            model: 'gemini-3.1-pro',
            modelSelection: null,
            roleHint: 'Counterpoint',
          },
        ],
      },
    },
    {
      url: '/api/parallel-chat-groups/group-1/messages',
      method: 'POST',
      body: {
        activeChannelId: 'channel-1',
        body: 'hi',
      },
    },
  ]);
});

test('parallel chat resource route keeps the legacy concurrent-groups alias', () => {
  const source = readFileSync(
    path.join(
      process.cwd(),
      'src/products/chat/api/resources/parallelChatGroupRoutes.ts',
    ),
    'utf8',
  );

  assert.match(source, /\/api\/parallel-chat-groups/u);
  assert.match(source, /\/api\/concurrent-groups/u);
  assert.match(source, /\(\?:parallel-chat-groups\|concurrent-groups\)/u);
});

test('workspace parallel draft create input carries group-level runtime session policy', () => {
  const createInput = buildParallelChatDraftCreateInput({
    body: 'Compare session policy propagation',
    existingCount: 0,
    originSurface: 'code',
    draftCwd: 'C:/repo/main',
    draftSessionPolicy: {
      workspaceKind: 'worktree',
      workspaceAccess: 'read_only',
      permissionMode: 'default',
    },
    draftParallelChatTargets: [
      {
        provider: 'claude',
        instance: null,
        model: 'claude-opus-4-6',
        modelSelection: null,
      },
      { provider: 'codex', instance: null, model: 'gpt-5.4', modelSelection: null },
    ],
    draftParallelBranches: [
      {
        target: {
          provider: 'claude',
          instance: null,
          model: 'claude-opus-4-6',
          modelSelection: null,
        },
        audienceKeys: ['cat:reviewer'],
        workflowShape: 'sequential',
      },
      {
        target: { provider: 'codex', instance: null, model: 'gpt-5.4', modelSelection: null },
        audienceKeys: [],
        workflowShape: 'sequential',
      },
    ],
  });

  assert.deepEqual(createInput.runtimeSessionPolicy, {
    workspaceKind: 'worktree',
    workspaceAccess: 'read_only',
    permissionMode: 'default',
  });
  assert.equal(createInput.repoPath, 'C:/repo/main');
  assert.deepEqual(createInput.targets.map((target) => target.audienceKeys), [
    ['cat:reviewer'],
    [],
  ]);
});
