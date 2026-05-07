import assert from 'node:assert/strict';
import test from 'node:test';

import {
  appendOptimisticUserMessage,
  applyOptimisticPendingExecutionTarget,
  preserveOptimisticUserMessageAfterRefresh,
} from '../src/products/shared/renderer/workspaceChatUtils.tsx';
import {
  clearAllPendingOptimisticSends,
  clearPendingOptimisticSend,
  listPendingOptimisticSends,
  registerPendingOptimisticSend,
} from '../src/products/shared/renderer/pendingOptimisticSends.ts';
import {
  preservePendingOptimisticSendsAfterWorkspaceRefresh,
} from '../src/products/shared/renderer/optimisticRefresh.ts';

function createPayload(overrides: Record<string, unknown> = {}) {
  return {
    ownerDisplayName: 'Kenny',
    metadata: {
      generatedAt: '2026-04-20T12:00:00.000Z',
      requestId: 'request-1',
      version: 'test',
    },
    chat: {
      selectedChannelId: 'channel-1',
      selectedChannel: {
        id: 'channel-1',
        title: 'Room',
        topic: 'Test room',
        unreadCount: 2,
        updatedAt: '2026-04-20T12:00:00.000Z',
        lastMessageAt: null,
        pendingProvider: 'claude',
        pendingModel: 'opus',
        pendingInstance: 'native',
        pendingModelSelection: null,
        messages: [],
      },
      channels: [
        {
          id: 'channel-1',
          title: 'Room',
          topic: 'Test room',
          unreadCount: 2,
          lastMessageAt: null,
          pendingProvider: 'claude',
          pendingModel: 'opus',
          pendingModelSelection: null,
        },
      ],
    },
    ...overrides,
  } as never;
}

test('appendOptimisticUserMessage stamps the selected room and summary with one optimistic user turn', () => {
  const payload = createPayload();
  const before = Date.now();

  const { payload: next, optimisticMessageId } = appendOptimisticUserMessage(
    payload,
    'channel-1',
    'Ship it.',
  );
  const createdAt = next.chat.selectedChannel?.messages[0]?.createdAt ?? '';

  assert.notEqual(next, payload);
  assert.equal(next.chat.selectedChannel?.messages.length, 1);
  assert.equal(next.chat.selectedChannel?.messages[0]?.id, optimisticMessageId);
  assert.match(
    optimisticMessageId,
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu,
  );
  assert.equal(next.chat.selectedChannel?.messages[0]?.senderKind, 'user');
  assert.equal(next.chat.selectedChannel?.messages[0]?.senderName, 'Kenny');
  assert.equal(next.chat.selectedChannel?.messages[0]?.metadata?.optimistic, true);
  assert.equal(next.chat.selectedChannel?.updatedAt, createdAt);
  assert.equal(next.chat.selectedChannel?.lastMessageAt, createdAt);
  assert.equal(next.chat.selectedChannel?.unreadCount, 0);
  assert.equal(next.chat.channels[0]?.lastMessageAt, createdAt);
  assert.equal(next.chat.channels[0]?.unreadCount, 0);
  assert.equal(next.metadata.generatedAt, createdAt);
  assert.ok(Date.parse(createdAt) >= before);
  assert.equal(payload.chat.selectedChannel?.messages.length, 0);
});

test('appendOptimisticUserMessage rejects payloads without the active selected room', () => {
  assert.throws(
    () => appendOptimisticUserMessage(createPayload({
      chat: {
        selectedChannelId: 'channel-2',
        selectedChannel: null,
        channels: [],
      },
    }), 'channel-1', 'Ship it.'),
    /No chat is available for optimistic updates/u,
  );
});

