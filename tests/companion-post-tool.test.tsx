import assert from 'node:assert/strict';
import test from 'node:test';

import { createDefaultChatState } from '../src/products/chat/state/defaults.ts';
import { createChannel, requireChannel } from '../src/products/chat/state/model/index.ts';
import { MemoryChatStore } from '../src/products/chat/state/store.ts';
import { MemoryCompanionBoxStore } from '../src/products/chat/state/companion-box/index.ts';
import { beginChannelMessageDispatch } from '../src/products/chat/state/runtime-dispatch/routing.ts';
import {
  createCompanionContentDecisionRequester,
  restrictObservationToCompanionContentTools,
} from '../src/products/chat/state/companionContentDecisionScope.ts';
import {
  COMPANION_CONTENT_POST_CREATE_TOOL,
} from '../src/products/chat/companion/supervisedContentTools.ts';
import { COMPANION_PROFILE_METADATA_KEYS } from '../src/products/chat/companion/profileReadModel.ts';
import type { RuntimeClient } from '../src/platform/runtime/client.ts';
import {
  PROVIDER_AGENT_DECISION_CONTRACT_VERSION,
  type ProviderAgentBoundedObservation,
  type ProviderAgentDecision,
} from '../src/platform/orchestration/index.ts';
import {
  parseProviderCapabilityBootstrapConfigDocument,
  type ProviderCapabilityBootstrapConfig,
} from '../src/platform/supervision/index.ts';

const NOW = new Date('2026-09-29T12:00:00.000Z');

function runtimeStub(): RuntimeClient {
  return {
    async closeSession() {},
  } as unknown as RuntimeClient;
}

function fixtureBootstrapConfig(): ProviderCapabilityBootstrapConfig {
  const parsed = parseProviderCapabilityBootstrapConfigDocument(
    {
      version: 1,
      profiles: [
        {
          id: 'claude-native-sonnet-strong',
          selector: {
            provider: 'claude',
            instance: 'native',
            model: 'sonnet',
            control: 'default',
          },
          initialTreatment: 'strong_agent',
          confidenceLevel: 'catalog_only',
          reason: 'Operator-approved strong Chat candidate.',
        },
      ],
    },
    { observedAt: '2026-09-29T00:00:00.000Z' },
  );
  if (!parsed.config) {
    throw new Error('Expected fixture bootstrap config.');
  }
  return parsed.config;
}

function createLane(input: { roles: string[]; roomMode?: 'direct_message' | 'chat_channel' }) {
  const state = createChannel(
    createDefaultChatState(),
    {
      title: '',
      topic: 'Companion post lane',
      originSurface: 'chat',
      ...(input.roomMode === 'chat_channel' ? {} : { entryKind: 'direct' as const }),
      roomMode: input.roomMode ?? 'direct_message',
      cats: [
        {
          name: 'Mochi',
          provider: 'claude',
          instance: 'native',
          model: 'sonnet',
          roles: input.roles,
        },
      ],
    },
    NOW,
  );
  const catId = state.cats[0]?.id;
  if (!catId) {
    throw new Error('Expected Cat id.');
  }
  return { state, channelId: state.selectedChannelId, catId };
}

function postDecision(input: Record<string, unknown>): ProviderAgentDecision {
  return {
    contractVersion: PROVIDER_AGENT_DECISION_CONTRACT_VERSION,
    kind: 'tool_request',
    decisionId: 'decision-companion-post-1',
    confidence: 'high',
    toolName: COMPANION_CONTENT_POST_CREATE_TOOL,
    target: { kind: 'worker_tool', toolName: COMPANION_CONTENT_POST_CREATE_TOOL },
    input,
    rationaleSummary: 'The owner asked for a post about the afternoon nap.',
  };
}

