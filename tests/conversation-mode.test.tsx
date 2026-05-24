import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveConversationMode } from '../src/products/chat/renderer/conversationMode.ts';
import type { ChatChannelView } from '../src/products/chat/api/contracts.ts';

function createChannel(
  overrides: Partial<ChatChannelView> = {},
): ChatChannelView {
  return {
    id: 'channel-1',
    title: 'Chat',
    topic: 'Testing conversation modes.',
    channelKind: 'chat_channel',
    status: 'active',
    unreadCount: 0,
    repoPath: null,
    chatCwd: null,
    language: null,
    responseLanguage: 'en',
    formationMode: 'manual',
    skillProfile: null,
    mcpProfile: null,
    orchestratorRoles: [],
    pendingProvider: null,
    pendingModel: null,
    pendingInstance: null,
    pendingModelSelection: null,
    createdAt: '2026-03-28T00:00:00.000Z',
    updatedAt: '2026-03-28T00:00:00.000Z',
    lastMessageAt: null,
    lastActivatedAt: null,
    orchestratorLease: {
      sessionId: null,
      status: 'not_started',
      cwd: null,
      lastError: null,
      provider: null,
      model: null,
      startedAt: null,
      lastUsedAt: null,
    },
    catAssignments: [],
    assignedCats: [],
    messages: [],
    roomRouting: {
      mode: 'chat_channel',
      defaultRecipientId: null,
      lastOutcome: null,
      lastCheckpoint: null,
      lastWakeRequest: null,
      wakeHistory: [],
      workflow: {
        activeTurn: null,
        pendingContinuations: [],
        lastOutcomeEvent: null,
      },
    },
    assignedParticipants: undefined,
    workingMemory: {
      summary: null,
      facts: [],
      openLoops: [],
      updatedAt: null,
    },
    ...overrides,
  };
}

test('resolveConversationMode keeps direct lanes topology-first even when room mode is legacy-mismatched', () => {
  const channel = createChannel({
    channelKind: 'direct_message',
    roomRouting: {
      ...createChannel().roomRouting!,
      mode: 'chat_channel',
      defaultRecipientId: 'cat-1',
    },
    assignedCats: [{
      catId: 'cat-1',
      name: 'Companion',
      roles: [],
      skillProfile: null,
      mcpProfile: null,
      status: 'active',
      joinedAt: '2026-03-28T00:00:00.000Z',
      leftAt: null,
      avatarColor: null,
      execution: {
        target: {
          provider: 'claude',
          instance: null,
          model: null,
        },
        modelSelection: null,
        lease: {
          sessionId: null,
          status: 'not_started',
          cwd: null,
          lastError: null,
          provider: null,
          model: null,
          startedAt: null,
          lastUsedAt: null,
        },
      },
      memory: {
        summary: null,
        facts: [],
        openLoops: [],
        updatedAt: null,
      },
    }],
  });

  assert.equal(resolveConversationMode(channel), 'direct_message');
  });

test('resolveConversationMode distinguishes default and participant chat semantics', () => {
  const defaultChat = createChannel();
  const singleParticipantChat = createChannel({
    assignedCats: [{
      catId: 'cat-1',
      name: 'Companion',
      roles: [],
      skillProfile: null,
      mcpProfile: null,
      status: 'active',
      joinedAt: '2026-03-28T00:00:00.000Z',
      leftAt: null,
      avatarColor: null,
      execution: {
        target: {
          provider: 'claude',
          instance: null,
          model: null,
        },
        modelSelection: null,
        lease: {
          sessionId: null,
          status: 'ready',
          cwd: null,
          lastError: null,
          provider: null,
          model: null,
          startedAt: null,
          lastUsedAt: null,
        },
      },
      memory: {
        summary: null,
        facts: [],
        openLoops: [],
        updatedAt: null,
      },
    }],
  });
  const participantChat = createChannel({
    channelKind: 'chat_channel',
    assignedCats: [
      {
        ...singleParticipantChat.assignedCats[0],
        catId: 'cat-1',
      },
      {
        ...singleParticipantChat.assignedCats[0],
        catId: 'cat-2',
        name: 'Reviewer',
      },
    ],
  });

  assert.equal(resolveConversationMode(defaultChat), 'default_chat');
  assert.equal(resolveConversationMode(singleParticipantChat), 'participant_chat');
  assert.equal(resolveConversationMode(participantChat), 'participant_chat');
});

test('resolveConversationMode treats temporary participants as participant chats', () => {
  const adhocRoom = createChannel({
    assignedParticipants: [
      {
        participantId: 'participant-inline',
        sourceKind: 'adhoc',
        sourceRefId: null,
        name: 'Inline Reviewer',
        roles: [],
        roleHint: 'Counterpoint',
        skillProfile: null,
        mcpProfile: null,
        status: 'active',
        joinedAt: '2026-03-28T00:00:00.000Z',
        leftAt: null,
        avatarColor: null,
        avatarUrl: null,
        execution: {
          target: {
            provider: 'antigravity',
            instance: 'native',
            model: 'Gemini 3.1 Pro (high)',
          },
          modelSelection: null,
          lease: {
            sessionId: null,
            status: 'ready',
            cwd: null,
            lastError: null,
            provider: null,
            model: null,
            startedAt: null,
            lastUsedAt: null,
          },
        },
        memory: {
          summary: null,
          facts: [],
          openLoops: [],
          updatedAt: null,
        },
      },
      {
        participantId: 'participant-verifier',
        sourceKind: 'adhoc',
        sourceRefId: null,
        name: 'Verifier',
        roles: [],
        roleHint: null,
        skillProfile: null,
        mcpProfile: null,
        status: 'active',
        joinedAt: '2026-03-28T00:00:00.000Z',
        leftAt: null,
        avatarColor: null,
        avatarUrl: null,
        execution: {
          target: {
            provider: 'claude',
            instance: 'native',
            model: 'claude-sonnet',
          },
          modelSelection: null,
          lease: {
            sessionId: null,
            status: 'ready',
            cwd: null,
            lastError: null,
            provider: null,
            model: null,
            startedAt: null,
            lastUsedAt: null,
          },
        },
        memory: {
          summary: null,
          facts: [],
          openLoops: [],
          updatedAt: null,
        },
      },
    ],
  });

  assert.equal(resolveConversationMode(adhocRoom), 'participant_chat');
});
