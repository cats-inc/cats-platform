import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  createCatsMemoryService,
  FileCanonicalMemoryStore,
  MemoryCanonicalMemoryStore,
} from '../build/server/platform/memory/index.js';
import { buildMemoryFlushSummary } from '../build/server/platform/memory/maintenance.js';
import { createCatActorId } from '../build/server/core/actors.js';
import {
  extractCanonicalMemoryFromChannel,
  extractCanonicalMemoryFromOwnerProfile,
} from '../build/server/platform/memory/extraction.js';
import { buildMemoryRetrievalContext } from '../build/server/platform/memory/retrieval.js';
import { createMemoryAwareCompanionBoxStore } from '../build/server/products/chat/state/companionMemoryAdapter.js';
import { MemoryCompanionBoxStore } from '../build/server/products/chat/state/companion-box/index.js';
import { createChatMemorySurface } from '../build/server/products/chat/state/memoryAdapter.js';
import { MemoryChatStore } from '../build/server/products/chat/state/store.js';
import { createSharedCoreFixtureBundle } from '../build/server/shared/coreFixtures.js';

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

function buildCanonicalRecord(input) {
  const nowIso = input.nowIso ?? '2026-03-23T14:00:00.000Z';
  return {
    id: input.id ?? `test-memory-${input.title ?? input.subjectId ?? 'record'}`,
    subjectKind: input.subjectKind ?? 'cat',
    subjectId: input.subjectId ?? 'cat-memory',
    category: input.category ?? 'fact',
    title: input.title ?? null,
    content: input.content,
    summary: input.summary ?? input.content,
    tags: input.tags ?? [],
    keywords: input.keywords ?? [],
    confidence: input.confidence ?? null,
    sourceRefs: input.sourceRefs ?? [],
    visibility: input.visibility ?? (input.subjectKind === 'channel' ? 'channel_private' : 'owner_private'),
    promotionRule: input.promotionRule ?? 'durable_memory',
    lineage: input.lineage ?? {
      sourceScopeKeys: input.sourceRefs ?? [],
      derivedFromIds: [],
      replacementGroup: `${input.originKind ?? 'companion_memory'}:${input.subjectId ?? 'cat-memory'}`,
    },
    origin: {
      kind: input.originKind ?? 'companion_memory',
      boxId: input.boxId ?? null,
      channelId: input.channelId ?? null,
      flushedAt: nowIso,
      flushReason: input.flushReason ?? 'manual',
    },
    createdAt: nowIso,
    updatedAt: nowIso,
    lastRetrievedAt: null,
  };
}

test('memory substrate flushes companion and owner data into canonical records and builds retrieval context', async () => {
  const now = new Date('2026-03-23T14:00:00.000Z');
  const chatStore = new MemoryChatStore();
  const companionStore = new MemoryCompanionBoxStore();
  const memoryStore = new MemoryCanonicalMemoryStore();
  const memoryService = createCatsMemoryService(createChatMemorySurface(chatStore), memoryStore);

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
    durableMemory: [
      {
        id: 'owner-durable-1',
        subjectType: 'owner',
        subjectId: core.ownerProfile.actorId,
        category: 'policy',
        content: 'Always include one recommended next step when summarizing.',
        confidence: 0.95,
        sourceRefs: [],
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      },
      {
        id: 'cat-durable-1',
        subjectType: 'cat',
        subjectId: createCatActorId('cat-memory'),
        category: 'fact',
        content: 'Companion tracks the morning bird count on the balcony.',
        confidence: 0.9,
        sourceRefs: [],
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      },
    ],
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
  assert.ok(catFlush.payload.persistedRecords.length > 0);
  assert.ok(catFlush.payload.persistedRecords.some((record) => record.promotionRule === 'companion_response_profile'));

  const catRecords = await memoryService.listCanonicalRecords({
    subjectKind: 'cat',
    subjectId: 'cat-memory',
  });
  assert.ok(catRecords.some((record) => record.origin.kind === 'response_profile'));
  assert.ok(catRecords.some((record) => record.category === 'preference'));
  assert.ok(catRecords.every((record) => record.promotionRule));
  assert.ok(
    catRecords.some((record) =>
      record.origin.kind === 'durable_memory'
      && record.content.includes('bird count'),
    ),
  );

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
        defaultRecipientId: 'cat-memory',
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
  assert.equal(retrieval.policy.visibility, 'owner_private');
  assert.ok(retrieval.selectedMemories.length > 0);
  assert.ok(retrieval.supportingEvidence.length > 0);
  assert.ok(retrieval.ownerProfileHints.some((hint) => hint.includes('concise')));
  assert.ok(
    retrieval.ownerProfileHints.some((hint) => hint.includes('recommended next step')),
  );
  assert.equal(retrieval.ownerProfile.mode, 'matched');
  assert.ok(retrieval.facts.some((fact) => fact.toLowerCase().includes('bird')));
});

