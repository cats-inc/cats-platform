import { defaultCatProducts, hasPlatformSurface } from '../../../shared/platformSurfaces.js';
import {
  appendMessage,
  requireChannel,
  resolveOrchestratorDisplayName,
} from '../state/model/index.js';
import {
  collectChannelSessionIds,
  resolveParticipantLeaseAttachment,
} from '../shared/channelParticipants.js';
import type {
  ChatChannelCat,
  ChatState,
} from './contracts.js';

export function seedBossCatGreeting(
  state: ChatState,
  channelId: string,
  now: Date,
): ChatState {
  if (!state.bossCatId) {
    return state;
  }

  const channel = requireChannel(state, channelId);
  if (
    (channel.participantAssignments?.length ?? channel.catAssignments.length) > 0
    || channel.messages.length > 0
  ) {
    return state;
  }

  const bossCatName = resolveOrchestratorDisplayName(state);
  return appendMessage(
    state,
    channelId,
    {
      senderKind: 'orchestrator',
      senderName: bossCatName,
      body: `Meow! I'm ${bossCatName}, your Boss Cat. What should we chat about?`,
    },
    now,
  ).state;
}

export function collectLinkedChannelSessionIds(
  channel: ReturnType<typeof requireChannel>,
): string[] {
  return collectChannelSessionIds(channel);
}

export function collectCatSessionIds(
  state: ChatState,
  catId: string,
): string[] {
  const sessionIds = new Set<string>();
  for (const channel of state.channels) {
    for (const assignment of channel.catAssignments) {
      if (assignment.catId !== catId) {
        continue;
      }
      const sessionId = resolveParticipantLeaseAttachment(channel, assignment.participantId)?.sessionId ?? null;
      if (sessionId) {
        sessionIds.add(sessionId);
      }
    }
  }
  return [...sessionIds];
}

export function catParticipatesInChat(products: readonly string[] | null | undefined): boolean {
  return hasPlatformSurface(products, 'chat', {
    fallback: defaultCatProducts(),
  });
}

export function mapChannelCat(assignment: ChatChannelCat) {
  return {
    catId: assignment.catId,
    name: assignment.name,
    roles: structuredClone(assignment.roles),
    skillProfile: assignment.skillProfile,
    mcpProfile: assignment.mcpProfile,
    status: assignment.status,
    joinedAt: assignment.joinedAt,
    leftAt: assignment.leftAt,
    avatarColor: assignment.avatarColor,
    execution: structuredClone(assignment.execution),
    memory: structuredClone(assignment.memory),
  };
}
