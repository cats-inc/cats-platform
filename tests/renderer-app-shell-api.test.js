import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createAsyncKeyedGate,
  createKeyedRequestCoalescer,
} from '../build/server/products/chat/shared/asyncControl.js';

test('selected-channel request coalescer reuses the same in-flight promise per channel', async () => {
  const coalescer = createKeyedRequestCoalescer();
  let calls = 0;
  let release = () => {};
  const deferred = new Promise((resolve) => {
    release = resolve;
  });

  const first = coalescer.run('channel-1', async () => {
    calls += 1;
    await deferred;
    return { channelId: 'channel-1' };
  });
  const second = coalescer.run('channel-1', async () => {
    calls += 1;
    return { channelId: 'channel-1', duplicate: true };
  });

  assert.equal(calls, 1);
  release();
  const [firstResult, secondResult] = await Promise.all([first, second]);
  assert.equal(calls, 1);
  assert.equal(firstResult, secondResult);
});

test('chat mutation gate serializes same-channel operations without blocking different channels', async () => {
  const gate = createAsyncKeyedGate();
  const order = [];
  let releaseFirst = () => {};
  const firstDeferred = new Promise((resolve) => {
    releaseFirst = resolve;
  });

  const first = gate.run('channel-1', async () => {
    order.push('first:start');
    await firstDeferred;
    order.push('first:end');
  });
  const second = gate.run('channel-1', async () => {
    order.push('second:start');
    order.push('second:end');
  });
  const parallel = gate.run('channel-2', async () => {
    order.push('parallel:start');
    order.push('parallel:end');
  });

  await Promise.resolve();
  assert.deepEqual(order, ['first:start', 'parallel:start', 'parallel:end']);

  releaseFirst();
  await Promise.all([first, second, parallel]);
  assert.deepEqual(order, [
    'first:start',
    'parallel:start',
    'parallel:end',
    'first:end',
    'second:start',
    'second:end',
  ]);
});