test('scope-aware canonical flush removes stale durable memory when curated notes are deleted', async () => {
  const now = new Date('2026-03-23T16:00:00.000Z');
  const chatStore = new MemoryChatStore();
  const companionStore = new MemoryCompanionBoxStore();
  const memoryStore = new MemoryCanonicalMemoryStore();
  const memoryService = createCatsMemoryService(createChatMemorySurface(chatStore), memoryStore);

  const core = await chatStore.readCore();
  await chatStore.writeCore({
    ...core,
    durableMemory: [
      {
        id: 'cat-durable-delete-me',
        subjectType: 'cat',
        subjectId: createCatActorId('cat-memory'),
        category: 'fact',
        content: 'Companion used to prefer moonlit naps.',
        confidence: 0.8,
        sourceRefs: [],
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      },
    ],
  });

  await memoryService.flushCompanionBox({
    catId: 'cat-memory',
    companionStore,
    now,
  });

  let catRecords = await memoryService.listCanonicalRecords({
    subjectKind: 'cat',
    subjectId: 'cat-memory',
  });
  assert.ok(catRecords.some((record) => record.origin.kind === 'durable_memory'));

  await chatStore.writeCore({
    ...(await chatStore.readCore()),
    durableMemory: [],
  });

  const previousDurableRecordId = catRecords.find((record) => record.origin.kind === 'durable_memory')?.id;
  const secondFlush = await memoryService.flushCompanionBox({
    catId: 'cat-memory',
    companionStore,
    now: new Date('2026-03-23T16:05:00.000Z'),
  });
  assert.ok(previousDurableRecordId);
  assert.ok(secondFlush.removedRecordIds.includes(previousDurableRecordId));

  catRecords = await memoryService.listCanonicalRecords({
    subjectKind: 'cat',
    subjectId: 'cat-memory',
  });
  assert.equal(
    catRecords.filter((record) => record.origin.kind === 'durable_memory').length,
    0,
  );
});

test('memory service flushes project and relationship durable memory into canonical records', async () => {
  const now = new Date('2026-03-24T09:00:00.000Z');
  const fixtures = createSharedCoreFixtureBundle();
  const relationshipId = 'relationship-owner-inline-agent';
  const chatStore = new MemoryChatStore();
  const memoryStore = new MemoryCanonicalMemoryStore();
  const memoryService = createCatsMemoryService(createChatMemorySurface(chatStore), memoryStore);

  const core = await chatStore.readCore();
  await chatStore.writeCore({
    ...core,
    projects: [fixtures.project],
    durableMemory: [
      {
        id: 'project-durable-1',
        subjectType: 'project',
        subjectId: fixtures.project.id,
        category: 'policy',
        content: 'Launch work should keep compatibility fixes additive and low-risk.',
        confidence: 0.92,
        sourceRefs: [],
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      },
      {
        id: 'relationship-durable-1',
        subjectType: 'relationship',
        subjectId: relationshipId,
        category: 'relationship',
        content: 'Owner trusts Inline-Agent for first-pass audits but wants a final summary.',
        confidence: 0.88,
        sourceRefs: [],
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      },
    ],
  });

  const projectFlush = await memoryService.flushProject({
    projectId: fixtures.project.id,
    reason: 'manual',
    now,
  });
  const relationshipFlush = await memoryService.flushRelationship({
    relationshipId,
    reason: 'manual',
    now,
  });

  assert.equal(projectFlush.scope, 'project');
  assert.equal(relationshipFlush.scope, 'relationship');

  const projectRecords = await memoryService.listCanonicalRecords({
    subjectKind: 'project',
    subjectId: fixtures.project.id,
  });
  const relationshipRecords = await memoryService.listCanonicalRecords({
    subjectKind: 'relationship',
    subjectId: relationshipId,
  });

  assert.ok(projectRecords.some((record) => record.content.includes('additive and low-risk')));
  assert.ok(
    relationshipRecords.some((record) => record.content.includes('final summary')),
  );
});

