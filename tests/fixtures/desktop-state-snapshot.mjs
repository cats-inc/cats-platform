import { normalizeImportedChatSnapshot } from '../../build/server/products/chat/state/store.js';
import { createDefaultChatState } from '../../build/server/products/chat/state/defaults.js';
import { createChannel } from '../../build/server/products/chat/state/model/index.js';

const NOW = new Date('2026-01-01T00:00:00.000Z');
export function snapshot() {
  let chat = createChannel(createDefaultChatState(), { originSurface: 'chat', title: 'One',
    topic: 'Isolated storage fixture', cats: [{ name: 'Fixture', provider: 'codex' }] }, NOW);
  chat = createChannel(chat, { originSurface: 'code', title: 'Two', topic: '',
    cats: [{ name: 'Second', provider: 'claude' }] }, NOW);
  for (const channel of chat.channels) {
    channel.messages = [{ id: `${channel.id}-message`, channelId: channel.id,
      senderKind: 'user', senderName: 'Owner', body: '公園 hello\u0000world', mentions: [],
      metadata: { opaque: { nested: [1, '雪'] } }, usage: null, createdAt: NOW.toISOString() }];
  }
  chat.parallelChatGroups = [{ id: 'fixture-parallel', title: 'Compare', mode: 'parallel',
    status: 'active', memberChannelIds: chat.channels.map(channel => channel.id),
    createdAt: NOW.toISOString(), updatedAt: NOW.toISOString(), lastMessageAt: NOW.toISOString() }];
  const result = normalizeImportedChatSnapshot(chat);
  result.setupCompleteAt = NOW.toISOString();
  return result;
}
