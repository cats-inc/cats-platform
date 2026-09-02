import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import test from 'node:test';
import type { IncomingMessage, ServerResponse } from 'node:http';

import { createTelegramIngressDispatcher } from '../src/platform/transports/telegram/ingressDispatch.js';
import { createTelegramRelay } from '../src/platform/transports/telegram/relay/index.js';
import { InMemoryTelegramRelayStore } from '../src/platform/transports/telegram/store/index.js';
import type { TransportWorkGoldenPathPort } from '../src/platform/transports/work-delivery/port.js';
import { handleTelegramWebhook } from '../src/server/routes/telegram.js';

const BINDING = {
  id: 'binding-1',
  platform: 'telegram' as const,
  botName: 'work_bot',
  orchestratorActorId: 'actor-cat-cat-1',
  catActorId: 'actor-cat-cat-1',
  bossCatActorId: 'actor-cat-cat-1',
  roomMode: 'direct_message' as const,
  status: 'active' as const,
  createdAt: '2026-09-02T00:00:00.000Z',
  updatedAt: '2026-09-02T00:00:00.000Z',
};

function webhookRequest(updateId: number): IncomingMessage {
  const request = Readable.from([JSON.stringify({
    update_id: updateId,
    message: {
      message_id: updateId * 10,
      text: '/work preserve this update',
      chat: { id: 12345, type: 'private' },
      from: { id: 7, first_name: 'Owner' },
    },
  })]) as unknown as IncomingMessage;
  request.headers = { 'content-type': 'application/json' };
  return request;
}

function responseCapture(): {
  response: ServerResponse;
  status: () => number | null;
  payload: () => Record<string, unknown>;
} {
  let statusCode: number | null = null;
  let body = '';
  const response = {
    writeHead(code: number) {
      statusCode = code;
      return this;
    },
    end(chunk?: string) {
      body = chunk ?? '';
      return this;
    },
  } as unknown as ServerResponse;
  return {
    response,
    status: () => statusCode,
    payload: () => JSON.parse(body) as Record<string, unknown>,
  };
}

test('a failed /work capture returns 500 and remains eligible for redelivery', async () => {
  const relayStore = new InMemoryTelegramRelayStore();
  const telegramRelay = createTelegramRelay({ store: relayStore });
  let attempts = 0;
  const goldenPath: TransportWorkGoldenPathPort = {
    ownsCallback: () => false,
    handleWorkCommand: async () => {
      attempts += 1;
      if (attempts === 1) {
        throw new Error('simulated Core write failure');
      }
      return { handled: true, outcome: 'accepted', workItemId: 'work-1', rejection: null };
    },
    handleActionCallback: async () => ({
      handled: true,
      outcome: 'admitted',
      workItemId: 'work-1',
      rejection: null,
    }),
    refuse: async () => ({
      handled: true,
      outcome: 'refused',
      workItemId: null,
      rejection: null,
    }),
  };
  const chatStore = {
    readCore: async () => ({ botBindings: [BINDING] }),
    read: async () => ({
      bossCatId: 'cat-1',
      cats: [{
        id: 'cat-1',
        name: 'Work Cat',
        status: 'active',
        products: ['chat'],
      }],
    }),
  };
  const dependencies = {
    chatStore,
    telegramRelay,
    transportWorkGoldenPath: goldenPath,
    ingressDispatcher: createTelegramIngressDispatcher(),
    telegramRoomBridge: {
      readState: async () => {
        throw new Error('golden-path update must not enter Chat');
      },
    },
    memoryService: {},
    runtimeClient: {},
  };

  const failed = responseCapture();
  await handleTelegramWebhook(
    webhookRequest(101),
    failed.response,
    dependencies as never,
  );
  assert.equal(failed.status(), 500);
  assert.equal(
    (failed.payload().error as Record<string, unknown>).code,
    'telegram_webhook_processing_failed',
  );
  assert.equal(relayStore.hasProcessedUpdate(101), false);

  const retried = responseCapture();
  await handleTelegramWebhook(
    webhookRequest(101),
    retried.response,
    dependencies as never,
  );
  assert.equal(retried.status(), 202);
  assert.equal(attempts, 2);
  assert.equal(relayStore.hasProcessedUpdate(101), true);
});
