import assert from 'node:assert/strict';
import { access, mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  FileCompanionBoxStore,
  deriveCompanionBoxStatePath,
} from '../build/server/products/chat/state/companion-box/index.js';
import {
  buildCompanionBoxDirectoryKey,
  buildCompanionSourceStorageKey,
} from '../build/server/products/chat/companion/layout.js';

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

test('companion storage keys sanitize dot traversal segments', () => {
  assert.equal(buildCompanionBoxDirectoryKey('..'), 'companion-boxes/unknown');
  assert.equal(
    buildCompanionSourceStorageKey('..', '..', 'json'),
    'companion-boxes/unknown/sources/unknown.json',
  );
});

test('FileCompanionBoxStore persists sources, derived records, memory, and response profile', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'cats-companion-store-'));
  const chatStatePath = path.join(tempDir, 'chat-state.json');
  const store = new FileCompanionBoxStore(deriveCompanionBoxStatePath(chatStatePath));
  const now = new Date('2026-03-23T10:00:00.000Z');

  const ingested = await store.ingestSource(
    'cat-companion',
    {
      kind: 'note',
      storageMode: 'uploaded_copy',
      title: 'Favorite toy',
      textContent: 'Companion loves feather toys and window naps.',
      ownerNote: 'Use this in direct companion chats.',
      metadata: {
        tags: ['toy', 'window'],
      },
    },
    now,
  );
  const responseProfile = await store.updateResponseProfile(
    'cat-companion',
    {
      expressionMode: 'animalistic',
      outputMode: 'tts',
      notes: 'Prefer short purr-like replies.',
    },
    now,
  );
  const memory = await store.createMemory(
    'cat-companion',
    {
      category: 'fact',
      content: 'Enjoys watching pigeons from the living-room window.',
      summary: 'Window pigeon watcher',
      sourceIds: [ingested.source.id],
    },
    now,
  );

  const summary = await store.getBoxSummary('cat-companion', now);
  const reloaded = new FileCompanionBoxStore(deriveCompanionBoxStatePath(chatStatePath));
  const sources = await reloaded.listSources('cat-companion', now);
  const derived = await reloaded.listDerived('cat-companion', now);
  const memoryRecords = await reloaded.listMemory('cat-companion', now);

  assert.equal(summary.box.catId, 'cat-companion');
  assert.equal(summary.sourceCount, 1);
  assert.equal(summary.derivedCount, ingested.derivedRecords.length);
  assert.equal(summary.memoryCount, 1);
  assert.equal(responseProfile.outputMode, 'tts');
  assert.equal(memory.summary, 'Window pigeon watcher');
  assert.equal(sources[0].title, 'Favorite toy');
  assert.ok(sources[0].storedPath?.startsWith('companion-boxes/cat-companion/sources/'));
  assert.ok(derived.some((record) => record.kind === 'summary'));
  assert.ok(derived.some((record) => record.kind === 'tags'));
  assert.equal(memoryRecords[0].content, 'Enjoys watching pigeons from the living-room window.');

  const materializedPath = path.join(tempDir, ...sources[0].storedPath.split('/'));
  const materializedBody = JSON.parse(await readFile(materializedPath, 'utf-8'));
  assert.equal(materializedBody.title, 'Favorite toy');
  assert.equal(materializedBody.sourceText, 'Companion loves feather toys and window naps.');
});

