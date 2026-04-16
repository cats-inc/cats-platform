import assert from 'node:assert/strict';
import test from 'node:test';
import { createRef } from 'react';
import { renderToStaticMarkup } from 'react-dom/server.browser';
import type { JSX } from 'react';

import { IDLE_BUSY_STATE } from '../src/shared/workspaceBusy.ts';
import { ChatTranscriptPanel } from '../src/products/chat/renderer/components/chat-view/ChatTranscriptPanel.tsx';
import { ChatTranscriptSurface } from '../src/products/shared/renderer/components/chat-view/ChatTranscriptSurface.tsx';
import {
  buildConcurrentTranscriptRenderItems,
  resolveDurableConcurrentClusterMaxSegmentCount,
} from '../src/products/shared/renderer/components/chat-view/concurrentTranscriptProjection.ts';
import type { ResolvedChannelParticipant } from '../src/products/chat/shared/channelParticipants.js';

function createParticipant(
  participantId: string,
  name: string,
): ResolvedChannelParticipant {
  return {
    participantId,
    sourceKind: 'adhoc',
    sourceRefId: null,
    name,
    roles: [],
    roleHint: null,
    skillProfile: null,
    mcpProfile: null,
    status: 'active',
    joinedAt: '2026-04-16T12:00:00.000Z',
    leftAt: null,
    avatarColor: null,
    avatarUrl: null,
    execution: {
      target: {
        provider: 'claude',
        instance: null,
        model: null,
      },
      lease: {
        sessionId: null,
        status: 'not_started',
        cwd: null,
        lastError: null,
        laneId: null,
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
  };
}

function createCompletedConcurrentTurnFixture() {
  const visibleMessages = [
    {
      id: 'message-user',
      channelId: 'channel-1',
      senderKind: 'user',
      senderName: 'Kenneth',
      body: 'Help me compare these.',
      mentions: [],
      metadata: {},
      usage: null,
      createdAt: '2026-04-16T12:00:00.000Z',
    },
    {
      id: 'message-claude',
      channelId: 'channel-1',
      senderKind: 'agent',
      senderName: 'Claude-CLI',
      body: 'Claude answer.',
      mentions: [],
      metadata: {
        event: 'assistant_turn_segment',
        turnId: 'turn-1',
        sourceMessageId: 'message-user',
        targetStateId: 'target-claude',
        targetId: 'participant-claude',
        laneId: 'lane-claude',
        segmentIndex: 0,
      },
      usage: null,
      createdAt: '2026-04-16T12:00:01.000Z',
    },
    {
      id: 'message-codex',
      channelId: 'channel-1',
      senderKind: 'agent',
      senderName: 'Codex-CLI',
      body: 'Codex answer.',
      mentions: [],
      metadata: {
        event: 'assistant_turn_segment',
        turnId: 'turn-1',
        sourceMessageId: 'message-user',
        targetStateId: 'target-codex',
        targetId: 'participant-codex',
        laneId: 'lane-codex',
        segmentIndex: 0,
      },
      usage: null,
      createdAt: '2026-04-16T12:00:02.000Z',
    },
  ] as const;

  const workflow = {
    activeTurn: null,
    turnHistory: [
      {
        id: 'turn-1',
        status: 'completed',
        sourceMessageId: 'message-user',
        sourceSenderKind: 'user',
        sourceSenderName: 'Kenneth',
        guard: 'allowed',
        stageId: 'stage-1',
        workflowShape: 'concurrent',
        reviewRequired: false,
        lastCheckpointId: null,
        convergeTargetId: null,
        continuationCount: 0,
        dispatchCount: 2,
        targetStatuses: [
          {
            id: 'target-claude',
            dispatchId: 'dispatch-claude',
            participant: {
              participantKind: 'cat',
              participantId: 'participant-claude',
              participantName: 'Claude-CLI',
            },
            laneId: 'lane-claude',
            sessionId: 'session-claude',
            source: null,
            sourceMessageId: 'message-user',
            trigger: 'default',
            mentionNames: [],
            depth: 0,
            parentCheckpointId: null,
            branchStrategy: null,
            handoffReason: null,
            wakeRequestId: null,
            status: 'completed',
            queuedAt: '2026-04-16T12:00:00.000Z',
            startedAt: '2026-04-16T12:00:00.500Z',
            completedAt: '2026-04-16T12:00:01.500Z',
            response: {
              assistantTurnId: 'assistant-turn-claude',
              messageIds: ['message-claude'],
              fullText: 'Claude answer.',
              segmentCount: 1,
            },
            error: null,
          },
          {
            id: 'target-codex',
            dispatchId: 'dispatch-codex',
            participant: {
              participantKind: 'cat',
              participantId: 'participant-codex',
              participantName: 'Codex-CLI',
            },
            laneId: 'lane-codex',
            sessionId: 'session-codex',
            source: null,
            sourceMessageId: 'message-user',
            trigger: 'default',
            mentionNames: [],
            depth: 0,
            parentCheckpointId: null,
            branchStrategy: null,
            handoffReason: null,
            wakeRequestId: null,
            status: 'completed',
            queuedAt: '2026-04-16T12:00:00.000Z',
            startedAt: '2026-04-16T12:00:00.500Z',
            completedAt: '2026-04-16T12:00:02.500Z',
            response: {
              assistantTurnId: 'assistant-turn-codex',
              messageIds: ['message-codex'],
              fullText: 'Codex answer.',
              segmentCount: 1,
            },
            error: null,
          },
        ],
        events: [],
        startedAt: '2026-04-16T12:00:00.000Z',
        updatedAt: '2026-04-16T12:00:03.000Z',
        completedAt: '2026-04-16T12:00:03.000Z',
      },
    ],
    eventHistory: [],
    lastCheckpointEvent: null,
    lastOutcomeEvent: null,
  } as never;

  return { visibleMessages, workflow };
}

test('buildConcurrentTranscriptRenderItems projects a completed concurrent turn into one cluster item', () => {
  const { visibleMessages, workflow } = createCompletedConcurrentTurnFixture();

  const items = buildConcurrentTranscriptRenderItems({
    visibleMessages: [...visibleMessages],
    workflow,
  });

  assert.equal(resolveDurableConcurrentClusterMaxSegmentCount({
    visibleMessages: [...visibleMessages],
    workflow,
  }), 2);
  assert.deepEqual(items.map((item) => item.kind), ['message', 'concurrent_cluster']);
  assert.equal(items[1]?.kind, 'concurrent_cluster');
  if (items[1]?.kind !== 'concurrent_cluster') {
    throw new Error('expected concurrent cluster render item');
  }
  assert.equal(items[1].messages.length, 2);
  assert.deepEqual(
    items[1].segments.map((segment) => segment.speakerLabel),
    ['Claude-CLI', 'Codex-CLI'],
  );
});

test('ChatTranscriptPanel keeps compare_cards layout for completed concurrent turns', () => {
  const { visibleMessages, workflow } = createCompletedConcurrentTurnFixture();
  const participants = new Map([
    ['participant-claude', createParticipant('participant-claude', 'Claude-CLI')],
    ['participant-codex', createParticipant('participant-codex', 'Codex-CLI')],
  ]);

  const markup = renderToStaticMarkup(
    <ChatTranscriptPanel
      hasConversationStarted
      greeting="Hello"
      transcriptListRef={createRef<HTMLDivElement>()}
      bottomSentinelRef={() => {}}
      visibleMessages={[...visibleMessages]}
      workflow={workflow}
      cats={[]}
      bossCatId={null}
      selectedChannelId="channel-1"
      disabledMentionNames={[]}
      busy={IDLE_BUSY_STATE}
      compareBusy={false}
      isCompareGroup={false}
      choiceResponsesBySource={new Map()}
      onChoiceSubmit={() => {}}
      latestUserTurnMessageId={null}
      latestUserTurnStatus="idle"
      liveIndicator={undefined}
      liveSpeakerParticipant={null}
      liveSpeakerParticipantCat={null}
      resolveLiveIndicatorSegmentParticipant={(segment) =>
        segment.participantId ? (participants.get(segment.participantId) ?? null) : null}
      messageStackTone={(senderKind) => senderKind}
      resolveMessageParticipant={() => null}
      resolveParticipantCatRecord={() => null}
      buildParticipantAvatarClassName={() => 'catAvatar transcriptAvatar'}
      buildParticipantAvatarStyle={() => undefined}
      resolveParticipantAvatarUrl={() => null}
      resolveParticipantDisplayName={(participant) => participant.name}
      showLiveProgressDetails={false}
      resolveConcurrentClusterPresentationMode={() => 'compare_cards'}
      buildConcurrentClusterActions={() => []}
    />,
  );

  assert.match(markup, /compareCardsGrid/u);
  assert.match(markup, /Claude-CLI/u);
  assert.match(markup, /Codex-CLI/u);
  assert.match(markup, /Claude answer\./u);
  assert.match(markup, /Codex answer\./u);
});

test('ChatTranscriptPanel falls back to raw transcript bubbles when a durable cluster resolves to inline_stack', () => {
  const { visibleMessages, workflow } = createCompletedConcurrentTurnFixture();
  const participants = new Map([
    ['participant-claude', createParticipant('participant-claude', 'Claude-CLI')],
    ['participant-codex', createParticipant('participant-codex', 'Codex-CLI')],
  ]);

  const markup = renderToStaticMarkup(
    <ChatTranscriptPanel
      hasConversationStarted
      greeting="Hello"
      transcriptListRef={createRef<HTMLDivElement>()}
      bottomSentinelRef={() => {}}
      visibleMessages={[...visibleMessages]}
      workflow={workflow}
      cats={[]}
      bossCatId={null}
      selectedChannelId="channel-1"
      disabledMentionNames={[]}
      busy={IDLE_BUSY_STATE}
      compareBusy={false}
      isCompareGroup={false}
      choiceResponsesBySource={new Map()}
      onChoiceSubmit={() => {}}
      latestUserTurnMessageId={null}
      latestUserTurnStatus="idle"
      liveIndicator={undefined}
      liveSpeakerParticipant={null}
      liveSpeakerParticipantCat={null}
      resolveLiveIndicatorSegmentParticipant={(segment) =>
        segment.participantId ? (participants.get(segment.participantId) ?? null) : null}
      messageStackTone={(senderKind) => senderKind}
      resolveMessageParticipant={(message) =>
        typeof message.metadata?.targetId === 'string'
          ? (participants.get(message.metadata.targetId) ?? null)
          : null}
      resolveParticipantCatRecord={() => null}
      buildParticipantAvatarClassName={() => 'catAvatar transcriptAvatar'}
      buildParticipantAvatarStyle={() => undefined}
      resolveParticipantAvatarUrl={() => null}
      resolveParticipantDisplayName={(participant) => participant.name}
      showLiveProgressDetails={false}
      resolveConcurrentClusterPresentationMode={() => 'inline_stack'}
      buildConcurrentClusterActions={() => []}
    />,
  );

  assert.doesNotMatch(markup, /compareCardsGrid/u);
  assert.equal((markup.match(/messageActionIcon/gu) ?? []).length, 3);
  assert.match(markup, /Claude-CLI/u);
  assert.match(markup, /Codex-CLI/u);
  assert.match(markup, /Claude answer\./u);
  assert.match(markup, /Codex answer\./u);
});

test('shared ChatTranscriptSurface keeps compare_cards layout for completed concurrent turns', () => {
  const { visibleMessages, workflow } = createCompletedConcurrentTurnFixture();

  const markup = renderToStaticMarkup(
    <ChatTranscriptSurface
      hasConversationStarted
      greeting="Hello"
      payload={{
        chat: {
          cats: [],
          bossCatId: null,
          showVerboseMessages: true,
          showLiveProgressDetails: false,
        },
      } as Parameters<typeof ChatTranscriptSurface>[0]['payload']}
      selectedChannel={{
        id: 'channel-1',
        title: 'Team Code',
        messages: [...visibleMessages],
        roomRouting: {
          defaultRecipientId: null,
          workflow,
        },
      } as Parameters<typeof ChatTranscriptSurface>[0]['selectedChannel']}
      busy={IDLE_BUSY_STATE}
      liveIndicator={undefined}
      directLaneExcludedMentionNames={[]}
      transcriptListRef={() => {}}
      bottomSentinelRef={() => {}}
      onChoiceSubmit={() => {}}
      resolveConcurrentClusterPresentationMode={() => 'compare_cards'}
      buildConcurrentClusterActions={() => []}
    />,
  );

  assert.match(markup, /compareCardsGrid/u);
  assert.match(markup, /Claude-CLI/u);
  assert.match(markup, /Codex-CLI/u);
  assert.match(markup, /Claude answer\./u);
  assert.match(markup, /Codex answer\./u);
});

test('shared ChatTranscriptSurface renders copy actions for completed assistant bubbles and accepts extra message actions', () => {
  const markup = renderToStaticMarkup(
    <ChatTranscriptSurface
      hasConversationStarted
      greeting="Hello"
      payload={({
        chat: {
          cats: [],
          bossCatId: null,
          showVerboseMessages: true,
          showLiveProgressDetails: false,
        },
      }) as Parameters<typeof ChatTranscriptSurface>[0]['payload']}
      selectedChannel={({
        id: 'channel-1',
        title: 'Peer Code',
        messages: [
          {
            id: 'message-user',
            channelId: 'channel-1',
            senderKind: 'user',
            senderName: 'Kenneth',
            body: 'hi',
            mentions: [],
            metadata: {},
            usage: null,
            createdAt: '2026-04-16T12:00:00.000Z',
          },
          {
            id: 'message-agent',
            channelId: 'channel-1',
            senderKind: 'agent',
            senderName: 'Claude-CLI',
            body: 'Hello from Claude.',
            mentions: [],
            metadata: {},
            usage: null,
            createdAt: '2026-04-16T12:00:01.000Z',
          },
        ],
        roomRouting: {
          defaultRecipientId: null,
          workflow: {
            activeTurn: null,
            turnHistory: [],
            eventHistory: [],
            lastCheckpointEvent: null,
            lastOutcomeEvent: null,
          },
        },
      }) as Parameters<typeof ChatTranscriptSurface>[0]['selectedChannel']}
      busy={IDLE_BUSY_STATE}
      liveIndicator={undefined}
      directLaneExcludedMentionNames={[]}
      transcriptListRef={() => {}}
      bottomSentinelRef={() => {}}
      onChoiceSubmit={() => {}}
      resolveConcurrentClusterPresentationMode={() => 'inline_stack'}
      buildConcurrentClusterActions={() => []}
      buildTranscriptMessageActions={({ message }) =>
        message.senderKind === 'agent'
          ? [{
              key: 'share',
              title: 'Share to other chats',
              icon: <span aria-hidden="true">+</span> as JSX.Element,
              onSelect: () => {},
            }]
          : []}
    />,
  );

  assert.match(markup, /messageActions messageActionsHoverOnly/u);
  assert.match(markup, /messageActions messageActionsPersistent/u);
  assert.match(markup, /aria-label="Copy message"/u);
  assert.match(markup, /title="Share to other chats"/u);
});
