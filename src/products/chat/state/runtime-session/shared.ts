import type {
  ChatChannelCat,
  ChatChannelView,
} from '../../api/contracts.js';
import type { CompanionBoxStore } from '../companionBoxStore.js';
import type { ChatStore } from '../store.js';
import type { CatsMemoryService } from '../../../../platform/memory/index.js';
import { ORCHESTRATOR_NAME } from '../model.js';

export interface RuntimeSessionRoutingOptions {
  transport?: import('../runtimeTargeting.js').RuntimeTransportContext;
  companionStore?: CompanionBoxStore;
  memoryService?: CatsMemoryService;
  chatStore?: Pick<ChatStore, 'readCore' | 'writeCore'>;
}

export function activeAssignedCats(channel: { assignedCats: ChatChannelCat[] }) {
  return channel.assignedCats.filter((cat) => cat.status === 'active');
}

export function shouldRewriteOrchestratorReply(
  content: string,
  orchestratorName: string,
  channel: ChatChannelView,
): boolean {
  if (activeAssignedCats(channel).length > 0) {
    return false;
  }

  const normalized = content.toLowerCase();
  return normalized.includes(`@${orchestratorName.toLowerCase()}`)
    || normalized.includes(`@${ORCHESTRATOR_NAME.toLowerCase()}`);
}
