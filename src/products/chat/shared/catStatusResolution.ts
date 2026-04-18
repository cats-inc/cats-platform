import type { ChatCat, ChatChannelView } from '../api/contracts.js';
import type { ChatOperatorView } from './operator-loop/types.js';
import { resolveChatLifecycleState, type ChatLifecycleState } from './lifecycle.js';

export type CatStatusKind =
  | 'active'
  | 'blocked'
  | 'waiting_for_review'
  | 'idle'
  | 'sleeping'
  | 'error';

export interface CatStatusIndicator {
  catId: string;
  catName: string;
  avatarColor: string | null;
  status: CatStatusKind;
  statusLabel: string;
  busy: boolean;
}

export type CatStatusChannelView = Pick<ChatChannelView, 'catAssignments'>;
export type CatStatusOperatorView = Pick<ChatOperatorView, 'approvals' | 'latestRun'>;

export function resolveCatStatusIndicator(
  cat: ChatCat,
  channel: CatStatusChannelView,
  operatorView: CatStatusOperatorView | null,
): CatStatusIndicator {
  const assignment = channel.catAssignments?.find((a) => a.catId === cat.id);
  const leaseStatus = assignment?.execution?.lease?.status ?? 'not_started';
  const lifecycle: ChatLifecycleState = resolveChatLifecycleState(leaseStatus);

  // Check operator-level state for blocked/review conditions
  const hasPendingApproval = operatorView?.approvals.some(
    (a) => a.status === 'pending',
  ) ?? false;

  const hasBlockedRun = operatorView?.latestRun?.status === 'blocked';

  let status: CatStatusKind;
  let statusLabel: string;
  let busy = false;

  if (lifecycle === 'error') {
    status = 'error';
    statusLabel = 'Error';
  } else if (hasPendingApproval) {
    status = 'waiting_for_review';
    statusLabel = 'Waiting for review';
  } else if (hasBlockedRun) {
    status = 'blocked';
    statusLabel = 'Blocked';
  } else if (lifecycle === 'awake') {
    status = 'active';
    statusLabel = 'Active';
    busy = true;
  } else if (lifecycle === 'waking_up') {
    status = 'active';
    statusLabel = 'Waking up';
    busy = true;
  } else if (lifecycle === 'sleeping') {
    status = 'sleeping';
    statusLabel = 'Sleeping';
  } else {
    status = 'idle';
    statusLabel = 'Idle';
  }

  return {
    catId: cat.id,
    catName: cat.name,
    avatarColor: cat.avatarColor ?? null,
    status,
    statusLabel,
    busy,
  };
}
