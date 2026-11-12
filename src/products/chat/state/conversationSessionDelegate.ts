import type { ConversationSessionDelegate } from '../../../shared/conversationSessionDelegate.js';
import type { ChatStore } from './store.js';
import { createChannel } from './model/index.js';
import { syncCoreStateWithChatState } from './core-projection/index.js';
import { activateChannelSessions } from './runtime-session/activation.js';
import { createLockedDispatchChatStore } from './runtime-dispatch/merge.js';
import { readWritableConversationState } from '../api/scopedConversationState.js';
import { closeUnreferencedConversationSessions, trackCreatedRuntimeSessions } from '../api/conversationRuntimeCleanup.js';
import {
  resolveChannelParticipantAssignments,
  resolveParticipantLeaseAttachment,
} from '../shared/channelParticipants.js';
import type { ChatChannelState } from '../api/contracts.js';
import { resolveChannelProductScope } from '../shared/channelTopology.js';

/** A Code session runs in its conversation's one participant, the target it opened with. */
function resolveCodeSessionId(channel: Pick<ChatChannelState, 'participantAssignments' | 'catAssignments'>): string | null {
  const participant = resolveChannelParticipantAssignments(channel)
    .find((assignment) => assignment.status === 'active');
  return participant ? resolveParticipantLeaseAttachment(channel, participant.participantId)?.sessionId ?? null : null;
}

/** Code's fixed opening operation reuses the ordinary conversation/session engine. */
export function createConversationSessionDelegate(store: ChatStore, runtimeDataDir?: string): ConversationSessionDelegate {
  return {
    available: Boolean(store.updateSnapshot),
    async admit(input, existing, persist) {
      if (!store.updateSnapshot) throw new Error('atomic_store_required');
      await store.updateSnapshot(({ chat, core }) => {
        if (existing(core)) return { chat, core };
        const next = createChannel(chat, { title: 'Code', topic: '', originSurface: 'code', entryKind: 'default',
          repoPath: input.cwd,
          temporaryParticipants: [{ name: '', provider: input.target.provider,
            instance: input.target.instance ?? undefined, model: input.target.model ?? undefined }] },
          new Date(), { prevalidatedRuntimePolicy: input.policy });
        return { chat: next, core: persist(syncCoreStateWithChatState(next, core), next.selectedChannelId) };
      });
    },
    async inspect(channelId, check) {
      let valid = false;
      if (!store.updateSnapshot) return false;
      const project = (channel: Omit<ChatChannelState, 'messages'> | undefined) => channel ? {
          id: channel.id, origin: channel.originSurface ?? '',
          scope: resolveChannelProductScope(channel),
          archived: channel.status === 'archived', cwd: channel.repoPath,
          workspaceKind: channel.runtimeWorkspaceKind ?? null, workspaceAccess: channel.runtimeWorkspaceAccess ?? null,
          permissionMode: channel.runtimePermissionMode ?? null,
          executionPolicy: channel.runtimeExecutionPolicy ?? undefined,
          sessionId: resolveCodeSessionId(channel) } : null;
      if (store.readCatalog) {
        const catalog = await store.readCatalog();
        return check(catalog.core, project(catalog.headers.find(row => row.id === channelId)));
      }
      await store.updateSnapshot(({ chat, core }) => {
        valid = check(core, project(chat.channels.find(row => row.id === channelId)));
        return { chat, core };
      });
      return valid;
    },
    async activate(channelId, runtime) {
      if (!store.updateSnapshot) throw new Error('atomic_store_required');
      const baseline = await readWritableConversationState(store, channelId);
      const tracked = trackCreatedRuntimeSessions(runtime), now = new Date();
      try {
        const activation = await activateChannelSessions(baseline, channelId, tracked.runtimeClient, now, { runtimeDataDir });
        await createLockedDispatchChatStore(store, channelId, baseline, () => now, tracked.runtimeClient).write(activation.state);
      } finally {
        await closeUnreferencedConversationSessions({ chatStore: store, runtimeClient: tracked.runtimeClient },
          channelId, [...tracked.pending]);
      }
    },
  };
}
