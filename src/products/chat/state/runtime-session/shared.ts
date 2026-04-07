import type {
  ChatChannelParticipant,
  ChatChannelCat,
  ChatChannelView,
} from '../../api/contracts.js';
import type { CompanionBoxStore } from '../companion-box/index.js';
import type { ChatStore } from '../store.js';
import type { CatsMemoryService } from '../../../../platform/memory/index.js';
import { ORCHESTRATOR_NAME } from '../model/index.js';
import { parseMentions } from '../mentionParsing.js';

export interface RuntimeSessionRoutingOptions {
  transport?: import('../runtimeTargeting.js').RuntimeTransportContext;
  companionStore?: CompanionBoxStore;
  memoryService?: CatsMemoryService;
  chatStore?: Pick<ChatStore, 'readCore' | 'writeCore'>;
  forceReviveClosedSessions?: boolean;
  chatStatePath?: string;
  runtimeDataDir?: string;
}

export function activeAssignedParticipants(
  channel: Pick<ChatChannelView, 'assignedParticipants' | 'assignedCats'>,
): Array<ChatChannelParticipant | ChatChannelCat> {
  const participants = channel.assignedParticipants && channel.assignedParticipants.length > 0
    ? channel.assignedParticipants
    : channel.assignedCats;
  return participants.filter((participant) => participant.status === 'active');
}

export function shouldRewriteOrchestratorReply(
  content: string,
  orchestratorName: string,
  channel: ChatChannelView,
): boolean {
  if (activeAssignedParticipants(channel).length > 0) {
    return false;
  }

  const normalized = content.toLowerCase();
  if (parseMentions(content).length > 0) {
    return true;
  }

  return normalized.includes(`@${orchestratorName.toLowerCase()}`)
    || normalized.includes(`@${ORCHESTRATOR_NAME.toLowerCase()}`);
}
