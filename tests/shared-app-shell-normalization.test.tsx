import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { normalizeAppShellPayload } from '../src/products/shared/renderer/api/normalization.ts';
import {
  resolveVisibleChatChannel,
  resolveVisibleChatChannelId,
} from '../src/products/shared/renderer/appShellPresentation.ts';
import { resolveProjectPath } from './helpers/projectRoot.js';

type MutablePayload = ReturnType<typeof createLegacyPayload>;

function createLegacyPayload() {
  return {
    setupCompleteAt: '2026-03-25T00:00:00.000Z',
    chat: {
      globalOrchestrator: {
        id: 'orch',
        name: 'Boss',
        provider: 'claude',
        instance: null,
        model: 'claude-sonnet-4-6',
      },
      bossCatId: 'cat-boss',
      cats: [
        {
          id: 'cat-nova',
          name: 'Nova',
          roles: ['Engineer'],
          skillProfile: null,
          mcpProfile: null,
          status: 'active',
          createdAt: '2026-03-01T00:00:00.000Z',
          updatedAt: '2026-03-01T00:00:00.000Z',
          archivedAt: null,
          avatarColor: '#112233',
          avatarUrl: null,
          provider: 'claude',
          instance: null,
          model: 'claude-sonnet-4-6',
          products: ['chat'],
          memory: {
            summary: null,
            facts: [],
            openLoops: [],
            updatedAt: null,
          },
        },
      ],
      selectedChannelId: 'channel-nova',
      selectedChannel: {
        id: 'channel-nova',
        title: 'Nova Direct Lane',
        createdAt: '2026-03-01T00:00:00.000Z',
        updatedAt: '2026-03-20T00:00:00.000Z',
        messages: [],
        routingStatus: 'idle',
        channelKind: 'direct_message',
        roomRouting: {
          mode: 'direct_message',
          defaultRecipientId: 'cat-nova',
          workflow: {
            activeTurn: null,
            turnHistory: [],
            eventHistory: [],
            lastCheckpointEvent: null,
            lastOutcomeEvent: null,
          },
        },
        catAssignments: [
          {
            catId: 'cat-nova',
            status: 'active',
            joinedAt: '2026-03-01T00:00:00.000Z',
            leftAt: null,
            execution: {
              target: { provider: 'claude', instance: null, model: 'claude-sonnet-4-6' },
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
          },
        ],
      },
    },
  } as unknown as MutablePayload;
}

test('shared normalizer backfills participantAssignments with cat-backed names instead of "Participant"', () => {
  const payload = normalizeAppShellPayload(createLegacyPayload() as never) as MutablePayload;
  const participantAssignments = payload.chat.selectedChannel.participantAssignments as Array<{
    participantId: string;
    sourceKind: string;
    sourceRefId: string | null;
    name: string;
  }>;

  assert.equal(participantAssignments.length, 1);
  assert.equal(participantAssignments[0].sourceKind, 'cat');
  assert.equal(participantAssignments[0].sourceRefId, 'cat-nova');
  assert.equal(
    participantAssignments[0].name,
    'Nova',
    'cat-backed participantAssignments should resolve the cat name rather than defaulting to "Participant"',
  );
});

test('shared normalizer fills assignedCats and assignedParticipants from catAssignments in legacy payloads', () => {
  const payload = normalizeAppShellPayload(createLegacyPayload() as never) as MutablePayload;
  const assignedCats = payload.chat.selectedChannel.assignedCats as Array<{
    participantId: string;
    sourceKind: string;
    sourceRefId: string;
    catId: string;
    name: string;
    avatarColor: string | null;
    avatarUrl: string | null;
  }>;
  const assignedParticipants = payload.chat.selectedChannel.assignedParticipants as Array<{
    participantId: string;
    sourceKind: string;
    name: string;
    avatarColor: string | null;
  }>;

  assert.equal(assignedCats.length, 1);
  assert.equal(assignedCats[0].participantId, 'cat-nova');
  assert.equal(assignedCats[0].sourceKind, 'cat');
  assert.equal(assignedCats[0].sourceRefId, 'cat-nova');
  assert.equal(assignedCats[0].catId, 'cat-nova');
  assert.equal(assignedCats[0].name, 'Nova');
  assert.equal(assignedCats[0].avatarColor, '#112233');

  assert.equal(assignedParticipants.length, 1);
  assert.equal(assignedParticipants[0].participantId, 'cat-nova');
  assert.equal(assignedParticipants[0].sourceKind, 'cat');
  assert.equal(
    assignedParticipants[0].name,
    'Nova',
    'cat-backed assignedParticipants should inherit the cat name end-to-end',
  );
  assert.equal(assignedParticipants[0].avatarColor, '#112233');
});

test('resolveVisibleChatChannel picks the direct-lane channel when the chats route has no selection', () => {
  const selectedChannel = { id: 'channel-a' } as const;
  const directLaneChannel = { id: 'channel-direct' } as const;

  assert.equal(resolveVisibleChatChannel(selectedChannel, null), selectedChannel);
  assert.equal(resolveVisibleChatChannel(null, directLaneChannel), directLaneChannel);
  assert.equal(resolveVisibleChatChannel(null, null), null);
  assert.equal(resolveVisibleChatChannelId(null, directLaneChannel), 'channel-direct');
});

test('WorkspaceProductApp gates default and participant-chat chatSurfaceProps off visibleChannel so direct-lane routes (/chat/dm/:catId, /work/dm/:catId, /code/dm/:catId) keep direct-lane controls', () => {
  const source = readFileSync(
    resolveProjectPath(import.meta.url, 'src/products/shared/renderer/WorkspaceProductApp.tsx'),
    'utf8',
  );
  const chatSurfaceIndex = source.indexOf('chatSurfaceProps={{');
  assert.notEqual(
    chatSurfaceIndex,
    -1,
    'WorkspaceProductApp should still build chatSurfaceProps inline',
  );
  const chatSurfaceRegion = source.slice(chatSurfaceIndex, chatSurfaceIndex + 4000);

  assert.match(
    chatSurfaceRegion,
    /onStartFresh:\s*\n?\s*visibleChatChannelId\s*&&\s*visibleChannel\s*&&\s*isDefaultChatChannel\(visibleChannel\)/u,
    'onStartFresh should gate on visibleChannel so direct-lane routes inherit the default control',
  );
  assert.match(
    chatSurfaceRegion,
    /selectedExecutionTarget:\s*\n?\s*visibleChannel\s*&&\s*isDefaultChatChannel\(visibleChannel\)/u,
    'selectedExecutionTarget should gate on visibleChannel',
  );
  assert.match(
    chatSurfaceRegion,
    /onExecutionTargetChange:\s*\n?\s*visibleChannel\s*&&\s*isDefaultChatChannel\(visibleChannel\)/u,
    'onExecutionTargetChange should gate on visibleChannel',
  );
  assert.match(
    chatSurfaceRegion,
    /onToggleActiveWorkflowShape:\s*\n?\s*visibleChannel\s*&&\s*supportsParticipantAudienceSelection\(visibleChannel\)/u,
    'onToggleActiveWorkflowShape should gate on visibleChannel',
  );
  assert.match(
    chatSurfaceRegion,
    /onSetActiveAudienceKeys:\s*\n?\s*visibleChannel\s*&&\s*supportsParticipantAudienceSelection\(visibleChannel\)/u,
    'onSetActiveAudienceKeys should gate on visibleChannel',
  );
  assert.equal(
    /selectedChannel\?\.composerMode|visibleChannel\?\.composerMode/u.test(chatSurfaceRegion),
    false,
    'chatSurfaceProps must not regress to composerMode checks',
  );
});
