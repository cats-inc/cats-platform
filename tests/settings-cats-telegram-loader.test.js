import assert from 'node:assert/strict';
import test from 'node:test';

import {
  beginSettingsCatsTelegramScopeLoad,
  createSettingsCatsTelegramAutoLoader,
  createSettingsCatsTelegramScopeKey,
  SETTINGS_CATS_TELEGRAM_ERROR_MESSAGE,
} from '../dist-server/products/chat/settingsCatsTelegramDiagnostics.js';

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function createHandlers(events) {
  return {
    onStart() {
      events.push('start');
    },
    onSuccess(snapshot) {
      events.push(`success:${snapshot.status.id}:${snapshot.diagnostics.id}`);
    },
    onError(message) {
      events.push(`error:${message}`);
    },
    onFinish() {
      events.push('finish');
    },
  };
}

test('settings cats telegram scope key stays stable across equivalent binding arrays', () => {
  const firstKey = createSettingsCatsTelegramScopeKey({
    bossCatId: 'cat-boss',
    botBindings: [
      { id: 'binding-a', status: 'active', updatedAt: '2026-03-23T00:00:00.000Z' },
      { id: 'binding-b', status: 'disabled', updatedAt: '2026-03-23T00:00:00.000Z' },
    ],
  });
  const secondKey = createSettingsCatsTelegramScopeKey({
    bossCatId: 'cat-boss',
    botBindings: [
      { id: 'binding-b', status: 'disabled', updatedAt: '2026-03-23T00:00:00.000Z' },
      { id: 'binding-a', status: 'active', updatedAt: '2026-03-23T00:00:00.000Z' },
    ],
  });
  const changedKey = createSettingsCatsTelegramScopeKey({
    bossCatId: 'cat-boss',
    botBindings: [
      { id: 'binding-a', status: 'active', updatedAt: '2026-03-24T00:00:00.000Z' },
      { id: 'binding-b', status: 'disabled', updatedAt: '2026-03-23T00:00:00.000Z' },
    ],
  });

  assert.equal(firstKey, secondKey);
  assert.notEqual(firstKey, changedKey);
});

test('settings cats telegram auto loader does not re-fetch when the scope key is unchanged', async () => {
  const calls = [];
  const events = [];
  const loader = createSettingsCatsTelegramAutoLoader({
    async fetchStatus() {
      calls.push('status');
      return { id: 'status-1' };
    },
    async fetchDiagnostics() {
      calls.push('diagnostics');
      return { id: 'diagnostics-1' };
    },
  });

  const firstRun = loader.loadForScope('scope-a', createHandlers(events));
  assert.equal(firstRun.started, true);
  await firstRun.promise;

  const secondRun = loader.loadForScope('scope-a', createHandlers(events));
  assert.equal(secondRun.started, false);
  await secondRun.promise;

  const thirdRun = loader.loadForScope('scope-b', createHandlers(events));
  assert.equal(thirdRun.started, true);
  await thirdRun.promise;

  assert.deepEqual(calls, ['status', 'diagnostics', 'status', 'diagnostics']);
  assert.deepEqual(events, [
    'start',
    'success:status-1:diagnostics-1',
    'finish',
    'start',
    'success:status-1:diagnostics-1',
    'finish',
  ]);
});

test('settings cats telegram auto loader drops cancelled results during rapid scope switches', async () => {
  const firstStatus = deferred();
  const firstDiagnostics = deferred();
  const secondStatus = deferred();
  const secondDiagnostics = deferred();
  const events = [];
  let callCount = 0;

  const loader = createSettingsCatsTelegramAutoLoader({
    fetchStatus() {
      callCount += 1;
      return callCount === 1 ? firstStatus.promise : secondStatus.promise;
    },
    fetchDiagnostics() {
      return callCount === 1 ? firstDiagnostics.promise : secondDiagnostics.promise;
    },
  });

  const firstRun = loader.loadForScope('scope-a', createHandlers(events));
  firstRun.cancel();

  const secondRun = loader.loadForScope('scope-b', createHandlers(events));
  firstStatus.resolve({ id: 'status-a' });
  firstDiagnostics.resolve({ id: 'diagnostics-a' });
  secondStatus.resolve({ id: 'status-b' });
  secondDiagnostics.resolve({ id: 'diagnostics-b' });

  await Promise.all([firstRun.promise, secondRun.promise]);

  assert.deepEqual(events, [
    'start',
    'start',
    'success:status-b:diagnostics-b',
    'finish',
  ]);
});

test('settings cats telegram auto loader normalizes unknown load failures to the shared fallback message', async () => {
  const events = [];
  const loader = createSettingsCatsTelegramAutoLoader({
    async fetchStatus() {
      throw 'boom';
    },
    async fetchDiagnostics() {
      return { id: 'unused' };
    },
  });

  const run = loader.loadForScope('scope-a', createHandlers(events));
  await run.promise;

  assert.deepEqual(events, [
    'start',
    `error:${SETTINGS_CATS_TELEGRAM_ERROR_MESSAGE}`,
    'finish',
  ]);
});

test('settings cats telegram scope load resets loader scope during strict-mode style cleanup', async () => {
  const calls = [];
  const events = [];
  const loader = createSettingsCatsTelegramAutoLoader({
    async fetchStatus() {
      calls.push('status');
      return { id: 'status-1' };
    },
    async fetchDiagnostics() {
      calls.push('diagnostics');
      return { id: 'diagnostics-1' };
    },
  });

  const firstRun = beginSettingsCatsTelegramScopeLoad(loader, 'scope-a', createHandlers(events));
  firstRun.cancel();
  await firstRun.promise;

  const secondRun = beginSettingsCatsTelegramScopeLoad(loader, 'scope-a', createHandlers(events));
  assert.equal(secondRun.started, true);
  await secondRun.promise;

  assert.deepEqual(calls, ['status', 'diagnostics', 'status', 'diagnostics']);
  assert.deepEqual(events, [
    'start',
    'start',
    'success:status-1:diagnostics-1',
    'finish',
  ]);
});
