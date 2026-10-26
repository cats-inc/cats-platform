import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';

import {
  createTelegramBotApiDeliveryClient,
  TelegramDispatchGuardError,
} from '../build/server/platform/transports/telegram/delivery.js';

test('photo upload awaits the final asynchronous authorization guard after reading the original file', async t => {
  const root = await mkdtemp(path.join(tmpdir(), 'cats-telegram-image-guard-'));
  t.after(() => rm(root, { recursive: true, force: true, maxRetries: 5 }));
  const file = path.join(root, 'original.jpg'); await writeFile(file, Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
  let release; let entered = false; let network = 0; let allowed = true;
  const client = createTelegramBotApiDeliveryClient({ botToken: 'fixture-token', fetchImpl: async () => {
    network++; throw new Error('Unexpected network call');
  } });
  const pending = client.deliver({ operation: 'send_media', mediaKind: 'photo', chatId: '12345',
    mediaFile: { path: file, fileName: 'original.jpg' } }, { async assertAllowed() {
    entered = true; await new Promise(resolve => { release = resolve; });
    if (!allowed) throw new Error('scope revoked while reading');
  } });
  while (!entered) await new Promise(resolve => setTimeout(resolve, 1));
  assert.equal(network, 0); allowed = false; release();
  await assert.rejects(pending, TelegramDispatchGuardError); assert.equal(network, 0);
});

test('only an explicit Telegram rate-limit rejection is automatically retryable', async () => {
  for (const [payload, expected] of [[{ ok: false, error_code: 429, parameters: { retry_after: 30 } }, 'retryable'],
    [{ ok: false, error_code: 403 }, 'rejected'], [{ ok: false, error_code: 500 }, 'uncertain'], [{}, 'uncertain']]) {
    const client = createTelegramBotApiDeliveryClient({ botToken: 'fixture-token', fetchImpl: async () => ({
      ok: false, status: payload.error_code ?? 502, async json() { return payload; }, async text() { return JSON.stringify(payload); } }) });
    const result = await client.deliver({ operation: 'send', chatId: '12345', text: 'Fixture message' });
    assert.equal(result.failureKind, expected);
    if (expected === 'retryable') assert.equal(result.retryAfterSeconds, 30);
  }
});

test('telegram bot api delivery client configures commands and menu button', async () => {
  const calls = [];
  const client = createTelegramBotApiDeliveryClient({
    botToken: 'bot-token',
    fetchImpl: async (url, options = {}) => {
      calls.push({
        url,
        method: options.method,
        body: options.body ? JSON.parse(String(options.body)) : null,
      });
      return {
        ok: true,
        status: 200,
        async json() {
          return { ok: true, result: true };
        },
        async text() {
          return JSON.stringify({ ok: true, result: true });
        },
      };
    },
  });

  const commandsResult = await client.setMyCommands({
    commands: [
      {
        command: 'help',
        description: 'Show available commands',
      },
    ],
    scope: { type: 'default' },
  });
  const menuResult = await client.setChatMenuButton({
    menuButton: { type: 'commands' },
  });
  const deleteCommandsResult = await client.deleteMyCommands({
    scope: { type: 'default' },
  });

  assert.equal(commandsResult.ok, true);
  assert.equal(menuResult.ok, true);
  assert.equal(deleteCommandsResult.ok, true);
  assert.equal(calls.length, 3);
  assert.equal(calls[0].url, 'https://api.telegram.org/botbot-token/setMyCommands');
  assert.deepEqual(calls[0].body, {
    commands: [
      {
        command: 'help',
        description: 'Show available commands',
      },
    ],
    scope: { type: 'default' },
  });
  assert.equal(calls[1].url, 'https://api.telegram.org/botbot-token/setChatMenuButton');
  assert.deepEqual(calls[1].body, {
    menu_button: { type: 'commands' },
  });
  assert.equal(calls[2].url, 'https://api.telegram.org/botbot-token/deleteMyCommands');
  assert.deepEqual(calls[2].body, {
    scope: { type: 'default' },
  });
});

test('telegram bot api delivery client sends media by URL', async () => {
  const calls = [];
  const replyMarkup = { inline_keyboard: [[{ text: 'Open Code', callback_data: 'fixture:code' }]] };
  const client = createTelegramBotApiDeliveryClient({
    botToken: 'bot-token',
    fetchImpl: async (url, options = {}) => {
      calls.push({
        url,
        method: options.method,
        body: options.body ? JSON.parse(String(options.body)) : null,
      });
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            ok: true,
            result: {
              message_id: 42,
              chat: { id: 4242 },
            },
          };
        },
        async text() {
          return JSON.stringify({ ok: true });
        },
      };
    },
  });

  const result = await client.deliver({
    operation: 'send_media',
    chatId: '4242',
    mediaKind: 'photo',
    mediaUrl: 'https://example.com/morning.jpg',
    caption: 'Good morning',
    replyMarkup,
  });

  assert.equal(result.ok, true);
  assert.equal(result.chatId, '4242');
  assert.equal(result.messageId, '42');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.telegram.org/botbot-token/sendPhoto');
  assert.deepEqual(calls[0].body, {
    chat_id: '4242',
    photo: 'https://example.com/morning.jpg',
    caption: 'Good morning',
    reply_markup: replyMarkup,
  });
});

test('a local photo upload preserves the choice buttons on the Bot API wire', async t => {
  const root = await mkdtemp(path.join(tmpdir(), 'telegram-photo-choice-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const file = path.join(root, 'photo.jpg');
  await writeFile(file, Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
  const replyMarkup = { inline_keyboard: [[{ text: 'Open Code', callback_data: 'fixture:code' }]] };
  let body;
  const client = createTelegramBotApiDeliveryClient({ botToken: 'fixture-token',
    fetchImpl: async (_url, options) => {
      body = options.body.toString('utf8');
      return { ok: true, status: 200,
        json: async () => ({ ok: true, result: { message_id: 42, chat: { id: 4242 } } }) };
    },
  });
  const result = await client.deliver({ operation: 'send_media', mediaKind: 'photo', chatId: '4242',
    mediaFile: { path: file, fileName: 'photo.jpg' }, caption: 'Open Code?', replyMarkup });
  assert.equal(result.ok, true);
  assert.ok(body.includes('name="reply_markup"\r\n\r\n' + JSON.stringify(replyMarkup)));
});