test('memory-aware companion store auto-syncs direct source mutations without route-owned flushes', async () => {
  const now = new Date('2026-03-23T18:00:00.000Z');
  const chatStore = new MemoryChatStore();
  const baseCompanionStore = new MemoryCompanionBoxStore();
  const memoryStore = new MemoryCanonicalMemoryStore();
  const memoryService = createCatsMemoryService(createChatMemorySurface(chatStore), memoryStore);
  const companionStore = createMemoryAwareCompanionBoxStore(baseCompanionStore, memoryService);

  const ingested = await companionStore.ingestSource(
    'cat-memory',
    {
      kind: 'note',
      storageMode: 'uploaded_copy',
      title: 'Play routine',
      textContent: 'Companion adores feather wand warmups.',
      metadata: { tags: ['play'] },
    },
    now,
  );
  const ingestSync = companionStore.consumePendingCanonicalSync('cat-memory');
  assert.equal(ingestSync?.status, 'synced');
  assert.equal(companionStore.consumePendingCanonicalSync('cat-memory'), null);

  let catRecords = await memoryService.listCanonicalRecords({
    subjectKind: 'cat',
    subjectId: 'cat-memory',
  });
  assert.ok(catRecords.some((record) => record.content.includes('feather wand warmups')));

  await companionStore.updateSource(
    'cat-memory',
    ingested.source.id,
    {
      textContent: 'Companion now prefers laser pointer sprints.',
    },
    new Date('2026-03-23T18:05:00.000Z'),
  );
  const updateSync = companionStore.consumePendingCanonicalSync('cat-memory');
  assert.equal(updateSync?.status, 'synced');

  catRecords = await memoryService.listCanonicalRecords({
    subjectKind: 'cat',
    subjectId: 'cat-memory',
  });
  assert.equal(catRecords.some((record) => record.content.includes('feather wand warmups')), false);
  assert.ok(catRecords.some((record) => record.content.includes('laser pointer sprints')));

  await companionStore.deleteSource(
    'cat-memory',
    ingested.source.id,
    new Date('2026-03-23T18:10:00.000Z'),
  );
  const deleteSync = companionStore.consumePendingCanonicalSync('cat-memory');
  assert.equal(deleteSync?.status, 'synced');

  catRecords = await memoryService.listCanonicalRecords({
    subjectKind: 'cat',
    subjectId: 'cat-memory',
  });
  assert.equal(catRecords.some((record) => record.content.includes('laser pointer sprints')), false);
});

test('retrieval policy keeps owner-private cat memory out of shared-room contexts while preserving channel context and owner hints', () => {
  const context = buildMemoryRetrievalContext({
    now: new Date('2026-03-23T14:30:00.000Z'),
    catId: 'cat-memory',
    channelId: 'channel-memory',
    includeOwnerProfile: true,
    channelTitle: 'Ops Room',
    channelTopic: 'Coordinate the next response.',
    roomMode: 'boss_chat',
    transport: 'web',
    canonicalRecords: [
      buildCanonicalRecord({
        subjectKind: 'cat',
        subjectId: 'cat-memory',
        title: 'Private cat note',
        content: 'Companion prefers sunrise balcony patrols.',
        visibility: 'owner_private',
        promotionRule: 'companion_curated_memory',
      }),
      buildCanonicalRecord({
        subjectKind: 'channel',
        subjectId: 'channel-memory',
        title: 'Current room summary',
        content: 'The room is coordinating the next response.',
        visibility: 'channel_private',
        originKind: 'channel_working_memory',
        promotionRule: 'channel_summary',
      }),
      buildCanonicalRecord({
        subjectKind: 'owner',
        subjectId: 'owner-actor',
        title: 'Owner preference',
        content: 'Keep updates concise and high-signal.',
        visibility: 'owner_private',
        originKind: 'owner_profile',
        promotionRule: 'owner_communication_preference',
      }),
    ],
    companionSources: [
      {
        id: 'source-live',
        boxId: 'companion-box-cat-memory',
        catId: 'cat-memory',
        kind: 'note',
        storageMode: 'uploaded_copy',
        title: 'Live private note',
        ownerNote: null,
        sourceText: 'Companion privately tracks balcony pigeons.',
        textExcerpt: 'Companion privately tracks balcony pigeons.',
        linkedPath: null,
        storedPath: null,
        sourceUrl: null,
        mimeType: null,
        originalFileName: null,
        metadata: {},
        createdAt: '2026-03-23T14:00:00.000Z',
        updatedAt: '2026-03-23T14:00:00.000Z',
      },
    ],
  });

  assert.equal(context.policy.visibility, 'shared_room');
  assert.ok(context.hits.every((hit) => hit.subjectKind !== 'cat'));
  assert.ok(context.hits.some((hit) => hit.subjectKind === 'channel'));
  assert.ok(context.excludedMemories.some((record) => record.reason === 'policy_scope'));
  assert.ok(context.ownerProfileHints.some((hint) => hint.includes('concise')));
});

