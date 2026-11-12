import { DatabaseChatStore } from '../../build/server/products/chat/state/databaseStore.js';
const [profile, channelId, action, stopAt] = process.argv.slice(2);
const store = new DatabaseChatStore(profile);
process.on('disconnect', () => process.exit(1));
const hold = phase => {
  if (phase !== stopAt) return;
  process.send?.({ type: 'checkpoint', phase });
  return new Promise(() => {});
};
process.once('message', async () => {
  try {
    await store.archiveConversation(channelId, action, { checkpoint: phase => hold(phase), workerCheckpoint: phase => hold(`native:${phase}`) });
    process.send?.({ type: 'unexpected_completion' }); await store.close(); process.exit(0);
  } catch (error) { process.send?.({ type: 'error', code: error?.code ?? 'failed' }); await store.close(); process.exit(1); }
});
process.send?.({ type: 'ready' });
