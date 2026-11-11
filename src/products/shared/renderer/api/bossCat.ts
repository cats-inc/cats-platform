/** SPEC-139 FR-10: the owner's join card, read and answered through owner-only routes. */

export interface BossCatJoinRequestView {
  id: string;
  status: 'pending' | 'approved' | 'declined' | 'expired' | 'refused';
  requestedVia: 'desktop' | 'mobile';
  createdAt: string;
  expiresAt: string;
  decidedAt: string | null;
  refusal: string | null;
  conversation: {
    id: string;
    title: string;
    surface: string;
    participantNames: string[];
    archived: boolean;
  } | null;
  grants: {
    repoPath: string | null;
    workspaceAccess: string;
    permissionMode: string;
    codeTools: boolean;
  } | null;
  bossCat: {
    id: string;
    name: string;
    provider: string;
    model: string | null;
    mcpProfile: string | null;
    skillProfile: string | null;
    companionMemory: boolean;
  } | null;
  history: { messagesBeforeJoin: number };
}

function requestPath(laneId: string, requestId: string): string {
  return `/api/channels/${encodeURIComponent(laneId)}/boss-cat/join-requests/${encodeURIComponent(requestId)}`;
}

/** Null when the card is gone. */
export async function fetchBossCatJoinRequest(
  laneId: string,
  requestId: string,
  signal?: AbortSignal,
): Promise<BossCatJoinRequestView | null> {
  const response = await fetch(requestPath(laneId, requestId), { headers: { Accept: 'application/json' }, signal });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Boss Cat join request returned ${response.status}`);
  return (await response.json() as { request: BossCatJoinRequestView }).request;
}

export async function decideBossCatJoinRequest(
  laneId: string,
  requestId: string,
  decision: 'approve' | 'decline',
): Promise<{ status: string; refusal?: string }> {
  const response = await fetch(`${requestPath(laneId, requestId)}/decision`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ decision }),
  });
  if (!response.ok) throw new Error(`Boss Cat join decision returned ${response.status}`);
  return (await response.json() as { outcome: { status: string; refusal?: string } }).outcome;
}
