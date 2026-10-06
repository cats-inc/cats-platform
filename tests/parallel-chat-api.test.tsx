import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import {
  createParallelChatGroup,
  sendChatMessage,
  sendParallelChatMessage,
} from '../src/products/shared/renderer/api/chat.ts';
import type { AppShellPayload } from '../src/products/shared/api/workspaceContracts.ts';
import {
  buildParallelChatDraftCreateInput,
  submitNewParallelChatDraft,
} from '../src/products/shared/renderer/composerParallelDispatch.ts';

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
          provider: 'antigravity',
          instance: 'native',
          model: 'antigravity-default',
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
            provider: 'antigravity',
            instance: 'native',
            model: 'antigravity-default',
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

test('chat message client preserves dispatch acknowledgement metadata', async () => {
  const originalFetch = globalThis.fetch;
  const requests: Array<{ url: string; method: string; body: unknown }> = [];
  const dispatch = {
    channelId: 'channel-1',
    results: [],
    orchestrator: {
      planId: 'plan-1',
      planner: 'dynamic_room_workflow',
      loopMode: 'checkpoint_driven',
      dispatchBoundary: 'supervised_runtime_boundary',
      runtimeToolBoundary: 'runtime_mcp_facade',
      initialTargets: [
        {
          targetKind: 'orchestrator',
          targetId: 'orchestrator',
          targetName: 'Orchestrator',
          laneId: 'lane-1',
          sessionId: null,
          trigger: 'room_default',
          plannedDepth: 0,
        },
      ],
    },
  };

  globalThis.fetch = async (input, init = {}) => {
    requests.push({
      url: String(input),
      method: init.method ?? 'GET',
      body: typeof init.body === 'string' ? JSON.parse(init.body) : null,
    });

    return new Response(JSON.stringify({
      appShell: { chat: { selectedChannelId: 'channel-1' } },
      message: null,
      phase: 'acknowledged',
      results: [],
      dispatch,
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  try {
    const payload = await sendChatMessage('channel-1', {
      body: 'hi',
    });

    assert.deepEqual(payload.dispatch, dispatch);
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.deepEqual(requests, [
    {
      url: '/api/channels/channel-1/messages',
      method: 'POST',
      body: {
        body: 'hi',
      },
    },
  ]);
});

test('parallel chat client posts detached branch cwd and runtime policy fields', async () => {
  const originalFetch = globalThis.fetch;
  const requests: Array<{ url: string; method: string; body: unknown }> = [];

  globalThis.fetch = async (input, init = {}) => {
    requests.push({
      url: String(input),
      method: init.method ?? 'GET',
      body: typeof init.body === 'string' ? JSON.parse(init.body) : null,
    });

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
  };

  try {
    await createParallelChatGroup({
      title: 'Peer Code',
      originSurface: 'code',
      repoPath: 'C:/repo/main',
      runtimeSessionPolicy: {
        workspaceKind: 'source',
        workspaceAccess: 'read_write',
        permissionMode: 'skip',
      },
      targets: [
        {
          provider: 'claude',
          instance: null,
          model: 'claude-opus-4-6',
          modelSelection: null,
        },
        {
          provider: 'codex',
          instance: null,
          model: 'gpt-5.4',
          modelSelection: null,
          cwd: 'C:/repo/worktrees/right',
          runtimeSessionPolicy: {
            workspaceKind: 'worktree',
            workspaceAccess: 'read_only',
            permissionMode: 'default',
          },
        },
      ],
      participantCatIds: [],
      temporaryParticipants: [],
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
        repoPath: 'C:/repo/main',
        runtimeSessionPolicy: {
          workspaceKind: 'source',
          workspaceAccess: 'read_write',
          permissionMode: 'skip',
        },
        targets: [
          {
            provider: 'claude',
            instance: null,
            model: 'claude-opus-4-6',
            modelSelection: null,
          },
          {
            provider: 'codex',
            instance: null,
            model: 'gpt-5.4',
            modelSelection: null,
            cwd: 'C:/repo/worktrees/right',
            runtimeSessionPolicy: {
              workspaceKind: 'worktree',
              workspaceAccess: 'read_only',
              permissionMode: 'default',
            },
          },
        ],
        participantCatIds: [],
        temporaryParticipants: [],
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
        audienceKeys: ['cat:reviewer'],
        workflowShape: 'sequential',
      },
      {
        provider: 'codex',
        instance: null,
        model: 'gpt-5.4',
        modelSelection: null,
        audienceKeys: [],
        workflowShape: 'sequential',
        cwd: 'C:/repo/worktrees/right',
        runtimeSessionPolicy: {
          workspaceKind: 'source',
          workspaceAccess: 'read_write',
          permissionMode: 'skip',
        },
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
  assert.equal(createInput.targets[1]?.cwd, 'C:/repo/worktrees/right');
  assert.deepEqual(createInput.targets[1]?.runtimeSessionPolicy, {
    workspaceKind: 'source',
    workspaceAccess: 'read_write',
    permissionMode: 'skip',
  });
});

test('workspace parallel submit sends branch prompt override bodies', async () => {
  const originalFetch = globalThis.fetch;
  const requests: Array<{ url: string; method: string; body: unknown }> = [];

  globalThis.fetch = async (input, init = {}) => {
    requests.push({
      url: String(input),
      method: init.method ?? 'GET',
      body: typeof init.body === 'string' ? JSON.parse(init.body) : null,
    });

    if (String(input) === '/api/parallel-chat-groups') {
      return new Response(JSON.stringify({
        appShell: { chat: { selectedChannelId: 'channel-1' } },
        group: {
          id: 'group-1',
          memberChannelIds: ['channel-1', 'channel-2'],
          members: [
            { channelId: 'channel-1' },
            { channelId: 'channel-2' },
          ],
        },
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({
      appShell: {
        chat: {
          channels: [
            { id: 'channel-1', routingStatus: 'idle' },
            { id: 'channel-2', routingStatus: 'running' },
          ],
        },
      },
      groupId: 'group-1',
      phase: 'acknowledged',
      results: [],
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  try {
    await submitNewParallelChatDraft({
      body: 'Lead prompt',
      payload: {
        chat: {
          channels: [],
          capabilities: { maxAudienceParticipants: 4 },
        },
      } as unknown as AppShellPayload,
      originSurface: 'code',
      draftCwd: null,
      draftFiles: [],
      draftParallelChatTargets: [
        {
          provider: 'claude',
          instance: null,
          model: 'claude-opus-4-6',
          modelSelection: null,
          audienceKeys: [],
          workflowShape: 'sequential',
        },
        {
          provider: 'codex',
          instance: null,
          model: 'gpt-5.4',
          modelSelection: null,
          audienceKeys: [],
          workflowShape: 'sequential',
          promptOverride: 'Branch prompt',
        },
      ],
      buildChannelPath: (channelId) => `/code/chats/${channelId}`,
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.deepEqual(requests[1]?.body, {
    activeChannelId: 'channel-1',
    body: 'Lead prompt',
    channelInputs: [
      {
        channelId: 'channel-1',
        body: 'Lead prompt',
      },
      {
        channelId: 'channel-2',
        body: 'Branch prompt',
      },
    ],
  });
});

test('workspace parallel submit applies draft cat picks to each lane before the first send', async () => {
  const originalFetch = globalThis.fetch;
  const requests: Array<{ method: string; url: string; body: unknown }> = [];
  const json = (body: unknown) => new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    const method = init.method ?? 'GET';
    requests.push({ method, url, body: typeof init.body === 'string' ? JSON.parse(init.body) : null });
    if (url === '/api/parallel-chat-groups') {
      return json({
        appShell: { chat: { selectedChannelId: 'lane-1' } },
        group: {
          id: 'group-1',
          memberChannelIds: ['lane-1', 'lane-2'],
          members: [{ channelId: 'lane-1' }, { channelId: 'lane-2' }],
        },
      });
    }
    if (method === 'PATCH') {
      return json({});
    }
    if (url === '/api/app-shell') {
      return json({ chat: { channels: [], cats: [], selectedChannelId: 'lane-1' } });
    }
    return json({
      appShell: { chat: { channels: [{ id: 'lane-1', routingStatus: 'running' }] } },
      groupId: 'group-1',
      phase: 'acknowledged',
      results: [],
    });
  };

  try {
    await submitNewParallelChatDraft({
      body: 'Compare these',
      payload: {
        chat: { channels: [], capabilities: { maxAudienceParticipants: 4 } },
      } as unknown as AppShellPayload,
      originSurface: 'chat',
      draftCwd: null,
      draftFiles: [],
      draftParticipantCatIds: ['mochi', 'tora'],
      draftParallelChatTargets: [
        { provider: 'claude', instance: null, model: 'opus', modelSelection: null,
          audienceKeys: ['cat:mochi'], workflowShape: 'sequential' },
        { provider: 'codex', instance: null, model: 'gpt-5.6-sol', modelSelection: null,
          audienceKeys: ['cat:mochi', 'cat:tora'], workflowShape: 'sequential' },
      ],
      draftCatExecutionTargetOverrides: new Map([[
        'mochi',
        { provider: 'codex', instance: 'native', model: 'gpt-5.6-sol', modelSelection: null },
      ]]),
      buildChannelPath: (channelId) => `/chat/chats/${channelId}`,
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  const patches = requests.filter((request) => request.method === 'PATCH');
  assert.deepEqual(patches.map((request) => request.url), [
    '/api/channels/lane-1/participants/mochi',
    '/api/channels/lane-2/participants/mochi',
  ]);
  assert.deepEqual(patches[0]?.body, {
    provider: 'codex', instance: 'native', model: 'gpt-5.6-sol', modelSelection: null,
  });
  const createIndex = requests.findIndex((request) => request.url === '/api/parallel-chat-groups');
  const sendIndex = requests.findIndex((request) =>
    request.method === 'POST' && request.url !== '/api/parallel-chat-groups');
  const lastPatchIndex = requests.indexOf(patches[patches.length - 1]!);
  assert.ok(createIndex < requests.indexOf(patches[0]!), 'picks are applied after the lanes exist');
  assert.ok(lastPatchIndex < sendIndex, 'every pick lands before the first message is sent');
});
