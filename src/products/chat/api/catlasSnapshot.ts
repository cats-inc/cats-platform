import { resolveTaskExecutionProduct } from '../../../shared/taskExecutionBridge.js';
import { coreContentOrigins } from '../../../core/contentProvenance.js';
import type { CatsCoreState } from '../../../core/types.js';
import { effectiveOwnerListing, ownerEntry } from '../../../core/ownerLifecycle.js';
import type { ChatChannelState, ChatState, ChatMessage } from './contracts.js';
import type { GuideCatAssistProduct, GuideCatAssistTarget } from '../../../shared/guideCatAssist.js';

export interface CatlasSnapshotEntry extends GuideCatAssistTarget {
  title: string;
  status: string;
  surface: GuideCatAssistProduct;
  idleDays: number;
  external: boolean;
  repoPathSet?: boolean;
}
export interface CatlasSnapshot {
  pendingApprovals: CatlasSnapshotEntry[];
  stalledWork: CatlasSnapshotEntry[];
  awaitingReply: CatlasSnapshotEntry[];
  activeProjects: CatlasSnapshotEntry[];
  recentConversations: CatlasSnapshotEntry[];
  context: { now: string; weekday: number; daypart: string; locale: string; ownerDisplayName: string };
}
export function completedCatlasReplies(channel: ChatChannelState): ChatMessage[][] {
  const groups = new Map<string, ChatMessage[]>();
  for (const message of channel.messages) {
    if (message.senderKind !== 'agent' && message.senderKind !== 'orchestrator') continue;
    const key = typeof message.metadata.assistantTurnId === 'string' ? message.metadata.assistantTurnId : message.id;
    const group = groups.get(key) ?? [];
    group.push(message); groups.set(key, group);
  }
  return [...groups.values()].filter(group => group.some(message => message.metadata.terminal === true)
    || group.every(message => message.metadata.terminal === undefined));
}
export function hasUnresolvedCatlasChoice(channel: ChatChannelState): boolean {
  if (channel.roomRouting?.workflow?.activeTurn) return false;
  const replies = completedCatlasReplies(channel);
  const latest = replies[replies.length - 1];
  const choice = latest?.filter(message => message.choices?.length).at(-1);
  if (!choice) return false;
  const index = channel.messages.indexOf(choice);
  return !channel.messages.some((message, position) => message.choiceResponse?.sourceMessageId === choice.id
    || position > index && message.senderKind === 'user');
}
export function catlasSnapshotEntries(snapshot: CatlasSnapshot): CatlasSnapshotEntry[] {
  return [...snapshot.pendingApprovals, ...snapshot.stalledWork, ...snapshot.awaitingReply,
    ...snapshot.activeProjects, ...snapshot.recentConversations];
}
export function internalCatlasSnapshot(snapshot: CatlasSnapshot): CatlasSnapshot {
  const internal = (items: CatlasSnapshotEntry[]) => items.filter(item => !item.external);
  return { ...snapshot, pendingApprovals: internal(snapshot.pendingApprovals), stalledWork: internal(snapshot.stalledWork),
    awaitingReply: internal(snapshot.awaitingReply), activeProjects: internal(snapshot.activeProjects),
    recentConversations: internal(snapshot.recentConversations) };
}

/** Missing origin is intentionally navigation-only. Ownership is not provenance. */
export function buildCatlasSnapshot(input: {
  core: CatsCoreState; chat: ChatState; now: Date; locale: string; cooldownIds?: Set<string>;
}): CatlasSnapshot {
  const { core, chat, now } = input;
  const idle = (updatedAt: string) => Math.max(0, Math.floor((now.getTime() - Date.parse(updatedAt)) / 86_400_000));
  const origins = coreContentOrigins(core);
  const records = [...core.projects.map(record => ({ ...record, kind: 'project' as const })),
    ...core.workItems.map(record => ({ ...record, kind: 'work_item' as const })),
    ...core.tasks.map(record => ({ ...record, kind: 'task' as const }))];
  const visible = (kind: CatlasSnapshotEntry['kind'], id: string, status: string) =>
    !input.cooldownIds?.has(id) && !['completed', 'cancelled', 'archived'].includes(status)
    && (kind === 'conversation' || !ownerEntry(core, kind, id)?.deleted
      && effectiveOwnerListing(core, kind, id, status) === 'visible');
  const toEntry = (record: typeof records[number]): CatlasSnapshotEntry => ({
    id: record.id, kind: record.kind, title: record.title.slice(0, 200), status: record.status,
    surface: record.kind === 'task' ? resolveTaskExecutionProduct({ core, task: record, fallbackProduct: 'work' }) ?? 'work' : 'work', idleDays: idle(record.updatedAt), external: origins.get(record.id) !== 'internal',
    ...(record.kind === 'project' ? { repoPathSet: !!record.repoPath } : {}),
  });
  const capped = (items: CatlasSnapshotEntry[]) => items.slice(0, 5);
  const eligibleRecords = records.filter(record => visible(record.kind, record.id, record.status));
  const conversations = chat.channels.filter(channel => {
    const canonical = core.conversations.find(record => record.sourceChannelId === channel.id);
    return channel.channelKind !== 'direct_message' && canonical?.kind !== 'private_escalation'
      && canonical?.kind !== 'external_transport' && canonical?.kind !== 'direct_message'
      && visible('conversation', canonical?.id ?? channel.id, channel.status)
      && canonical?.status !== 'archived';
  }).sort((a, b) => (b.lastMessageAt ?? b.updatedAt).localeCompare(a.lastMessageAt ?? a.updatedAt));
  const conversationEntry = (channel: ChatChannelState): CatlasSnapshotEntry => ({
    id: core.conversations.find(record => record.sourceChannelId === channel.id)?.id ?? channel.id,
    kind: 'conversation', title: channel.title.slice(0, 200), status: channel.status,
    surface: channel.originSurface ?? 'chat', idleDays: idle(channel.lastMessageAt ?? channel.updatedAt),
    external: !core.conversations.some(record => record.sourceChannelId === channel.id),
  });
  const hour = now.getHours();
  return {
    pendingApprovals: capped(eligibleRecords.filter(record => record.kind === 'task'
      && record.approval.status === 'pending').map(toEntry)),
    stalledWork: capped(eligibleRecords.filter(record => record.kind === 'work_item'
      && (record.status === 'blocked' || record.status === 'in_progress' && idle(record.updatedAt) >= 2)).map(toEntry)),
    awaitingReply: capped(conversations.filter(channel => idle(channel.lastMessageAt ?? channel.updatedAt) <= 14
      && hasUnresolvedCatlasChoice(channel)).map(conversationEntry)),
    activeProjects: capped(eligibleRecords.filter(record => record.kind === 'project'
      && ['active', 'paused'].includes(record.status)).map(toEntry)),
    recentConversations: capped(conversations.slice(0, 10).map(conversationEntry)),
    context: { now: now.toISOString(), weekday: now.getDay(), daypart: hour < 6 ? 'night' : hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening',
      locale: input.locale, ownerDisplayName: core.ownerProfile.displayName },
  };
}
