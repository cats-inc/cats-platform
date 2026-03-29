import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createTelegramBotApiDeliveryClient,
} from '../dist-server/platform/transports/telegram/delivery.js';

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
