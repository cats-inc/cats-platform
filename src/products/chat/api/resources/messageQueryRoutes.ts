import { sendJson, sendMethodNotAllowed } from '../../../../shared/http.js';
import { redactConversationProposalCards } from '../../state/conversationProposals.js';
import { DEFAULT_MESSAGE_PAGE_SIZE, MAX_MESSAGE_PAGE_SIZE, MAX_MESSAGE_SEARCH_RESULTS } from '../../shared/transcript.js';
import { ChatApiError, handleRestError } from '../routeErrors.js';
import type { ChatApiRouteContext } from '../routeSupport.js';
import { presentedChannelWindow } from '../presentationReadModels.js';

function parameter(context: ChatApiRouteContext, name: string): string | undefined {
  const values = context.url.searchParams.getAll(name);
  if (values.length > 1) throw new ChatApiError(400, 'bad_request', `Only one ${name} parameter is allowed.`);
  return values[0];
}

function limitParameter(context: ChatApiRouteContext, maximum: number): number {
  const text = parameter(context, 'limit');
  if (text === undefined) return DEFAULT_MESSAGE_PAGE_SIZE;
  if (!/^[1-9]\d{0,2}$/u.test(text) || Number(text) > maximum) {
    throw new ChatApiError(400, 'bad_request', `limit must be an integer from 1 to ${maximum}.`);
  }
  return Number(text);
}

export async function handleMessagePage(context: ChatApiRouteContext, channelId: string): Promise<void> {
  try {
    const limit = limitParameter(context, MAX_MESSAGE_PAGE_SIZE);
    const before = parameter(context, 'before');
    const store = context.dependencies.chatStore;
    if (!store.readMessagePage) throw new ChatApiError(501, 'transcript_query_unavailable', 'This store does not support transcript paging.');
    const window = store.readMessageWindow ? await store.readMessageWindow(channelId, limit, before) : null;
    const page = window ? { ...window.page, displayMessages: presentedChannelWindow(window).messages }
      : await store.readMessagePage(channelId, limit, before);
    sendJson(context.response, 200, { ...page, messages: redactConversationProposalCards(page.messages),
      ...(page.displayMessages ? { displayMessages: redactConversationProposalCards(page.displayMessages) } : {}) });
  } catch (error) { handleRestError(context, error); }
}

/** Routed behind the host's normal product authentication gate. */
export async function routeMessageSearch(context: ChatApiRouteContext): Promise<boolean> {
  if (context.url.pathname !== '/api/conversations/messages/search') return false;
  if (context.method !== 'GET') { sendMethodNotAllowed(context.response, ['GET']); return true; }
  try {
    const query = parameter(context, 'q');
    if (query === undefined || query.length > 200) throw new ChatApiError(400, 'bad_request', 'q is required and accepts at most 200 characters.');
    const channelId = parameter(context, 'channelId');
    if (channelId !== undefined && (!channelId.trim() || channelId.length > 256)) throw new ChatApiError(400, 'bad_request', 'Invalid channelId.');
    const limit = limitParameter(context, MAX_MESSAGE_SEARCH_RESULTS);
    const store = context.dependencies.chatStore;
    if (!store.searchMessages) throw new ChatApiError(501, 'transcript_query_unavailable', 'This store does not support transcript search.');
    const hits = await store.searchMessages(query, { channelId, limit });
    sendJson(context.response, 200, { hits: hits.map(hit => ({ channelId: hit.channelId,
      message: redactConversationProposalCards([hit.message])[0]! })) });
  } catch (error) { handleRestError(context, error); }
  return true;
}
