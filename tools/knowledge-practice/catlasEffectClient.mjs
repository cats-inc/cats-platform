import assert from 'node:assert/strict';
import { canonical } from './artifacts.mjs';

/** Worker-side capability proxy. The parent owns all external calls and secrets. */
export function createCatlasEffectClient({ port, resetId }) {
  const pending = new Map();
  let sequence = 0, closed = false;
  port.on('message', message => {
    const receiver = pending.get(message?.id);
    if (!receiver) return;
    pending.delete(message.id);
    if (message.ok) receiver.resolve(message.value);
    else receiver.reject(new Error('Parent rejected the evaluation effect.'));
  });
  port.on('close', () => {
    closed = true;
    for (const receiver of pending.values()) receiver.reject(new Error('Evaluation effect channel closed.'));
    pending.clear();
  });
  function call(method, args) {
    assert.ok(!closed, 'Evaluation effect channel closed.');
    assert.ok(sequence < 32, 'Evaluation effect request budget exhausted.');
    assert.ok(Buffer.byteLength(canonical(args)) <= 128 * 1024);
    const id = ++sequence;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      try { port.postMessage({ resetId, id, method, args }); }
      catch (error) { pending.delete(id); reject(error); }
    });
  }
  return {
    runtimeClient: Object.fromEntries(['createSession', 'observeSession', 'sendMessage', 'cancelSession', 'closeSession']
      .map(method => [method, (...args) => call(method, args)])),
    judge: ({ signal: _signal, ...input }) => call('judge', [input]),
    confirmCleanup: input => call('confirmCleanup', [input]),
    close: () => port.close(),
  };
}
