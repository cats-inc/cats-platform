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
        maxChatParticipants: 5,
        maxAudienceParticipants: 3,
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

test('ChatView shows temporary participants in the top bar and composer avatar stack', () => {
  const markup = renderToStaticMarkup(
    <ChatView {...createProps()} />,
  );

  assert.match(markup, /data-tooltip="Gemini-CLI · gemini-3\.1-pro"/u);
  assert.match(markup, /data-tooltip="Claude-CLI · claude-sonnet"/u);
  assert.match(markup, /audienceChip/u);
  assert.doesNotMatch(markup, /data-tooltip="2 participants"/u);
  assert.match(markup, /channelParticipantAvatar/u);
  assert.doesNotMatch(markup, /#F04A70|#2B9CF0/u);
});

test('ChatView keeps Cat visuals in room stacks while the composer stack preserves boss styling', () => {
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
    /class="catAvatar catAvatarBoss" data-tooltip="Milo · Claude-CLI · claude-sonnet" style="background:#7A5B3A"/u,
  );
  assert.match(
    markup,
    /class="catAvatar channelParticipantAvatar" data-tooltip="Gemini-CLI · gemini-3\.1-pro"/u,
  );
  assert.match(
    markup,
    /class="audienceChipAvatar" style="background:#7A5B3A"/u,
  );
  assert.match(
    markup,
    /audienceChipLabel">Milo \+2</u,
  );
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

test('ChatView gives temporary participants a live progress avatar and top-bar pulse once session startup has promoted the assistant bubble', () => {
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
            {
              id: 'message-session-started',
              channelId: 'channel-1',
              senderKind: 'system',
              senderName: 'Runtime',
              body: 'Inline Reviewer connected to cats-runtime session session-inline.',
              mentions: [],
              metadata: {
                event: 'session_started',
                targetKind: 'cat',
                targetId: 'participant-inline',
                verbosity: 'verbose',
              },
              usage: null,
              createdAt: '2026-04-07T00:01:02.500Z',
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
                    response: null,
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
          phase: 'streaming',
          participantId: 'participant-inline',
          speakerLabel: 'Inline Reviewer',
        },
      })}
    />,
  );

  assert.match(markup, /typingIndicator/u);
  assert.match(markup, /class="catAvatar transcriptAvatar channelParticipantAvatar"/u);
  assert.match(markup, /Inline Reviewer/u);
  assert.match(markup, /catAvatarPulsing/u);
});

test('ChatView promotes solo orchestrator progress once the session_started system message is visible', () => {
  const baseChannel = createChannel();
  const markup = renderToStaticMarkup(
    <ChatView
      {...createProps({
        selectedChannel: createChannel({
          title: 'Solo runtime chat',
          composerMode: 'solo',
          pendingProvider: 'claude',
          pendingModel: 'opus',
          messages: [
            {
              id: 'message-user',
              channelId: 'channel-1',
              senderKind: 'user',
              senderName: 'Kenny',
              body: 'Please reply with exactly OK.',
              mentions: [],
              metadata: {},
              usage: null,
              createdAt: '2026-04-07T00:01:00.000Z',
            },
            {
              id: 'message-session-started',
              channelId: 'channel-1',
              senderKind: 'system',
              senderName: 'Runtime',
              body: 'Claude-CLI connected to cats-runtime session session-orchestrator.',
              mentions: [],
              metadata: {
                event: 'session_started',
                targetKind: 'orchestrator',
                verbosity: 'verbose',
              },
              usage: null,
              createdAt: '2026-04-07T00:01:01.500Z',
            },
          ],
          roomRouting: {
            ...baseChannel.roomRouting!,
            defaultRecipientId: null,
            workflow: {
              activeTurn: {
                id: 'turn-orchestrator',
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
          phase: 'streaming',
          participantId: 'orchestrator',
          speakerLabel: 'Claude-CLI',
          sessionStartedAt: '2026-04-07T00:01:01.500Z',
          requiresSessionStartConfirmation: true,
          progressKind: 'session',
        },
      })}
    />,
  );

  assert.match(markup, /typingIndicator/u);
  assert.doesNotMatch(markup, /userTurnStatusProcessing/u);
});

test('ChatView keeps the last user bubble in a generic processing state until session startup is persisted', () => {
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
                    startedAt: null,
                    completedAt: null,
                    response: null,
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
          phase: 'streaming',
          participantId: 'participant-inline',
          speakerLabel: 'Inline Reviewer',
          sessionStartedAt: '2026-04-07T00:01:02.000Z',
          requiresSessionStartConfirmation: true,
          progressKind: 'session',
        },
      })}
    />,
  );

  assert.match(markup, /userTurnStatusProcessing/u);
  assert.match(markup, /typingDots userTurnStatusDots/u);
  assert.doesNotMatch(markup, /typingIndicator/u);
  assert.doesNotMatch(markup, /catAvatarPulsing/u);
});

