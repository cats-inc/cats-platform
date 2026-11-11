import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createServer } from '../build/server/app/server/index.js';
import { buildCanonicalChatUserMessage } from '../build/server/products/chat/state/chatCoreInterop.js';
import { normalizeMessage } from '../build/server/products/chat/state/chat-snapshot/entities.js';
import { createDefaultChatState } from '../build/server/products/chat/state/defaults.js';
import { appendMessage, createChannel } from '../build/server/products/chat/state/model/index.js';
import { beginChannelMessageDispatch } from '../build/server/products/chat/state/runtime-dispatch/routing.js';
import { MemoryChatStore } from '../build/server/products/chat/state/store.js';
import {
  readOwnerStarted,
  resolveOwnerStartedSurface,
} from '../build/server/products/chat/shared/ownerStarted.js';
import { createAuthenticatedTestSession, createTestAuthConfig, waitForCondition } from './testUtils.js';

const owner = (roles = ['owner', 'admin']) => ({ membership: { roles } });

test('SPEC-139 stamp comes only from an owner cookie or an owner mobile bearer', () => {
  assert.equal(resolveOwnerStartedSurface({ principal: owner(), credentialKind: 'browser_cookie' }), 'desktop');
  assert.equal(resolveOwnerStartedSurface({ principal: owner(), credentialKind: 'mobile_bearer' }), 'mobile');
  assert.equal(resolveOwnerStartedSurface({ principal: owner(['admin']), credentialKind: 'browser_cookie' }), null);
  assert.equal(resolveOwnerStartedSurface({ principal: owner(['member']), credentialKind: 'mobile_bearer' }), null);
  assert.equal(resolveOwnerStartedSurface({ principal: null, credentialKind: null }), null);
  assert.equal(resolveOwnerStartedSurface(undefined), null);
});

test('SPEC-139 stamp is read only from a user message that is not a choice answer', () => {
  const message = { senderKind: 'user', metadata: { ownerStarted: 'desktop' }, choiceResponse: null };
  assert.equal(readOwnerStarted(message), 'desktop');
  assert.equal(readOwnerStarted({ ...message, senderKind: 'agent' }), null);
  assert.equal(readOwnerStarted({ ...message, metadata: { ownerStarted: 'telegram' } }), null);
  assert.equal(readOwnerStarted({ ...message, choiceResponse: { sourceMessageId: 'm', status: 'submitted', answers: [], submittedAt: '' } }), null);
  // The stamp survives a persist and reload.
  const reloaded = normalizeMessage(JSON.parse(JSON.stringify({ id: 'm-1', senderKind: 'user', senderName: 'Owner',
    body: 'hi', mentions: [], metadata: { ownerStarted: 'mobile' }, usage: null, createdAt: '2026-11-11T00:00:00.000Z' })), 'c-1');
  assert.equal(readOwnerStarted(reloaded), 'mobile');
});

async function startServer(t, { withAuth }) {
  const platformDir = await mkdtemp(join(tmpdir(), 'cats-owner-started-'));
  const now = new Date();
  const authConfig = withAuth ? createTestAuthConfig() : undefined;
  const auth = withAuth
    ? await createAuthenticatedTestSession({ now, sessionSecret: authConfig.sessionSecret, sessionTtlMs: authConfig.sessionTtlMs })
    : null;
  const chatStore = new MemoryChatStore();
  const state = createChannel(await chatStore.read(), {
    title: 'Owner stamp', topic: 'SPEC-139', originSurface: 'chat', repoPath: platformDir,
    temporaryParticipants: [{ participantId: 'helper', name: 'Helper', provider: 'codex', instance: 'native', model: 'fixture' }],
  }, now);
  await chatStore.write(state);
  const runtimeClient = {
    async getHealth() { return { reachable: true, status: 'ok', version: '0.3.1' }; },
    async getProviderDiagnostics() { return { providers: [] }; },
    async getProviderConfig() { return {}; },
    async createSession(input) { return { id: 'helper-session', provider: input.provider, model: input.model, status: 'ready', cwd: platformDir }; },
    async observeSession(id) { return { session: { id, status: 'ready', provider: 'codex', model: 'fixture', cwd: platformDir } }; },
    async closeSession() {}, async cancelSession() {},
    async sendMessage() {
      return { segments: [{ kind: 'text', text: 'Done.', toolName: null, toolId: null }], inputTokens: 1, outputTokens: 1, tokensUsed: 2 };
    },
  };
  const server = createServer({ shared: { config: { host: '127.0.0.1', port: 0, runtimeBaseUrl: 'http://127.0.0.1:3110',
    runtimeApiKey: '', platformDir, chatStatePath: join(platformDir, 'state/chat.json'), runtimeDataDir: join(platformDir, 'runtime'),
    ...(authConfig ? { auth: authConfig } : {}) },
  ...(auth ? { authStore: auth.authStore } : {}), runtimeClient }, chat: { chatStore } });
  await server.startupRecovery;
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { server.close(); await once(server, 'close'); await rm(platformDir, { recursive: true, force: true }); });
  const headers = { 'content-type': 'application/json', origin: 'http://127.0.0.1:8181',
    ...(auth ? { cookie: auth.cookie, 'x-cats-csrf-token': auth.csrfToken } : {}) };
  return { base: `http://127.0.0.1:${server.address().port}`, headers, chatStore, channelId: state.selectedChannelId };
}