test('generic retrieval context includes scoped project and relationship memory', async () => {
  const now = new Date('2026-03-24T10:00:00.000Z');
  const fixtures = createSharedCoreFixtureBundle();
  const relationshipId = 'relationship-owner-inline-agent';
  const chatStore = new MemoryChatStore();
  const memoryStore = new MemoryCanonicalMemoryStore();
  const memoryService = createCatsMemoryService(createChatMemorySurface(chatStore), memoryStore);

  const core = await chatStore.readCore();
  await chatStore.writeCore({
    ...core,
    projects: [fixtures.project],
    ownerProfile: {
      ...core.ownerProfile,
      summary: 'Owner wants one concise recommendation first.',
      updatedAt: now.toISOString(),
    },
    durableMemory: [
      {
        id: 'project-durable-1',
        subjectType: 'project',
        subjectId: fixtures.project.id,
        category: 'policy',
        content: 'Cats Platform Launch keeps rollout notes additive and migration-safe.',
        confidence: 0.93,
        sourceRefs: [],
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      },
      {
        id: 'relationship-durable-1',
        subjectType: 'relationship',
        subjectId: relationshipId,
        category: 'relationship',
        content: 'Inline-Agent should bring the first draft, but the owner expects a final summary.',
        confidence: 0.89,
        sourceRefs: [],
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      },
    ],
  });

  await memoryService.flushOwnerProfile({ now });
  await memoryService.flushProject({ projectId: fixtures.project.id, now });
  await memoryService.flushRelationship({ relationshipId, now });

  const context = await memoryService.buildRetrievalContext({
    projectIds: [fixtures.project.id],
    relationshipIds: [relationshipId],
    roomMode: 'boss_chat',
    transport: 'web',
    includeOwnerProfile: true,
    now,
  });

  assert.deepEqual(context.scope.projectIds, [fixtures.project.id]);
  assert.deepEqual(context.scope.relationshipIds, [relationshipId]);
  assert.ok(
    context.selectedMemories.some((hit) =>
      hit.subjectKind === 'project'
      && hit.selectionReasons.includes('project_scope_match'),
    ),
  );
  assert.ok(
    context.selectedMemories.some((hit) =>
      hit.subjectKind === 'relationship'
      && hit.selectionReasons.includes('relationship_scope_match'),
    ),
  );
  assert.ok(context.ownerProfileHints.some((hint) => hint.includes('concise recommendation')));
});

test('replaceRecords rejects an empty selector filter instead of clearing the full store', async () => {
  const store = new MemoryCanonicalMemoryStore();
  await store.upsertRecords([
    buildCanonicalRecord({
      subjectKind: 'cat',
      subjectId: 'cat-memory',
      content: 'Companion likes blanket forts.',
    }),
  ]);

  await assert.rejects(
    () => store.replaceRecords({}, []),
    /replaceRecords requires at least one filter selector/u,
  );

  const records = await store.listRecords();
  assert.equal(records.length, 1);
  assert.equal(records[0].content, 'Companion likes blanket forts.');
});