test('ChatView shows retry only on the latest failed acknowledged user turn', () => {
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
              id: 'message-runtime-error',
              channelId: 'channel-1',
              senderKind: 'system',
              senderName: 'Runtime',
              body: 'Failed to continue the message dispatch: Runtime unavailable.',
              mentions: [],
              metadata: {
                event: 'runtime_error',
              },
              usage: null,
              createdAt: '2026-04-07T00:01:03.000Z',
            },
          ],
          roomRouting: {
            ...baseChannel.roomRouting!,
            lastOutcome: {
              turnId: 'turn-1',
              mode: 'boss_chat',
              sourceMessageId: 'message-user',
              sourceSenderKind: 'user',
              sourceSenderName: 'Kenny',
              status: 'error',
              resolution: {
                routingMode: 'room_default',
                selectionKind: 'default_target',
                defaultTarget: null,
                defaultTargetReason: null,
                fallbackTarget: null,
                blockedReason: null,
                note: null,
              },
              resolvedTargets: [],
              unresolvedMentions: [],
              dispatches: [],
              checkpoints: [],
              continuationCount: 0,
              totalDispatchCount: 0,
              guard: null,
              startedAt: '2026-04-07T00:01:01.000Z',
              completedAt: '2026-04-07T00:01:03.000Z',
            },
            workflow: {
              activeTurn: null,
              pendingContinuations: [],
              lastOutcomeEvent: null,
            },
          },
        }),
        onRetryMessage: async () => {},
      })}
    />,
  );

  assert.match(markup, /Response failed/u);
  assert.match(markup, /title="Retry response"/u);
});

test('ChatView keeps live assistant progress collapsed when progress details are off', () => {
  const markup = renderToStaticMarkup(
    <ChatView
      {...createProps({
        payload: {
          ...createPayload(),
          chat: {
            ...createPayload().chat,
            showLiveProgressDetails: false,
          },
        } as unknown as AppShellPayload,
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
              id: 'message-session-started',
              channelId: 'channel-1',
              senderKind: 'system',
              senderName: 'Runtime',
              body: 'Inline Reviewer connected to cats-runtime session session-inline.',
              mentions: [],
              metadata: {
                event: 'session_started',
                targetKind: 'cat',
                targetId: 'participant-inline',
                verbosity: 'verbose',
              },
              usage: null,
              createdAt: '2026-04-07T00:01:01.500Z',
            },
          ],
        }),
        liveIndicator: {
          ...EMPTY_LIVE_INDICATOR,
          active: true,
          phase: 'streaming',
          participantId: 'participant-inline',
          speakerLabel: 'Inline Reviewer',
          contentBlocks: [
            {
              id: 'text:0',
              index: 0,
              kind: 'text',
              status: 'streaming',
              title: null,
              text: 'Looking into it...',
              toolName: null,
              toolId: null,
              metadata: null,
            },
            {
              id: 'tool:1',
              index: 1,
              kind: 'tool',
              status: 'streaming',
              title: 'search',
              text: '',
              toolName: 'search',
              toolId: 'tool-search',
              metadata: null,
            },
          ],
        },
      })}
    />,
  );

  assert.match(markup, /typingIndicator/u);
  assert.match(markup, /Looking into it/u);
  assert.match(markup, /typingDots/u);
  assert.doesNotMatch(markup, /toolSegmentChip/u);
});