test('applyOptimisticPendingExecutionTarget updates the selected room and summary in place on the cloned payload', () => {
  const payload = createPayload();

  const next = applyOptimisticPendingExecutionTarget(payload, 'channel-1', {
    pendingProvider: 'codex',
    pendingModel: 'gpt-5.4',
    pendingInstance: 'main',
    pendingModelSelection: {
      entryId: 'gpt-5.4',
      entryMode: 'explicit',
    },
  });

  assert.notEqual(next, payload);
  assert.equal(next.chat.selectedChannel?.pendingProvider, 'codex');
  assert.equal(next.chat.selectedChannel?.pendingModel, 'gpt-5.4');
  assert.equal(next.chat.selectedChannel?.pendingInstance, 'main');
  assert.deepEqual(next.chat.selectedChannel?.pendingModelSelection, {
    entryId: 'gpt-5.4',
    entryMode: 'explicit',
  });
  assert.equal(next.chat.channels[0]?.pendingProvider, 'codex');
  assert.equal(next.chat.channels[0]?.pendingModel, 'gpt-5.4');
  assert.deepEqual(next.chat.channels[0]?.pendingModelSelection, {
    entryId: 'gpt-5.4',
    entryMode: 'explicit',
  });
  assert.equal(payload.chat.selectedChannel?.pendingProvider, 'claude');
});

test('preserveOptimisticUserMessageAfterRefresh replays the latest optimistic turn when refresh drops it', () => {
  const optimisticMessage = {
    id: '17c0bd79-e36d-4532-af2b-36b70a629198',
    channelId: 'channel-1',
    senderKind: 'user',
    senderName: 'Kenny',
    body: 'Still sending...',
    mentions: [],
    metadata: {
      optimistic: true,
    },
    usage: null,
    createdAt: '2026-04-20T12:01:00.000Z',
  };
  const previousPayload = createPayload({
    chat: {
      selectedChannelId: 'channel-1',
      selectedChannel: {
        id: 'channel-1',
        title: 'Room',
        topic: 'Test room',
        unreadCount: 0,
        updatedAt: '2026-04-20T12:01:00.000Z',
        lastMessageAt: '2026-04-20T12:01:00.000Z',
        pendingProvider: 'claude',
        pendingModel: 'opus',
        pendingInstance: 'native',
        pendingModelSelection: null,
        messages: [
          {
            id: 'message-earlier',
            channelId: 'channel-1',
            senderKind: 'user',
            senderName: 'Kenny',
            body: 'Earlier',
            mentions: [],
            metadata: {},
            usage: null,
            createdAt: '2026-04-20T12:00:30.000Z',
          },
          optimisticMessage,
        ],
      },
      channels: [
        {
          id: 'channel-1',
          title: 'Room',
          topic: 'Test room',
          unreadCount: 0,
          lastMessageAt: '2026-04-20T12:01:00.000Z',
          pendingProvider: 'claude',
          pendingModel: 'opus',
          pendingModelSelection: null,
        },
      ],
    },
  });
  const refreshedPayload = createPayload({
    metadata: {
      generatedAt: '2026-04-20T12:01:05.000Z',
      requestId: 'request-2',
      version: 'test',
    },
    chat: {
      selectedChannelId: 'channel-1',
      selectedChannel: {
        id: 'channel-1',
        title: 'Room',
        topic: 'Test room',
        unreadCount: 3,
        updatedAt: '2026-04-20T12:01:05.000Z',
        lastMessageAt: '2026-04-20T12:00:30.000Z',
        pendingProvider: 'claude',
        pendingModel: 'opus',
        pendingInstance: 'native',
        pendingModelSelection: null,
        messages: [
          {
            id: 'message-earlier',
            channelId: 'channel-1',
            senderKind: 'user',
            senderName: 'Kenny',
            body: 'Earlier',
            mentions: [],
            metadata: {},
            usage: null,
            createdAt: '2026-04-20T12:00:30.000Z',
          },
        ],
      },
      channels: [
        {
          id: 'channel-1',
          title: 'Room',
          topic: 'Test room',
          unreadCount: 3,
          lastMessageAt: '2026-04-20T12:00:30.000Z',
          pendingProvider: 'claude',
          pendingModel: 'opus',
          pendingModelSelection: null,
        },
      ],
    },
  });

  const next = preserveOptimisticUserMessageAfterRefresh(
    previousPayload,
    refreshedPayload,
    'channel-1',
    optimisticMessage.id,
  );

  assert.notEqual(next, refreshedPayload);
  assert.equal(next.chat.selectedChannel?.messages.length, 2);
  assert.deepEqual(next.chat.selectedChannel?.messages[1], optimisticMessage);
  assert.equal(next.chat.selectedChannel?.updatedAt, optimisticMessage.createdAt);
  assert.equal(next.chat.selectedChannel?.lastMessageAt, optimisticMessage.createdAt);
  assert.equal(next.chat.selectedChannel?.unreadCount, 0);
  assert.equal(next.chat.channels[0]?.lastMessageAt, optimisticMessage.createdAt);
  assert.equal(next.chat.channels[0]?.unreadCount, 0);
  assert.equal(next.metadata.generatedAt, optimisticMessage.createdAt);
});

