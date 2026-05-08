import assert from 'node:assert/strict';
import test from 'node:test';

import { createDefaultChatState } from '../src/products/chat/state/defaults.ts';
import {
  createChannel,
} from '../src/products/chat/state/model/index.ts';
import {
  beginChannelMessageDispatch,
} from '../src/products/chat/state/runtime-dispatch/routing.ts';
import { MemoryChatStore } from '../src/products/chat/state/store.ts';
import type { RuntimeClient } from '../src/platform/runtime/client.ts';
import {
  parseProviderCapabilityBootstrapConfigDocument,
} from '../src/platform/supervision/index.ts';
import { buildCodeDashboardProjection } from '../src/products/code/api/projection.ts';
import { buildWorkWorkItemListProjection } from '../src/products/work/api/projection.ts';

function runtimeStub(): RuntimeClient {
  return {
    async closeSession() {},
  } as RuntimeClient;
}

function strongBootstrapConfig() {
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
          reason: 'Fixture direct audience Cat is strong.',
        },
      ],
    },
    { observedAt: '2026-05-06T08:00:00.000Z' },
  );

  if (!parsed.config) {
    throw new Error('Expected fixture bootstrap config to parse.');
  }

  return parsed.config;
}

function stripLegacyDirectProductMetadata(metadata: Record<string, unknown>): Record<string, unknown> {
  const nextMetadata = { ...metadata };
  delete nextMetadata.directSlashMode;
  delete nextMetadata.directSlashModeIntake;
  delete nextMetadata.planning;
  return nextMetadata;
}

test('Work projection lists Work Items created from direct slash-mode chat', async () => {
  const now = new Date('2026-05-06T08:00:00.000Z');
  const state = createChannel(
    createDefaultChatState(),
    {
      title: '',
      topic: 'Direct work projection',
      originSurface: 'chat',
      entryKind: 'direct',
      roomMode: 'direct_message',
      cats: [
        {
          name: 'ConciergeCat',
          provider: 'claude',
          instance: 'native',
          model: 'sonnet',
        },
      ],
    },
    now,
  );
  const channelId = state.selectedChannelId;
  const store = new MemoryChatStore(state);

  await beginChannelMessageDispatch(
    state,
    channelId,
    {
      body: '/work clarify projection coverage',
      senderName: 'Kenneth',
    },
    runtimeStub(),
    new Date('2026-05-06T08:01:00.000Z'),
    {
      chatStore: store,
      providerCapabilityBootstrapConfig: strongBootstrapConfig(),
    },
  );

  const core = await store.readCore();
  const projection = buildWorkWorkItemListProjection(core);
  const directWorkItem = projection.workItems.find((candidate) =>
    candidate.title === 'clarify projection coverage');

  assert.ok(directWorkItem);
  assert.equal(directWorkItem.status, 'draft');
  assert.equal(directWorkItem.conversationTitle, 'ConciergeCat Direct Chat');
  assert.equal(directWorkItem.conversationSourceChannelId, channelId);
  assert.equal(directWorkItem.assignedActors[0]?.displayName, 'ConciergeCat');
});

test('Code projection lists code-target Work Item anchors created from direct slash-mode chat', async () => {
  const now = new Date('2026-05-06T08:00:00.000Z');
  const state = createChannel(
    createDefaultChatState(),
    {
      title: '',
      topic: 'Direct code projection',
      originSurface: 'chat',
      entryKind: 'direct',
      roomMode: 'direct_message',
      cats: [
        {
          name: 'BuilderCat',
          provider: 'claude',
          instance: 'native',
          model: 'sonnet',
        },
      ],
    },
    now,
  );
  const channelId = state.selectedChannelId;
  const store = new MemoryChatStore(state);

  await beginChannelMessageDispatch(
    state,
    channelId,
    {
      body: '/code wire the projection surface',
      senderName: 'Kenneth',
    },
    runtimeStub(),
    new Date('2026-05-06T08:01:00.000Z'),
    {
      chatStore: store,
      providerCapabilityBootstrapConfig: strongBootstrapConfig(),
    },
  );

  const core = await store.readCore();
  const canonicalOnlyCore = {
    ...core,
    workItems: core.workItems.map((workItem) =>
      workItem.title === 'wire the projection surface'
        ? {
            ...workItem,
            metadata: stripLegacyDirectProductMetadata(workItem.metadata),
          }
        : workItem),
  };
  const projection = buildCodeDashboardProjection(canonicalOnlyCore);
  const directCodeWorkItem = projection.sections.workItems.items.find((candidate) =>
    candidate.title === 'wire the projection surface');

  assert.ok(directCodeWorkItem);
  assert.equal(projection.summary.workItemCount, 1);
  assert.equal(projection.selection.defaultWorkItemId, directCodeWorkItem.id);
  assert.equal(directCodeWorkItem.status, 'draft');
  assert.equal(directCodeWorkItem.targetProduct, 'code');
  assert.equal(directCodeWorkItem.conversationTitle, 'BuilderCat Direct Chat');
  assert.equal(directCodeWorkItem.conversationSourceChannelId, channelId);
  assert.equal(directCodeWorkItem.assignedActors[0]?.displayName, 'BuilderCat');
});
