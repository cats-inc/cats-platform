import assert from 'node:assert/strict';
import test from 'node:test';

import {
  appendCoreActivity,
  createDefaultCoreState,
} from '../dist-server/core/model/index.js';
import { executeCoreMemoryMaintenanceAction } from '../dist-server/core/memoryMaintenanceActions.js';
import { buildCoreMemoryMaintenanceSummary } from '../dist-server/core/memoryMaintenance.js';
import { MemoryCoreStore } from '../dist-server/core/store.js';

test('buildCoreMemoryMaintenanceSummary normalizes memory maintenance activity history', () => {
  const now = new Date('2026-03-26T17:00:00.000Z');
  let core = createDefaultCoreState();

  core = appendCoreActivity(
    core,
    {
      id: 'activity-memory-runtime',
      kind: 'note',
      message: 'Runtime memory flush completed.',
      createdAt: '2026-03-26T16:59:00.000Z',
      metadata: {
        category: 'memory_maintenance',
        trigger: 'runtime_hook',
        status: 'executed',
        phase: 'pre_reset',
        sessionId: 'session-runtime',
        channelId: 'channel-runtime',
        reason: 'runtime_hook',
        summary: {
          subjects: [
            {
              kind: 'channel',
              id: 'channel-runtime',
            },
          ],
          flushCount: 1,
          persistedCount: 2,
          removedCount: 1,
          removedRecordIds: ['cats-memory-old-1'],
          sourceScopeKeys: ['channel:channel-runtime'],
          replacementGroups: ['channel:channel-runtime:summary'],
        },
      },
    },
    now,
  ).core;
  core = appendCoreActivity(
    core,
    {
      id: 'activity-memory-companion',
      kind: 'note',
      message: 'Companion sync deferred.',
      createdAt: '2026-03-26T16:58:00.000Z',
      metadata: {
        category: 'memory_maintenance',
        trigger: 'companion_sync',
        status: 'deferred',
        catId: 'cat-companion',
        reason: 'manual',
        error: 'rate limited',
      },
    },
    now,
  ).core;
  core = appendCoreActivity(
    core,
    {
      id: 'activity-memory-owner',
      kind: 'note',
      message: 'Owner sync missing context.',
      createdAt: '2026-03-26T16:57:00.000Z',
      metadata: {
        category: 'memory_maintenance',
        trigger: 'owner_sync',
        status: 'missing_context',
        reason: 'owner_profile_sync',
      },
    },
    now,
  ).core;
  core = appendCoreActivity(
    core,
    {
      id: 'activity-non-memory',
      kind: 'note',
      message: 'Ignore me.',
      createdAt: '2026-03-26T16:56:00.000Z',
      metadata: {
        category: 'orchestrator',
      },
    },
    now,
  ).core;

  const maintenance = buildCoreMemoryMaintenanceSummary(core);

  assert.deepEqual(maintenance.totals, {
    recentCount: 3,
    executed: 1,
    deferred: 1,
    missingContext: 1,
    error: 0,
  });
  assert.equal(maintenance.latestByTrigger.runtimeHook?.id, 'activity-memory-runtime');
  assert.equal(maintenance.latestByTrigger.companionSync?.id, 'activity-memory-companion');
  assert.equal(maintenance.latestByTrigger.ownerSync?.id, 'activity-memory-owner');
  assert.deepEqual(maintenance.recent.map((activity) => activity.id), [
    'activity-memory-runtime',
    'activity-memory-companion',
    'activity-memory-owner',
  ]);
  assert.deepEqual(
    maintenance.recent[0]?.summary?.removedRecordIds,
    ['cats-memory-old-1'],
  );
  assert.deepEqual(maintenance.recent[0]?.subjectKeys, ['channel:channel-runtime']);
  assert.deepEqual(maintenance.recent[1]?.subjectKeys, ['cat:cat-companion']);
  assert.deepEqual(maintenance.recent[2]?.subjectKeys, ['owner:actor-owner']);
});