test('preserveOptimisticUserMessageAfterRefresh leaves refresh payload unchanged when the optimistic turn already survived', () => {
  const optimisticMessage = {
    id: '17c0bd79-e36d-4532-af2b-36b70a629198',
    channelId: 'channel-1',
    senderKind: 'user',
    senderName: 'Kenny',
    body: 'Still sending...',
    mentions: [],
    metadata: {
      optimistic: true,
    },
    usage: null,
    createdAt: '2026-04-20T12:01:00.000Z',
  };
  const previousPayload = createPayload({
    chat: {
      selectedChannelId: 'channel-1',
      selectedChannel: {
        id: 'channel-1',
        title: 'Room',
        topic: 'Test room',
        unreadCount: 0,
        updatedAt: '2026-04-20T12:01:00.000Z',
        lastMessageAt: '2026-04-20T12:01:00.000Z',
        pendingProvider: 'claude',
        pendingModel: 'opus',
        pendingInstance: 'native',
        pendingModelSelection: null,
        messages: [optimisticMessage],
      },
      channels: [
        {
          id: 'channel-1',
          title: 'Room',
          topic: 'Test room',
          unreadCount: 0,
          lastMessageAt: '2026-04-20T12:01:00.000Z',
          pendingProvider: 'claude',
          pendingModel: 'opus',
          pendingModelSelection: null,
        },
      ],
    },
  });
  const refreshedPayload = createPayload({
    chat: {
      selectedChannelId: 'channel-1',
      selectedChannel: {
        id: 'channel-1',
        title: 'Room',
        topic: 'Test room',
        unreadCount: 0,
        updatedAt: '2026-04-20T12:01:00.000Z',
        lastMessageAt: '2026-04-20T12:01:00.000Z',
        pendingProvider: 'claude',
        pendingModel: 'opus',
        pendingInstance: 'native',
        pendingModelSelection: null,
        messages: [optimisticMessage],
      },
      channels: [
        {
          id: 'channel-1',
          title: 'Room',
          topic: 'Test room',
          unreadCount: 0,
          lastMessageAt: '2026-04-20T12:01:00.000Z',
          pendingProvider: 'claude',
          pendingModel: 'opus',
          pendingModelSelection: null,
        },
      ],
    },
  });

  assert.equal(
    preserveOptimisticUserMessageAfterRefresh(
      previousPayload,
      refreshedPayload,
      'channel-1',
      optimisticMessage.id,
    ),
    refreshedPayload,
  );
});

test('preserveOptimisticUserMessageAfterRefresh rejects refreshed id collisions', () => {
  const optimisticMessage = {
    id: '17c0bd79-e36d-4532-af2b-36b70a629198',
    channelId: 'channel-1',
    senderKind: 'user',
    senderName: 'Kenny',
    body: 'Still sending...',
    mentions: [],
    metadata: {
      optimistic: true,
    },
    usage: null,
    createdAt: '2026-04-20T12:01:00.000Z',
  };
  const previousPayload = createPayload({
    chat: {
      selectedChannelId: 'channel-1',
      selectedChannel: {
        id: 'channel-1',
        title: 'Room',
        topic: 'Test room',
        unreadCount: 0,
        updatedAt: '2026-04-20T12:01:00.000Z',
        lastMessageAt: '2026-04-20T12:01:00.000Z',
        pendingProvider: 'claude',
        pendingModel: 'opus',
        pendingInstance: 'native',
        pendingModelSelection: null,
        messages: [optimisticMessage],
      },
      channels: [
        {
          id: 'channel-1',
          title: 'Room',
          topic: 'Test room',
          unreadCount: 0,
          lastMessageAt: '2026-04-20T12:01:00.000Z',
          pendingProvider: 'claude',
          pendingModel: 'opus',
          pendingModelSelection: null,
        },
      ],
    },
  });
  const refreshedMessage = {
    ...optimisticMessage,
    senderKind: 'assistant',
    body: 'Different owner of the same id',
    metadata: {},
  };
  const refreshedPayload = createPayload({
    chat: {
      selectedChannelId: 'channel-1',
      selectedChannel: {
        id: 'channel-1',
        title: 'Room',
        topic: 'Test room',
        unreadCount: 0,
        updatedAt: '2026-04-20T12:01:01.000Z',
        lastMessageAt: '2026-04-20T12:01:01.000Z',
        pendingProvider: 'claude',
        pendingModel: 'opus',
        pendingInstance: 'native',
        pendingModelSelection: null,
        messages: [refreshedMessage],
      },
      channels: [
        {
          id: 'channel-1',
          title: 'Room',
          topic: 'Test room',
          unreadCount: 0,
          lastMessageAt: '2026-04-20T12:01:01.000Z',
          pendingProvider: 'claude',
          pendingModel: 'opus',
          pendingModelSelection: null,
        },
      ],
    },
  });
  const warnings: unknown[][] = [];
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => {
    warnings.push(args);
  };
  try {
    assert.equal(
      preserveOptimisticUserMessageAfterRefresh(
        previousPayload,
        refreshedPayload,
        'channel-1',
        optimisticMessage.id,
      ),
      refreshedPayload,
    );
    assert.equal(warnings.length, 1);
    assert.equal(
      (warnings[0]?.[1] as { feature?: string } | undefined)?.feature,
      'chat_optimistic_message_preserve',
    );
  } finally {
    console.warn = originalWarn;
  }
});

