import { appendCoreActivity } from '../../../core/model/index.js';
import type { CatsCoreState } from '../../../core/types.js';
import { buildChatConversationId, buildChatWorkItemId } from '../../../shared/chatCoreIds.js';
import type { ChatState } from './contracts.js';
import type { ChatStore } from '../state/store.js';
import {
  channelWorkProjectRevision,
  readChannelWorkProjectId,
  setChannelWorkProject,
  workProjectRefusal,
  type WorkProjectRefusal,
} from '../state/model/workProject.js';

/**
 * SPEC-142 FR-22 to FR-24: the one path that changes a conversation's Project, for the owner's
 * control and a confirmed proposal alike. The conversation and Core change together: the
 * Work Items parented under the projected Work Item follow it to the new Project.
 */

export type ApplyWorkProjectOutcome =
  | { refusal: WorkProjectRefusal | 'revision_stale' }
  | { projectId: string | null; revision: number };

export async function applyChannelWorkProject(
  store: ChatStore,
  input: {
    channelId: string;
    projectId: string | null;
    expectedRevision?: number;
    now: Date;
    /** Who changed it: the owner, or the participant whose proposal the owner confirmed (FR-19). */
    actorId?: string;
    confirmedByActorId?: string;
  },
): Promise<ApplyWorkProjectOutcome> {
  let outcome: ApplyWorkProjectOutcome = { refusal: 'channel_not_found' };
  const apply = ({ chat, core }: { chat: ChatState; core: CatsCoreState }) => {
    const channel = chat.channels.find((entry) => entry.id === input.channelId);
    if (!channel) { outcome = { refusal: 'channel_not_found' }; return { chat, core }; }
    if (input.expectedRevision !== undefined && channelWorkProjectRevision(channel) !== input.expectedRevision) {
      outcome = { refusal: 'revision_stale' };
      return { chat, core };
    }
    const refusal = workProjectRefusal(chat, core, input.channelId, input.projectId);
    if (refusal) { outcome = { refusal }; return { chat, core }; }
    if (readChannelWorkProjectId(channel) === input.projectId) {
      outcome = { projectId: input.projectId, revision: channelWorkProjectRevision(channel) };
      return { chat, core };
    }
    const previousId = readChannelWorkProjectId(channel);
    const nextChat = setChannelWorkProject(chat, input.channelId, input.projectId, input.now);
    const projectedId = buildChatWorkItemId(input.channelId);
    const at = input.now.toISOString();
    const moved: CatsCoreState = {
      ...core,
      workItems: core.workItems.map((workItem) => workItem.parentWorkItemId === projectedId
        ? { ...workItem, projectId: input.projectId, updatedAt: at }
        : workItem),
    };
    const titleOf = (id: string | null) => core.projects.find((entry) => entry.id === id)?.title ?? id;
    // The note belongs to the conversation and names the Projects by title only. A record that
    // names a Project's id keeps it from being deleted, and FR-27 lets the owner delete a
    // Project once its conversations have left it.
    const nextCore = appendCoreActivity(moved, {
      kind: 'note',
      actorId: input.actorId ?? core.ownerProfile.actorId,
      workItemId: projectedId,
      conversationId: buildChatConversationId(input.channelId),
      message: input.projectId
        ? `Put the conversation ${channel.title} into Project: ${titleOf(input.projectId)}`
        : `Took the conversation ${channel.title} out of Project: ${titleOf(previousId)}`,
      metadata: {
        ...(input.confirmedByActorId ? { confirmedByActorId: input.confirmedByActorId } : {}),
        conversationWorkProject: { change: input.projectId ? (previousId ? 'moved' : 'joined') : 'left' },
      },
    }, input.now).core;
    outcome = { projectId: input.projectId,
      revision: channelWorkProjectRevision(nextChat.channels.find((entry) => entry.id === input.channelId)!) };
    return { chat: nextChat, core: nextCore };
  };
  if (store.updateSnapshot) {
    await store.updateSnapshot(apply);
  } else {
    const next = apply({ chat: await store.read(), core: await store.readCore() });
    await store.writeSnapshot(next.chat, next.core);
  }
  return outcome;
}

/** FR-16: what a change to this Project's folder reaches: its other conversations and Work Items. */
export function workProjectReach(
  chat: Pick<ChatState, 'channels'>,
  core: Pick<CatsCoreState, 'workItems'>,
  projectId: string,
  exceptChannelId: string | null,
): { otherConversations: number; workItems: number } {
  return {
    otherConversations: chat.channels.filter((channel) => channel.id !== exceptChannelId
      && readChannelWorkProjectId(channel) === projectId).length,
    workItems: core.workItems.filter((workItem) => workItem.projectId === projectId).length,
  };
}
