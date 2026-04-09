import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server.browser';

import type {
  AppShellPayload,
  ChatCat,
  ChatChannelCat,
  ChatChannelParticipant,
  ChatChannelView,
} from '../src/products/chat/api/contracts.ts';
import { ChatView, type ChatViewProps } from '../src/products/chat/renderer/components/ChatView.tsx';
import { buildDraftParticipantExecutionLabel } from '../src/products/chat/renderer/chatUtils.tsx';
import { EMPTY_LIVE_INDICATOR } from '../src/products/chat/renderer/hooks/useLiveIndicator.ts';

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

function createChatCat(overrides: Partial<ChatCat> = {}): ChatCat {
  return {
    id: 'cat-lead',
    name: 'Milo',
    roles: [],
    skillProfile: null,
    mcpProfile: null,
    status: 'active',
    createdAt: '2026-04-07T00:00:00.000Z',
    updatedAt: '2026-04-07T00:00:00.000Z',
    archivedAt: null,
    avatarColor: '#7A5B3A',
    avatarUrl: null,
    defaultExecutionTarget: {
      provider: 'claude',
      instance: 'native',
      model: 'claude-sonnet',
    },
    defaultModelSelection: null,
    products: ['chat'],
    memory: {
      summary: null,
      facts: [],
      openLoops: [],
      updatedAt: null,
    },
    ...overrides,
  };
}

function createTemporaryParticipant(
  overrides: Partial<ChatChannelParticipant> = {},
): ChatChannelParticipant {
  return {
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
    avatarColor: '#F04A70',
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
    ...overrides,
  };
}

