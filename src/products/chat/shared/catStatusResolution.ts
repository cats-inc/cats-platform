import type { ChatCat, ChatChannelView } from '../api/contracts.js';
import type { ChatOperatorView } from './operator-loop/types.js';
import { resolveChatLifecycleState, type ChatLifecycleState } from './lifecycle.js';
import { messageKeys, type MessageKey } from '../../../shared/i18n/index.js';

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
  statusLabelKey: MessageKey;
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
  let statusLabelKey: MessageKey;
  let busy = false;

  if (lifecycle === 'error') {
    status = 'error';
    statusLabelKey = messageKeys.chatCatStatusErrorLabel;
  } else if (hasPendingApproval) {
    status = 'waiting_for_review';
    statusLabelKey = messageKeys.chatCatStatusWaitingForReviewLabel;
  } else if (hasBlockedRun) {
    status = 'blocked';
    statusLabelKey = messageKeys.chatCatStatusBlockedLabel;
  } else if (lifecycle === 'awake') {
    status = 'active';
    statusLabelKey = messageKeys.chatCatStatusActiveLabel;
    busy = true;
  } else if (lifecycle === 'waking_up') {
    status = 'active';
    statusLabelKey = messageKeys.chatCatStatusWakingUpLabel;
    busy = true;
  } else if (lifecycle === 'sleeping') {
    status = 'sleeping';
    statusLabelKey = messageKeys.chatCatStatusSleepingLabel;
  } else {
    status = 'idle';
    statusLabelKey = messageKeys.chatCatStatusIdleLabel;
  }

  return {
    catId: cat.id,
    catName: cat.name,
    avatarColor: cat.avatarColor ?? null,
    status,
    statusLabelKey,
    busy,
  };
}
