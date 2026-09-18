import { loadConfig } from '../../src/config.js';
import { createCat, createChannel } from '../../src/products/chat/state/model/index.js';
import { buildChannelView, summarizeParallelChatGroups } from '../../src/products/chat/state/model/readModels.js';
import { MemoryChatStore } from '../../src/products/chat/state/store.js';
import { createAppShell } from '../../src/products/chat/state/shell.js';
import { createAssumedReadyRuntimeSetupSummary } from '../../src/runtime/setup.js';

export async function createConversationNavigationFixture(root: string, includeChatModes = false) {
  const store = new MemoryChatStore();
  let state = await store.read();
  const ids: string[] = [];
  const providers = ['codex', 'claude', 'copilot', 'cursor'];
  const efforts = ['low', 'medium', 'high', 'max'];
  for (let index = 0; index < 4; index += 1) {
    state = createChannel(state, {
      title: `Conversation ${index + 1}`,
      originSurface: 'chat',
      topic: `Conversation ${index + 1}`,
      entryKind: 'default',
      pendingProvider: providers[index],
      pendingModel: `model-${index + 1}`,
      pendingInstance: 'cli/native',
      pendingModelSelection: {
        entryId: `model-${index + 1}`, entryMode: 'explicit',
        controls: { [`${providers[index]}.reasoning_effort`]: efforts[index] },
      },
      skipBossCatGreeting: true,
    }, new Date(`2026-09-18T01:00:0${index}.000Z`));
    const id = state.selectedChannelId;
    ids.push(id);
    state.channels.find((channel) => channel.id === id)!.messages.push({
      id: `message-${index}`, channelId: id, senderKind: 'agent', senderName: 'Assistant',
      body: `Transcript ${index + 1}`, mentions: [], metadata: {}, usage: null,
      createdAt: '2026-09-18T01:00:05.000Z',
    });
  }
  if (includeChatModes) {
    for (const name of ['Fixture Cat One', 'Fixture Cat Two']) {
      state = createCat(state, { name, provider: 'codex', model: 'model-1' });
    }
    const catIds = state.cats.map((cat) => cat.id);
    for (const entryKind of ['direct', 'group'] as const) {
      state = createChannel(state, {
        title: `${entryKind} fixture`, topic: '', originSurface: 'chat', entryKind,
        roomMode: entryKind === 'direct' ? 'direct_message' : 'chat_channel',
        participantCatIds: entryKind === 'direct' ? [catIds[0]] : catIds,
        skipBossCatGreeting: true,
      });
      const id = state.selectedChannelId;
      state.channels.find((channel) => channel.id === id)!.messages.push({
        id: `${entryKind}-message`, channelId: id, senderKind: 'agent', senderName: 'Fixture Cat',
        body: `${entryKind} transcript`, mentions: [], metadata: {}, usage: null,
        createdAt: '2026-09-18T01:00:05.000Z',
      });
    }
  }
  await store.write(state);
  const config = loadConfig({ CATS_PLATFORM_DIR: root, CATS_RUNTIME_DIR: `${root}/runtime`, CATS_DESKTOP_DIR: `${root}/desktop` });
  const runtime = { baseUrl: 'http://127.0.0.1:3110', reachable: true, status: 'ok', service: 'cats-runtime' };
  const payload = (id = ids[0], scope = 'navigation-test') => createAppShell(config, runtime,
    { ...state, selectedChannelId: id }, new Date('2026-09-18T01:00:05.000Z'), {
      scopeId: scope, setupCompleteAt: '2026-09-18T01:00:00.000Z', ownerDisplayName: 'Test Owner',
      ownerAvatarColor: null, runtimeSetup: createAssumedReadyRuntimeSetupSummary(),
    });
  const snapshot = (id: string) => ({ selectedChannelId: id, selectedChannel: buildChannelView(state, id),
    parallelChatGroups: summarizeParallelChatGroups(state, id) });
  return { ids, state, store, config, payload, snapshot };
}