function createCatParticipant(
  cat: ChatCat,
  overrides: Partial<ChatChannelCat> = {},
): ChatChannelCat {
  return {
    participantId: `participant:${cat.id}`,
    sourceKind: 'cat',
    sourceRefId: cat.id,
    catId: cat.id,
    name: cat.name,
    roles: [],
    roleHint: null,
    skillProfile: null,
    mcpProfile: null,
    status: 'active',
    joinedAt: '2026-04-07T00:00:00.000Z',
    leftAt: null,
    avatarColor: cat.avatarColor,
    avatarUrl: cat.avatarUrl,
    execution: {
      target: {
        provider: cat.defaultExecutionTarget.provider,
        instance: cat.defaultExecutionTarget.instance,
        model: cat.defaultExecutionTarget.model,
      },
      modelSelection: cat.defaultModelSelection ?? null,
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
    ...overrides,
  };
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
      createTemporaryParticipant(),
      createTemporaryParticipant({
        participantId: 'participant-verifier',
        name: 'Runtime Verifier',
        roleHint: null,
        avatarColor: '#2B9CF0',
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
      }),
    ],
    assignedCats: [],
    messages: [],
    roomRouting: {
      mode: 'boss_chat',
      defaultRecipientId: 'participant-inline',
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

test('ChatView shows temporary participants in the top bar and the current recipient chip', () => {
  const markup = renderToStaticMarkup(
    <ChatView {...createProps()} />,
  );

  assert.match(markup, /data-tooltip="Inline Reviewer"/u);
  assert.match(markup, /data-tooltip="Runtime Verifier"/u);
  assert.match(markup, /composerRecipientChip/u);
  assert.doesNotMatch(markup, /data-tooltip="2 participants"/u);
  assert.match(markup, /channelParticipantAvatar/u);
  assert.doesNotMatch(markup, /#F04A70|#2B9CF0/u);
});

test('ChatView keeps Cat visuals in room stacks while the recipient chip stays recipient-centric', () => {
  const leadCat = createChatCat();
  const leadParticipant = createCatParticipant(leadCat, {
    participantId: 'participant-cat-lead',
  });
  const markup = renderToStaticMarkup(
    <ChatView
      {...createProps({
        payload: {
          ...createPayload(),
          chat: {
            ...createPayload().chat,
            bossCatId: leadCat.id,
            cats: [leadCat],
          },
        } as unknown as AppShellPayload,
        selectedChannel: createChannel({
          assignedParticipants: [
            leadParticipant,
            createTemporaryParticipant(),
            createTemporaryParticipant({
              participantId: 'participant-verifier',
              name: 'Runtime Verifier',
              avatarColor: '#2B9CF0',
            }),
          ],
          assignedCats: [leadParticipant],
          roomRouting: {
            ...createChannel().roomRouting!,
            defaultRecipientId: leadParticipant.participantId,
          },
        }),
      })}
    />,
  );

  assert.match(
    markup,
    /class="catAvatar catAvatarBoss" data-tooltip="Milo" style="background:#7A5B3A"/u,
  );
  assert.match(
    markup,
    /class="catAvatar channelParticipantAvatar" data-tooltip="Inline Reviewer"/u,
  );
  assert.match(
    markup,
    /recipientChipAvatarBoss/u,
  );
  assert.match(
    markup,
    /class="composerRecipientChipLabel">Milo/u,
  );
  assert.doesNotMatch(markup, /composerStackAvatar/u);
});

test('ChatView renders temporary participant transcript speakers as room members', () => {
  const markup = renderToStaticMarkup(
    <ChatView
      {...createProps({
        selectedChannel: createChannel({
          messages: [
            {
              id: 'message-1',
              channelId: 'channel-1',
              senderKind: 'agent',
              senderName: 'Inline Reviewer',
              body: 'I checked the proposal.',
              createdAt: '2026-04-07T00:01:00.000Z',
              metadata: {
                targetKind: 'cat',
                targetId: 'participant-inline',
              },
            },
          ],
        }),
      })}
    />,
  );

  assert.match(markup, /transcriptAvatar/u);
  assert.match(markup, /Inline Reviewer/u);
  assert.doesNotMatch(markup, /catAvatarLeadBadge/u);
});

test('ChatView resolves temporary participant transcript speakers by execution label snapshot', () => {
  const markup = renderToStaticMarkup(
    <ChatView
      {...createProps({
        selectedChannel: createChannel({
          messages: [
            {
              id: 'message-1',
              channelId: 'channel-1',
              senderKind: 'agent',
              senderName: 'Runtime',
              body: 'I checked the proposal.',
              createdAt: '2026-04-07T00:01:00.000Z',
              metadata: {
                executionLabelSnapshot: buildDraftParticipantExecutionLabel(
                  createTemporaryParticipant().execution.target,
                ),
              },
            },
          ],
        }),
      })}
    />,
  );

  assert.match(markup, /class="catAvatar transcriptAvatar channelParticipantAvatar"/u);
  assert.match(markup, /Inline Reviewer/u);
  assert.doesNotMatch(markup, /#F04A70/u);
});

test('ChatView prefers room participants over fallback Cat names in transcript speakers', () => {
  const markup = renderToStaticMarkup(
    <ChatView
      {...createProps({
        payload: {
          ...createPayload(),
          chat: {
            ...createPayload().chat,
            cats: [
              {
                id: 'cat-inline-reviewer',
                name: 'Inline Reviewer',
                status: 'active',
                avatarColor: '#11AA55',
                avatarUrl: null,
              },
            ],
          },
        } as unknown as AppShellPayload,
        selectedChannel: createChannel({
          messages: [
            {
              id: 'message-1',
              channelId: 'channel-1',
              senderKind: 'agent',
              senderName: 'Inline Reviewer',
              body: 'I checked the proposal.',
              createdAt: '2026-04-07T00:01:00.000Z',
              metadata: {},
            },
          ],
        }),
      })}
    />,
  );

  assert.match(markup, /Inline Reviewer/u);
  assert.doesNotMatch(markup, /#11AA55/u);
});

test('ChatView gives temporary participants a live progress avatar and top-bar pulse while they are speaking', () => {
  const baseChannel = createChannel();
  const markup = renderToStaticMarkup(
    <ChatView
      {...createProps({
        selectedChannel: createChannel({
          messages: [
            {
              id: 'message-1',
              channelId: 'channel-1',
              senderKind: 'user',
              senderName: 'Kenny',
              body: 'Review this draft.',
              mentions: [],
              metadata: {},
              usage: null,
              createdAt: '2026-04-07T00:01:00.000Z',
            },
          ],
          roomRouting: {
            ...baseChannel.roomRouting!,
            workflow: {
              activeTurn: {
                id: 'turn-1',
                status: 'running',
                sourceMessageId: 'message-1',
                sourceSenderKind: 'user',
                sourceSenderName: 'Kenny',
                guard: null,
                stageId: 'dispatching',
                workflowShape: 'sequential',
                reviewRequired: false,
                lastCheckpointId: null,
                convergeTargetId: null,
                continuationCount: 0,
                dispatchCount: 1,
                targetStatuses: [
                  {
                    id: 'target-1',
                    dispatchId: 'dispatch-1',
                    participant: {
                      participantKind: 'cat',
                      participantId: 'participant-inline',
                      participantName: 'Inline Reviewer',
                    },
                    source: null,
                    sourceMessageId: 'message-1',
                    trigger: 'room_default',
                    mentionNames: [],
                    depth: 0,
                    parentCheckpointId: null,
                    branchStrategy: null,
                    handoffReason: null,
                    wakeRequestId: null,
                    status: 'running',
                    queuedAt: '2026-04-07T00:01:01.000Z',
                    startedAt: '2026-04-07T00:01:02.000Z',
                    completedAt: null,
                    responseMessageId: null,
                    error: null,
                  },
                ],
                events: [],
                startedAt: '2026-04-07T00:01:01.000Z',
                updatedAt: '2026-04-07T00:01:02.000Z',
                completedAt: null,
              },
              pendingContinuations: [],
              lastOutcomeEvent: null,
            },
          },
        }),
        liveIndicator: {
          ...EMPTY_LIVE_INDICATOR,
          active: true,
          phase: 'waiting',
          speakerLabel: 'Gemini',
        },
      })}
    />,
  );

  assert.match(markup, /typingIndicator/u);
  assert.match(markup, /class="catAvatar transcriptAvatar channelParticipantAvatar"/u);
  assert.match(markup, /Inline Reviewer/u);
  assert.match(markup, /catAvatarPulsing/u);
});

test('ChatView drops stale live progress once the routed reply is already visible', () => {
  const baseChannel = createChannel();
  const markup = renderToStaticMarkup(
    <ChatView
      {...createProps({
        selectedChannel: createChannel({
          messages: [
            {
              id: 'message-user',
              channelId: 'channel-1',
              senderKind: 'user',
              senderName: 'Kenny',
              body: 'Review this draft.',
              mentions: [],
              metadata: {},
              usage: null,
              createdAt: '2026-04-07T00:01:00.000Z',
            },
            {
              id: 'message-agent',
              channelId: 'channel-1',
              senderKind: 'agent',
              senderName: 'Inline Reviewer',
              body: 'Done.',
              mentions: [],
              metadata: {
                targetKind: 'cat',
                targetId: 'participant-inline',
              },
              usage: null,
              createdAt: '2026-04-07T00:01:04.000Z',
            },
          ],
          roomRouting: {
            ...baseChannel.roomRouting!,
            workflow: {
              activeTurn: {
                id: 'turn-1',
                status: 'running',
                sourceMessageId: 'message-user',
                sourceSenderKind: 'user',
                sourceSenderName: 'Kenny',
                guard: null,
                stageId: 'dispatching',
                workflowShape: 'sequential',
                reviewRequired: false,
                lastCheckpointId: null,
                convergeTargetId: null,
                continuationCount: 0,
                dispatchCount: 1,
                targetStatuses: [],
                events: [],
                startedAt: '2026-04-07T00:01:01.000Z',
                updatedAt: '2026-04-07T00:01:02.000Z',
                completedAt: null,
              },
              pendingContinuations: [],
              lastOutcomeEvent: null,
            },
          },
        }),
        liveIndicator: {
          ...EMPTY_LIVE_INDICATOR,
          active: true,
          phase: 'waiting',
          speakerLabel: 'Gemini',
        },
      })}
    />,
  );

  assert.doesNotMatch(markup, /typingIndicator/u);
  assert.doesNotMatch(markup, /catAvatarPulsing/u);
});

test('ChatView keeps transcript stack layout and hover-only user copy actions', () => {
  const markup = renderToStaticMarkup(
    <ChatView
      {...createProps({
        selectedChannel: createChannel({
          messages: [
            {
              id: 'message-user',
              channelId: 'channel-1',
              senderKind: 'user',
              senderName: 'Ken',
              body: 'hi',
              mentions: [],
              metadata: {},
              usage: null,
              createdAt: '2026-04-07T00:01:00.000Z',
            },
            {
              id: 'message-agent',
              channelId: 'channel-1',
              senderKind: 'agent',
              senderName: 'Inline Reviewer',
              body: 'Hi! How can I help you today?',
              mentions: [],
              metadata: {
                targetKind: 'cat',
                targetId: 'participant-inline',
              },
              usage: null,
              createdAt: '2026-04-07T00:01:01.000Z',
            },
          ],
        }),
      })}
    />,
  );

  assert.match(markup, /transcriptMessageStack transcriptMessageStackUser/u);
  assert.match(markup, /transcriptMessageStack transcriptMessageStackAgent/u);
  assert.match(markup, /messageActions messageActionsHoverOnly/u);
  assert.match(markup, /messageActions messageActionsPersistent/u);
});
