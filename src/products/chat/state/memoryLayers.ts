import type {
  ChatCat,
  ChatChannelState,
  ChatChannelView,
  ChatMessage,
  ChatState,
} from '../api/contracts.js';
import type { MemoryCheckpointSummary } from '../../../core/types.js';

function normalizeText(value: string, maxLength = 160): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return '';
  }

  return normalized.length > maxLength
    ? `${normalized.slice(0, maxLength - 1)}…`
    : normalized;
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return values
    .map((value) => value?.trim() ?? '')
    .filter((value, index, list) => value.length > 0 && list.indexOf(value) === index);
}

function latestMessageBy(
  channel: ChatChannelState,
  predicate: (message: ChatMessage) => boolean,
): ChatMessage | null {
  for (let index = channel.messages.length - 1; index >= 0; index -= 1) {
    const message = channel.messages[index];
    if (predicate(message)) {
      return message;
    }
  }

  return null;
}

function deriveOpenLoops(channel: ChatChannelView): string[] {
  const lastUserQuestion = [...channel.messages]
    .reverse()
    .find((message) =>
      message.senderKind === 'user'
      && (message.body.includes('?') || /please|can you|could you|help/u.test(message.body.toLowerCase())),
    );
  const unresolvedMentions = channel.roomRouting?.lastOutcome?.unresolvedMentions ?? [];

  return uniqueStrings([
    lastUserQuestion ? normalizeText(lastUserQuestion.body, 120) : null,
    ...unresolvedMentions.map((mention) => `Resolve @${mention}`),
  ]).slice(0, 4);
}

function deriveChannelWorkingMemory(channel: ChatChannelView, nowIso: string): MemoryCheckpointSummary {
  const latestUserMessage = latestMessageBy(channel, (message) => message.senderKind === 'user');
  const latestTeamMessage = latestMessageBy(
    channel,
    (message) => message.senderKind === 'agent' || message.senderKind === 'orchestrator',
  );
  const activeCatNames = channel.assignedCats
    .filter((cat) => cat.status === 'active')
    .map((cat) => cat.name);

  return {
    summary: normalizeText(
      [
        channel.topic ? `${channel.title}: ${channel.topic}` : channel.title,
        latestUserMessage ? `Latest owner ask: ${latestUserMessage.body}` : null,
        latestTeamMessage ? `Latest team update: ${latestTeamMessage.senderName} said ${latestTeamMessage.body}` : null,
      ].filter((part): part is string => Boolean(part)).join(' | '),
      220,
    ) || null,
    facts: uniqueStrings([
      channel.repoPath ? `Repo: ${channel.repoPath}` : null,
      `Room mode: ${channel.roomRouting?.mode ?? 'boss_chat'}`,
      channel.skillProfile ? `Skill profile: ${channel.skillProfile}` : null,
      activeCatNames.length > 0 ? `Active Cats: ${activeCatNames.join(', ')}` : null,
    ]).slice(0, 6),
    openLoops: deriveOpenLoops(channel),
    updatedAt: nowIso,
  };
}

function deriveOrchestratorMemory(
  state: ChatState,
  channel: ChatChannelView,
  nowIso: string,
): MemoryCheckpointSummary {
  const latestUserMessage = latestMessageBy(channel, (message) => message.senderKind === 'user');
  const participantNames = channel.assignedCats
    .filter((cat) => cat.status === 'active')
    .map((cat) => cat.name);

  return {
    summary: normalizeText(
      `${state.globalOrchestrator.executionTarget.provider} orchestrator is coordinating ${channel.title}${latestUserMessage ? ` around "${latestUserMessage.body}"` : ''}.`,
      220,
    ) || null,
    facts: uniqueStrings([
      `Current room: ${channel.title}`,
      participantNames.length > 0 ? `Specialist Cats: ${participantNames.join(', ')}` : null,
      channel.roomRouting?.defaultRecipientId ? `Lead participant: ${channel.roomRouting.defaultRecipientId}` : null,
    ]).slice(0, 6),
    openLoops: deriveOpenLoops(channel),
    updatedAt: nowIso,
  };
}

