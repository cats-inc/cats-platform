import type { ConversationSessionDelegate } from '../../../shared/conversationSessionDelegate.js';
import type { ChatStore } from './store.js';
import { createChannel } from './model/index.js';
import { syncCoreStateWithChatState } from './core-projection/index.js';
import { activateChannelSessions } from './runtime-session/activation.js';
import { mergeCompletedDispatchState } from './runtime-dispatch/merge.js';
import { resolveOrchestratorLeaseAttachment } from '../shared/channelParticipants.js';

/** Code's fixed opening operation reuses the ordinary conversation/session engine. */
export function createConversationSessionDelegate(store: ChatStore, runtimeDataDir?: string): ConversationSessionDelegate {
  return {
    available: Boolean(store.updateSnapshot),
    async admit(input, existing, persist) {
      if (!store.updateSnapshot) throw new Error('atomic_store_required');
      await store.updateSnapshot(({ chat, core }) => {
        if (existing(core)) return { chat, core };
        const next = createChannel(chat, { title: 'Code', topic: '', originSurface: 'code', entryKind: 'default',
          repoPath: input.cwd, pendingProvider: input.target.provider,
          pendingInstance: input.target.instance, pendingModel: input.target.model ?? undefined,
          skipBossCatGreeting: true }, new Date(), { prevalidatedRuntimePolicy: input.policy });
        return { chat: next, core: persist(syncCoreStateWithChatState(next, core), next.selectedChannelId) };
      });
    },
    async inspect(channelId, check) {
      let valid = false;
      if (!store.updateSnapshot) return false;
      await store.updateSnapshot(({ chat, core }) => {
        const channel = chat.channels.find(row => row.id === channelId);
        valid = check(core, channel ? { id: channel.id, origin: channel.originSurface ?? '',
          archived: channel.status === 'archived', cwd: channel.repoPath,
          workspaceKind: channel.runtimeWorkspaceKind ?? null, workspaceAccess: channel.runtimeWorkspaceAccess ?? null,
          permissionMode: channel.runtimePermissionMode ?? null,
          sessionId: resolveOrchestratorLeaseAttachment(channel)?.sessionId ?? null } : null);
        return { chat, core };
      });
      return valid;
    },
    async activate(channelId, runtime) {
      if (!store.updateSnapshot) throw new Error('atomic_store_required');
      const baseline = await store.read();
      const activation = await activateChannelSessions(baseline, channelId, runtime, new Date(), { runtimeDataDir });
      await store.updateSnapshot(({ chat, core }) => ({ core,
        chat: mergeCompletedDispatchState(chat, baseline, activation.state, channelId, new Date()) }));
    },
  };
}
