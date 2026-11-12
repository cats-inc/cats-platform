import { matchRoute, sendJson, sendMethodNotAllowed } from '../../../../shared/http.js';
import { assertConversationWritable } from '../../shared/conversationArchive.js';
import type { ChatApiRouteContext } from '../routeSupport.js';
import { ChatApiError, handleRestError } from '../routeErrors.js';
import { publishRoomMutation } from '../transportEventPublisher.js';
import { ConversationArchiveError } from '../../state/database/archiveJobs.js';

export async function assertChannelWritable(context: ChatApiRouteContext, channelId: string): Promise<void> {
  const store = context.dependencies.chatStore;
  const channel = store.readChannelHeader ? await store.readChannelHeader(channelId)
    : (await store.read()).channels.find(channel => channel.id === channelId);
  if (!channel) throw new ChatApiError(404, 'channel_not_found', 'The selected conversation is unavailable.');
  assertConversationWritable(channel);
}

/** The platform's ordinary product authentication/CSRF gate owns admission. */
export async function routeConversationArchive(context: ChatApiRouteContext): Promise<boolean> {
  const match = matchRoute(context.url.pathname, /^\/api\/channels\/([^/]+)\/(archive|unarchive)$/u);
  if (!match) return false;
  if (context.method !== 'POST') { sendMethodNotAllowed(context.response, ['POST']); return true; }
  const controller = new AbortController();
  const channelId = match[0]!;
  let attempted = false;
  const abort = () => { if (!context.response.writableEnded) controller.abort(); };
  context.request.once('aborted', abort); context.response.once('close', abort);
  try {
    if (context.request.aborted || context.response.destroyed) { controller.abort(); return true; }
    const store = context.dependencies.chatStore;
    if (!store.archiveConversation) throw new ChatApiError(501, 'archive_unavailable', 'This store does not support conversation archives.');
    const result = await context.dependencies.mutationGate.run(channelId, () => {
      if (controller.signal.aborted) throw new ConversationArchiveError('archive_cancelled');
      attempted = true;
      return store.archiveConversation!(channelId, match[1] === 'archive' ? 'archive' : 'restore', { signal: controller.signal });
    });
    sendJson(context.response, 200, result);
  } catch (error) { if (!controller.signal.aborted) handleRestError(context, error); }
  finally {
    context.request.removeListener('aborted', abort); context.response.removeListener('close', abort);
    // A durable handoff may have committed even when the requesting transport
    // disappears. Other subscriptions must reconcile after every terminal attempt.
    if (attempted) {
      publishRoomMutation(context.dependencies.eventHub, channelId, 'updated');
      context.dependencies.eventHub?.emit({ kind: 'recents_changed', channelId, timestamp: new Date().toISOString() });
    }
  }
  return true;
}
