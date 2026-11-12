import type { RuntimeClient } from '../../../platform/runtime/client.js';
import type { ChatStore } from '../state/store.js';
import { collectParticipantSessionIds } from '../shared/channelParticipants.js';
import { readConversationMetadata } from './scopedConversationState.js';

/** Track creation independently of whether setup reached a persisted lease. */
export function trackCreatedRuntimeSessions(client: RuntimeClient) {
  const pending = new Set<string>();
  const runtimeClient = new Proxy(client, { get(target, property) {
    if (property === 'createSession') return async (...args: Parameters<RuntimeClient['createSession']>) => {
      const session = await client.createSession(...args); pending.add(session.id); return session;
    };
    if (property === 'closeSession') return async (...args: Parameters<RuntimeClient['closeSession']>) => {
      const result = await client.closeSession(...args); pending.delete(args[0]); return result;
    };
    const value = Reflect.get(target, property, target);
    return typeof value === 'function' ? value.bind(target) : value;
  } });
  return { runtimeClient, pending };
}

/** Recover/read current attachment proof before cleaning up a possibly committed operation. */
export async function closeUnreferencedConversationSessions(dependencies: {
  chatStore: ChatStore; runtimeClient: Pick<RuntimeClient, 'closeSession'>;
}, channelId: string, sessionIds: readonly string[]): Promise<void> {
  if (!sessionIds.length) return;
  let retained: Set<string>;
  try {
    const store = dependencies.chatStore;
    const header = store.readChannelHeader ? await store.readChannelHeader(channelId)
      : (await readConversationMetadata(store, channelId)).channels.find(channel => channel.id === channelId);
    retained = new Set(header ? collectParticipantSessionIds(header) : []);
  } catch {
    process.stderr.write('[cats-channel-session] Runtime cleanup needs a verified current conversation\n');
    return;
  }
  for (const id of new Set(sessionIds)) {
    if (!retained.has(id)) {
      try { await dependencies.runtimeClient.closeSession(id); }
      catch { process.stderr.write('[cats-channel-session] failed to close an uncommitted Runtime session\n'); }
    }
  }
}
