import { DatabaseChatStore } from '../../build/server/products/chat/state/databaseStore.js';
const [file, channelId] = process.argv.slice(2);
const store = new DatabaseChatStore(file);
await store.initialize();
const release = await store.reserveConversationOperation(channelId);
if (!release) throw Error('The isolated operation target was missing');
process.stdout.write('reserved\n');
process.stdin.resume();
