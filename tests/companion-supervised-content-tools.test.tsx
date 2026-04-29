import assert from 'node:assert/strict';
import test from 'node:test';

import {
  COMPANION_CONTENT_LIST_TOOL,
  COMPANION_CONTENT_READ_TOOL,
  createCompanionContentTools,
  type CompanionContentListInput,
  type CompanionContentListResult,
  type CompanionContentReadInput,
  type CompanionContentReadResult,
} from '../src/products/chat/companion/supervisedContentTools.js';
import { MemoryCompanionBoxStore } from '../src/products/chat/state/companion-box/index.js';
import {
  createInMemoryToolEvidenceSink,
  createSupervisedToolRegistry,
  createToolBoundary,
} from '../src/platform/supervision/index.js';
import type { ToolSurfaceGrant } from '../src/platform/supervision/toolRegistry.js';

const NOW = '2026-04-29T00:00:00.000Z';

async function seedCompanionStore() {
  const companionStore = new MemoryCompanionBoxStore();
  const note = await companionStore.ingestSource(
    'cat-morning',
    {
      kind: 'note',
      storageMode: 'uploaded_copy',
      title: 'Favorite greeting',
      ownerNote: 'Use when the owner needs a calm start.',
      textContent: 'A calm morning note.',
      metadata: { tags: ['morning'] },
    },
    new Date(NOW),
  );
  const image = await companionStore.ingestSource(
    'cat-morning',
    {
      kind: 'image',
      storageMode: 'linked_path',
      title: 'Sunrise',
      linkedPath: 'C:/private/sunrise.png',
      metadata: { caption: 'A soft sunrise.' },
    },
    new Date(NOW),
  );
  await companionStore.ingestSource(
    'cat-other',
    {
      kind: 'note',
      storageMode: 'uploaded_copy',
      title: 'Other cat note',
      textContent: 'Out of scope.',
    },
    new Date(NOW),
  );

  return {
    companionStore,
    note: note.source,
    image: image.source,
  };
}

async function invokeCompanionContentTool<TInput, TOutput>(input: {
  companionStore: MemoryCompanionBoxStore;
  resourceScopes: Array<Record<string, unknown>>;
  toolName: typeof COMPANION_CONTENT_LIST_TOOL | typeof COMPANION_CONTENT_READ_TOOL;
  toolInput: TInput;
  grant?: ToolSurfaceGrant;
}) {
  const tools = createCompanionContentTools({
    companionStore: input.companionStore,
    resourceScopes: input.resourceScopes,
    now: () => new Date(NOW),
  });
  const registry = createSupervisedToolRegistry();
  tools.register(registry);
  const evidenceSink = createInMemoryToolEvidenceSink();
  const boundary = createToolBoundary({
    registry,
    evidenceSink,
    now: () => NOW,
  });
  const executor = input.toolName === COMPANION_CONTENT_LIST_TOOL
    ? tools.executors[COMPANION_CONTENT_LIST_TOOL]
    : tools.executors[COMPANION_CONTENT_READ_TOOL];

  const result = await boundary.invoke<TInput, TOutput>({
    toolName: input.toolName,
    input: input.toolInput,
    actionId: `${input.toolName}:action`,
    runId: 'run-scheduled-1',
    actorRef: 'actor-cat-morning',
    grant: input.grant ?? {
      parentToolScope: 'read_only',
      policyToolScope: 'read_only',
    },
    execute: executor as never,
  });

  return {
    result,
    evidence: evidenceSink.read(),
  };
}

test('companion content list and read stay inside declared source ids', async () => {
  const { companionStore, note, image } = await seedCompanionStore();
  const resourceScopes = [{
    kind: 'companion_content',
    catId: 'cat-morning',
    sourceIds: [note.id],
  }];

  const list = await invokeCompanionContentTool<
    CompanionContentListInput,
    CompanionContentListResult
  >({
    companionStore,
    resourceScopes,
    toolName: COMPANION_CONTENT_LIST_TOOL,
    toolInput: { catId: 'cat-morning' },
  });

  assert.equal(list.result.status, 'applied');
  assert.deepEqual(list.result.result.items.map((item) => item.sourceId), [note.id]);
  assert.equal(list.result.result.items[0].title, 'Favorite greeting');
  assert.equal(list.evidence[0].toolName, COMPANION_CONTENT_LIST_TOOL);
  assert.equal(list.evidence[0].status, 'applied');

  const read = await invokeCompanionContentTool<
    CompanionContentReadInput,
    CompanionContentReadResult
  >({
    companionStore,
    resourceScopes,
    toolName: COMPANION_CONTENT_READ_TOOL,
    toolInput: { catId: 'cat-morning', sourceId: note.id },
  });

  assert.equal(read.result.status, 'applied');
  assert.equal(read.result.result.sourceId, note.id);
  assert.equal(read.result.result.sourceText, 'A calm morning note.');
  assert.equal(read.result.result.metadata.tags[0], 'morning');

  const blocked = await invokeCompanionContentTool<
    CompanionContentReadInput,
    CompanionContentReadResult
  >({
    companionStore,
    resourceScopes,
    toolName: COMPANION_CONTENT_READ_TOOL,
    toolInput: { catId: 'cat-morning', sourceId: image.id },
  });

  assert.equal(blocked.result.status, 'rejected');
  assert.equal(blocked.result.error.code, 'E_NOT_AUTHORIZED');
});

test('companion content list rejects requested source kinds outside scope', async () => {
  const { companionStore } = await seedCompanionStore();

  const result = await invokeCompanionContentTool<
    CompanionContentListInput,
    CompanionContentListResult
  >({
    companionStore,
    resourceScopes: [{
      kind: 'companion_content',
      catId: 'cat-morning',
      sourceKinds: ['image'],
    }],
    toolName: COMPANION_CONTENT_LIST_TOOL,
    toolInput: { catId: 'cat-morning', sourceKinds: ['note'] },
  });

  assert.equal(result.result.status, 'rejected');
  assert.equal(result.result.error.code, 'E_NOT_AUTHORIZED');
});

test('companion content tools require an explicit companion content scope', async () => {
  const { companionStore, note } = await seedCompanionStore();

  const result = await invokeCompanionContentTool<
    CompanionContentReadInput,
    CompanionContentReadResult
  >({
    companionStore,
    resourceScopes: [],
    toolName: COMPANION_CONTENT_READ_TOOL,
    toolInput: { catId: 'cat-morning', sourceId: note.id },
  });

  assert.equal(result.result.status, 'rejected');
  assert.equal(result.result.error.code, 'E_NOT_AUTHORIZED');
});
