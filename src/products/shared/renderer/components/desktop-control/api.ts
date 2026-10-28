/** SPEC-133 owner API. Every route requires the local owner, so other clients get 403. */
export const DESKTOP_CONTROL_API = '/api/desktop-control';

export type DesktopControlStatus = 'unavailable' | 'off' | 'not_injected' | 'injected' | 'active_turn' | 'holding';

export interface DesktopControlApp {
  name: string;
  path: string;
  publisher: string | null;
  tier: 'full' | 'observe_only';
}

export interface DesktopControlGrantRequest extends DesktopControlApp {
  requestId: string;
  query: string;
  reason: string;
  createdAt: string;
}

export interface DesktopControlState {
  available: boolean;
  reason: string | null;
  enabled: boolean;
  conversations: string[];
  conversation?: {
    channelId: string;
    enabled: boolean;
    status: DesktopControlStatus;
    reason: string | null;
    grants: Array<DesktopControlApp & { aumid: string | null }>;
    pendingRequests: DesktopControlGrantRequest[];
  };
}

async function request(path: string, init?: RequestInit): Promise<DesktopControlState> {
  const response = await fetch(`${DESKTOP_CONTROL_API}${path}`, {
    cache: 'no-store',
    credentials: 'same-origin',
    ...init,
    headers: { ...(init?.body ? { 'content-type': 'application/json' } : {}), ...init?.headers },
  });
  if (!response.ok) throw new Error(String(response.status));
  return await response.json() as DesktopControlState;
}

export const readDesktopControl = (channelId?: string) =>
  request(`/state${channelId ? `?channelId=${encodeURIComponent(channelId)}` : ''}`);

export const setDesktopControlEnabled = (enabled: boolean) =>
  request('/settings', { method: 'PUT', body: JSON.stringify({ enabled }) });

export const setConversationDesktopControl = (channelId: string, enabled: boolean) =>
  request(`/conversations/${encodeURIComponent(channelId)}`, { method: 'PUT', body: JSON.stringify({ enabled }) });

export const decideDesktopControlGrant = (channelId: string, requestId: string, decision: 'allow' | 'deny') =>
  request(`/grant-requests/${encodeURIComponent(requestId)}`, { method: 'POST', body: JSON.stringify({ decision, channelId }) });

export const stopDesktopControl = (channelId: string) =>
  request('/stop', { method: 'POST', body: JSON.stringify({ channelId }) });
