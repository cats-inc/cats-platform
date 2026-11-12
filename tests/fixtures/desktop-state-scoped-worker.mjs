import { randomUUID } from 'node:crypto';
import { DatabaseChatStore } from '../../build/server/products/chat/state/databaseStore.js';
const [file, id, count] = process.argv.slice(2);
const store = new DatabaseChatStore(file);
try {
  await store.initialize();
  for (let index = 0; index < Number(count); index++) {
    await store.updateChannel(id, channel => {
      const next = channel.messages.length + 1;
      channel.title = `Count ${next}`;
      channel.messages.push({ ...structuredClone(channel.messages[0]), id: randomUUID(),
        body: `Concurrent scoped ${next}`, createdAt: new Date().toISOString(), metadata: {} });
      channel.updatedAt = channel.messages.at(-1).createdAt;
      return { channel };
    });
  }
} finally { await store.close(); }