function deriveCatMemory(
  cat: ChatCat,
  state: ChatState,
  currentChannel: ChatChannelView,
  nowIso: string,
): MemoryCheckpointSummary {
  const relatedChannels = state.channels
    .filter((channel) =>
      channel.catAssignments.some((assignment) => assignment.catId === cat.id && assignment.status === 'active'),
    )
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  const latestChannel = relatedChannels[0];
  const effectiveChannel = latestChannel?.id === currentChannel.id ? currentChannel : null;
  const channelForSummary = effectiveChannel ?? currentChannel;
  const lastOwnMessage = effectiveChannel
    ? latestMessageBy(
      effectiveChannel,
      (message) => message.senderKind === 'agent' && message.senderName === cat.name,
    )
    : null;

  return {
    summary: normalizeText(
      lastOwnMessage
        ? `${cat.name} recently helped in ${channelForSummary.title}: ${lastOwnMessage.body}`
        : `${cat.name} is currently participating in ${channelForSummary.title}.`,
      220,
    ) || null,
    facts: uniqueStrings([
      cat.roles.length > 0 ? `Roles: ${cat.roles.join(', ')}` : null,
      cat.skillProfile ? `Skill profile: ${cat.skillProfile}` : null,
      `Default target: ${cat.defaultExecutionTarget.provider}`,
      relatedChannels.length > 0 ? `Recent rooms: ${relatedChannels.slice(0, 3).map((channel) => channel.title).join(', ')}` : null,
    ]).slice(0, 6),
    openLoops: (currentChannel.workingMemory?.openLoops ?? []).slice(0, 3),
    updatedAt: nowIso,
  };
}

export function refreshDerivedMemoryLayers(
  state: ChatState,
  channelId: string,
  now: Date = new Date(),
): ChatState {
  const nextState = structuredClone(state);
  const nowIso = now.toISOString();
  const channel = nextState.channels.find((candidate) => candidate.id === channelId);
  if (!channel) {
    return nextState;
  }

  const channelView: ChatChannelView = {
    ...structuredClone(channel),
    assignedCats: channel.catAssignments
      .filter((assignment) => assignment.status === 'active')
      .map((assignment) => {
        const cat = nextState.cats.find((candidate) => candidate.id === assignment.catId);
        return cat
          ? {
              catId: cat.id,
              name: cat.name,
              roles: assignment.roles.length > 0 ? structuredClone(assignment.roles) : structuredClone(cat.roles),
              skillProfile: cat.skillProfile,
              mcpProfile: cat.mcpProfile,
              status: assignment.status,
              joinedAt: assignment.joinedAt,
              leftAt: assignment.leftAt,
              avatarColor: cat.avatarColor,
              execution: structuredClone(assignment.execution),
              memory: structuredClone(cat.memory),
            }
          : null;
      })
      .filter((cat): cat is ChatChannelView['assignedCats'][number] => cat !== null),
  };

  channel.workingMemory = deriveChannelWorkingMemory(channelView, nowIso);
  nextState.globalOrchestrator.memory = deriveOrchestratorMemory(nextState, {
    ...channelView,
    workingMemory: structuredClone(channel.workingMemory),
  }, nowIso);
  nextState.globalOrchestrator.updatedAt = nowIso;

  for (const assignment of channel.catAssignments) {
    if (assignment.status !== 'active') {
      continue;
    }
    const cat = nextState.cats.find((candidate) => candidate.id === assignment.catId);
    if (!cat) {
      continue;
    }
    cat.memory = deriveCatMemory(cat, nextState, {
      ...channelView,
      workingMemory: structuredClone(channel.workingMemory),
    }, nowIso);
    cat.updatedAt = nowIso;
  }

  return nextState;
}
