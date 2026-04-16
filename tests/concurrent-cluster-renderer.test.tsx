import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server.browser';

import { createLiveIndicatorSegmentState } from '../src/shared/liveIndicator.ts';
import { ConcurrentClusterRenderer } from '../src/products/chat/renderer/components/chat-view/ConcurrentClusterRenderer.tsx';
import { resolveCompareCardsWindow } from '../src/products/chat/renderer/components/chat-view/CompareCardsLayout.tsx';
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

function renderConcurrentCluster(
  mode: 'inline_stack' | 'compare_cards' | 'focus_rail' | 'adaptive',
  segments: Parameters<typeof ConcurrentClusterRenderer>[0]['segments'],
  actions: Parameters<typeof ConcurrentClusterRenderer>[0]['actions'] = [],
): string {
  const liveSpeakerParticipant = createParticipant('participant-latest', 'Latest Speaker');
  return renderToStaticMarkup(
    <ConcurrentClusterRenderer
      mode={mode}
      segments={segments}
      cats={[]}
      bossCatId={null}
      selectedChannelId="channel-1"
      disabledMentionNames={[]}
      liveSpeakerParticipant={liveSpeakerParticipant}
      liveSpeakerParticipantCat={null}
      resolveLiveIndicatorSegmentParticipant={() => null}
      resolveParticipantCatRecord={() => null}
      buildParticipantAvatarClassName={() => 'catAvatar transcriptAvatar'}
      buildParticipantAvatarStyle={() => undefined}
      resolveParticipantAvatarUrl={() => null}
      resolveParticipantDisplayName={(participant) => participant.name}
      showProgressDetails={false}
      actions={actions}
    />,
  );
}

test('compare_cards applies primary-only fallback to the first concurrent segment', () => {
  const markup = renderConcurrentCluster('compare_cards', [
    createLiveIndicatorSegmentState({
      phase: 'waiting',
      sourceMessageId: 'message-1',
      laneId: 'lane-1',
      targetStateId: 'target-1',
      segmentIndex: 0,
    }),
    createLiveIndicatorSegmentState({
      phase: 'waiting',
      sourceMessageId: 'message-1',
      laneId: 'lane-2',
      targetStateId: 'target-2',
      segmentIndex: 1,
    }),
  ]);

  assert.equal(markup.match(/Latest Speaker/gu)?.length ?? 0, 1);
});

