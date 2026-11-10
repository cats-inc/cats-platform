import assert from 'node:assert/strict';
import test from 'node:test';

import { createDefaultCoreState } from '../build/server/core/model/index.js';
import { bestEffortFlushRuntimeSessionMemory } from '../build/server/platform/memory/runtimeMaintenance.js';
import { RuntimeSessionNotFoundError } from '../build/server/runtime/client.js';

function createCountingCoreStore() {
  let core = createDefaultCoreState();
  const store = {
    writes: 0,
    async readCore() {
      return structuredClone(core);
    },
    async writeCore(next) {
      store.writes += 1;
      core = structuredClone(next);
      return structuredClone(core);
    },
    async updateCore(mutator) {
      return store.writeCore(await mutator(structuredClone(core)));
    },
    activities() {
      return core.activities;
    },
  };
  return store;
}

function flushWithObserveFailure(coreStore, error) {
  return bestEffortFlushRuntimeSessionMemory({
    runtimeClient: {
      async observeSession() {
        throw error;
      },
    },
    sessionId: 'session-gone',
    requestedPhase: 'pre_reset',
    memoryService: {},
    coreStore,
  });
}

test('a session Runtime no longer has is not recorded as a maintenance failure', async () => {
  const coreStore = createCountingCoreStore();

  await flushWithObserveFailure(coreStore, new RuntimeSessionNotFoundError('Session not found'));

  assert.equal(coreStore.writes, 0);
  assert.equal(coreStore.activities().length, 0);
});

test('other observe failures are still recorded as maintenance errors', async () => {
  const coreStore = createCountingCoreStore();

  await flushWithObserveFailure(coreStore, new Error('Runtime unreachable'));

  assert.equal(coreStore.writes, 1);
  const [activity] = coreStore.activities();
  assert.equal(activity.metadata.category, 'memory_maintenance');
  assert.equal(activity.metadata.status, 'error');
  assert.equal(activity.metadata.sessionId, 'session-gone');
});