async function dispatchWithDecision(input: {
  roles: string[];
  roomMode?: 'direct_message' | 'chat_channel';
  decision: ProviderAgentDecision | null;
  body?: string;
}) {
  const lane = createLane(input);
  const companionStore = new MemoryCompanionBoxStore();
  let observation: ProviderAgentBoundedObservation | null = null;
  const begun = await beginChannelMessageDispatch(
    lane.state,
    lane.channelId,
    { body: input.body ?? 'Please write a post about your afternoon nap.' },
    runtimeStub(),
    NOW,
    {
      chatStore: new MemoryChatStore(lane.state),
      companionStore,
      providerCapabilityBootstrapConfig: fixtureBootstrapConfig(),
      providerAgentDecisionRequester: async (request) => {
        observation = request.observation;
        return input.decision;
      },
    },
  );
  const offered = (observation as ProviderAgentBoundedObservation | null)?.availableTools
    .some(({ manifest }) => manifest.name === COMPANION_CONTENT_POST_CREATE_TOOL) ?? false;
  return {
    ...lane,
    begun,
    offered,
    observation: observation as ProviderAgentBoundedObservation | null,
    posts: (await companionStore.listDerived(lane.catId)).filter((record) =>
      record.metadata[COMPANION_PROFILE_METADATA_KEYS.surface]
        === COMPANION_PROFILE_METADATA_KEYS.postSurface),
  };
}

test('companion Cat in a direct lane publishes a post through the boundary and still replies', async () => {
  const result = await dispatchWithDecision({
    roles: ['companion'],
    decision: postDecision({
      catId: 'someone-else',
      title: 'Sunny nap',
      body: 'I napped by the window all afternoon.',
      tags: ['nap'],
    }),
  });

  assert.equal(result.offered, true);
  assert.equal(result.observation?.policy.dials.toolScope, 'narrow_write');
  assert.equal(result.posts.length, 1);
  assert.equal(result.posts[0]?.catId, result.catId);
  assert.equal(result.posts[0]?.title, 'Sunny nap');
  assert.deepEqual(result.posts[0]?.tags, ['nap']);

  const notice = requireChannel(result.begun.state, result.channelId).messages
    .find((message) => message.metadata.event === 'companion_post_published');
  assert.equal(notice?.senderKind, 'system');
  assert.match(notice?.body ?? '', /Mochi posted "Sunny nap"/u);
  // Unlike the Work sidecars, the Cat's own reply still runs this turn.
  assert.notEqual(result.begun.preparedTurn, null);
});

test('ordinary Cats are not offered the post tool and a stray decision writes nothing', async () => {
  const result = await dispatchWithDecision({
    roles: ['reviewer'],
    decision: postDecision({ title: 'Nope', body: 'Should not publish.' }),
  });

  assert.equal(result.offered, false);
  assert.equal(result.posts.length, 0);
});

test('companion Cats outside a direct lane are not offered the post tool', async () => {
  const result = await dispatchWithDecision({
    roles: ['companion'],
    roomMode: 'chat_channel',
    decision: null,
    body: '@Mochi please write a post about your afternoon nap.',
  });

  // The Cat is still the lone target, so only the direct-lane bound withholds the tool.
  assert.equal(result.observation?.actor.actorRef, `cat:${result.catId}`);
  assert.equal(result.offered, false);
});

test('companion-scoped requester only decides on companion tools', async () => {
  const lane = await dispatchWithDecision({ roles: ['companion'], decision: null });
  const observation = lane.observation;
  assert.ok(observation);
  const withWorkTool: ProviderAgentBoundedObservation = {
    ...observation,
    availableTools: [
      ...observation.availableTools,
      {
        manifest: { ...observation.availableTools[0]!.manifest, name: 'work.project.lookup' },
        reason: 'Work lookup.',
      },
    ],
    invariants: [...observation.invariants, 'work.project.lookup is read only.'],
  };

  const restricted = restrictObservationToCompanionContentTools(withWorkTool);
  assert.deepEqual(
    restricted?.availableTools.map(({ manifest }) => manifest.name),
    [COMPANION_CONTENT_POST_CREATE_TOOL],
  );
  assert.ok(restricted?.invariants.every((invariant) => invariant.includes('companion.content.')));

  const seen: ProviderAgentBoundedObservation[] = [];
  const requester = createCompanionContentDecisionRequester(async (request) => {
    seen.push(request.observation);
    return null;
  });
  assert.equal(requester.preparationBudget, undefined);
  assert.equal(requester.supportsCollaboration, undefined);

  const request = {
    state: lane.state,
    channelId: lane.channelId,
    payload: { body: 'hello' },
    runtimeClient: runtimeStub(),
    now: NOW,
  };
  await requester({
    ...request,
    observation: { ...withWorkTool, availableTools: withWorkTool.availableTools.slice(1) },
  });
  assert.equal(seen.length, 0);
  await requester({ ...request, observation: withWorkTool });
  assert.deepEqual(
    seen[0]?.availableTools.map(({ manifest }) => manifest.name),
    [COMPANION_CONTENT_POST_CREATE_TOOL],
  );
});
