// Real process/crash fixture. Usage: node <script> <temporary-profile> <increments> [hold-checkpoint].
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { DatabaseChatStore } from '../../build/server/products/chat/state/databaseStore.js';

const [profile, countText, checkpoint] = process.argv.slice(2);
const count = Number(countText);
if (checkpoint === 'unsupported_sqlite') {
  const original = process.getBuiltinModule;
  process.getBuiltinModule = name => name === 'node:sqlite' ? undefined : original(name);
}
if (!profile || !Number.isSafeInteger(count) || count < 0 || count > 100) throw new Error('Invalid explicit fixture arguments');
const store = new DatabaseChatStore(profile, { onFatal(error) {
  if (checkpoint === 'unsupported_sqlite') console.log(error.code);
}, checkpoint: async stage => {
  if (stage !== checkpoint) return;
  console.log('ready');
  await new Promise(() => { setInterval(() => {}, 10_000); });
} });
try {
  await store.initialize();
  for (let index = 0; index < count; index++) {
    await store.updateSnapshot(({ chat, core }) => {
      const number = Number(core.ownerProfile.displayName);
      const total = chat.channels.reduce((sum, channel) => sum + channel.messages.length, 0);
      assert.equal(total, number + 2, 'JSON Core and SQLite conversation rows must agree');
      core.ownerProfile.displayName = String(number + 1);
      const channel = chat.channels[0];
      channel.messages.push({ id: randomUUID(), channelId: channel.id, senderKind: 'user',
        senderName: 'Fixture', body: `increment ${number + 1}`, mentions: [], metadata: {},
        usage: null, createdAt: new Date().toISOString() });
      return { chat, core };
    });
  }
} finally { await store.close(); }
