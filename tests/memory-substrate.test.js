import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createCatsMemoryService,
  MemoryCanonicalMemoryStore,
} from '../dist-server/platform/memory/index.js';
import { MemoryCompanionBoxStore } from '../dist-server/products/chat/state/companionBoxStore.js';
import { MemoryChatStore } from '../dist-server/chat/store.js';

function buildCompanionCat(catId, nowIso) {
  return {
    id: catId,
    name: 'Companion',
    roles: ['companion'],
    skillProfile: 'companion',
    mcpProfile: null,
    status: 'active',
    createdAt: nowIso,
    updatedAt: nowIso,
    archivedAt: null,
    avatarColor: null,
    defaultExecutionTarget: {
      provider: 'claude',
      instance: null,
      model: null,
    },
    memory: {
      summary: null,
      facts: [],
      openLoops: [],
      updatedAt: null,
    },
  };
}

test('memory substrate flushes companion and owner data into canonical records and builds retrieval context', async () => {
  const now = new Date('2026-03-23T14:00:00.000Z');
  const chatStore = new MemoryChatStore();
  const companionStore = new MemoryCompanionBoxStore();
  const memoryStore = new MemoryCanonicalMemoryStore();
  const memoryService = createCatsMemoryService(chatStore, memoryStore);

  const core = await chatStore.readCore();
  await chatStore.writeCore({
    ...core,
    ownerProfile: {
      ...core.ownerProfile,
      summary: 'Owner prefers concise updates with explicit next steps.',
      communicationPreferences: ['Keep updates concise and high-signal.'],
      decisionPreferences: ['Offer one recommended option first.'],
      escalationPreferences: ['Escalate before deleting or resetting long-running work.'],
      updatedAt: now.toISOString(),
    },
  });

  await companionStore.ingestSource(
    'cat-memory',
    {
      kind: 'note',
      storageMode: 'uploaded_copy',
      title: 'Favorite routine',
      textContent: 'Companion waits by the balcony door every morning to watch birds.',
      ownerNote: 'Mention the bird-watching ritual in private chats.',
      metadata: {
        traits: ['observant', 'routine-loving'],
      },
    },
    now,
  );
  await companionStore.createMemory(
    'cat-memory',
    {
      category: 'preference',
      content: 'Companion prefers calm, warm language and short replies.',
      summary: 'Warm concise tone',
      sourceIds: [],
    },
    now,
  );
  await companionStore.updateResponseProfile(
    'cat-memory',
    {
      expressionMode: 'animalistic',
      outputMode: 'text',
      notes: 'Use soft purr-like phrasing and keep answers short.',
    },
    now,
  );

  const catFlush = await memoryService.flushCompanionBox({
    catId: 'cat-memory',
    companionStore,
    reason: 'pre_reset',
    now,
  });
  const ownerFlush = await memoryService.flushOwnerProfile({
    reason: 'owner_profile_sync',
    now,
  });

  assert.ok(catFlush.persistedCount > 0);
  assert.ok(ownerFlush.persistedCount > 0);

  const catRecords = await memoryService.listCanonicalRecords({
    subjectKind: 'cat',
    subjectId: 'cat-memory',
  });
  assert.ok(catRecords.some((record) => record.origin.kind === 'response_profile'));
  assert.ok(catRecords.some((record) => record.category === 'preference'));

  const retrieval = await memoryService.buildCompanionRetrievalContext({
    cat: buildCompanionCat('cat-memory', now.toISOString()),
    channel: {
      id: 'channel-memory',
      title: 'Direct Companion',
      topic: 'How should Companion greet me today?',
      workingMemory: {
        summary: 'Owner asked about morning greeting style.',
        facts: ['Private direct companion lane'],
        openLoops: ['Decide how to mention the bird-watching ritual.'],
        updatedAt: now.toISOString(),
      },
      roomRouting: {
        mode: 'direct_cat_chat',
        leadParticipantId: 'cat-memory',
        explicitParticipantIds: [],
        mentionParticipantIds: [],
        defaultTargetParticipantId: 'cat-memory',
        lastTrigger: null,
        lastOutcome: null,
        lastWakeRequest: null,
        wakeHistory: [],
      },
    },
    companionStore,
    now,
  });

  assert.ok(retrieval.hits.length > 0);
  assert.ok(retrieval.ownerProfileHints.some((hint) => hint.includes('concise')));
  assert.ok(retrieval.facts.some((fact) => fact.toLowerCase().includes('bird')));
});
