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
    channelKind: 'boss_thread',
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
    composerMode: 'solo',
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
      mode: 'boss_chat',
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
    channelKind: 'direct_lane',
    composerMode: 'cat_led',
    roomRouting: {
      ...createChannel().roomRouting!,
      mode: 'boss_chat',
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

  assert.equal(resolveConversationMode(channel), 'direct_lane');
});

test('resolveConversationMode distinguishes solo, cat-led, and multi-cat thread semantics', () => {
  const soloThread = createChannel();
  const catLedThread = createChannel({
    composerMode: 'cat_led',
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
  const multiCatRoom = createChannel({
    channelKind: 'multi_cat_room',
    composerMode: 'cat_led',
    assignedCats: [
      {
        ...catLedThread.assignedCats[0],
        catId: 'cat-1',
      },
      {
        ...catLedThread.assignedCats[0],
        catId: 'cat-2',
        name: 'Reviewer',
      },
    ],
  });

  assert.equal(resolveConversationMode(soloThread), 'solo_thread');
  assert.equal(resolveConversationMode(catLedThread), 'cat_led_thread');
  assert.equal(resolveConversationMode(multiCatRoom), 'multi_cat_room');
});

test('resolveConversationMode treats temporary participants as multi-participant rooms', () => {
  const adhocRoom = createChannel({
    composerMode: 'cat_led',
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
            provider: 'gemini',
            instance: 'native',
            model: 'gemini-3.1-pro',
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

  assert.equal(resolveConversationMode(adhocRoom), 'multi_cat_room');
});
