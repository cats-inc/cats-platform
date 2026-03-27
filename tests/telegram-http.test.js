import assert from 'node:assert/strict';
import test from 'node:test';

import { createTelegramIpv4Fetch } from '../dist-server/platform/transports/telegram/http.js';

test('createTelegramIpv4Fetch forces family 4 for Telegram API requests', async () => {
  const calls = [];
  const fetchImpl = createTelegramIpv4Fetch((url, options, onResponse) => {
    calls.push({ url: String(url), options });
    const listeners = new Map();
    queueMicrotask(() => {
      const response = {
        statusCode: 200,
        on(event, handler) {
          listeners.set(event, handler);
        },
      };
      onResponse(response);
      queueMicrotask(() => {
        listeners.get('data')?.(Buffer.from('{"ok":true}'));
        listeners.get('end')?.();
      });
    });
    return {
      on() {
        return this;
      },
      write() {},
      end() {},
      destroy() {},
    };
  });

  const response = await fetchImpl('https://api.telegram.org/botabc/getMe', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ hello: 'world' }),
  });

  assert.equal(response.ok, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.family, 4);
  assert.equal(calls[0].options.servername, 'api.telegram.org');
});
