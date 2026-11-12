import type { CatsCoreState } from '../../../core/types.js';
import type { ConversationProposalContext, ConversationProposalRecord } from '../../../platform/proposals/contracts.js';
import { channelWorkProjectRevision, readChannelWorkProjectId } from '../state/model/workProject.js';
import type { ChatStore } from '../state/store.js';
import { readConversationProposal, readConversationProposalFromMessages } from '../state/conversationProposals.js';
import { resolveChannelProductScope } from '../shared/channelTopology.js';
import type { ChatChannelState, ChatState } from './contracts.js';
import { readConversationState } from './scopedConversationState.js';

type Header = Omit<ChatChannelState, 'messages'>;

export function proposalContext(channelId: string, conversationId: string, channel: Header | undefined,
  groups: ChatState['parallelChatGroups'], core: CatsCoreState, headers: readonly Header[]): ConversationProposalContext | null {
  if (!channel) return null;
  return { channelId, conversationId, core, level: resolveChannelProductScope(channel),
    parallelMember: groups.some(group => group.status === 'active' && group.memberChannelIds.includes(channelId)),
    workProjectId: readChannelWorkProjectId(channel), workProjectRevision: channelWorkProjectRevision(channel),
    otherConversationsInProject: projectId => headers.filter(header => header.id !== channelId
      && readChannelWorkProjectId(header) === projectId).length };
}

/** Cold cards remain readable through bounded off-thread pages, never whole-archive hydration. */
export async function readProposalRecord(store: ChatStore, channelId: string, proposalId: string): Promise<ConversationProposalRecord | null> {
  const state = store.readChannelStates ? await store.readChannelStates([channelId], { archivedMetadataOnly: true })
    : await readConversationState(store, channelId);
  const channel = state.channels.find(channel => channel.id === channelId);
  if (!channel) return null;
  if (channel.status === 'archived' && store.readMessagePage) {
    let cursor: string | undefined, found: ConversationProposalRecord | null = null;
    do {
      const page = await store.readMessagePage(channelId, 200, cursor);
      // Keep the oldest occurrence, matching the original transcript reader's order.
      found = readConversationProposalFromMessages(page.messages, proposalId) ?? found;
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    return found;
  }
  return readConversationProposal(state, channelId, proposalId);
}