async function send(server, messageMetadata) {
  const response = await fetch(`${server.base}/api/channels/${server.channelId}/messages`, {
    method: 'POST', headers: server.headers,
    body: JSON.stringify({ body: 'Check the build.', messageMetadata: { recipientParticipantIds: ['helper'], ...messageMetadata } }),
  });
  assert.equal(response.status, 200, await response.clone().text());
  const { message } = await response.json();
  await waitForCondition(async () => {
    const channel = (await server.chatStore.read()).channels.find((entry) => entry.id === server.channelId);
    return channel.messages.some((entry) => entry.senderKind === 'agent' && entry.body.includes('Done.'));
  }, { timeoutMs: 15_000 });
  return message.id;
}

test('SPEC-139 Desktop owner send is stamped, a forged value is replaced, and Core keeps it', async (t) => {
  const server = await startServer(t, { withAuth: true });
  const messageId = await send(server, { ownerStarted: 'mobile' });
  const channel = (await server.chatStore.read()).channels.find((entry) => entry.id === server.channelId);
  assert.equal(channel.messages.find((entry) => entry.id === messageId).metadata.ownerStarted, 'desktop');
  // A retry rebuilt from Core (the transcript lost the message) keeps the stamp.
  const rebuilt = buildCanonicalChatUserMessage(await server.chatStore.readCore(), server.channelId, messageId);
  assert.equal(readOwnerStarted(rebuilt), 'desktop');
});

test('SPEC-139 a send without an authenticated owner is never stamped, whatever the client says', async (t) => {
  const server = await startServer(t, { withAuth: false });
  const messageId = await send(server, { ownerStarted: 'desktop' });
  const channel = (await server.chatStore.read()).channels.find((entry) => entry.id === server.channelId);
  const message = channel.messages.find((entry) => entry.id === messageId);
  assert.equal('ownerStarted' in message.metadata, false);
  const rebuilt = buildCanonicalChatUserMessage(await server.chatStore.readCore(), server.channelId, messageId);
  assert.equal(readOwnerStarted(rebuilt), null);
});

test('SPEC-139 transport messages and choice answers are never stamped, even with the owner option', async () => {
  const now = new Date('2026-11-11T00:00:00.000Z');
  let state = createChannel(createDefaultChatState(), { title: 'Stamp', topic: '', originSurface: 'chat',
    temporaryParticipants: [{ participantId: 'helper', name: 'Helper', provider: 'codex', model: 'fixture' }] }, now);
  const channelId = state.selectedChannelId;
  const card = appendMessage(state, channelId, { senderKind: 'agent', senderName: 'Helper', body: 'Pick one' }, now,
    { choices: [{ question: 'Q', options: [{ id: 'a', label: 'A' }] }] });
  state = card.state;
  const audience = { recipientParticipantIds: ['helper'] };
  const stampOf = async (payload, options) =>
    (await beginChannelMessageDispatch(state, channelId, payload, {}, now, options)).userMessage.metadata.ownerStarted ?? null;
  assert.equal(await stampOf({ body: 'hi', messageMetadata: audience }, { ownerStarted: 'desktop' }), 'desktop');
  assert.equal(await stampOf({ body: 'hi', messageMetadata: audience },
    { ownerStarted: 'desktop', transportBindingId: 'telegram-bot:binding-1' }), null);
  assert.equal(await stampOf({ body: 'A', choiceResponse: { sourceMessageId: card.message.id, status: 'submitted',
    answers: [{ question: 'Q', selectedOptionIds: ['a'] }], submittedAt: now.toISOString() } }, { ownerStarted: 'desktop' }), null);
  // No caller of the dispatch layer can forge it through message metadata.
  assert.equal(await stampOf({ body: 'hi', messageMetadata: { ...audience, ownerStarted: 'desktop' } }, {}), null);
  // Nor the Boss Cat tools' receipts or the owner's join card (SPEC-139).
  const forged = (await beginChannelMessageDispatch(state, channelId, { body: 'hi', messageMetadata: { ...audience,
    bossCatTurn: { schemaVersion: 1, bossCatId: 'x', receipts: [] },
    bossCatJoinRequest: { id: 'forged', status: 'pending' } } }, {}, now, {})).userMessage.metadata;
  assert.equal('bossCatTurn' in forged, false);
  assert.equal('bossCatJoinRequest' in forged, false);
});