test('executeCoreMemoryMaintenanceAction records executed companion sync activity', async () => {
  const coreStore = new MemoryCoreStore(createDefaultCoreState());
  const memoryService = {
    async listCanonicalRecords() {
      return [];
    },
    async flushCompanionBox() {
      return {
        scope: 'cat',
        subjectId: 'cat-companion',
        reason: 'manual',
        persistedCount: 2,
        removedRecordIds: ['cats-memory-old-1'],
        payload: {
          version: 1,
          subject: {
            kind: 'cat',
            id: 'cat-companion',
          },
          sourceScopeKeys: ['cat:cat-companion'],
          persistedRecords: [
            {
              replacementGroup: 'cat:cat-companion:summary',
            },
          ],
        },
      };
    },
    async flushChannel() {
      throw new Error('not used');
    },
    async flushOwnerProfile() {
      throw new Error('not used');
    },
    async flushProject() {
      throw new Error('not used');
    },
    async flushRelationship() {
      throw new Error('not used');
    },
    async buildRetrievalContext() {
      throw new Error('not used');
    },
    async buildCompanionRetrievalContext() {
      throw new Error('not used');
    },
    async buildChannelRetrievalContext() {
      throw new Error('not used');
    },
  };
  const companionStore = {};

  const result = await executeCoreMemoryMaintenanceAction({
    action: 'sync_companion',
    catId: 'cat-companion',
    coreStore,
    memoryService,
    companionStore,
    now: new Date('2026-03-26T18:30:00.000Z'),
  });

  assert.equal(result.status, 'executed');
  assert.equal(result.summary?.persistedCount, 2);

  const core = await coreStore.readCore();
  const maintenance = buildCoreMemoryMaintenanceSummary(core);
  assert.equal(maintenance.totals.executed, 1);
  assert.equal(maintenance.latestByTrigger.companionSync?.status, 'executed');
  assert.match(
    maintenance.latestByTrigger.companionSync?.message ?? '',
    /Synchronized Cats-owned canonical companion memory/i,
  );
});

test('executeCoreMemoryMaintenanceAction records deferred owner sync activity', async () => {
  const coreStore = new MemoryCoreStore(createDefaultCoreState());
  const memoryService = {
    async listCanonicalRecords() {
      return [];
    },
    async flushCompanionBox() {
      throw new Error('not used');
    },
    async flushChannel() {
      throw new Error('not used');
    },
    async flushOwnerProfile() {
      throw new Error('owner sync failed');
    },
    async flushProject() {
      throw new Error('not used');
    },
    async flushRelationship() {
      throw new Error('not used');
    },
    async buildRetrievalContext() {
      throw new Error('not used');
    },
    async buildCompanionRetrievalContext() {
      throw new Error('not used');
    },
    async buildChannelRetrievalContext() {
      throw new Error('not used');
    },
  };

  const result = await executeCoreMemoryMaintenanceAction({
    action: 'sync_owner',
    coreStore,
    memoryService,
    reason: 'owner_profile_sync',
    now: new Date('2026-03-26T18:45:00.000Z'),
  });

  assert.equal(result.status, 'deferred');
  assert.equal(result.summary, null);
  assert.match(result.error ?? '', /owner sync failed/i);

  const core = await coreStore.readCore();
  const maintenance = buildCoreMemoryMaintenanceSummary(core);
  assert.equal(maintenance.totals.deferred, 1);
  assert.equal(maintenance.latestByTrigger.ownerSync?.status, 'deferred');
  assert.equal(maintenance.latestByTrigger.ownerSync?.reason, 'owner_profile_sync');
  assert.deepEqual(maintenance.latestByTrigger.ownerSync?.subjectKeys, ['owner:actor-owner']);
  assert.match(
    maintenance.latestByTrigger.ownerSync?.message ?? '',
    /Cats-owned owner memory sync failed/i,
  );
});