test('pending optimistic send registry replaces defensively and clears by id', () => {
  clearAllPendingOptimisticSends();
  const warnings: unknown[][] = [];
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => {
    warnings.push(args);
  };
  try {
    registerPendingOptimisticSend('channel-1', '17c0bd79-e36d-4532-af2b-36b70a629198');
    registerPendingOptimisticSend('channel-1', '00e18b96-e1b5-4bb1-b16c-7e47365ae23a');

    assert.deepEqual(listPendingOptimisticSends(), [
      {
        channelId: 'channel-1',
        optimisticMessageId: '00e18b96-e1b5-4bb1-b16c-7e47365ae23a',
      },
    ]);
    assert.equal(warnings.length, 1);
    assert.equal(
      (warnings[0]?.[1] as { feature?: string } | undefined)?.feature,
      'chat_optimistic_message_replaced_in_flight',
    );

    clearPendingOptimisticSend('channel-1', 'wrong-id');
    assert.equal(listPendingOptimisticSends().length, 1);
    clearPendingOptimisticSend('channel-1', '00e18b96-e1b5-4bb1-b16c-7e47365ae23a');
    assert.equal(listPendingOptimisticSends().length, 0);
  } finally {
    console.warn = originalWarn;
    clearAllPendingOptimisticSends();
  }
});

test('workspace chat refresh preserves registered pending optimistic sends', () => {
  clearAllPendingOptimisticSends();
  const optimisticMessage = {
    id: '17c0bd79-e36d-4532-af2b-36b70a629198',
    channelId: 'channel-1',
    senderKind: 'user',
    senderName: 'Kenny',
    body: 'Still sending...',
    mentions: [],
    metadata: {
      optimistic: true,
    },
    usage: null,
    createdAt: '2026-04-20T12:01:00.000Z',
  };
  const previousPayload = createPayload({
    chat: {
      selectedChannelId: 'channel-1',
      selectedChannel: {
        id: 'channel-1',
        title: 'Room',
        topic: 'Test room',
        unreadCount: 0,
        updatedAt: '2026-04-20T12:01:00.000Z',
        lastMessageAt: '2026-04-20T12:01:00.000Z',
        pendingProvider: 'claude',
        pendingModel: 'opus',
        pendingInstance: 'native',
        pendingModelSelection: null,
        messages: [optimisticMessage],
      },
      channels: [
        {
          id: 'channel-1',
          title: 'Room',
          topic: 'Test room',
          unreadCount: 0,
          lastMessageAt: '2026-04-20T12:01:00.000Z',
          pendingProvider: 'claude',
          pendingModel: 'opus',
          pendingModelSelection: null,
        },
      ],
    },
  });
  const refreshedPayload = createPayload({
    metadata: {
      generatedAt: '2026-04-20T12:01:01.000Z',
      requestId: 'request-2',
      version: 'test',
    },
    chat: {
      selectedChannelId: 'channel-1',
      selectedChannel: {
        id: 'channel-1',
        title: 'Room',
        topic: 'Test room',
        unreadCount: 0,
        updatedAt: '2026-04-20T12:01:01.000Z',
        lastMessageAt: '2026-04-20T12:00:59.000Z',
        pendingProvider: 'claude',
        pendingModel: 'opus',
        pendingInstance: 'native',
        pendingModelSelection: null,
        messages: [],
      },
      channels: [
        {
          id: 'channel-1',
          title: 'Room',
          topic: 'Test room',
          unreadCount: 0,
          lastMessageAt: '2026-04-20T12:00:59.000Z',
          pendingProvider: 'claude',
          pendingModel: 'opus',
          pendingModelSelection: null,
        },
      ],
    },
  });

  try {
    registerPendingOptimisticSend('channel-1', optimisticMessage.id);
    const next = preservePendingOptimisticSendsAfterWorkspaceRefresh(
      previousPayload,
      refreshedPayload,
    );

    assert.equal(next.chat.selectedChannel?.messages.length, 1);
    assert.deepEqual(next.chat.selectedChannel?.messages[0], optimisticMessage);
  } finally {
    clearAllPendingOptimisticSends();
  }
});

