import type { AppShellPayload } from '../../../products/shared/api/workspaceContracts.js';
import type {
  ConversationBehaviorSurface,
  SurfaceConversationBehaviorPatch,
} from '../../../products/shared/conversationBehavior.js';
import { updateChatConversationBehaviorPreference } from '../../../products/chat/renderer/api/appShell.js';
import { updateCodeConversationBehaviorPreference } from '../../../products/code/renderer/api/appShell.js';
import { updateWorkConversationBehaviorPreference } from '../../../products/work/renderer/api/appShell.js';

type ProductConversationBehaviorPreferenceUpdater = (
  patch: SurfaceConversationBehaviorPatch,
  signal?: AbortSignal,
) => Promise<AppShellPayload>;

const PRODUCT_CONVERSATION_BEHAVIOR_UPDATER_BY_SURFACE: Record<
  ConversationBehaviorSurface,
  ProductConversationBehaviorPreferenceUpdater
> = {
  chat: updateChatConversationBehaviorPreference,
  code: updateCodeConversationBehaviorPreference,
  work: updateWorkConversationBehaviorPreference,
};

export function updateProductConversationBehaviorPreference(
  surface: ConversationBehaviorSurface,
  patch: SurfaceConversationBehaviorPatch,
  signal?: AbortSignal,
): Promise<AppShellPayload> {
  return PRODUCT_CONVERSATION_BEHAVIOR_UPDATER_BY_SURFACE[surface](patch, signal);
}
