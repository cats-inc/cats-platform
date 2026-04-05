import assert from 'node:assert/strict';
import test from 'node:test';

import { closeAppServerGracefully } from '../build/server/app/server/shutdown.js';

test('closeAppServerGracefully closes idle connections before waiting for shutdown', async () => {
  let closeCalls = 0;
  let closeIdleCalls = 0;
  let closeAllCalls = 0;

  await closeAppServerGracefully({
    close(callback) {
      closeCalls += 1;
      callback();
    },
    closeIdleConnections() {
      closeIdleCalls += 1;
    },
    closeAllConnections() {
      closeAllCalls += 1;
    },
  }, {
    forceCloseDelayMs: 10,
  });

  await new Promise((resolve) => setTimeout(resolve, 25));

  assert.equal(closeCalls, 1);
  assert.equal(closeIdleCalls, 1);
  assert.equal(closeAllCalls, 0);
});

test('closeAppServerGracefully force closes lingering sockets after the grace delay', async () => {
  let closeIdleCalls = 0;
  let closeAllCalls = 0;
  let closeCallback = null;

  await closeAppServerGracefully({
    close(callback) {
      closeCallback = callback;
    },
    closeIdleConnections() {
      closeIdleCalls += 1;
    },
    closeAllConnections() {
      closeAllCalls += 1;
      closeCallback?.();
    },
  }, {
    forceCloseDelayMs: 0,
  });

  assert.equal(closeIdleCalls, 1);
  assert.equal(closeAllCalls, 1);
});