test('ChatView shows provider-specific live assistant progress when progress details are on', () => {
  const markup = renderToStaticMarkup(
    <ChatView
      {...createProps({
        payload: {
          ...createPayload(),
          chat: {
            ...createPayload().chat,
            showLiveProgressDetails: true,
          },
        } as unknown as AppShellPayload,
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
              id: 'message-session-started',
              channelId: 'channel-1',
              senderKind: 'system',
              senderName: 'Runtime',
              body: 'Inline Reviewer connected to cats-runtime session session-inline.',
              mentions: [],
              metadata: {
                event: 'session_started',
                targetKind: 'cat',
                targetId: 'participant-inline',
                verbosity: 'verbose',
              },
              usage: null,
              createdAt: '2026-04-07T00:01:01.500Z',
            },
          ],
        }),
        liveIndicator: {
          ...EMPTY_LIVE_INDICATOR,
          active: true,
          phase: 'streaming',
          participantId: 'participant-inline',
          speakerLabel: 'Inline Reviewer',
          contentBlocks: [
            {
              id: 'text:0',
              index: 0,
              kind: 'text',
              status: 'streaming',
              title: null,
              text: 'Looking into it...',
              toolName: null,
              toolId: null,
              metadata: null,
            },
            {
              id: 'tool:1',
              index: 1,
              kind: 'tool',
              status: 'streaming',
              title: 'search',
              text: 'Searching for draft reviews',
              toolName: 'search',
              toolId: 'tool-search',
              metadata: null,
            },
          ],
        },
      })}
    />,
  );

  assert.match(markup, /typingIndicator/u);
  assert.match(markup, /Looking into it/u);
  assert.match(markup, /toolSegmentChip/u);
  assert.match(markup, /search/u);
  assert.match(markup, /Searching for draft reviews/u);
});

test('ChatView keeps speaker headers on every persisted assistant segment bubble', () => {
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
              body: 'What happened today?',
              mentions: [],
              metadata: {},
              usage: null,
              createdAt: '2026-04-07T00:01:00.000Z',
            },
            {
              id: 'message-agent-1',
              channelId: 'channel-1',
              senderKind: 'agent',
              senderName: 'Claude-CLI',
              body: 'First segment.',
              mentions: [],
              metadata: {
                event: 'assistant_turn_segment',
                turnId: 'turn-1',
                targetId: 'participant-claude',
                assistantTurnId: 'assistant-turn-1',
                terminal: false,
              },
              usage: null,
              createdAt: '2026-04-07T00:01:01.000Z',
            },
            {
              id: 'message-agent-2',
              channelId: 'channel-1',
              senderKind: 'agent',
              senderName: 'Claude-CLI',
              body: 'Second segment.',
              mentions: [],
              metadata: {
                event: 'assistant_turn_segment',
                turnId: 'turn-1',
                targetId: 'participant-claude',
                assistantTurnId: 'assistant-turn-1',
                terminal: true,
              },
              usage: null,
              createdAt: '2026-04-07T00:01:02.000Z',
            },
          ],
        }),
      })}
    />,
  );

  assert.equal((markup.match(/<strong>Claude-CLI<\/strong>/gu) ?? []).length, 2);
});

test('ChatView hides terminal live status details when progress details are off', () => {
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
          ],
        }),
        liveIndicator: {
          ...EMPTY_LIVE_INDICATOR,
          active: true,
          phase: 'streaming',
          participantId: 'participant-inline',
          speakerLabel: 'Inline Reviewer',
          contentBlocks: [
            {
              id: 'status:1',
              index: 1,
              kind: 'status',
              status: 'complete',
              title: null,
              text: 'Search complete',
              toolName: null,
              toolId: null,
              metadata: null,
            },
          ],
        },
      })}
    />,
  );

  assert.doesNotMatch(markup, /Search complete/u);
  assert.match(markup, /typingDots/u);
});

test('ChatView keeps typing dots visible for an initial streaming session phase without visible blocks', () => {
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
              body: 'Say hi.',
              mentions: [],
              metadata: {},
              usage: null,
              createdAt: '2026-04-07T00:01:00.000Z',
            },
          ],
        }),
        liveIndicator: {
          ...EMPTY_LIVE_INDICATOR,
          active: true,
          phase: 'streaming',
          participantId: 'participant-inline',
          speakerLabel: 'Inline Reviewer',
          progressKind: 'session',
        },
      })}
    />,
  );

  assert.match(markup, /Inline Reviewer/u);
  assert.match(markup, /typingDots/u);
});

