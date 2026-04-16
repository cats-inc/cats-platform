import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server.browser';

import { createLiveIndicatorSegmentState } from '../src/shared/liveIndicator.ts';
import { ConcurrentClusterRenderer } from '../src/products/chat/renderer/components/chat-view/ConcurrentClusterRenderer.tsx';
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
    />,
  );
}

test('compare_cards preserves primary speaker fallback for the latest concurrent segment', () => {
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

test('focus_rail treats the latest segment as primary and keeps secondary headers button-safe', () => {
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
      phase: 'waiting',
      sourceMessageId: 'message-1',
      laneId: 'lane-2',
      targetStateId: 'target-2',
      segmentIndex: 1,
    }),
  ]);

  assert.match(
    markup,
    /focusRailPrimary[\s\S]*Latest Speaker[\s\S]*focusRailSecondaries[\s\S]*Earlier Speaker/u,
  );
  assert.match(markup, /focusRailSecondaryName">Earlier Speaker/u);
  assert.doesNotMatch(
    markup,
    /<button[^>]*class="focusRailSecondaryHeader"[^>]*>\s*<div class="transcriptMessageTop"/u,
  );
});