test('workspace chat refresh preserves the registered optimistic id, not the latest row', () => {
  clearAllPendingOptimisticSends();
  const registeredOptimisticMessage = {
    id: '17c0bd79-e36d-4532-af2b-36b70a629198',
    channelId: 'channel-1',
    senderKind: 'user',
    senderName: 'Kenny',
    body: 'Registered send.',
    mentions: [],
    metadata: {
      optimistic: true,
    },
    usage: null,
    createdAt: '2026-04-20T12:01:00.000Z',
  };
  const laterOptimisticMessage = {
    ...registeredOptimisticMessage,
    id: '00e18b96-e1b5-4bb1-b16c-7e47365ae23a',
    body: 'Later local row.',
    createdAt: '2026-04-20T12:01:05.000Z',
  };
  const previousPayload = createPayload({
    chat: {
      selectedChannelId: 'channel-1',
      selectedChannel: {
        id: 'channel-1',
        title: 'Room',
        topic: 'Test room',
        unreadCount: 0,
        updatedAt: '2026-04-20T12:01:05.000Z',
        lastMessageAt: '2026-04-20T12:01:05.000Z',
        pendingProvider: 'claude',
        pendingModel: 'opus',
        pendingInstance: 'native',
        pendingModelSelection: null,
        messages: [registeredOptimisticMessage, laterOptimisticMessage],
      },
      channels: [
        {
          id: 'channel-1',
          title: 'Room',
          topic: 'Test room',
          unreadCount: 0,
          lastMessageAt: '2026-04-20T12:01:05.000Z',
          pendingProvider: 'claude',
          pendingModel: 'opus',
          pendingModelSelection: null,
        },
      ],
    },
  });
  const refreshedPayload = createPayload({
    metadata: {
      generatedAt: '2026-04-20T12:01:06.000Z',
      requestId: 'request-2',
      version: 'test',
    },
    chat: {
      selectedChannelId: 'channel-1',
      selectedChannel: {
        id: 'channel-1',
        title: 'Room',
        topic: 'Test room',
        unreadCount: 0,
        updatedAt: '2026-04-20T12:01:06.000Z',
        lastMessageAt: '2026-04-20T12:00:59.000Z',
        pendingProvider: 'claude',
        pendingModel: 'opus',
        pendingInstance: 'native',
        pendingModelSelection: null,
        messages: [],
      },
      channels: [
        {
          id: 'channel-1',
          title: 'Room',
          topic: 'Test room',
          unreadCount: 0,
          lastMessageAt: '2026-04-20T12:00:59.000Z',
          pendingProvider: 'claude',
          pendingModel: 'opus',
          pendingModelSelection: null,
        },
      ],
    },
  });

  try {
    registerPendingOptimisticSend('channel-1', registeredOptimisticMessage.id);
    const next = preservePendingOptimisticSendsAfterWorkspaceRefresh(
      previousPayload,
      refreshedPayload,
    );

    assert.equal(next.chat.selectedChannel?.messages.length, 1);
    assert.equal(next.chat.selectedChannel?.messages[0]?.id, registeredOptimisticMessage.id);
    assert.equal(next.chat.selectedChannel?.messages[0]?.body, 'Registered send.');
  } finally {
    clearAllPendingOptimisticSends();
  }
});