test('ChatView keeps a follow-up live bubble visible before tool blocks arrive', () => {
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
          ],
        }),
        liveIndicator: {
          ...EMPTY_LIVE_INDICATOR,
          active: true,
          phase: 'streaming',
          participantId: 'participant-inline',
          speakerLabel: 'Inline Reviewer',
          segments: [
            {
              id: 'segment-0',
              phase: 'sealed',
              targetStateId: 'target-inline',
              segmentIndex: 0,
              participantId: 'participant-inline',
              catId: null,
              activeCatIds: [],
              catName: null,
              speakerLabel: 'Inline Reviewer',
              sessionStartedAt: null,
              requiresSessionStartConfirmation: false,
              progressText: '',
              progressKind: null,
              tools: [],
              contentBlocks: [
                {
                  id: 'text:0',
                  index: 0,
                  kind: 'text',
                  status: 'complete',
                  title: null,
                  text: 'Looking into it...',
                  toolName: null,
                  toolId: null,
                  metadata: null,
                },
              ],
              events: [],
            },
            {
              id: 'segment-1',
              phase: 'streaming',
              targetStateId: 'target-inline',
              segmentIndex: 1,
              participantId: 'participant-inline',
              catId: null,
              activeCatIds: [],
              catName: null,
              speakerLabel: 'Inline Reviewer',
              sessionStartedAt: null,
              requiresSessionStartConfirmation: false,
              progressText: '',
              progressKind: null,
              tools: [
                {
                  toolName: 'search',
                  toolId: 'tool-search',
                  done: false,
                },
              ],
              contentBlocks: [],
              events: [
                {
                  eventType: 'tool_use',
                  label: 'Tool',
                  text: 'Started search',
                  tone: 'active',
                  kind: 'tool',
                  toolName: 'search',
                  toolId: 'tool-search',
                },
              ],
            },
          ],
        },
      })}
    />,
  );

  assert.match(markup, /Looking into it/u);
  assert.match(markup, /typingDots/u);
  assert.equal((markup.match(/<strong>Inline Reviewer<\/strong>/gu) ?? []).length, 2);
});

test('ChatView opens a follow-up live bubble when a hidden completed tool phase follows visible text', () => {
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
          ],
        }),
        liveIndicator: {
          ...EMPTY_LIVE_INDICATOR,
          active: true,
          phase: 'streaming',
          participantId: 'participant-inline',
          speakerLabel: 'Inline Reviewer',
          contentBlocks: [
            {
              id: 'text:0',
              index: 0,
              kind: 'text',
              status: 'streaming',
              title: null,
              text: 'Looking into it...',
              toolName: null,
              toolId: null,
              metadata: null,
            },
            {
              id: 'tool:1',
              index: 1,
              kind: 'tool',
              status: 'complete',
              title: 'search',
              text: 'Search complete',
              toolName: 'search',
              toolId: 'tool-search',
              metadata: null,
            },
          ],
        },
      })}
    />,
  );

  assert.match(markup, /Looking into it/u);
  assert.doesNotMatch(markup, /toolSegmentChip/u);
  assert.match(markup, /typingDots/u);
  assert.equal((markup.match(/<strong>Inline Reviewer<\/strong>/gu) ?? []).length, 2);
});

test('ChatView streams text content directly in the assistant bubble body when progress details are on', () => {
  const markup = renderToStaticMarkup(
    <ChatView
      {...createProps({
        payload: {
          ...createPayload(),
          chat: {
            ...createPayload().chat,
            showLiveProgressDetails: true,
          },
        } as unknown as AppShellPayload,
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
              id: 'message-session-started',
              channelId: 'channel-1',
              senderKind: 'system',
              senderName: 'Runtime',
              body: 'Inline Reviewer connected to cats-runtime session session-inline.',
              mentions: [],
              metadata: {
                event: 'session_started',
                targetKind: 'cat',
                targetId: 'participant-inline',
                verbosity: 'verbose',
              },
              usage: null,
              createdAt: '2026-04-07T00:01:01.500Z',
            },
          ],
        }),
        liveIndicator: {
          ...EMPTY_LIVE_INDICATOR,
          active: true,
          phase: 'streaming',
          participantId: 'participant-inline',
          speakerLabel: 'Inline Reviewer',
          contentBlocks: [
            {
              id: 'text:0',
              index: 0,
              kind: 'text',
              status: 'streaming',
              title: null,
              text: 'Streaming answer',
              toolName: null,
              toolId: null,
              metadata: null,
            },
          ],
        },
      })}
    />,
  );

  assert.match(markup, /Streaming answer/u);
  assert.doesNotMatch(markup, /typingDots/u);
  assert.doesNotMatch(markup, /typingContentBlocks/u);
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
          speakerLabel: null,
        },
      })}
    />,
  );

  assert.doesNotMatch(markup, /typingIndicator/u);
  assert.doesNotMatch(markup, /catAvatarPulsing/u);
});

