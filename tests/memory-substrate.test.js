import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  createCatsMemoryService,
  FileCanonicalMemoryStore,
  MemoryCanonicalMemoryStore,
} from '../dist-server/platform/memory/index.js';
import { buildMemoryRetrievalContext } from '../dist-server/platform/memory/retrieval.js';
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
    canonicalRecords: [
      buildCanonicalRecord({
        subjectKind: 'cat',
        subjectId: 'cat-memory',
        title: 'Bird watching ritual',
        content: 'Companion watches birds by the balcony every morning.',
      }),
      ...Array.from({ length: 10 }, (_, index) => buildCanonicalRecord({
        subjectKind: 'owner',
        subjectId: 'owner-actor',
        title: `Owner preference ${index + 1}`,
        content: 'Keep updates concise and high-signal.',
        originKind: 'owner_profile',
      })),
    ],
  });

  assert.ok(context.hits.some((hit) => hit.subjectKind === 'cat'));
  assert.ok(context.hits.every((hit) => hit.subjectKind !== 'owner'));
  assert.ok(context.ownerProfileHints.some((hint) => hint.includes('concise')));
});
