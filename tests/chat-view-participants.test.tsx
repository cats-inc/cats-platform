import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server.browser';

import type { AppShellPayload, ChatChannelView } from '../src/products/chat/api/contracts.ts';
import { ChatView, type ChatViewProps } from '../src/products/chat/renderer/components/ChatView.tsx';

function createPayload(): AppShellPayload {
  return {
    chat: {
      bossCatId: null,
      botBindings: [],
      capabilities: {
        maxParallelChats: 5,
      },
      cats: [],
      channels: [],
      selectedChannelId: 'channel-1',
      selectedChannel: null,
      showVerboseMessages: false,
    },
  } as unknown as AppShellPayload;
}

function createChannel(overrides: Partial<ChatChannelView> = {}): ChatChannelView {
  return {
    id: 'channel-1',
    title: 'Runtime Review',
    topic: 'Temporary participants',
    channelKind: 'multi_cat_room',
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
    composerMode: 'cat_led',
    pendingProvider: null,
    pendingModel: null,
    pendingInstance: null,
    pendingModelSelection: null,
    createdAt: '2026-04-07T00:00:00.000Z',
    updatedAt: '2026-04-07T00:00:00.000Z',
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
    participantAssignments: [],
    catAssignments: [],
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
        joinedAt: '2026-04-07T00:00:00.000Z',
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
        name: 'Runtime Verifier',
        roles: [],
        roleHint: null,
        skillProfile: null,
        mcpProfile: null,
        status: 'active',
        joinedAt: '2026-04-07T00:00:00.000Z',
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
    assignedCats: [],
    messages: [],
    roomRouting: {
      mode: 'boss_chat',
      leadParticipantId: 'participant-inline',
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
    workingMemory: {
      summary: null,
      facts: [],
      openLoops: [],
      updatedAt: null,
    },
    ...overrides,
  };
}

function createProps(overrides: Partial<ChatViewProps> = {}): ChatViewProps {
  const selectedChannel = createChannel();
  return {
    payload: createPayload(),
    selectedChannel,
    operatorSnapshot: null,
    operatorLoading: false,
    operatorError: '',
    composerDraft: '',
    busy: '',
    feedback: '',
    greeting: 'Ready.',
    channelFiles: [],
    channelPlusMenuOpen: false,
    channelPlusMenuRef: { current: null },
    channelFileInputRef: { current: null },
    activeAssignedCats: [],
    bossCatName: 'Boss Cat',
    bossCatAvatarColor: null,
    showBossCatAvatar: false,
    onComposerChange: () => {},
    onComposerKeyDown: () => {},
    onSendMessage: () => {},
    onToggleChannelPlusMenu: () => {},
    onChannelFileSelect: () => {},
    onChannelFilesChange: () => {},
    onApprovalDecision: () => {},
    onChoiceSubmit: () => {},
    onOperatorAction: () => {},
    autoResize: () => {},
    onSelect: () => {},
    ...overrides,
  };
}

test('ChatView shows temporary participants in the top bar and composer affordance', () => {
  const markup = renderToStaticMarkup(
    <ChatView {...createProps()} />,
  );

  assert.match(markup, /data-tooltip="Inline Reviewer"/u);
  assert.match(markup, /data-tooltip="Runtime Verifier"/u);
  assert.match(markup, />2 participants</u);
});