test('focus_rail treats the first segment as primary and keeps secondary headers button-safe', () => {
  const markup = renderConcurrentCluster('focus_rail', [
    createLiveIndicatorSegmentState({
      phase: 'sealed',
      sourceMessageId: 'message-1',
      laneId: 'lane-1',
      targetStateId: 'target-1',
      segmentIndex: 0,
      speakerLabel: 'Earlier Speaker',
      contentBlocks: [
        {
          id: 'text-earlier',
          kind: 'text',
          index: 0,
          status: 'complete',
          text: 'Earlier reply',
        },
      ],
    }),
    createLiveIndicatorSegmentState({
      phase: 'sealed',
      sourceMessageId: 'message-1',
      laneId: 'lane-2',
      targetStateId: 'target-2',
      segmentIndex: 1,
      speakerLabel: 'Later Speaker',
      contentBlocks: [
        {
          id: 'text-later',
          kind: 'text',
          index: 0,
          status: 'complete',
          text: 'Later reply',
        },
      ],
    }),
  ]);

  assert.match(
    markup,
    /focusRailPrimary[\s\S]*Earlier Speaker[\s\S]*focusRailSecondaries[\s\S]*Later Speaker/u,
  );
  assert.match(markup, /focusRailSecondaryName">Later Speaker/u);
  assert.doesNotMatch(
    markup,
    /<button[^>]*class="focusRailSecondaryHeader"[^>]*>\s*<div class="transcriptMessageTop"/u,
  );
});

test('focus_rail keeps anonymous sealed secondaries visible and labels controls accessibly', () => {
  const markup = renderConcurrentCluster('focus_rail', [
    createLiveIndicatorSegmentState({
      phase: 'sealed',
      sourceMessageId: 'message-1',
      laneId: 'lane-1',
      targetStateId: 'target-1',
      segmentIndex: 0,
      speakerLabel: 'Claude-CLI',
      contentBlocks: [
        {
          id: 'text-primary',
          kind: 'text',
          index: 0,
          status: 'complete',
          text: 'Primary answer',
        },
      ],
    }),
    createLiveIndicatorSegmentState({
      phase: 'sealed',
      sourceMessageId: 'message-1',
      laneId: 'lane-2',
      targetStateId: 'target-2',
      segmentIndex: 1,
      contentBlocks: [
        {
          id: 'text-anonymous',
          kind: 'text',
          index: 0,
          status: 'complete',
          text: 'Anonymous answer',
        },
      ],
    }),
  ]);

  assert.match(markup, /aria-label="Copy message from Claude-CLI"/u);
  assert.match(markup, /class="focusRailSecondaryAnonymousIndicator"/u);
  assert.match(markup, /aria-label="Expand unnamed response"/u);
  assert.match(markup, /aria-expanded="false"/u);
});

test('ConcurrentClusterRenderer renders cluster actions independently from mode-specific layout', () => {
  const markup = renderConcurrentCluster(
    'compare_cards',
    [
      createLiveIndicatorSegmentState({
        phase: 'sealed',
        sourceMessageId: 'message-1',
        laneId: 'lane-1',
        targetStateId: 'target-1',
        segmentIndex: 0,
        speakerLabel: 'Claude-CLI',
        contentBlocks: [
          {
            id: 'text-claude',
            kind: 'text',
            index: 0,
            status: 'complete',
            text: 'Claude answer',
          },
        ],
      }),
      createLiveIndicatorSegmentState({
        phase: 'sealed',
        sourceMessageId: 'message-1',
        laneId: 'lane-2',
        targetStateId: 'target-2',
        segmentIndex: 1,
        speakerLabel: 'Codex-CLI',
        contentBlocks: [
          {
            id: 'text-codex',
            kind: 'text',
            index: 0,
            status: 'complete',
            text: 'Codex answer',
          },
        ],
      }),
    ],
    [
      {
        key: 'dismiss',
        label: 'Dismiss',
        title: 'Dismiss layout',
        onSelect: () => {},
      },
    ],
  );

  assert.match(markup, /compareCardsGrid/u);
  assert.match(markup, /clusterActionBar/u);
  assert.match(markup, /Dismiss/u);
});

test('resolveCompareCardsWindow explicitly supports last-to-first wrap-around', () => {
  const windowState = resolveCompareCardsWindow(
    ['lane-0', 'lane-1', 'lane-2'],
    2,
  );

  assert.equal(windowState.showNav, true);
  assert.equal(windowState.normalizedStartIndex, 2);
  assert.deepEqual(windowState.visibleIndices, [2, 0]);
  assert.deepEqual(windowState.visibleItems, ['lane-2', 'lane-0']);
});

test('compare_cards promotes a single renderable card to a full-width grid', () => {
  const markup = renderConcurrentCluster('compare_cards', [
    createLiveIndicatorSegmentState({
      phase: 'sealed',
      sourceMessageId: 'message-1',
      laneId: 'lane-1',
      targetStateId: 'target-1',
      segmentIndex: 0,
      speakerLabel: 'Claude-CLI',
      contentBlocks: [
        {
          id: 'text-claude',
          kind: 'text',
          index: 0,
          status: 'complete',
          text: 'Claude answer',
        },
      ],
    }),
    createLiveIndicatorSegmentState({
      phase: 'sealed',
      sourceMessageId: 'message-1',
      laneId: 'lane-2',
      targetStateId: 'target-2',
      segmentIndex: 1,
    }),
  ]);

  assert.match(markup, /compareCardsGrid compareCardsGridSingle/u);
  assert.equal(
    markup.match(/<article[^>]*class="compareCard(?: compareCard\w+)?"/gu)?.length ?? 0,
    1,
  );
});

test('compare_cards exposes nav controls and per-card dots when carousel mode is active', () => {
  const markup = renderConcurrentCluster('compare_cards', [
    createLiveIndicatorSegmentState({
      phase: 'sealed',
      sourceMessageId: 'message-1',
      laneId: 'lane-1',
      targetStateId: 'target-1',
      segmentIndex: 0,
      speakerLabel: 'Claude-CLI',
      contentBlocks: [
        {
          id: 'text-claude',
          kind: 'text',
          index: 0,
          status: 'complete',
          text: 'Claude answer',
        },
      ],
    }),
    createLiveIndicatorSegmentState({
      phase: 'sealed',
      sourceMessageId: 'message-1',
      laneId: 'lane-2',
      targetStateId: 'target-2',
      segmentIndex: 1,
      speakerLabel: 'Codex-CLI',
      contentBlocks: [
        {
          id: 'text-codex',
          kind: 'text',
          index: 0,
          status: 'complete',
          text: 'Codex answer',
        },
      ],
    }),
    createLiveIndicatorSegmentState({
      phase: 'sealed',
      sourceMessageId: 'message-1',
      laneId: 'lane-3',
      targetStateId: 'target-3',
      segmentIndex: 2,
      speakerLabel: 'Gemini-CLI',
      contentBlocks: [
        {
          id: 'text-gemini',
          kind: 'text',
          index: 0,
          status: 'complete',
          text: 'Gemini answer',
        },
      ],
    }),
  ]);

  assert.match(markup, /compareCardsCarousel compareCardsCarouselNavVisible/u);
  assert.match(markup, /aria-label="Previous card"/u);
  assert.match(markup, /aria-label="Next card"/u);
  assert.equal(
    markup.match(/<button[^>]*class="compareCardsPaginationDot(?: compareCardsPaginationDotActive)?"/gu)?.length ?? 0,
    3,
  );
});