test('FileCompanionBoxStore updates and deletes sources while converging derived and memory source refs', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'cats-companion-store-'));
  const chatStatePath = path.join(tempDir, 'chat-state.json');
  const store = new FileCompanionBoxStore(deriveCompanionBoxStatePath(chatStatePath));
  const now = new Date('2026-03-23T10:30:00.000Z');

  const ingested = await store.ingestSource(
    'cat-converge',
    {
      kind: 'note',
      storageMode: 'uploaded_copy',
      title: 'Morning ritual',
      textContent: 'Companion watches birds by the window every morning.',
      metadata: {
        traits: ['observant'],
      },
    },
    now,
  );
  await store.createMemory(
    'cat-converge',
    {
      category: 'fact',
      content: 'Track the bird-watching habit.',
      sourceIds: [ingested.source.id],
    },
    now,
  );

  const updated = await store.updateSource(
    'cat-converge',
    ingested.source.id,
    {
      textContent: 'Companion now waits by the balcony for pigeon patrol every sunrise.',
      metadata: {
        traits: ['observant', 'balcony-loving'],
      },
    },
    new Date('2026-03-23T10:35:00.000Z'),
  );
  assert.ok(updated.derivedRecords.some((record) => record.content.includes('balcony')));
  assert.ok(updated.derivedRecords.some((record) => record.tags.includes('balcony-loving')));

  const updatedSources = await store.listSources('cat-converge');
  assert.equal(updatedSources[0].textExcerpt, 'Companion now waits by the balcony for pigeon patrol every sunrise.');

  const updatedDerived = await store.listDerived('cat-converge');
  assert.ok(updatedDerived.some((record) => record.content.includes('balcony')));
  assert.ok(updatedDerived.every((record) => !record.content.includes('window every morning')));

  const materializedPath = path.join(tempDir, ...updatedSources[0].storedPath.split('/'));
  const materializedBody = JSON.parse(await readFile(materializedPath, 'utf-8'));
  assert.equal(
    materializedBody.sourceText,
    'Companion now waits by the balcony for pigeon patrol every sunrise.',
  );

  const deleted = await store.deleteSource(
    'cat-converge',
    ingested.source.id,
    new Date('2026-03-23T10:40:00.000Z'),
  );
  assert.equal(deleted.sourceId, ingested.source.id);
  assert.ok(deleted.removedDerivedIds.length > 0);
  assert.ok(deleted.prunedMemoryIds.length > 0);

  const sourcesAfterDelete = await store.listSources('cat-converge');
  const derivedAfterDelete = await store.listDerived('cat-converge');
  const memoryAfterDelete = await store.listMemory('cat-converge');
  assert.equal(sourcesAfterDelete.length, 0);
  assert.equal(derivedAfterDelete.length, 0);
  assert.deepEqual(memoryAfterDelete[0].sourceIds, []);
  await assert.rejects(() => access(materializedPath));
});

test('FileCompanionBoxStore keeps linked path sources without duplicating content and builds hydration context', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'cats-companion-store-'));
  const chatStatePath = path.join(tempDir, 'chat-state.json');
  const store = new FileCompanionBoxStore(deriveCompanionBoxStatePath(chatStatePath));
  const now = new Date('2026-03-23T11:00:00.000Z');

  await store.ingestSource(
    'cat-archive',
    {
      kind: 'path_ref',
      storageMode: 'linked_path',
      title: 'Photo folder',
      linkedPath: 'D:/cats/photos',
      metadata: {
        description: 'Shared folder with cat travel photos.',
      },
    },
    now,
  );

  const sessionContext = await store.buildSessionContext({
    cat: {
      id: 'cat-archive',
      name: 'Archive',
      roles: ['companion'],
      skillProfile: 'companion',
      mcpProfile: null,
      status: 'active',
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
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
    },
    channel: {
      id: null,
      title: 'Archive Companion',
      topic: 'Hydration preview.',
      roomRouting: undefined,
      workingMemory: undefined,
    },
    requestedSkills: ['companion'],
    transport: 'web',
    now,
  });

  assert.equal(sessionContext.channelContext.channelId, null);
  assert.equal(sessionContext.requestedSkills[0], 'companion');
  assert.equal(sessionContext.sources[0].linkedPath, 'D:/cats/photos');
  assert.equal(sessionContext.sources[0].storedPath, null);
});

