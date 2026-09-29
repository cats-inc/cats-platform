import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createTelegramBotApiDeliveryClient } from '../build/server/platform/transports/telegram/delivery.js';
import { createTelegramIpv4Fetch } from '../build/server/platform/transports/telegram/http.js';
import { createDefaultChatState } from '../build/server/products/chat/state/defaults.js';
import { createCat, createChannel } from '../build/server/products/chat/state/model/index.js';
import { MemoryChatStore } from '../build/server/products/chat/state/store.js';
import { MemoryCompanionBoxStore } from '../build/server/products/chat/state/companion-box/memoryStore.js';
import { createChatTelegramRoomBridge } from '../build/server/products/chat/state/telegramBridgeAdapter.js';

const NOW = new Date('2026-09-29T14:00:00.000Z');
/** Bytes that are not valid UTF-8, so a text round trip would corrupt them. */
const BINARY = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x80, 0x81]);

/** Small Buffers share Node's pool, so copy out exactly these bytes. */
function binaryArrayBuffer() {
  return BINARY.buffer.slice(BINARY.byteOffset, BINARY.byteOffset + BINARY.length);
}

function jsonResponse(body) {
  return {
    ok: true,
    status: 200,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

test('the Telegram IPv4 fetch keeps a download\'s bytes intact', async () => {
  const fetchImpl = createTelegramIpv4Fetch((_url, _options, onResponse) => {
    const listeners = new Map();
    queueMicrotask(() => {
      onResponse({ statusCode: 200, on: (event, handler) => listeners.set(event, handler) });
      queueMicrotask(() => {
        listeners.get('data')?.(BINARY.subarray(0, 3));
        listeners.get('data')?.(BINARY.subarray(3));
        listeners.get('end')?.();
      });
    });
    return { on() { return this; }, write() {}, end() {}, destroy() {} };
  });

  const response = await fetchImpl('https://api.telegram.org/file/botabc/photos/file_7.jpg');
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), BINARY);
});

test('downloadFile asks getFile for the path, then fetches the bytes within the limit', async () => {
  const calls = [];
  const client = createTelegramBotApiDeliveryClient({
    botToken: 'token-123',
    fetchImpl: async (url, options = {}) => {
      calls.push({ url, body: options.body ? JSON.parse(String(options.body)) : null });
      if (url.endsWith('/getFile')) {
        return jsonResponse({ ok: true, result: { file_path: 'photos/file_7.jpg', file_size: BINARY.length } });
      }
      return { ...jsonResponse({}), arrayBuffer: async () => binaryArrayBuffer() };
    },
  });

  const file = await client.downloadFile({ fileId: 'photo-large', maxBytes: 1024 });
  assert.deepEqual(file, { bytes: BINARY, filePath: 'photos/file_7.jpg' });
  assert.deepEqual(calls.map((call) => call.url), [
    'https://api.telegram.org/bottoken-123/getFile',
    'https://api.telegram.org/file/bottoken-123/photos/file_7.jpg',
  ]);
  assert.deepEqual(calls[0].body, { file_id: 'photo-large' });
});

test('downloadFile gives up on a file over the limit or one Telegram cannot find', async () => {
  let downloads = 0;
  const client = (getFile) => createTelegramBotApiDeliveryClient({
    botToken: 'token-123',
    fetchImpl: async (url) => {
      if (url.endsWith('/getFile')) {
        return jsonResponse(getFile);
      }
      downloads += 1;
      return { ...jsonResponse({}), arrayBuffer: async () => binaryArrayBuffer() };
    },
  });

  assert.equal(
    await client({ ok: true, result: { file_path: 'photos/big.jpg', file_size: 5_000 } })
      .downloadFile({ fileId: 'big', maxBytes: 1_000 }),
    null,
  );
  assert.equal(downloads, 0, 'an oversized file is never fetched');
  assert.equal(
    await client({ ok: false, description: 'Bad Request: invalid file_id' })
      .downloadFile({ fileId: 'missing', maxBytes: 1_000 }),
    null,
  );
  assert.equal(
    await client({ ok: true, result: { file_path: 'photos/unsized.jpg' } })
      .downloadFile({ fileId: 'unsized', maxBytes: 4 }),
    null,
    'bytes over the limit are refused even when Telegram did not report a size',
  );
});

test('the chat room bridge stores inbound pictures in the room\'s attachment folder', async () => {
  let chat = createDefaultChatState();
  chat = createCat(chat, { name: 'Mochi', provider: 'claude', roles: ['companion'] }, NOW);
  const catId = chat.cats.find((cat) => cat.name === 'Mochi').id;
  chat = createChannel(chat, {
    title: 'Mochi',
    topic: 'Direct lane',
    originSurface: 'chat',
    roomMode: 'direct_message',
    defaultRecipientId: catId,
    participantCatIds: [catId],
    skipBossCatGreeting: true,
  }, NOW);
  const roomId = chat.selectedChannelId;
  // Without this the copy would land in the real ~/.cats/runtime/data.
  const runtimeDataDir = await mkdtemp(path.join(tmpdir(), 'cats-telegram-inbound-'));
  const roomBridge = createChatTelegramRoomBridge({
    chatStore: new MemoryChatStore(),
    companionStore: new MemoryCompanionBoxStore(),
    runtimeDataDir,
  });

  const stored = await roomBridge.storeInboundAttachments({
    state: chat,
    roomId,
    files: [{ name: 'telegram-photo-55.jpg', bytes: BINARY }],
  });

  assert.deepEqual(stored, ['.cats-attachments/telegram-photo-55.jpg']);
  assert.deepEqual(
    await readFile(path.join(runtimeDataDir, 'channels', roomId, '.cats-attachments', 'telegram-photo-55.jpg')),
    BINARY,
  );
});