test('ChatView keeps the next sequential speaker bubble visible after the prior speaker has already replied', () => {
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
              id: 'message-session-verifier',
              channelId: 'channel-1',
              senderKind: 'system',
              senderName: 'Runtime',
              body: 'Runtime Verifier connected to cats-runtime session session-verifier.',
              mentions: [],
              metadata: {
                event: 'session_started',
                targetKind: 'cat',
                targetId: 'participant-verifier',
                verbosity: 'verbose',
              },
              usage: null,
              createdAt: '2026-04-07T00:01:03.600Z',
            },
            {
              id: 'message-agent-1',
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
                dispatchCount: 2,
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
                    sourceMessageId: 'message-user',
                    trigger: 'room_default',
                    mentionNames: [],
                    depth: 0,
                    parentCheckpointId: null,
                    branchStrategy: null,
                    handoffReason: null,
                    wakeRequestId: null,
                    status: 'completed',
                    queuedAt: '2026-04-07T00:01:01.000Z',
                    startedAt: '2026-04-07T00:01:02.000Z',
                    completedAt: '2026-04-07T00:01:04.000Z',
                    response: {
                      assistantTurnId: 'assistant-turn-inline',
                      messageIds: ['message-agent-1'],
                      fullText: 'Done.',
                      segmentCount: 1,
                    },
                    error: null,
                  },
                  {
                    id: 'target-2',
                    dispatchId: 'dispatch-2',
                    participant: {
                      participantKind: 'cat',
                      participantId: 'participant-verifier',
                      participantName: 'Runtime Verifier',
                    },
                    source: null,
                    sourceMessageId: 'message-user',
                    trigger: 'room_default',
                    mentionNames: [],
                    depth: 0,
                    parentCheckpointId: null,
                    branchStrategy: null,
                    handoffReason: null,
                    wakeRequestId: null,
                    status: 'running',
                    queuedAt: '2026-04-07T00:01:03.000Z',
                    startedAt: '2026-04-07T00:01:03.500Z',
                    completedAt: null,
                    response: null,
                    error: null,
                  },
                ],
                events: [],
                startedAt: '2026-04-07T00:01:01.000Z',
                updatedAt: '2026-04-07T00:01:03.500Z',
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
          phase: 'streaming',
          participantId: 'participant-verifier',
          speakerLabel: 'Runtime Verifier',
        },
      })}
    />,
  );

  assert.match(markup, /typingIndicator/u);
  assert.match(markup, /Runtime Verifier/u);
  assert.doesNotMatch(markup, /userTurnStatusProcessing/u);
});

test('ChatView promotes a waiting next sequential speaker placeholder instead of returning to the user bubble', () => {
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
              id: 'message-agent-1',
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
                dispatchCount: 2,
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
                    sourceMessageId: 'message-user',
                    trigger: 'room_default',
                    mentionNames: [],
                    depth: 0,
                    parentCheckpointId: null,
                    branchStrategy: null,
                    handoffReason: null,
                    wakeRequestId: null,
                    status: 'completed',
                    queuedAt: '2026-04-07T00:01:01.000Z',
                    startedAt: '2026-04-07T00:01:02.000Z',
                    completedAt: '2026-04-07T00:01:04.000Z',
                    response: {
                      assistantTurnId: 'assistant-turn-inline',
                      messageIds: ['message-agent-1'],
                      fullText: 'Done.',
                      segmentCount: 1,
                    },
                    error: null,
                  },
                  {
                    id: 'target-2',
                    dispatchId: 'dispatch-2',
                    participant: {
                      participantKind: 'cat',
                      participantId: 'participant-verifier',
                      participantName: 'Runtime Verifier',
                    },
                    source: null,
                    sourceMessageId: 'message-user',
                    trigger: 'room_default',
                    mentionNames: [],
                    depth: 0,
                    parentCheckpointId: null,
                    branchStrategy: null,
                    handoffReason: null,
                    wakeRequestId: null,
                    status: 'running',
                    queuedAt: '2026-04-07T00:01:03.000Z',
                    startedAt: null,
                    completedAt: null,
                    response: null,
                    error: null,
                  },
                ],
                events: [],
                startedAt: '2026-04-07T00:01:01.000Z',
                updatedAt: '2026-04-07T00:01:05.000Z',
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
          participantId: 'participant-verifier',
          speakerLabel: 'Runtime Verifier',
        },
      })}
    />,
  );

  assert.match(markup, /typingIndicator/u);
  assert.match(markup, /Runtime Verifier/u);
  assert.doesNotMatch(markup, /userTurnStatusProcessing/u);
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
