import type { BoundProviderInteraction, BoundInteractionResponse, ProviderConversationSnapshot, SessionCapabilitiesSnapshot } from '../../../../../shared/providerInteractions.js';

export const conversationControlPath = (id: string) => `/api/provider-interactions/conversations/${encodeURIComponent(id)}`;
async function request<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(path, { cache: 'no-store', credentials: 'same-origin',
    ...(body === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error('Provider control unavailable.');
  return await response.json() as T;
}
export const readProviderConversation = (id: string) => request<ProviderConversationSnapshot>(conversationControlPath(id));
export const readProviderCapabilities = (conversationId: string, sessionId: string, refresh = false) => request<SessionCapabilitiesSnapshot>(
  `${conversationControlPath(conversationId)}/sessions/${encodeURIComponent(sessionId)}/capabilities${refresh ? '?refresh=true' : ''}`);
const requestPath = (i: BoundProviderInteraction) => `${conversationControlPath(i.binding.conversationId)}/sessions/${encodeURIComponent(i.sessionId)}/requests/${encodeURIComponent(i.interactionId)}`;
export async function respondProviderRequest(i: BoundProviderInteraction, body: BoundInteractionResponse): Promise<void> {
  await request(`${requestPath(i)}/respond`, body);
}
export async function openProviderUrl(i: BoundProviderInteraction): Promise<void> {
  // Opening is a distinct owner action and never submits an answer.
  const { url } = await request<{ url: string }>(`${requestPath(i)}/url`, {
    binding: i.binding, workerGeneration: i.workerGeneration, executionId: i.executionId, expectedRevision: i.revision,
  });
  const parsed = new URL(url);
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error('Unsupported URL');
  window.open(parsed.href, '_blank', 'noopener,noreferrer');
}
