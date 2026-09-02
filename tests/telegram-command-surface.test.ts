/**
 * Transport-owned commands on both ingress modes, and a truthful `/status`
 * (SPEC-114 FR-5, PLAN-105 Phase 1).
 *
 * Two defects sit behind these tests:
 *
 *  - slash commands were intercepted in the webhook route only, so on long
 *    polling — the default ingress, and the one the dev loop and `cats-one` boot
 *    chain use — `/status` was forwarded to the assistant as ordinary chat text;
 *  - `/status` replied `Status: Connected` and nothing else, which reads as
 *    "everything is fine" even when the host cannot accept delegated work at all.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { createTelegramCommandSurface } from '../src/app/server/telegramCommandSurface.js';
import type { BotBindingRecord } from '../src/core/types.js';
import type { ChatStore } from '../src/products/chat/state/store.js';

const BINDING: BotBindingRecord = {
  id: 'binding-1',
  platform: 'telegram',
  botName: 'cats_bot',
  orchestratorActorId: 'actor-orchestrator-global',
  catActorId: 'actor-cat-cat-1',
  bossCatActorId: null,
  botToken: 'token',
  webhookSecret: null,
  inboundMode: 'polling',
  roomMode: 'direct_message',
  status: 'active',
  createdAt: '2026-09-02T00:00:00.000Z',
  updatedAt: '2026-09-02T00:00:00.000Z',
};

function createChatStore(): ChatStore {
  const state = {
    cats: [{ id: 'cat-1', name: 'Smelly', skillProfile: 'chat-default', status: 'active' }],
    channels: [],
  };
  return {
    async read() {
      return state as never;
    },
    async write(next: unknown) {
      return next as never;
    },
  } as unknown as ChatStore;
}

function createSurface(readiness?: { describe(): Promise<unknown> }) {
  return createTelegramCommandSurface({
    chatStore: createChatStore(),
    readiness: readiness as never,
  });
}

function statusInput() {
  return {
    text: '/status',
    chatId: '42',
    senderName: 'Kenny',
    binding: BINDING,
    locale: 'en' as const,
  };
}

// --- Ownership -----------------------------------------------------------------

test('transport commands are owned, product-intent commands are not', () => {
  const surface = createSurface();
  for (const command of ['/status', '/help', '/commands', '/start', '/mode agent']) {
    assert.equal(surface.owns(command), true, `${command} is transport-owned`);
  }
  for (const command of ['/work ship the changelog', '/chat', '/code']) {
    assert.equal(
      surface.owns(command),
      false,
      `${command} belongs to a product and must reach the bridge`,
    );
  }
  assert.equal(surface.owns('just a message'), false);
});

// --- What /status may claim ----------------------------------------------------

test('/status says delegation is off when the host has no golden path', async () => {
  const reply = await createSurface(undefined).handle(statusInput());
  assert.ok(reply);
  assert.match(reply.replyText, /Status: Connected/u);
  assert.match(reply.replyText, /Work delegation: not enabled on this host/u);
});

test('/status names every missing prerequisite rather than implying readiness', async () => {
  const reply = await createSurface({
    describe: async () => ({
      enabled: true,
      workspacePath: null,
      authorizedOwnerCount: 0,
      bindings: [{
        bindingId: 'binding-1',
        botName: 'cats_bot',
        deliveryMode: 'artifact_only',
        toolScope: 'none',
        readiness: {
          ready: false,
          blockers: [
            {
              reason: 'workspace_missing',
              remediationKey: 'workDelivery.readiness.workspaceMissing',
              remediationPath: '/settings/work',
            },
            {
              reason: 'owner_not_authorized',
              remediationKey: 'workDelivery.readiness.ownerNotAuthorized',
              remediationPath: '/settings/work',
            },
          ],
        },
      }],
    }),
  }).handle(statusInput());

  assert.ok(reply);
  assert.match(reply.replyText, /Work delegation: unavailable/u);
  // The localized reason text, not the raw code.
  assert.match(reply.replyText, /No project or workspace is selected\./u);
  assert.match(reply.replyText, /authorized/iu);
  assert.doesNotMatch(reply.replyText, /Work delegation: ready/u);
});

test('/status reports readiness only when the binding is actually ready', async () => {
  const reply = await createSurface({
    describe: async () => ({
      enabled: true,
      workspacePath: '/repos/cats',
      authorizedOwnerCount: 1,
      bindings: [{
        bindingId: 'binding-1',
        botName: 'cats_bot',
        deliveryMode: 'commit_only',
        toolScope: 'narrow_write',
        readiness: { ready: true, blockers: [] },
      }],
    }),
  }).handle(statusInput());

  assert.ok(reply);
  assert.match(reply.replyText, /Work delegation: ready/u);
});

test('a readiness lookup that fails is reported as unknown, never as ready', async () => {
  // FR-5: the bot must not imply the host can honour work when that is unknown.
  const reply = await createSurface({
    describe: async () => {
      throw new Error('runtime unreachable');
    },
  }).handle(statusInput());

  assert.ok(reply);
  assert.match(reply.replyText, /Work delegation: could not be checked/u);
  assert.doesNotMatch(reply.replyText, /Work delegation: ready/u);
});

test('a binding missing from the report is not reported as ready', async () => {
  const reply = await createSurface({
    describe: async () => ({
      enabled: true,
      workspacePath: '/repos/cats',
      authorizedOwnerCount: 1,
      bindings: [],
    }),
  }).handle(statusInput());

  assert.ok(reply);
  assert.doesNotMatch(reply.replyText, /Work delegation: ready/u);
  assert.match(reply.replyText, /Work delegation: unavailable/u);
});

test('an unowned message is not answered by the command surface', async () => {
  const reply = await createSurface().handle({ ...statusInput(), text: 'hello' });
  assert.equal(reply, null);
});