test('FileCompanionBoxStore derives transcript and caption records for log and media metadata ingestion', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'cats-companion-store-'));
  const chatStatePath = path.join(tempDir, 'chat-state.json');
  const store = new FileCompanionBoxStore(deriveCompanionBoxStatePath(chatStatePath));
  const now = new Date('2026-03-23T12:00:00.000Z');

  await store.ingestSource(
    'cat-media',
    {
      kind: 'conversation_log',
      storageMode: 'uploaded_copy',
      title: 'Bedtime log',
      textContent: 'Owner: bedtime snack?\nCompanion: purr and circle.',
      metadata: {
        transcript: 'Owner asked about a snack. Companion purred and circled twice.',
      },
    },
    now,
  );
  await store.ingestSource(
    'cat-media',
    {
      kind: 'image',
      storageMode: 'imported_copy',
      title: 'Blanket photo',
      metadata: {
        caption: 'Companion kneads the blue blanket near the window.',
        tags: ['blanket', 'window'],
      },
    },
    now,
  );

  const derived = await store.listDerived('cat-media', now);
  assert.ok(derived.some((record) => record.kind === 'transcript'));
  assert.ok(derived.some((record) => record.kind === 'caption'));
  assert.ok(derived.some((record) => record.kind === 'tags'));
});

test('FileCompanionBoxStore read methods do not rewrite existing snapshots', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'cats-companion-store-'));
  const chatStatePath = path.join(tempDir, 'chat-state.json');
  const snapshotPath = deriveCompanionBoxStatePath(chatStatePath);
  const store = new FileCompanionBoxStore(snapshotPath);
  const now = new Date('2026-03-23T13:00:00.000Z');

  await store.ingestSource(
    'cat-read-only',
    {
      kind: 'note',
      storageMode: 'uploaded_copy',
      title: 'Quiet nap note',
      textContent: 'Companion naps by the window every afternoon.',
    },
    now,
  );

  const beforeRead = await stat(snapshotPath);
  await new Promise((resolve) => setTimeout(resolve, 25));

  await store.getBoxSummary('cat-read-only', now);
  await store.listSources('cat-read-only', now);
  await store.listDerived('cat-read-only', now);
  await store.listMemory('cat-read-only', now);
  await store.getResponseProfile('cat-read-only', now);
  await store.buildSessionContext({
    cat: buildCompanionCat('cat-read-only', now.toISOString()),
    channel: {
      id: 'channel-direct',
      title: 'Direct Companion',
      topic: 'Hydration check',
      roomRouting: {
        mode: 'direct_cat_chat',
        defaultRecipientId: 'cat-read-only',
        explicitParticipantIds: [],
        mentionParticipantIds: [],
        defaultTargetParticipantId: 'cat-read-only',
        lastTrigger: null,
        lastOutcome: null,
        lastWakeRequest: null,
        wakeHistory: [],
      },
      workingMemory: undefined,
    },
    requestedSkills: ['companion'],
    transport: 'web',
    now,
  });

  const afterRead = await stat(snapshotPath);
  assert.equal(afterRead.mtimeMs, beforeRead.mtimeMs);
});

test('FileCompanionBoxStore rolls back snapshot when stored source materialization fails', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'cats-companion-store-'));
  const chatStatePath = path.join(tempDir, 'chat-state.json');
  const snapshotPath = deriveCompanionBoxStatePath(chatStatePath);
  const store = new FileCompanionBoxStore(snapshotPath);
  const now = new Date('2026-03-23T14:00:00.000Z');

  await writeFile(path.join(tempDir, 'companion-boxes'), 'block materialization', 'utf-8');

  await assert.rejects(
    store.ingestSource(
      'cat-materialize-fail',
      {
        kind: 'note',
        storageMode: 'uploaded_copy',
        title: 'Broken materialize',
        textContent: 'This write should roll back cleanly.',
      },
      now,
    ),
  );

  const snapshot = await store.readSnapshot();
  assert.equal(snapshot.boxes.length, 0);
  assert.equal(snapshot.sources.length, 0);
  assert.equal(snapshot.derived.length, 0);
  assert.equal(snapshot.memory.length, 0);
});

