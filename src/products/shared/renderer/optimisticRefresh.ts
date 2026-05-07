import type { AppShellPayload } from '../api/workspaceContracts.js';
import { listPendingOptimisticSends } from './pendingOptimisticSends.js';
import { preserveOptimisticUserMessageAfterRefresh } from './workspaceChatUtils.js';

export function preservePendingOptimisticSendsAfterWorkspaceRefresh(
  previousPayload: AppShellPayload,
  refreshedPayload: AppShellPayload,
): AppShellPayload {
  let nextPayload: AppShellPayload = refreshedPayload;
  for (const pendingSend of listPendingOptimisticSends()) {
    nextPayload = preserveOptimisticUserMessageAfterRefresh(
      previousPayload,
      nextPayload,
      pendingSend.channelId,
    );
  }

  return nextPayload;
}
