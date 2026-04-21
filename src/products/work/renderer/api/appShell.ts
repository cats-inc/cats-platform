export * from '../../../shared/renderer/api/appShell.js';

import type { AppShellPayload } from '../../api/contracts.js';
import type { SurfaceConversationBehaviorPatch } from '../../../shared/conversationBehavior.js';
import { updateConversationBehaviorPreference as updateWorkspaceConversationBehaviorPreference } from '../../../shared/renderer/api/appShell.js';

export async function updateWorkConversationBehaviorPreference(
  patch: SurfaceConversationBehaviorPatch,
  signal?: AbortSignal,
): Promise<AppShellPayload> {
  return updateWorkspaceConversationBehaviorPreference('work', patch, signal) as Promise<AppShellPayload>;
}