test('workspace chat refresh does not resurrect optimistic sends after rollback clears registry', () => {
  clearAllPendingOptimisticSends();
  const optimisticMessage = {
    id: '17c0bd79-e36d-4532-af2b-36b70a629198',
    channelId: 'channel-1',
    senderKind: 'user',
    senderName: 'Kenny',
    body: 'Rolled back.',
    mentions: [],
    metadata: {
      optimistic: true,
    },
    usage: null,
    createdAt: '2026-04-20T12:01:00.000Z',
  };
  const previousPayload = createPayload({
    chat: {
      selectedChannelId: 'channel-1',
      selectedChannel: {
        id: 'channel-1',
        title: 'Room',
        topic: 'Test room',
        unreadCount: 0,
        updatedAt: '2026-04-20T12:01:00.000Z',
        lastMessageAt: '2026-04-20T12:01:00.000Z',
        pendingProvider: 'claude',
        pendingModel: 'opus',
        pendingInstance: 'native',
        pendingModelSelection: null,
        messages: [optimisticMessage],
      },
      channels: [
        {
          id: 'channel-1',
          title: 'Room',
          topic: 'Test room',
          unreadCount: 0,
          lastMessageAt: '2026-04-20T12:01:00.000Z',
          pendingProvider: 'claude',
          pendingModel: 'opus',
          pendingModelSelection: null,
        },
      ],
    },
  });
  const refreshedPayload = createPayload({
    metadata: {
      generatedAt: '2026-04-20T12:01:01.000Z',
      requestId: 'request-2',
      version: 'test',
    },
    chat: {
      selectedChannelId: 'channel-1',
      selectedChannel: {
        id: 'channel-1',
        title: 'Room',
        topic: 'Test room',
        unreadCount: 0,
        updatedAt: '2026-04-20T12:01:01.000Z',
        lastMessageAt: '2026-04-20T12:00:59.000Z',
        pendingProvider: 'claude',
        pendingModel: 'opus',
        pendingInstance: 'native',
        pendingModelSelection: null,
        messages: [],
      },
      channels: [
        {
          id: 'channel-1',
          title: 'Room',
          topic: 'Test room',
          unreadCount: 0,
          lastMessageAt: '2026-04-20T12:00:59.000Z',
          pendingProvider: 'claude',
          pendingModel: 'opus',
          pendingModelSelection: null,
        },
      ],
    },
  });

  registerPendingOptimisticSend('channel-1', optimisticMessage.id);
  clearPendingOptimisticSend('channel-1', optimisticMessage.id);

  assert.equal(
    preservePendingOptimisticSendsAfterWorkspaceRefresh(previousPayload, refreshedPayload),
    refreshedPayload,
  );
});

test('workspace chat refresh does not re-inject channel-switch-back sends without a body snapshot', () => {
  clearAllPendingOptimisticSends();
  const refreshedPayload = createPayload({
    metadata: {
      generatedAt: '2026-04-20T12:01:01.000Z',
      requestId: 'request-2',
      version: 'test',
    },
    chat: {
      selectedChannelId: 'channel-1',
      selectedChannel: {
        id: 'channel-1',
        title: 'Room A',
        topic: 'Test room A',
        unreadCount: 0,
        updatedAt: '2026-04-20T12:01:01.000Z',
        lastMessageAt: null,
        pendingProvider: 'claude',
        pendingModel: 'opus',
        pendingInstance: 'native',
        pendingModelSelection: null,
        messages: [],
      },
      channels: [
        {
          id: 'channel-1',
          title: 'Room A',
          topic: 'Test room A',
          unreadCount: 0,
          lastMessageAt: null,
          pendingProvider: 'claude',
          pendingModel: 'opus',
          pendingModelSelection: null,
        },
        {
          id: 'channel-2',
          title: 'Room B',
          topic: 'Test room B',
          unreadCount: 0,
          lastMessageAt: null,
          pendingProvider: 'claude',
          pendingModel: 'opus',
          pendingModelSelection: null,
        },
      ],
    },
  });
  const previousPayload = createPayload({
    metadata: {
      generatedAt: '2026-04-20T12:01:00.000Z',
      requestId: 'request-1',
      version: 'test',
    },
    chat: {
      selectedChannelId: 'channel-1',
      selectedChannel: {
        ...refreshedPayload.chat.selectedChannel,
        updatedAt: '2026-04-20T12:01:00.000Z',
      },
      channels: refreshedPayload.chat.channels,
    },
  });

  try {
    registerPendingOptimisticSend('channel-1', '17c0bd79-e36d-4532-af2b-36b70a629198');
    assert.equal(
      preservePendingOptimisticSendsAfterWorkspaceRefresh(previousPayload, refreshedPayload),
      refreshedPayload,
    );
    assert.deepEqual(listPendingOptimisticSends(), [
      {
        channelId: 'channel-1',
        optimisticMessageId: '17c0bd79-e36d-4532-af2b-36b70a629198',
      },
    ]);
  } finally {
    clearAllPendingOptimisticSends();
  }
});

