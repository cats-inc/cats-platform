/** SPEC-142 FR-15 to FR-18: a proposal's card, read and answered through owner-only routes. */

export interface ConversationProposalCardView {
  id: string;
  kind: string;
  status: 'open' | 'confirming' | 'confirmed' | 'declined' | 'expired' | 'stale' | 'failed';
  outOfDate: boolean;
  createdAt: string;
  expiresAt: string;
  decidedAt: string | null;
  refusal: string | null;
  proposer: { participantId: string; name: string | null } | null;
  view: {
    title: string;
    fields: Array<{ name: string; value: string | null }>;
    records: Array<{ kind: string; id: string | null; title: string | null }>;
    folderWarning: { folder: string; otherConversations: number; workItems: number } | null;
  } | null;
}

function proposalPath(channelId: string, proposalId: string): string {
  return `/api/channels/${encodeURIComponent(channelId)}/proposals/${encodeURIComponent(proposalId)}`;
}

/** Null when the card is gone. */
export async function fetchConversationProposal(
  channelId: string,
  proposalId: string,
  signal?: AbortSignal,
): Promise<ConversationProposalCardView | null> {
  const response = await fetch(proposalPath(channelId, proposalId), { headers: { Accept: 'application/json' }, signal });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Proposal returned ${response.status}`);
  return (await response.json() as { proposal: ConversationProposalCardView }).proposal;
}

export async function decideConversationProposal(
  channelId: string,
  proposalId: string,
  decision: 'confirm' | 'decline',
): Promise<{ status: string; refusal: string | null }> {
  const response = await fetch(`${proposalPath(channelId, proposalId)}/decision`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ decision }),
  });
  if (!response.ok) throw new Error(`Proposal decision returned ${response.status}`);
  const { outcome } = await response.json() as { outcome: { status: string; refusal?: string | null } };
  return { status: outcome.status, refusal: outcome.refusal ?? null };
}
