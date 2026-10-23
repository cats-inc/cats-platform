import assert from 'node:assert/strict';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { readBrowserSdk } from '#cats-app-package';

test('the injected multimedia SDK uses its scoped protocol and reads never submit generation', async () => {
  const requests = [];
  const listeners = new Map();
  const port = {
    onmessage: null, start() {},
    postMessage(message) {
      requests.push(message);
      const value = message.method.endsWith('.capabilities') ? { schemaVersion: 2, profiles: [] }
        : message.method.endsWith('.read') ? { bytes: new ArrayBuffer(4), mimeType: 'image/png' }
          : { id: 'work-one', status: 'succeeded' };
      queueMicrotask(() => port.onmessage({ data: { id: message.id, ok: true, value } }));
    },
  };
  const parent = { postMessage(message) {
    queueMicrotask(() => listeners.get('message')({ source: parent,
      data: { type: 'cats.app.connect', nonce: message.nonce }, ports: [port] }));
  } };
  const context = { __CATS_APP_BOOT__: { appId: 'cats.studio', version: '0.4.0', nonce: 'nonce', locale: 'zh-TW', theme: 'dark' },
    parent, window: { addEventListener(name, listener) { listeners.set(name, listener); },
      removeEventListener(name) { listeners.delete(name); } },
    setTimeout(callback, delay) { const timer = setTimeout(callback, delay); timer.unref(); return timer; }, clearTimeout };
  runInNewContext(await readBrowserSdk(), context);
  const sdk = context.catsApp;
  assert.equal(sdk.appId, 'cats.studio');
  assert.ok(Object.isFrozen(sdk.media) && Object.isFrozen(sdk.media.images));
  assert.equal((await sdk.media.images.getCapabilities()).schemaVersion, 2);
  await sdk.media.images.list();
  await sdk.media.images.refresh('work-one');
  const image = await sdk.media.images.read('work-one');
  assert.equal(image.mimeType, 'image/png');
  assert.equal(image.bytes.byteLength, 4);
  assert.deepEqual(requests.map((request) => request.method),
    ['media.images.capabilities', 'media.images.list', 'media.images.refresh', 'media.images.read']);
  const input = { requestId: 'one', targetId: 'grok/native', prompt: 'Morning' };
  await sdk.media.images.submit(input);
  assert.equal(requests.at(-1).method, 'media.images.submit');
  assert.equal(requests.at(-1).params, input);
  await sdk.images.list();
  assert.equal(requests.at(-1).method, 'images.list', 'installed Apps keep their original negotiated API');
  assert.equal(context.__CATS_APP_BOOT__, undefined, 'bootstrap metadata is consumed');
});