test('workspace chat refresh does not preserve channel A optimistic row into channel B', () => {
  clearAllPendingOptimisticSends();
  const optimisticMessage = {
    id: '17c0bd79-e36d-4532-af2b-36b70a629198',
    channelId: 'channel-1',
    senderKind: 'user',
    senderName: 'Kenny',
    body: 'Channel A send.',
    mentions: [],
    metadata: {
      optimistic: true,
    },
    usage: null,
    createdAt: '2026-04-20T12:01:00.000Z',
  };
  const previousPayload = createPayload({
    chat: {
      selectedChannelId: 'channel-1',
      selectedChannel: {
        id: 'channel-1',
        title: 'Room A',
        topic: 'Test room A',
        unreadCount: 0,
        updatedAt: '2026-04-20T12:01:00.000Z',
        lastMessageAt: '2026-04-20T12:01:00.000Z',
        pendingProvider: 'claude',
        pendingModel: 'opus',
        pendingInstance: 'native',
        pendingModelSelection: null,
        messages: [optimisticMessage],
      },
      channels: [
        {
          id: 'channel-1',
          title: 'Room A',
          topic: 'Test room A',
          unreadCount: 0,
          lastMessageAt: '2026-04-20T12:01:00.000Z',
          pendingProvider: 'claude',
          pendingModel: 'opus',
          pendingModelSelection: null,
        },
        {
          id: 'channel-2',
          title: 'Room B',
          topic: 'Test room B',
          unreadCount: 0,
          lastMessageAt: null,
          pendingProvider: 'claude',
          pendingModel: 'opus',
          pendingModelSelection: null,
        },
      ],
    },
  });
  const refreshedPayload = createPayload({
    chat: {
      selectedChannelId: 'channel-2',
      selectedChannel: {
        id: 'channel-2',
        title: 'Room B',
        topic: 'Test room B',
        unreadCount: 0,
        updatedAt: '2026-04-20T12:01:01.000Z',
        lastMessageAt: null,
        pendingProvider: 'claude',
        pendingModel: 'opus',
        pendingInstance: 'native',
        pendingModelSelection: null,
        messages: [],
      },
      channels: [
        {
          id: 'channel-1',
          title: 'Room A',
          topic: 'Test room A',
          unreadCount: 0,
          lastMessageAt: '2026-04-20T12:01:00.000Z',
          pendingProvider: 'claude',
          pendingModel: 'opus',
          pendingModelSelection: null,
        },
        {
          id: 'channel-2',
          title: 'Room B',
          topic: 'Test room B',
          unreadCount: 0,
          lastMessageAt: null,
          pendingProvider: 'claude',
          pendingModel: 'opus',
          pendingModelSelection: null,
        },
      ],
    },
  });

  const warnings: unknown[][] = [];
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => {
    warnings.push(args);
  };
  try {
    registerPendingOptimisticSend('channel-1', optimisticMessage.id);
    assert.equal(
      preservePendingOptimisticSendsAfterWorkspaceRefresh(previousPayload, refreshedPayload),
      refreshedPayload,
    );
    assert.equal(warnings.length, 1);
    assert.equal(
      (warnings[0]?.[1] as { feature?: string } | undefined)?.feature,
      'chat_optimistic_message_orphaned_channel',
    );
    assert.equal(listPendingOptimisticSends().length, 0);
  } finally {
    console.warn = originalWarn;
    clearAllPendingOptimisticSends();
  }
});
