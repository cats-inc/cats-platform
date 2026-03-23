import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  FileCompanionBoxStore,
  deriveCompanionBoxStatePath,
} from '../dist-server/products/chat/state/companionBoxStore.js';

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
