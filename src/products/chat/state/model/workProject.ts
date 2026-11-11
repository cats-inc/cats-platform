import type { CatsCoreState } from '../../../../core/types.js';
import type { ChatChannelState, ChatState } from '../../api/contracts.js';
import { productScopeIncludes } from '../../../../shared/productScope.js';
import { isDirectLaneChannel, resolveChannelProductScope } from '../../shared/channelTopology.js';
import { buildChatConversationId } from '../../../../shared/chatCoreIds.js';

/**
 * SPEC-142 FR-22 to FR-25: a conversation at `work` can belong to one Project. Only the owner sets,
 * changes or clears it, from the conversation or by confirming a proposal. `workProjectRevision`
 * counts those changes, so a whole-state writer that read the state before one cannot undo it
 * (`keepOwnerWorkProjects`).
 */

export type WorkProjectRefusal =
  | 'channel_not_found'
  | 'not_work_level'
  | 'direct_lane'
  | 'parallel_member'
  | 'conversation_archived'
  | 'project_not_found'
  | 'project_archived'
  | 'supervised_run_active';

/** A supervised run under way or waiting for the owner; `blocked` is how Work holds one for a decision. */
const ACTIVE_RUN = new Set(['queued', 'running', 'blocked']);

export function readChannelWorkProjectId(channel: Pick<ChatChannelState, 'workProjectId'>): string | null {
  return typeof channel.workProjectId === 'string' && channel.workProjectId ? channel.workProjectId : null;
}

function isParallelMember(state: ChatState, channelId: string): boolean {
  return state.parallelChatGroups.some((group) => group.status === 'active' && group.memberChannelIds.includes(channelId));
}

/**
 * FR-23: a supervised run of the conversation's Tasks that is queued, running, blocked or waiting
 * for approval. Turn Runs and the projected Work Item's status do not count.
 */
export function hasActiveSupervisedRun(core: Pick<CatsCoreState, 'tasks' | 'runs'>, conversationId: string): boolean {
  const taskIds = new Set(core.tasks.filter((task) => task.conversationId === conversationId).map((task) => task.id));
  const pendingApproval = core.tasks.some((task) => taskIds.has(task.id) && task.approval?.status === 'pending');
  return pendingApproval || core.runs.some((run) => run.metadata?.source !== 'chat-room-workflow'
    && ((run.taskId !== null && taskIds.has(run.taskId)) || run.conversationId === conversationId)
    && ACTIVE_RUN.has(run.status));
}

export function workProjectRefusal(
  state: ChatState,
  core: Pick<CatsCoreState, 'projects' | 'tasks' | 'runs'>,
  channelId: string,
  projectId: string | null,
): WorkProjectRefusal | null {
  const channel = state.channels.find((entry) => entry.id === channelId);
  if (!channel) return 'channel_not_found';
  if (isDirectLaneChannel(channel)) return 'direct_lane';
  if (!productScopeIncludes(resolveChannelProductScope(channel), 'work')) return 'not_work_level';
  if (isParallelMember(state, channelId)) return 'parallel_member';
  if (channel.status === 'archived') return 'conversation_archived';
  if (projectId !== null) {
    const project = core.projects.find((entry) => entry.id === projectId);
    if (!project) return 'project_not_found';
    if (project.status === 'archived') return 'project_archived';
  }
  if (hasActiveSupervisedRun(core, buildChatConversationId(channelId))) return 'supervised_run_active';
  return null;
}

/** The one write of a conversation's Project. Its callers check `workProjectRefusal` first. */
export function setChannelWorkProject(state: ChatState, channelId: string, projectId: string | null, now: Date): ChatState {
  return {
    ...state,
    channels: state.channels.map((channel) => channel.id !== channelId ? channel : {
      ...channel,
      workProjectId: projectId,
      workProjectRevision: (channel.workProjectRevision ?? 0) + 1,
      updatedAt: now.toISOString(),
    }),
  };
}

/** The revision the owner's control and a proposal's card are bound to. */
export function channelWorkProjectRevision(channel: Pick<ChatChannelState, 'workProjectRevision'>): number {
  return channel.workProjectRevision ?? 0;
}

/**
 * Every store write keeps a newer stored Project over the incoming copy: a writer that read the
 * state before the owner's change brings an older revision.
 */
export function keepOwnerWorkProjects(stored: ChatState, incoming: ChatState): { state: ChatState; keptChannelIds: string[] } {
  const storedById = new Map(stored.channels.map((channel) => [channel.id, channel]));
  const keptChannelIds: string[] = [];
  let next = incoming;
  incoming.channels.forEach((channel, index) => {
    const previous = storedById.get(channel.id);
    if (!previous) return;
    if (channelWorkProjectRevision(previous) <= channelWorkProjectRevision(channel)) return;
    if (next === incoming) next = { ...incoming, channels: [...incoming.channels] };
    next.channels[index] = {
      ...channel,
      workProjectId: previous.workProjectId ?? null,
      workProjectRevision: previous.workProjectRevision,
    };
    keptChannelIds.push(channel.id);
  });
  return { state: next, keptChannelIds };
}