test('file-backed canonical memory store does not overwrite malformed snapshots on read failure', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'cats-memory-malformed-'));
  try {
    const snapshotPath = path.join(tempDir, 'chat-state.memory.json');
    const malformedSnapshot = '{ definitely-not-valid-json';
    await writeFile(snapshotPath, malformedSnapshot, 'utf-8');

    const store = new FileCanonicalMemoryStore(snapshotPath);
    await assert.rejects(() => store.readSnapshot());
    assert.equal(await readFile(snapshotPath, 'utf-8'), malformedSnapshot);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('file-backed canonical memory store serializes concurrent upserts', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'cats-memory-concurrency-'));
  try {
    const snapshotPath = path.join(tempDir, 'chat-state.memory.json');
    const store = new FileCanonicalMemoryStore(snapshotPath);
    await store.readSnapshot();

    const originalWriteSnapshot = Object.getPrototypeOf(store).writeSnapshot.bind(store);
    let releaseFirstWrite = null;
    let signalFirstWriteStarted = null;
    const firstWriteStarted = new Promise((resolve) => {
      signalFirstWriteStarted = resolve;
    });
    let firstWritePending = true;

    store.writeSnapshot = async function patchedWriteSnapshot(snapshot) {
      if (firstWritePending) {
        firstWritePending = false;
        signalFirstWriteStarted();
        await new Promise((resolve) => {
          releaseFirstWrite = resolve;
        });
      }
      return originalWriteSnapshot(snapshot);
    };

    const firstUpsert = store.upsertRecords([
      buildCanonicalRecord({
        title: 'Window routine',
        content: 'Companion watches birds from the window every morning.',
      }),
    ]);
    await firstWriteStarted;

    const secondUpsert = store.upsertRecords([
      buildCanonicalRecord({
        title: 'Blanket routine',
        content: 'Companion curls up on the blue blanket every afternoon.',
      }),
    ]);

    releaseFirstWrite();
    await Promise.all([firstUpsert, secondUpsert]);

    const records = await store.listRecords();
    assert.deepEqual(
      records.map((record) => record.title).sort(),
      ['Blanket routine', 'Window routine'],
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('retrieval keeps unrelated owner records out of top hits while preserving owner hints', () => {
  const context = buildMemoryRetrievalContext({
    now: new Date('2026-03-23T14:00:00.000Z'),
    catId: 'cat-memory',
    channelId: 'channel-memory',
    includeOwnerProfile: true,
    channelTitle: 'Bird routine',
    channelTopic: 'How should Companion talk about birds today?',
    roomMode: 'direct_cat_chat',
    transport: 'web',
    canonicalRecords: [
      buildCanonicalRecord({
        subjectKind: 'cat',
        subjectId: 'cat-memory',
        title: 'Bird watching ritual',
        content: 'Companion watches birds by the balcony every morning.',
        promotionRule: 'companion_curated_memory',
      }),
      ...Array.from({ length: 10 }, (_, index) => buildCanonicalRecord({
        subjectKind: 'owner',
        subjectId: 'owner-actor',
        title: `Owner preference ${index + 1}`,
        content: 'Keep updates concise and high-signal.',
        originKind: 'owner_profile',
        promotionRule: 'owner_communication_preference',
      })),
    ],
  });

  assert.ok(context.hits.some((hit) => hit.subjectKind === 'cat'));
  assert.ok(context.hits.every((hit) => hit.subjectKind !== 'owner'));
  assert.ok(context.ownerProfileHints.some((hint) => hint.includes('concise')));
  assert.equal(context.ownerProfile.mode, 'fallback');
});

test('array-backed channel and owner records emit distinct replacement groups per entry', () => {
  const now = new Date('2026-03-23T19:00:00.000Z');
  const channelRecords = extractCanonicalMemoryFromChannel({
    channel: {
      id: 'channel-memory',
      title: 'Ops Room',
      topic: 'Coordinate the next response.',
      workingMemory: {
        summary: 'Current thread summary.',
        facts: ['First fact', 'Second fact'],
        openLoops: ['First loop', 'Second loop'],
        updatedAt: now.toISOString(),
      },
    },
    reason: 'manual',
    now,
  });
  const ownerRecords = extractCanonicalMemoryFromOwnerProfile({
    ownerProfile: {
      actorId: 'owner-actor',
      displayName: 'Owner',
      summary: 'Owner profile summary.',
      communicationPreferences: ['Keep updates concise.', 'Lead with the recommendation.'],
      decisionPreferences: ['Offer one recommended option first.', 'Call out tradeoffs briefly.'],
      escalationPreferences: ['Escalate before destructive actions.', 'Raise blockers early.'],
      updatedAt: now.toISOString(),
    },
    reason: 'owner_profile_sync',
    now,
  });

  const channelFactGroups = channelRecords
    .filter((record) => record.promotionRule === 'channel_fact')
    .map((record) => record.lineage.replacementGroup);
  const channelLoopGroups = channelRecords
    .filter((record) => record.promotionRule === 'channel_open_loop')
    .map((record) => record.lineage.replacementGroup);
  const ownerCommunicationGroups = ownerRecords
    .filter((record) => record.promotionRule === 'owner_communication_preference')
    .map((record) => record.lineage.replacementGroup);

  assert.equal(new Set(channelFactGroups).size, channelFactGroups.length);
  assert.equal(new Set(channelLoopGroups).size, channelLoopGroups.length);
  assert.equal(new Set(ownerCommunicationGroups).size, ownerCommunicationGroups.length);
});

test('buildMemoryFlushSummary deduplicates source scopes and replacement groups across flushes', () => {
  const summary = buildMemoryFlushSummary([
    {
      scope: 'cat',
      subjectId: 'cat-memory',
      reason: 'manual',
      generatedAt: '2026-03-26T07:10:00.000Z',
      persistedCount: 2,
      persistedRecordIds: ['cats-memory-1', 'cats-memory-2'],
      removedRecordIds: ['cats-memory-old-1'],
      payload: {
        version: 1,
        reason: 'manual',
        generatedAt: '2026-03-26T07:10:00.000Z',
        subject: {
          kind: 'cat',
          id: 'cat-memory',
        },
        replacementMode: 'subject_projection_replace',
        sourceScopeKeys: ['cat:memory', 'cat:memory'],
        persistedRecords: [
          {
            recordId: 'cats-memory-1',
            category: 'fact',
            originKind: 'companion_memory',
            promotionRule: 'companion_curated_memory',
            visibility: 'owner_private',
            sourceRefs: [],
            sourceScopeKeys: ['cat:memory'],
            replacementGroup: 'cat:group-1',
          },
          {
            recordId: 'cats-memory-2',
            category: 'preference',
            originKind: 'response_profile',
            promotionRule: 'companion_response_profile',
            visibility: 'owner_private',
            sourceRefs: [],
            sourceScopeKeys: ['cat:memory'],
            replacementGroup: 'cat:group-1',
          },
        ],
        removedRecordIds: ['cats-memory-old-1'],
      },
    },
    {
      scope: 'channel',
      subjectId: 'channel-memory',
      reason: 'pre_reset',
      generatedAt: '2026-03-26T07:10:05.000Z',
      persistedCount: 1,
      persistedRecordIds: ['cats-memory-3'],
      removedRecordIds: ['cats-memory-old-1', 'cats-memory-old-2'],
      payload: {
        version: 1,
        reason: 'pre_reset',
        generatedAt: '2026-03-26T07:10:05.000Z',
        subject: {
          kind: 'channel',
          id: 'channel-memory',
        },
        replacementMode: 'subject_projection_replace',
        sourceScopeKeys: ['channel:working-memory'],
        persistedRecords: [
          {
            recordId: 'cats-memory-3',
            category: 'fact',
            originKind: 'channel_working_memory',
            promotionRule: 'channel_fact',
            visibility: 'channel_private',
            sourceRefs: [],
            sourceScopeKeys: ['channel:working-memory'],
            replacementGroup: 'channel:group-1',
          },
        ],
        removedRecordIds: ['cats-memory-old-1', 'cats-memory-old-2'],
      },
    },
  ]);

  assert.deepEqual(summary.subjects, [
    { kind: 'cat', id: 'cat-memory' },
    { kind: 'channel', id: 'channel-memory' },
  ]);
  assert.equal(summary.flushCount, 2);
  assert.equal(summary.persistedCount, 3);
  assert.equal(summary.removedCount, 3);
  assert.deepEqual(summary.removedRecordIds, ['cats-memory-old-1', 'cats-memory-old-2']);
  assert.deepEqual(summary.sourceScopeKeys, ['cat:memory', 'channel:working-memory']);
  assert.deepEqual(summary.replacementGroups, ['cat:group-1', 'channel:group-1']);
});

